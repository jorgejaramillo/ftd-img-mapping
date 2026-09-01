import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAccess } from "../middleware/auth";
import { assignNextBatch } from "../services/assignment";
import { DataForSeoError, searchGoogleImages } from "../services/dataforseo";
import { tryInspectRemoteImage } from "../services/imagePipeline";
import { getAssignedProducts, getProductById, reprocessProduct, saveCandidates, saveSelection } from "../db/queries";
import { reprocessSchema, selectImageSchema } from "../utils/validation";
import type { ImageCandidate, ProcessImageMessage } from "../types";

export const productsRoutes = new Hono<AppEnv>();

productsRoutes.use("*", requireAccess);

productsRoutes.post("/assign-batch", async (c) => {
  const user = c.get("user");
  const limit = Number(c.env.ASSIGNMENT_BATCH_SIZE ?? "100");
  const products = await assignNextBatch(c.env.DB, user.email, limit);
  return c.json({ products });
});

productsRoutes.get("/assigned", async (c) => {
  const user = c.get("user");
  const products = await getAssignedProducts(c.env.DB, user.email);
  return c.json({ products });
});

async function enrichCandidate(images: ImagesBinding, candidate: ImageCandidate): Promise<ImageCandidate> {
  if (candidate.width !== null) return candidate; // ya enriquecida en una página anterior
  const info = await tryInspectRemoteImage(images, candidate.imageUrl, 2500);
  return {
    ...candidate,
    width: info?.width ?? candidate.width,
    height: info?.height ?? candidate.height,
    format: info?.format ?? candidate.format,
    fileSize: info?.fileSize ?? candidate.fileSize,
  };
}

/**
 * DataForSEO devuelve hasta ~100 resultados de imagen en una sola llamada
 * (ya pagada). Se cachea ese pool completo en `candidates_json` y se pagina
 * sobre él con `?offset=`: el botón "buscar más resultados" del frontend
 * NUNCA dispara una consulta nueva a DataForSEO mientras queden candidatas
 * sin mostrar en el pool — solo se enriquece (gratis, vía IMAGES.info()) la
 * página pedida.
 */
productsRoutes.post("/:id/search-images", async (c) => {
  const productId = c.req.param("id");
  const offset = Math.max(0, Number(c.req.query("offset") ?? "0") || 0);
  const pageSize = Number(c.env.SEARCH_CANDIDATE_COUNT ?? "10");

  const product = await getProductById(c.env.DB, productId);
  if (!product) return c.json({ error: "not_found" }, 404);

  let pool: ImageCandidate[];

  if (product.candidates_json) {
    pool = JSON.parse(product.candidates_json) as ImageCandidate[];
  } else {
    try {
      pool = await searchGoogleImages({
        ean: product.ean,
        productName: product.product_name,
        locationCode: Number(c.env.DATAFORSEO_LOCATION_CODE ?? "2032"),
        languageCode: c.env.DATAFORSEO_LANGUAGE_CODE ?? "es",
        login: c.env.DATAFORSEO_LOGIN,
        password: c.env.DATAFORSEO_PASSWORD,
      });
    } catch (err) {
      if (err instanceof DataForSeoError) {
        return c.json({ error: "dataforseo_error", message: err.message }, 502);
      }
      throw err;
    }
  }

  const windowEnd = Math.min(offset + pageSize, pool.length);
  const window = pool.slice(offset, windowEnd);
  const needsEnrichment = window.some((candidate) => candidate.width === null);

  if (needsEnrichment || !product.candidates_json) {
    const enrichedWindow = await Promise.all(window.map((candidate) => enrichCandidate(c.env.IMAGES, candidate)));
    for (let i = 0; i < enrichedWindow.length; i++) {
      pool[offset + i] = enrichedWindow[i];
    }
    await saveCandidates(c.env.DB, productId, JSON.stringify(pool));
  }

  return c.json({
    candidates: pool.slice(offset, windowEnd),
    hasMore: windowEnd < pool.length,
    total: pool.length,
  });
});

productsRoutes.post("/:id/select", async (c) => {
  const productId = c.req.param("id");
  const body = await c.req.json();
  const parsed = selectImageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
  }

  const product = await getProductById(c.env.DB, productId);
  if (!product) return c.json({ error: "not_found" }, 404);

  if ("noSuitableImage" in parsed.data) {
    await saveSelection(c.env.DB, productId, { noSuitableImage: true });
  } else {
    await saveSelection(c.env.DB, productId, {
      imageUrl: parsed.data.imageUrl,
      sourceUrl: parsed.data.sourceUrl,
    });
  }

  const updated = await getProductById(c.env.DB, productId);
  return c.json({ product: updated });
});

productsRoutes.post("/:id/reprocess", async (c) => {
  const productId = c.req.param("id");
  const body = await c.req.json();
  const parsed = reprocessSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
  }

  const product = await getProductById(c.env.DB, productId);
  if (!product) return c.json({ error: "not_found" }, 404);

  const batch = await reprocessProduct(c.env.DB, productId, parsed.data);
  if (!batch) {
    return c.json(
      { error: "no_batch", message: "El producto no pertenece a un lote de procesamiento existente" },
      400,
    );
  }

  const message: ProcessImageMessage = {
    productId,
    processingBatchId: batch.id,
    sku: product.sku,
    imageUrl: parsed.data.imageUrl,
  };
  await c.env.IMAGE_QUEUE.send(message);

  return c.json({ ok: true });
});
