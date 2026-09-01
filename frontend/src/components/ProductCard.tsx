import type { ImageCandidate, Product, ProductSearchState } from "../types";
import { api } from "../lib/api";
import { ImageCandidateGrid } from "./ImageCandidateGrid";

export function ProductCard({
  product,
  searchState,
  onSelectionChange,
  onLoadMore,
}: {
  product: Product;
  searchState: ProductSearchState | null;
  onSelectionChange: (updated: Product) => void;
  onLoadMore: () => void;
}) {
  async function select(candidate: ImageCandidate) {
    const res = await api.selectImage(product.id, { imageUrl: candidate.imageUrl, sourceUrl: candidate.sourceUrl });
    onSelectionChange(res.product);
  }

  async function markNoSuitableImage() {
    const res = await api.selectImage(product.id, { noSuitableImage: true });
    onSelectionChange(res.product);
  }

  const candidates = searchState?.candidates ?? null;

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

      {candidates === null && <p className="hint">Buscando imágenes...</p>}

      {candidates && candidates.length > 0 && (
        <ImageCandidateGrid candidates={candidates} selectedImageUrl={product.selected_image_url} onSelect={select} />
      )}

      {candidates && candidates.length === 0 && <p className="hint">No se encontraron imágenes para este producto.</p>}

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
