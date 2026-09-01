import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { navigate } from "../App";

const POLL_INTERVAL_MS = 2000;
// "skipped" (no encontré imagen adecuada) también es terminal para este batch:
// nunca pasa por la cola, así que nunca llegaría a completed/error por sí solo.
const TERMINAL_STATUSES = ["completed", "error", "skipped"];

export function ProcessingPage({ batchId }: { batchId: string }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await api.getBatchStatus(batchId);
      if (cancelled) return;
      setCounts(res.counts);

      const total = Object.values(res.counts).reduce((sum, n) => sum + n, 0);
      const done = TERMINAL_STATUSES.reduce((sum, status) => sum + (res.counts[status] ?? 0), 0);

      if (total > 0 && done >= total) {
        navigate(`/results/${batchId}`);
        return;
      }

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [batchId]);

  if (!counts) return <p className="hint">Cargando progreso...</p>;

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const done = TERMINAL_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

  return (
    <div className="page">
      <h1>Procesando {total} imágenes</h1>
      <p className="hint">
        {done} / {total} completadas
      </p>
      <progress value={done} max={total || 1} />
    </div>
  );
}
