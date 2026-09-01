import type { ImageCandidate } from "../types";

function formatBytes(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

// Tamaño final que produce el pipeline (OUTPUT_WIDTH/OUTPUT_HEIGHT en el
// worker, por defecto 1000x1000). Una candidata que ya viene en este tamaño
// exacto no necesitaría reescalado real al procesarse.
const TARGET_WIDTH = 1000;
const TARGET_HEIGHT = 1000;

export function ImageCandidateThumb({
  candidate,
  selected,
  onSelect,
}: {
  candidate: ImageCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const isTargetSize = candidate.width === TARGET_WIDTH && candidate.height === TARGET_HEIGHT;
  const sizeLabel = candidate.width && candidate.height ? `${candidate.width} × ${candidate.height} px` : "";
  const weightLabel = formatBytes(candidate.fileSize);
  const formatLabel = candidate.format?.toUpperCase();

  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    // El sitio de origen puede bloquear el hotlinking de imageUrl: se cae una
    // sola vez a la miniatura cacheada por Google antes de rendirse.
    const img = e.currentTarget;
    if (candidate.thumbnailUrl && img.src !== candidate.thumbnailUrl) {
      img.src = candidate.thumbnailUrl;
    }
  }

  return (
    <button
      type="button"
      className={`candidate-thumb ${selected ? "selected" : ""}`}
      onClick={onSelect}
      title={candidate.title}
    >
      {isTargetSize && <div className="candidate-size-badge">1000×1000 ✓</div>}
      <img src={candidate.imageUrl} alt={candidate.title} loading="lazy" onError={handleImgError} />
      <div className="candidate-meta">
        <span className={isTargetSize ? "candidate-size-ok" : ""}>{sizeLabel}</span>
        {(weightLabel || formatLabel) && (
          <span className="candidate-meta-secondary">{[weightLabel, formatLabel].filter(Boolean).join(" · ")}</span>
        )}
      </div>
      {selected && <div className="candidate-badge">✓ Seleccionada</div>}
    </button>
  );
}
