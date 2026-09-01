import { useState, type FormEvent } from "react";
import { api, type ImportSummary } from "../lib/api";
import { navigate } from "../App";

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.uploadImport(file);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>Importar productos</h1>
      <p className="hint">Sube un archivo .csv o .xlsx con columnas SKU, EAN y PRODUCT_NAME (en cualquier orden).</p>

      <form onSubmit={handleSubmit} className="import-form">
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="submit" disabled={!file || submitting}>
          {submitting ? "Importando..." : "Importar"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="import-summary">
          <p>Total de filas: {result.totalRows}</p>
          <p>Importados: {result.importedRows}</p>
          <p>Filas vacías/omitidas: {result.skippedRows}</p>
          <p>Duplicados (ignorados): {result.duplicateRows}</p>
          <button onClick={() => navigate("/")}>Ir a selección de imágenes</button>
        </div>
      )}
    </div>
  );
}
