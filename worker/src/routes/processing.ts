import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAccess } from "../middleware/auth";
import { generateId } from "../utils/ids";
import {
  createProcessingBatch,
  deleteProcessingBatch,
  getBatchResults,
  getBatchStatusCounts,
  markSelectedAsProcessing,
  markSkippedForBatch,
  updateProcessingBatchTotal,
} from "../db/queries";
import type { ProcessImageMessage } from "../types";

export const processingRoutes = new Hono<AppEnv>();

processingRoutes.use("*", requireAccess);

processingRoutes.post("/start", async (c) => {
  const user = c.get("user");
  const batchId = generateId("batch");

  // El batch debe existir antes de que products.processing_batch_id lo referencie
  // (FOREIGN KEY). total_products se corrige abajo una vez se sabe cuántos hay.
  await createProcessingBatch(c.env.DB, { id: batchId, createdBy: user.email, totalProducts: 0 });

  const toProcess = await markSelectedAsProcessing(c.env.DB, user.email, batchId);
  const skipped = await markSkippedForBatch(c.env.DB, user.email, batchId);
  const totalProducts = toProcess.length + skipped.length;

  if (totalProducts === 0) {
    // Nada quedó vinculado a este batch (ni seleccionado ni marcado como "no
    // encontré imagen adecuada"): se puede borrar sin violar la FK de products.
    await deleteProcessingBatch(c.env.DB, batchId);
    return c.json(
      { error: "nothing_selected", message: "No hay productos seleccionados ni marcados para procesar" },
      400,
    );
  }

  await updateProcessingBatchTotal(c.env.DB, batchId, totalProducts);

  if (toProcess.length > 0) {
    const messages: Array<{ body: ProcessImageMessage }> = toProcess.map((product) => ({
      body: {
        productId: product.id,
        processingBatchId: batchId,
        sku: product.sku,
        imageUrl: product.selected_image_url!,
      },
    }));

    const CHUNK_SIZE = 100;
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      await c.env.IMAGE_QUEUE.sendBatch(messages.slice(i, i + CHUNK_SIZE));
    }
  }

  return c.json({ batchId, totalProducts });
});

processingRoutes.get("/:batchId/status", async (c) => {
  const counts = await getBatchStatusCounts(c.env.DB, c.req.param("batchId"));
  return c.json({ counts });
});

processingRoutes.get("/:batchId/results", async (c) => {
  const products = await getBatchResults(c.env.DB, c.req.param("batchId"));
  return c.json({ products });
});
