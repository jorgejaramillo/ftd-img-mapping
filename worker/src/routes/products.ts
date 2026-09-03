import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/auth";
import { assignNextBatch } from "../services/assignment";
import { buildKeyword, DataForSeoError, searchGoogleImages } from "../services/dataforseo";
import { tryInspectRemoteImage } from "../services/imagePipeline";
import { getAssignedProducts, getProductById, reprocessProduct, saveCandidates, saveSelection } from "../db/queries";
import { getOwnedProduct, PRODUCT_NOT_FOUND_BODY } from "../services/ownership";
import { reprocessSchema, selectImageSchema } from "../utils/validation";
import type { ImageCandidate, ProcessImageMessage } from "../types";

export const productsRoutes = new Hono<AppEnv>();

productsRoutes.use("*", requireAuth);

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

  const product = await getOwnedProduct(c.env.DB, productId, c.get("user").email);
  if (!product) return c.json(PRODUCT_NOT_FOUND_BODY, 404);

  let pool: ImageCandidate[];
  // La consulta que se mandó a Google. Solo se conoce cuando se consultó en
  // esta llamada; con el pool cacheado se puede recomponer igual, porque
  // buildKeyword() es determinística sobre ean + nombre.
  let query: string;

  // Un pool cacheado VACÍO no cuenta como caché: se vuelve a consultar. Si no,
  // "Buscar de nuevo" leería para siempre ese vacío sin llamar a DataForSEO
  // (le pasa a las filas que quedaron con '[]' guardado de antes).
  const cachedPool = product.candidates_json
    ? (JSON.parse(product.candidates_json) as ImageCandidate[])
    : null;
  const cached = cachedPool !== null && cachedPool.length > 0;

  if (cached) {
    pool = cachedPool;
    query = buildKeyword(product.ean, product.product_name);
  } else {
    try {
      const result = await searchGoogleImages({
        ean: product.ean,
        productName: product.product_name,
        locationCode: Number(c.env.DATAFORSEO_LOCATION_CODE ?? "2032"),
        languageCode: c.env.DATAFORSEO_LANGUAGE_CODE ?? "es",
        login: c.env.DATAFORSEO_LOGIN,
        password: c.env.DATAFORSEO_PASSWORD,
      });
      pool = result.candidates;
      query = result.keyword;
    } catch (err) {
      if (err instanceof DataForSeoError) {
        // Queda en los logs del Worker (observability está activo) con todo lo
        // necesario para reproducir la consulta desde el dashboard.
        console.error("dataforseo_error", {
          sku: product.sku,
          ean: product.ean,
          keyword: err.detail.keyword,
          statusCode: err.detail.statusCode,
          message: err.message,
        });
        return c.json(
          {
            error: "dataforseo_error",
            message: err.message,
            query: err.detail.keyword,
            statusCode: err.detail.statusCode,
          },
          502,
        );
      }
      throw err;
    }
  }

  const windowEnd = Math.min(offset + pageSize, pool.length);
  const window = pool.slice(offset, windowEnd);
  const needsEnrichment = window.some((candidate) => candidate.width === null);

  // Un pool VACÍO no se cachea: si se guardara "[]", `candidates_json` pasaría
  // a ser truthy y "Reintentar" devolvería para siempre ese vacío cacheado sin
  // volver a consultar — exactamente el "no pasa nada" al reintentar.
  if (pool.length > 0 && (needsEnrichment || !cached)) {
    const enrichedWindow = await Promise.all(window.map((candidate) => enrichCandidate(c.env.IMAGES, candidate)));
    for (let i = 0; i < enrichedWindow.length; i++) {
      pool[offset + i] = enrichedWindow[i];
    }
    await saveCandidates(c.env.DB, productId, JSON.stringify(pool));
  }

  if (pool.length === 0) {
    console.warn("search_images_sin_resultados", { sku: product.sku, ean: product.ean, query });
  }

  return c.json({
    candidates: pool.slice(offset, windowEnd),
    hasMore: windowEnd < pool.length,
    total: pool.length,
    query,
  });
});

productsRoutes.post("/:id/select", async (c) => {
  const productId = c.req.param("id");
  const body = await c.req.json();
  const parsed = selectImageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
  }

  const product = await getOwnedProduct(c.env.DB, productId, c.get("user").email);
  if (!product) return c.json(PRODUCT_NOT_FOUND_BODY, 404);

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

  const product = await getOwnedProduct(c.env.DB, productId, c.get("user").email);
  if (!product) return c.json(PRODUCT_NOT_FOUND_BODY, 404);

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
