export function StickyProgressBar({
  selectedCount,
  totalCount,
  onProcess,
  processing,
}: {
  selectedCount: number;
  totalCount: number;
  onProcess: () => void;
  processing: boolean;
}) {
  const canProcess = selectedCount > 0 && !processing;

  return (
    <div className="sticky-progress-bar">
      <span>
        {selectedCount} / {totalCount} productos seleccionados
      </span>
      <button onClick={onProcess} disabled={!canProcess}>
        {processing ? "Procesando..." : "Procesar imágenes seleccionadas"}
      </button>
    </div>
  );
}
