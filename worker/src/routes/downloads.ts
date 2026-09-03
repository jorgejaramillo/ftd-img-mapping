import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/auth";
import { getBatchResults, getCompletedProductsForBatch } from "../db/queries";
import { BATCH_NOT_FOUND_BODY, getOwnedProduct, ownsBatch } from "../services/ownership";
import { getProcessedImage } from "../services/r2";
import { buildZip, type ZipEntry } from "../services/zip";

export const downloadsRoutes = new Hono<AppEnv>();

// Middleware por-ruta (no ".use('*', ...)"): downloadsRoutes se monta en el
// prefijo raíz "/api" para lograr las rutas finales exactas, y un ".use('*')"
// ahí terminaría protegiendo TODO "/api/*" a nivel del router combinado —
// incluyendo "/api/auth/login", que debe quedar público. Ver auth.ts.
downloadsRoutes.get("/products/:id/download", requireAuth, async (c) => {
  const product = await getOwnedProduct(c.env.DB, c.req.param("id"), c.get("user").email);
  if (!product || !product.final_r2_key) {
    return c.json({ error: "not_found", message: "Producto o imagen no encontrada." }, 404);
  }

  const object = await getProcessedImage(c.env.PRODUCT_IMAGES, product.final_r2_key);
  if (!object) return c.json({ error: "not_found_in_storage" }, 404);

  const filename = product.final_r2_key.split("/").pop() ?? product.sku;
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// Solo empaqueta lo que ya está 'completed', así que sirve igual con el lote
// terminado o a medio procesar: el frontend lo ofrece como "descargar las que
// ya están listas" mientras la cola sigue trabajando.
downloadsRoutes.get("/processing/:batchId/download-zip", requireAuth, async (c) => {
  const batchId = c.req.param("batchId");
  if (!(await ownsBatch(c.env.DB, batchId, c.get("user").email))) {
    return c.json(BATCH_NOT_FOUND_BODY, 404);
  }

  const products = await getCompletedProductsForBatch(c.env.DB, batchId);

  const entries: ZipEntry[] = [];
  for (const product of products) {
    if (!product.final_r2_key) continue;
    const object = await getProcessedImage(c.env.PRODUCT_IMAGES, product.final_r2_key);
    if (!object) continue;
    const bytes = new Uint8Array(await object.arrayBuffer());
    const filename = product.final_r2_key.split("/").pop() ?? product.sku;
    entries.push({ filename, bytes });
  }

  const zip = buildZip(entries);
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="batch-${batchId}.zip"`,
    },
  });
});

downloadsRoutes.get("/processing/:batchId/export-csv", requireAuth, async (c) => {
  const batchId = c.req.param("batchId");
  if (!(await ownsBatch(c.env.DB, batchId, c.get("user").email))) {
    return c.json(BATCH_NOT_FOUND_BODY, 404);
  }

  const products = await getBatchResults(c.env.DB, batchId);

  const rows = ["sku,image_url,status"];
  for (const product of products) {
    const imageUrl = product.final_r2_key ? `/api/products/${product.id}/download` : "";
    rows.push(`${product.sku},${imageUrl},${product.status}`);
  }

  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="batch-${batchId}.csv"`,
    },
  });
});
