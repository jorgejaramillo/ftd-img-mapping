import type { ImportRow, ProcessingBatchRow, ProductRow, ProductStatus } from "../types";

export async function insertImport(
  db: D1Database,
  input: { id: string; filename: string; createdBy: string },
): Promise<void> {
  await db
    .prepare(`INSERT INTO imports (id, filename, created_by) VALUES (?1, ?2, ?3)`)
    .bind(input.id, input.filename, input.createdBy)
    .run();
}

export async function updateImportCounts(
  db: D1Database,
  importId: string,
  counts: { totalRows: number; importedRows: number; skippedRows: number; duplicateRows: number },
): Promise<void> {
  await db
    .prepare(
      `UPDATE imports SET total_rows = ?2, imported_rows = ?3, skipped_rows = ?4, duplicate_rows = ?5 WHERE id = ?1`,
    )
    .bind(importId, counts.totalRows, counts.importedRows, counts.skippedRows, counts.duplicateRows)
    .run();
}

export async function listImports(db: D1Database): Promise<ImportRow[]> {
  const result = await db.prepare(`SELECT * FROM imports ORDER BY created_at DESC`).all<ImportRow>();
  return result.results;
}

export async function getImport(db: D1Database, id: string): Promise<ImportRow | null> {
  return db.prepare(`SELECT * FROM imports WHERE id = ?1`).bind(id).first<ImportRow>();
}

export async function getExistingSkus(db: D1Database, skus: string[]): Promise<Set<string>> {
  if (skus.length === 0) return new Set();

  // D1 limita cada statement a 100 parámetros bindeados: con imports de
  // miles de filas (uno por SKU) hay que trocear el IN (...) en chunks.
  const CHUNK_SIZE = 100;
  const existing = new Set<string>();

  for (let i = 0; i < skus.length; i += CHUNK_SIZE) {
    const chunk = skus.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, j) => `?${j + 1}`).join(",");
    const result = await db
      .prepare(`SELECT sku FROM products WHERE sku IN (${placeholders})`)
      .bind(...chunk)
      .all<{ sku: string }>();
    for (const row of result.results) existing.add(row.sku);
  }

  return existing;
}

export async function insertProducts(
  db: D1Database,
  importId: string,
  rows: Array<{ id: string; ean: string; productName: string; sku: string }>,
): Promise<void> {
  if (rows.length === 0) return;

  const statements = rows.map((row) =>
    db
      .prepare(
        `INSERT INTO products (id, import_id, ean, product_name, sku, status) VALUES (?1, ?2, ?3, ?4, ?5, 'pending')`,
      )
      .bind(row.id, importId, row.ean, row.productName, row.sku),
  );

  // D1 batch() corre las sentencias en una transacción implícita. Se trocea
  // en grupos razonables para imports de miles de filas; el límite de 100
  // parámetros de D1 es por statement (5 acá), no por batch, así que 200
  // sentencias por chunk es seguro.
  const CHUNK_SIZE = 200;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    await db.batch(statements.slice(i, i + CHUNK_SIZE));
  }
}

export async function assignPendingBatch(
  db: D1Database,
  userEmail: string,
  limit: number,
): Promise<ProductRow[]> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE products
       SET status = 'assigned', assigned_to = ?1, assigned_at = ?2, updated_at = ?2
       WHERE id IN (
         SELECT id FROM products WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?3
       )`,
    )
    .bind(userEmail, now, limit)
    .run();

  const result = await db
    .prepare(`SELECT * FROM products WHERE assigned_to = ?1 AND assigned_at = ?2 ORDER BY created_at ASC`)
    .bind(userEmail, now)
    .all<ProductRow>();
  return result.results;
}

export async function getAssignedProducts(db: D1Database, userEmail: string): Promise<ProductRow[]> {
  // Un producto 'skipped' ya vinculado a un processing_batch_id fue enviado a
  // procesar en un lote anterior (queda "Sin selección" en esos resultados) y
  // no debe reaparecer como trabajo pendiente del usuario.
  const result = await db
    .prepare(
      `SELECT * FROM products
       WHERE assigned_to = ?1
         AND (
           status IN ('assigned','selected')
           OR (status = 'skipped' AND processing_batch_id IS NULL)
         )
       ORDER BY created_at ASC`,
    )
    .bind(userEmail)
    .all<ProductRow>();
  return result.results;
}

export async function getProductById(db: D1Database, id: string): Promise<ProductRow | null> {
  return db.prepare(`SELECT * FROM products WHERE id = ?1`).bind(id).first<ProductRow>();
}

export async function saveCandidates(db: D1Database, productId: string, candidatesJson: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE products SET candidates_json = ?2, candidates_fetched_at = ?3, updated_at = ?3 WHERE id = ?1`,
    )
    .bind(productId, candidatesJson, now)
    .run();
}

export async function saveSelection(
  db: D1Database,
  productId: string,
  selection: { imageUrl: string; sourceUrl: string } | { noSuitableImage: true },
): Promise<void> {
  const now = new Date().toISOString();

  if ("noSuitableImage" in selection) {
    await db
      .prepare(
        `UPDATE products
         SET status = 'skipped', no_suitable_image = 1, selected_image_url = NULL, selected_source_url = NULL, updated_at = ?2
         WHERE id = ?1`,
      )
      .bind(productId, now)
      .run();
    return;
  }

  await db
    .prepare(
      `UPDATE products
       SET status = 'selected', no_suitable_image = 0, selected_image_url = ?2, selected_source_url = ?3, updated_at = ?4
       WHERE id = ?1`,
    )
    .bind(productId, selection.imageUrl, selection.sourceUrl, now)
    .run();
}

export async function createProcessingBatch(
  db: D1Database,
  input: { id: string; createdBy: string; totalProducts: number },
): Promise<void> {
  await db
    .prepare(`INSERT INTO processing_batches (id, created_by, total_products) VALUES (?1, ?2, ?3)`)
    .bind(input.id, input.createdBy, input.totalProducts)
    .run();
}

export async function updateProcessingBatchTotal(db: D1Database, batchId: string, totalProducts: number): Promise<void> {
  await db
    .prepare(`UPDATE processing_batches SET total_products = ?2 WHERE id = ?1`)
    .bind(batchId, totalProducts)
    .run();
}

export async function deleteProcessingBatch(db: D1Database, batchId: string): Promise<void> {
  await db.prepare(`DELETE FROM processing_batches WHERE id = ?1`).bind(batchId).run();
}

export async function markSelectedAsProcessing(
  db: D1Database,
  userEmail: string,
  batchId: string,
): Promise<ProductRow[]> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE products
       SET status = 'processing', processing_batch_id = ?2, updated_at = ?3
       WHERE assigned_to = ?1 AND status = 'selected'`,
    )
    .bind(userEmail, batchId, now)
    .run();

  const result = await db
    .prepare(`SELECT * FROM products WHERE processing_batch_id = ?1 AND status = 'processing'`)
    .bind(batchId)
    .all<ProductRow>();
  return result.results;
}

export async function markSkippedForBatch(db: D1Database, userEmail: string, batchId: string): Promise<ProductRow[]> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE products SET processing_batch_id = ?2, updated_at = ?3
       WHERE assigned_to = ?1 AND status = 'skipped' AND processing_batch_id IS NULL`,
    )
    .bind(userEmail, batchId, now)
    .run();

  const result = await db
    .prepare(`SELECT * FROM products WHERE processing_batch_id = ?1 AND status = 'skipped'`)
    .bind(batchId)
    .all<ProductRow>();
  return result.results;
}

export async function getBatchStatusCounts(
  db: D1Database,
  batchId: string,
): Promise<Record<ProductStatus, number>> {
  const result = await db
    .prepare(`SELECT status, COUNT(*) as count FROM products WHERE processing_batch_id = ?1 GROUP BY status`)
    .bind(batchId)
    .all<{ status: ProductStatus; count: number }>();

  const counts: Partial<Record<ProductStatus, number>> = {};
  for (const row of result.results) counts[row.status] = row.count;
  return counts as Record<ProductStatus, number>;
}

export async function getBatchResults(db: D1Database, batchId: string): Promise<ProductRow[]> {
  const result = await db
    .prepare(`SELECT * FROM products WHERE processing_batch_id = ?1 ORDER BY sku ASC`)
    .bind(batchId)
    .all<ProductRow>();
  return result.results;
}

export async function getCompletedProductsForBatch(db: D1Database, batchId: string): Promise<ProductRow[]> {
  const result = await db
    .prepare(`SELECT * FROM products WHERE processing_batch_id = ?1 AND status = 'completed'`)
    .bind(batchId)
    .all<ProductRow>();
  return result.results;
}

export async function markProductOriginalInfo(
  db: D1Database,
  productId: string,
  info: { width: number; height: number; format: string; fileSize: number },
): Promise<void> {
  await db
    .prepare(
      `UPDATE products
       SET original_width = ?2, original_height = ?3, original_format = ?4, original_filesize = ?5, updated_at = ?6
       WHERE id = ?1`,
    )
    .bind(productId, info.width, info.height, info.format, info.fileSize, new Date().toISOString())
    .run();
}

export async function markProductCompleted(
  db: D1Database,
  productId: string,
  input: { finalR2Key: string; finalWidth: number; finalHeight: number; finalFormat: string; finalFilesize: number },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE products
       SET status = 'completed', final_r2_key = ?2, final_width = ?3, final_height = ?4,
           final_format = ?5, final_filesize = ?6, error_message = NULL, processed_at = ?7, updated_at = ?7
       WHERE id = ?1`,
    )
    .bind(
      productId,
      input.finalR2Key,
      input.finalWidth,
      input.finalHeight,
      input.finalFormat,
      input.finalFilesize,
      now,
    )
    .run();
}

export async function markProductError(db: D1Database, productId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE products SET status = 'error', error_message = ?2, updated_at = ?3 WHERE id = ?1`)
    .bind(productId, message, now)
    .run();
}

export async function reprocessProduct(
  db: D1Database,
  productId: string,
  selection: { imageUrl: string; sourceUrl: string },
): Promise<ProcessingBatchRow | null> {
  const now = new Date().toISOString();
  const product = await getProductById(db, productId);
  if (!product) return null;

  await db
    .prepare(
      `UPDATE products
       SET selected_image_url = ?2, selected_source_url = ?3, no_suitable_image = 0,
           status = 'processing', error_message = NULL, updated_at = ?4
       WHERE id = ?1`,
    )
    .bind(productId, selection.imageUrl, selection.sourceUrl, now)
    .run();

  if (!product.processing_batch_id) return null;
  return db
    .prepare(`SELECT * FROM processing_batches WHERE id = ?1`)
    .bind(product.processing_batch_id)
    .first<ProcessingBatchRow>();
}
