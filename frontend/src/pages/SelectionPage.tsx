import { useEffect, useState } from "react";
import type { ImageCandidate, Product, ProductSearchState } from "../types";
import { api } from "../lib/api";
import { runWithConcurrency } from "../lib/concurrencyPool";
import { ProductCard } from "../components/ProductCard";
import { StickyProgressBar } from "../components/StickyProgressBar";
import { navigate } from "../App";

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
      const productsNeedingSearch = initial.products.filter((p) => !p.candidates_json);
      await runWithConcurrency(
        productsNeedingSearch,
        SEARCH_CONCURRENCY,
        (product) => api.searchImages(product.id),
        (result, product) => {
          if (cancelled) return;
          setSearchStateByProduct((prev) => ({
            ...prev,
            [product.id]: { candidates: result.candidates, hasMore: result.hasMore, loadingMore: false },
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

  async function handleLoadMore(product: Product) {
    const current = searchStateByProduct[product.id];
    if (!current || current.loadingMore) return;

    setSearchStateByProduct((prev) => ({ ...prev, [product.id]: { ...current, loadingMore: true } }));

    try {
      const result = await api.searchImages(product.id, current.candidates.length);
      setSearchStateByProduct((prev) => {
        const existing = prev[product.id];
        if (!existing) return prev;
        return {
          ...prev,
          [product.id]: {
            candidates: [...existing.candidates, ...result.candidates],
            hasMore: result.hasMore,
            loadingMore: false,
          },
        };
      });
    } catch (err) {
      setSearchStateByProduct((prev) => {
        const existing = prev[product.id];
        if (!existing) return prev;
        return { ...prev, [product.id]: { ...existing, loadingMore: false } };
      });
      setError(err instanceof Error ? err.message : "Error buscando más imágenes");
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

  if (error) return <p className="error">{error}</p>;
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
            onLoadMore={() => handleLoadMore(product)}
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
