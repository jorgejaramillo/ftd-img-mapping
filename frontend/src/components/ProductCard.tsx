import { useState } from "react";
import type { ImageCandidate, Product, ProductSearchState } from "../types";
import { api } from "../lib/api";
import { ImageCandidateGrid } from "./ImageCandidateGrid";

export function ProductCard({
  product,
  searchState,
  onSelectionChange,
  onLoadMore,
  onRetry,
}: {
  product: Product;
  searchState: ProductSearchState | null;
  onSelectionChange: (updated: Product) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const [actionError, setActionError] = useState<string | null>(null);

  async function select(candidate: ImageCandidate) {
    setActionError(null);
    try {
      const res = await api.selectImage(product.id, { imageUrl: candidate.imageUrl, sourceUrl: candidate.sourceUrl });
      onSelectionChange(res.product);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo guardar la selección");
    }
  }

  async function markNoSuitableImage() {
    setActionError(null);
    try {
      const res = await api.selectImage(product.id, { noSuitableImage: true });
      onSelectionChange(res.product);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  const candidates = searchState?.candidates ?? null;
  const searching = searchState?.loadingMore ?? false;
  const searchError = searchState?.error;
  // Sin candidatas y sin error: la búsqueda corrió y Google no devolvió nada.
  // Es un desenlace normal (no un fallo), pero hay que mostrar CON QUÉ se buscó
  // para que se pueda ver si el problema es el dato de entrada.
  const noResults = !searching && !searchError && candidates !== null && candidates.length === 0;
  const hasCandidates = Boolean(candidates && candidates.length > 0);

  return (
    <div className={`product-card status-${product.status}`}>
      <div className="product-card-header">
        <span className="product-sku">SKU {product.sku}</span>
        <span className="product-name">{product.product_name}</span>
        <span className="product-ean">EAN: {product.ean}</span>
        {searchState?.hasMore && (
          <button type="button" className="load-more-btn" onClick={onLoadMore} disabled={searchState.loadingMore}>
            {searchState.loadingMore ? "Buscando más..." : "Buscar más resultados"}
          </button>
        )}
      </div>

      {!hasCandidates && (searching || (candidates === null && !searchError)) && (
        <p className="hint">Buscando imágenes...</p>
      )}

      {!searching && searchError && (
        <div className="card-error">
          <div className="card-error-text">
            <span>No se pudo cargar este producto: {searchError.message}</span>
            {searchError.statusCode !== undefined && (
              <span className="card-error-detail">Código DataForSEO: {searchError.statusCode}</span>
            )}
            {searchError.query && (
              <span className="card-error-detail">
                Consulta: <code>{searchError.query}</code>
              </span>
            )}
          </div>
          {searchError.retryable && (
            <button type="button" onClick={onRetry}>
              Reintentar
            </button>
          )}
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <ImageCandidateGrid candidates={candidates} selectedImageUrl={product.selected_image_url} onSelect={select} />
      )}

      {noResults && (
        <div className="card-empty">
          <div className="card-error-text">
            <span>Google no devolvió imágenes para este producto.</span>
            {searchState?.query && (
              <span className="card-error-detail">
                Se buscó: <code>{searchState.query}</code>
              </span>
            )}
          </div>
          <button type="button" onClick={onRetry}>
            Buscar de nuevo
          </button>
        </div>
      )}

      {actionError && <p className="error">{actionError}</p>}

      <button
        type="button"
        className={`no-suitable-btn ${product.no_suitable_image ? "active" : ""}`}
        onClick={markNoSuitableImage}
      >
        No encontré una imagen adecuada
      </button>
    </div>
  );
}
