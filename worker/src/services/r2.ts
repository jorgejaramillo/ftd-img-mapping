import type { OutputFormat } from "./imagePipeline";

/**
 * La key se namespacea por productId porque el SKU dejó de ser único global
 * (ahora es único por dueño, ver migración 0003): si dos usuarios importan el
 * mismo archivo, `products/<sku>.jpg` haría que uno pisara la imagen del otro.
 * Sigue siendo determinística por producto, así que un PUT repetido — reintento
 * de la cola o reproceso manual — sobrescribe siempre el mismo objeto.
 *
 * El nombre de archivo final (lo último tras la última "/") sigue siendo
 * `<sku>.<ext>`, que es lo que ven las descargas sueltas y las entradas del ZIP.
 */
export function buildR2Key(productId: string, sku: string, extension: string): string {
  return `products/${productId}/${sku}.${extension}`;
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
