import { Fragment, useEffect, useState } from "react";
import type { ImageCandidate, Product } from "../types";
import { api } from "../lib/api";
import { navigate } from "../App";
import { ImageCandidateGrid } from "../components/ImageCandidateGrid";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  return `${Math.round(bytes / 1024)} KB`;
}

export function ResultsPage({ batchId }: { batchId: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  useEffect(() => {
    api.getBatchResults(batchId).then((res) => setProducts(res.products));
  }, [batchId]);

  async function handleReprocess(product: Product, candidate: ImageCandidate) {
    await api.reprocess(product.id, { imageUrl: candidate.imageUrl, sourceUrl: candidate.sourceUrl });
    setReprocessingId(null);
    navigate(`/processing/${batchId}`);
  }

  if (!products) return <p className="hint">Cargando resultados...</p>;

  const completed = products.filter((p) => p.status === "completed").length;
  const errors = products.filter((p) => p.status === "error").length;
  const skipped = products.filter((p) => p.status === "skipped").length;

  return (
    <div className="page">
      <h1>Procesamiento completado</h1>
      <div className="results-summary">
        <span>Procesadas: {completed}</span>
        <span>Errores: {errors}</span>
        <span>Sin selección: {skipped}</span>
        <span>Total: {products.length}</span>
      </div>

      <div className="results-actions">
        <a href={api.downloadZipUrl(batchId)}>Descargar ZIP</a>
        <a href={api.exportCsvUrl(batchId)}>Exportar CSV</a>
      </div>

      <table className="results-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Producto</th>
            <th>Tamaño original</th>
            <th>Tamaño final</th>
            <th>Peso original</th>
            <th>Peso final</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <Fragment key={product.id}>
              <tr>
                <td>{product.sku}</td>
                <td>{product.product_name}</td>
                <td>
                  {product.original_width && product.original_height
                    ? `${product.original_width}×${product.original_height}`
                    : "—"}
                </td>
                <td>
                  {product.final_width && product.final_height
                    ? `${product.final_width}×${product.final_height}`
                    : "—"}
                </td>
                <td>{formatBytes(product.original_filesize)}</td>
                <td>{formatBytes(product.final_filesize)}</td>
                <td>{product.status}</td>
                <td>
                  {product.status === "completed" && <a href={api.downloadUrl(product.id)}>Descargar</a>}{" "}
                  {product.status === "error" && <span title={product.error_message ?? ""}>Ver error</span>}{" "}
                  {product.candidates_json && (
                    <button onClick={() => setReprocessingId(reprocessingId === product.id ? null : product.id)}>
                      Reprocesar
                    </button>
                  )}
                </td>
              </tr>
              {reprocessingId === product.id && product.candidates_json && (
                <tr>
                  <td colSpan={8}>
                    <ImageCandidateGrid
                      candidates={JSON.parse(product.candidates_json) as ImageCandidate[]}
                      selectedImageUrl={product.selected_image_url}
                      onSelect={(candidate) => handleReprocess(product, candidate)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
