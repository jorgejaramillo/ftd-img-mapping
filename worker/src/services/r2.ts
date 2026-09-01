import type { OutputFormat } from "./imagePipeline";

export function buildR2Key(sku: string, extension: string): string {
  return `products/${sku}.${extension}`;
}

export function contentTypeForFormat(format: OutputFormat): string {
  switch (format) {
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    default:
      return "image/webp";
  }
}

export async function putProcessedImage(
  bucket: R2Bucket,
  key: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<void> {
  // La key es determinística por SKU: un PUT repetido siempre sobrescribe el
  // mismo objeto, por lo que reintentos de la cola y reprocesos manuales
  // nunca generan duplicados.
  await bucket.put(key, bytes, { httpMetadata: { contentType } });
}

export async function getProcessedImage(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}
