import type { ImageCandidate } from "../types";
import { ImageCandidateThumb } from "./ImageCandidateThumb";

export function ImageCandidateGrid({
  candidates,
  selectedImageUrl,
  onSelect,
}: {
  candidates: ImageCandidate[];
  selectedImageUrl: string | null;
  onSelect: (candidate: ImageCandidate) => void;
}) {
  return (
    <div className="candidate-grid">
      {candidates.map((candidate) => (
        <ImageCandidateThumb
          key={`${candidate.position}-${candidate.imageUrl}`}
          candidate={candidate}
          selected={selectedImageUrl === candidate.imageUrl}
          onSelect={() => onSelect(candidate)}
        />
      ))}
    </div>
  );
}
