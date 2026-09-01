import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAccess } from "../middleware/auth";
import { getBatchResults, getCompletedProductsForBatch, getProductById } from "../db/queries";
import { getProcessedImage } from "../services/r2";
import { buildZip, type ZipEntry } from "../services/zip";

export const downloadsRoutes = new Hono<AppEnv>();

downloadsRoutes.use("*", requireAccess);

downloadsRoutes.get("/products/:id/download", async (c) => {
  const product = await getProductById(c.env.DB, c.req.param("id"));
  if (!product || !product.final_r2_key) {
    return c.json({ error: "not_found" }, 404);
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

downloadsRoutes.get("/processing/:batchId/download-zip", async (c) => {
  const batchId = c.req.param("batchId");
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

downloadsRoutes.get("/processing/:batchId/export-csv", async (c) => {
  const batchId = c.req.param("batchId");
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
