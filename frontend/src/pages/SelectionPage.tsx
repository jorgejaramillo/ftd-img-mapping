import { useEffect, useState } from "react";
import type { ImageCandidate, Product, ProductSearchState, SearchError } from "../types";
import { api, ApiError } from "../lib/api";
import { runWithConcurrency } from "../lib/concurrencyPool";
import { ProductCard } from "../components/ProductCard";
import { StickyProgressBar } from "../components/StickyProgressBar";
import { navigate } from "../App";

/** Traduce cualquier fallo de búsqueda al detalle que necesita la tarjeta.
 * Un 404 (el producto ya no existe) no es reintentable: el botón solo tiene
 * sentido cuando repetir la llamada puede dar otro resultado. */
function toSearchError(err: unknown): SearchError {
  if (err instanceof ApiError) {
    return {
      message: err.message,
      query: err.query,
      statusCode: err.statusCode,
      retryable: err.httpStatus !== 404,
    };
  }
  return { message: err instanceof Error ? err.message : "Error buscando imágenes", retryable: true };
}

const SEARCH_CONCURRENCY = 8;
// Debe coincidir con SEARCH_CANDIDATE_COUNT del worker (tamaño de página que
// devuelve /search-images por cada llamada).
const PAGE_SIZE = 10;

export function SelectionPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [searchStateByProduct, setSearchStateByProduct] = useState<Record<string, ProductSearchState | null>>({});
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const assigned = await api.getAssigned();
      const initial = assigned.products.length > 0 ? assigned : await api.assignBatch();
      if (cancelled) return;

      setProducts(initial.products);

      const initialState: Record<string, ProductSearchState | null> = {};
      for (const product of initial.products) {
        if (product.candidates_json) {
          // El worker cachea el pool completo (hasta ~100); acá solo se
          // muestra la primera página, el resto se pide con "Buscar más".
          const pool = JSON.parse(product.candidates_json) as ImageCandidate[];
          initialState[product.id] = {
            candidates: pool.slice(0, PAGE_SIZE),
            hasMore: pool.length > PAGE_SIZE,
            loadingMore: false,
          };
        } else {
          initialState[product.id] = null;
        }
      }
      setSearchStateByProduct(initialState);

      // Búsquedas de imágenes con concurrencia acotada: nunca se disparan las
      // 100 a la vez, y cada tarjeta se rellena progresivamente al resolver.
      // Si UN producto falla (ej. se borró el catálogo propio desde otra pestaña mientras esta
      // página estaba abierta) no debe tumbar la búsqueda de los demás ni la
      // pantalla completa — por eso el try/catch vive DENTRO del worker.
      const productsNeedingSearch = initial.products.filter((p) => !p.candidates_json);
      await runWithConcurrency(
        productsNeedingSearch,
        SEARCH_CONCURRENCY,
        async (product) => {
          try {
            return { ok: true as const, result: await api.searchImages(product.id) };
          } catch (err) {
            return { ok: false as const, error: toSearchError(err) };
          }
        },
        (outcome, product) => {
          if (cancelled) return;
          setSearchStateByProduct((prev) => ({
            ...prev,
            [product.id]: outcome.ok
              ? {
                  candidates: outcome.result.candidates,
                  hasMore: outcome.result.hasMore,
                  loadingMore: false,
                  query: outcome.result.query,
                }
              : { candidates: [], hasMore: false, loadingMore: false, error: outcome.error },
          }));
        },
      );
    }

    load().catch((err) => setError(err instanceof Error ? err.message : "Error cargando productos"));

    return () => {
      cancelled = true;
    };
  }, []);

  function handleSelectionChange(updated: Product) {
    setProducts((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? prev);
  }

  async function runSearch(product: Product, offset: number) {
    setSearchStateByProduct((prev) => {
      const existing = prev[product.id];
      return { ...prev, [product.id]: { candidates: existing?.candidates ?? [], hasMore: false, loadingMore: true } };
    });

    try {
      const result = await api.searchImages(product.id, offset);
      setSearchStateByProduct((prev) => {
        const existing = prev[product.id];
        const priorCandidates = offset === 0 ? [] : (existing?.candidates ?? []);
        return {
          ...prev,
          [product.id]: {
            candidates: [...priorCandidates, ...result.candidates],
            hasMore: result.hasMore,
            loadingMore: false,
            query: result.query,
          },
        };
      });
    } catch (err) {
      setSearchStateByProduct((prev) => ({
        ...prev,
        [product.id]: {
          candidates: prev[product.id]?.candidates ?? [],
          hasMore: false,
          loadingMore: false,
          error: toSearchError(err),
        },
      }));
    }
  }

  async function handleProcess() {
    setProcessing(true);
    setError(null);
    try {
      const res = await api.startProcessing();
      navigate(`/processing/${res.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error iniciando el procesamiento");
      setProcessing(false);
    }
  }

  if (error) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <button onClick={() => window.location.reload()}>Recargar</button>
      </div>
    );
  }
  if (!products) return <p className="hint">Cargando productos...</p>;

  if (products.length === 0) {
    return (
      <div className="page">
        <p className="hint">No tienes productos pendientes asignados.</p>
        <button onClick={() => navigate("/import")}>Importar productos</button>
      </div>
    );
  }

  const selectedCount = products.filter((p) => p.status === "selected" || p.status === "skipped").length;

  return (
    <div className="page selection-page">
      <div className="product-list">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            searchState={searchStateByProduct[product.id] ?? null}
            onSelectionChange={handleSelectionChange}
            onLoadMore={() => runSearch(product, searchStateByProduct[product.id]?.candidates.length ?? 0)}
            onRetry={() => runSearch(product, 0)}
          />
        ))}
      </div>
      <StickyProgressBar
        selectedCount={selectedCount}
        totalCount={products.length}
        onProcess={handleProcess}
        processing={processing}
      />
    </div>
  );
}
