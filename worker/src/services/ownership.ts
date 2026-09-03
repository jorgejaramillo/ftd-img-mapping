import { getProcessingBatch, getProductById } from "../db/queries";
import type { ProductRow } from "../types";

/**
 * Chequeos de propiedad para el aislamiento por usuario (migración 0003).
 *
 * Regla: un recurso de otra cuenta se responde EXACTAMENTE como uno
 * inexistente (mismo 404, mismo mensaje). Distinguir "no existe" de "no es
 * tuyo" filtraría qué SKUs y qué lotes tienen las demás cuentas.
 */

export const PRODUCT_NOT_FOUND_BODY = {
  error: "not_found",
  message: "Este producto ya no existe — puede que el catálogo se haya reiniciado. Recarga la página.",
} as const;

export const BATCH_NOT_FOUND_BODY = {
  error: "not_found",
  message: "Este lote no existe o pertenece a otra cuenta.",
} as const;

/** Devuelve el producto solo si pertenece al usuario de la sesión. */
export async function getOwnedProduct(
  db: D1Database,
  productId: string,
  userEmail: string,
): Promise<ProductRow | null> {
  const product = await getProductById(db, productId);
  if (!product || product.owner_email !== userEmail) return null;
  return product;
}

/** True solo si el lote de procesamiento lo creó el usuario de la sesión. */
export async function ownsBatch(db: D1Database, batchId: string, userEmail: string): Promise<boolean> {
  const batch = await getProcessingBatch(db, batchId);
  return batch !== null && batch.created_by === userEmail;
}
