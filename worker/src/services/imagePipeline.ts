export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

export interface RemoteImageInfo {
  width?: number;
  height?: number;
  format?: string;
  fileSize?: number;
}

export class PipelineError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }
}

export type OutputFormat = "webp" | "png" | "jpeg";

export interface PipelineConfig {
  outputFormat: OutputFormat;
  outputWidth: number;
  outputHeight: number;
  productOccupancy: number;
  backgroundColor: string;
  maxOriginalBytes: number;
  downloadTimeoutMs: number;
}

export function extensionForFormat(format: OutputFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export async function downloadOriginalImage(url: string, config: PipelineConfig): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(config.downloadTimeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ftd-img-mapping/1.0)" },
    });
  } catch (err) {
    throw new PipelineError("DOWNLOAD_FAILED", `No se pudo descargar la imagen original: ${String(err)}`);
  }

  if (!response.ok) {
    throw new PipelineError("DOWNLOAD_HTTP_ERROR", `HTTP ${response.status} al descargar la imagen original`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new PipelineError("NOT_AN_IMAGE", `El contenido descargado no es una imagen (content-type: ${contentType})`);
  }

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength === 0) {
    throw new PipelineError("EMPTY_IMAGE", "La imagen descargada está vacía");
  }
  if (buffer.byteLength > config.maxOriginalBytes) {
    throw new PipelineError(
      "IMAGE_TOO_LARGE",
      `La imagen (${buffer.byteLength} bytes) supera el máximo permitido de ${config.maxOriginalBytes} bytes`,
    );
  }

  return buffer;
}

export async function inspectImage(images: ImagesBinding, bytes: ArrayBuffer): Promise<ImageInfo> {
  try {
    const info = await images.info(new Response(bytes).body!);
    // SVG no trae width/height/fileSize en la respuesta de info() (es vectorial).
    // `"width" in info` es el discriminante correcto: el otro miembro de la unión
    // tipa `format` como `string` genérico, así que comparar por valor no angosta el tipo.
    if (!("width" in info)) {
      return { width: 0, height: 0, format: info.format, fileSize: bytes.byteLength };
    }
    return {
      width: info.width,
      height: info.height,
      format: info.format,
      fileSize: info.fileSize,
    };
  } catch (err) {
    throw new PipelineError("INSPECT_FAILED", `No se pudo inspeccionar la imagen: ${String(err)}`);
  }
}

/** Best-effort: usado para enriquecer candidatos de búsqueda con dimensiones/peso
 * antes de que el usuario seleccione. Nunca lanza — si falla o excede el timeout,
 * simplemente devuelve null y el candidato se muestra sin esos datos. */
export async function tryInspectRemoteImage(
  images: ImagesBinding,
  url: string,
  timeoutMs: number,
): Promise<RemoteImageInfo | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok || !res.body) return null;

    const contentLength = Number(res.headers.get("content-length"));
    const info = await images.info(res.body);

    if (!("width" in info)) {
      return { format: info.format };
    }

    return {
      width: info.width,
      height: info.height,
      format: info.format,
      fileSize: info.fileSize || (Number.isFinite(contentLength) && contentLength > 0 ? contentLength : undefined),
    };
  } catch {
    return null;
  }
}

/**
 * v1: passthrough — no elimina el fondo (ver decisión documentada en el plan).
 * Punto de inserción para un futuro proveedor de segmentación: debe recibir la
 * imagen original y devolver la imagen con fondo transparente, sin requerir
 * cambios en el resto del pipeline (composeOnSquareCanvas ya asume que puede
 * recibir una imagen con transparencia).
 */
export async function removeBackground(_images: ImagesBinding, bytes: ArrayBuffer): Promise<ArrayBuffer> {
  return bytes;
}

export async function composeOnSquareCanvas(
  images: ImagesBinding,
  bytes: ArrayBuffer,
  config: PipelineConfig,
): Promise<Response> {
  const box = Math.round(config.outputWidth * config.productOccupancy);

  try {
    const chain = images
      .input(new Response(bytes).body!)
      // Paso A: escala el producto completo (sin recortar) para que quepa en
      // una caja de `box`x`box` (~70-75% del canvas final), preservando aspect ratio.
      .transform({ width: box, height: box, fit: "contain" })
      // Paso B: centra ese resultado sobre el canvas final completo, rellenando
      // el espacio sobrante con background (blanco por defecto, o transparente
      // si el formato de salida lo soporta y se configura BACKGROUND_COLOR=transparent).
      .transform({
        width: config.outputWidth,
        height: config.outputHeight,
        fit: "pad",
        background: config.backgroundColor,
      });

    const outputOptions =
      config.outputFormat === "png"
        ? ({ format: "image/png" } as const)
        : config.outputFormat === "jpeg"
          ? ({ format: "image/jpeg", quality: 85 } as const)
          : ({ format: "image/webp", quality: 85 } as const);

    const result = await chain.output(outputOptions);
    return result.response();
  } catch (err) {
    throw new PipelineError("COMPOSE_FAILED", `No se pudo componer la imagen final: ${String(err)}`);
  }
}

export interface ProcessedImageResult {
  original: ImageInfo;
  finalBytes: ArrayBuffer;
  finalInfo: ImageInfo;
}

export async function processProductImage(
  images: ImagesBinding,
  sourceUrl: string,
  config: PipelineConfig,
): Promise<ProcessedImageResult> {
  const originalBytes = await downloadOriginalImage(sourceUrl, config);
  const original = await inspectImage(images, originalBytes);
  const withoutBackground = await removeBackground(images, originalBytes);
  const finalResponse = await composeOnSquareCanvas(images, withoutBackground, config);
  const finalBytes = await finalResponse.arrayBuffer();
  const finalInfo = await inspectImage(images, finalBytes);

  return { original, finalBytes, finalInfo };
}
