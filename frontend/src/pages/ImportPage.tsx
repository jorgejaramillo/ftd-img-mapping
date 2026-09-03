import { useState, type FormEvent } from "react";
import { api, type ImportSummary } from "../lib/api";
import { navigate } from "../App";

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.uploadImport(file);
      setResult(res);
      setCleared(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    setError(null);
    try {
      await api.clearAllData();
      setConfirmingClear(false);
      setCleared(true);
      setResult(null);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error borrando los datos");
    } finally {
      setClearing(false);
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

      <div className="danger-zone">
        <h2>Borrar mis resultados</h2>
        <p className="hint">
          Elimina tus productos, tus importaciones y tus lotes de procesamiento para empezar de cero. Solo afecta a
          tu cuenta: el trabajo de los demás usuarios queda intacto. No borra las imágenes ya descargadas.
        </p>

        {cleared && <p className="hint">Tus datos fueron borrados. Ya puedes importar un archivo nuevo.</p>}

        {!confirmingClear ? (
          <button className="danger-btn" onClick={() => setConfirmingClear(true)}>
            Borrar mis resultados
          </button>
        ) : (
          <div className="danger-confirm">
            <span>¿Seguro? Esto borra todos tus productos y resultados, y no se puede deshacer.</span>
            <button className="danger-btn" onClick={handleClearAll} disabled={clearing}>
              {clearing ? "Borrando..." : "Sí, borrar mis datos"}
            </button>
            <button onClick={() => setConfirmingClear(false)} disabled={clearing}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
