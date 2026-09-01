import type { ProductRow } from "../types";
import { assignPendingBatch, getAssignedProducts } from "../db/queries";

/**
 * Si el usuario ya tiene productos asignados sin terminar (assigned/selected/skipped,
 * es decir, todavía no enviados a procesar), se le devuelven esos para continuar donde
 * quedó. Solo se le asigna un lote nuevo de `pending` cuando no le queda nada pendiente.
 */
export async function assignNextBatch(db: D1Database, userEmail: string, limit: number): Promise<ProductRow[]> {
  const alreadyAssigned = await getAssignedProducts(db, userEmail);
  if (alreadyAssigned.length > 0) {
    return alreadyAssigned;
  }
  return assignPendingBatch(db, userEmail, limit);
}
