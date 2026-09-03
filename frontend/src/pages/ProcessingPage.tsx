import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "../types";
import { api } from "../lib/api";
import { navigate } from "../App";

const POLL_INTERVAL_MS = 2000;
// "skipped" (no encontré imagen adecuada) también es terminal para este batch:
// nunca pasa por la cola, así que nunca llegaría a completed/error por sí solo.
const TERMINAL_STATUSES = ["completed", "error", "skipped"];

// Las descargas automáticas se disparan de a una y espaciadas: si se lanzan
// 100 clics de descarga en el mismo tick, Chrome descarta la mayoría.
const AUTO_DOWNLOAD_SPACING_MS = 400;
const AUTO_DOWNLOAD_PREF_KEY = "ftd-img-mapping:auto-download";

const STATUS_LABEL: Record<string, string> = {
  processing: "Procesando...",
  completed: "Completada",
  error: "Error",
  skipped: "Sin selección",
  selected: "En cola...",
};

interface QueuedDownload {
  url: string;
  filename: string;
}

function readAutoDownloadPref(): boolean {
  try {
    return window.localStorage.getItem(AUTO_DOWNLOAD_PREF_KEY) !== "off";
  } catch {
    return true; // modo incógnito / storage bloqueado: el default manda
  }
}

/** Nombre con el que se guarda la foto: `<sku>.<ext>`, igual que dentro del ZIP. */
function downloadFilename(product: Product): string {
  return product.final_r2_key?.split("/").pop() ?? product.sku;
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function ProcessingPage({ batchId }: { batchId: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoDownload, setAutoDownload] = useState(readAutoDownloadPref);
  const [allDone, setAllDone] = useState(false);

  // Cola de descargas automáticas. Vive en refs (no en estado) para que el
  // polling pueda encolar sin re-renderizar de más; `pendingDownloads` es solo
  // el espejo reactivo que necesita el redirect a resultados para no cortar
  // descargas a medio disparar.
  const queueRef = useRef<QueuedDownload[]>([]);
  const drainingRef = useRef(false);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pendingDownloads, setPendingDownloads] = useState(0);
  // Productos ya encolados: evita re-descargar la misma foto en cada vuelta
  // del polling (que devuelve el lote completo, no solo lo nuevo).
  const enqueuedRef = useRef<Set<string>>(new Set());
  // El toggle se lee dentro del polling; en un ref para no reiniciarlo al
  // cambiarlo (perdería la vuelta en curso).
  const autoDownloadRef = useRef(autoDownload);
  const firstPollRef = useRef(true);

  const syncPending = useCallback(() => {
    setPendingDownloads(queueRef.current.length + (drainingRef.current ? 1 : 0));
  }, []);

  const drain = useCallback(() => {
    if (drainingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      syncPending();
      return;
    }

    drainingRef.current = true;
    syncPending();
    triggerDownload(next.url, next.filename);

    drainTimerRef.current = setTimeout(() => {
      drainingRef.current = false;
      drain();
    }, AUTO_DOWNLOAD_SPACING_MS);
  }, [syncPending]);

  useEffect(() => {
    return () => clearTimeout(drainTimerRef.current);
  }, []);

  function handleToggleAutoDownload(enabled: boolean) {
    setAutoDownload(enabled);
    autoDownloadRef.current = enabled;
    try {
      window.localStorage.setItem(AUTO_DOWNLOAD_PREF_KEY, enabled ? "on" : "off");
    } catch {
      // storage bloqueado: la preferencia vale solo para esta pantalla
    }

    // Al reactivarlo no se descarga el backlog de golpe (serían decenas de
    // archivos de una): solo cuenta lo que se complete de acá en adelante.
    if (enabled) {
      for (const product of products ?? []) {
        if (product.status === "completed") enqueuedRef.current.add(product.id);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await api.getBatchResults(batchId);
        if (cancelled) return;
        setProducts(res.products);
        setError(null);

        const total = res.products.length;
        const done = res.products.filter((p) => TERMINAL_STATUSES.includes(p.status)).length;

        // Volver a abrir la URL de un lote YA terminado (un enlace viejo, un
        // "atrás") no debe redescargar el lote entero: solo se auto-descarga
        // lo que se completa mientras esta pantalla mira el progreso.
        const revisitingFinishedBatch = firstPollRef.current && total > 0 && done >= total;
        firstPollRef.current = false;

        if (autoDownloadRef.current && !revisitingFinishedBatch) {
          const recienListas = res.products.filter(
            (p) => p.status === "completed" && p.final_r2_key && !enqueuedRef.current.has(p.id),
          );
          if (recienListas.length > 0) {
            for (const product of recienListas) enqueuedRef.current.add(product.id);
            queueRef.current.push(
              ...recienListas.map((product) => ({
                url: api.downloadUrl(product.id),
                filename: downloadFilename(product),
              })),
            );
            syncPending();
            drain();
          }
        }

        if (total > 0 && done >= total) {
          // No se navega acá: primero hay que vaciar la cola de descargas
          // (desmontar la pantalla con descargas sin disparar las perdería).
          setAllDone(true);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        // No cortamos el polling por una falla puntual (puede ser transitoria);
        // solo avisamos y seguimos intentando.
        setError(err instanceof Error ? err.message : "Error consultando el progreso");
      }

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [batchId, drain, syncPending]);

  useEffect(() => {
    if (allDone && pendingDownloads === 0) navigate(`/results/${batchId}`);
  }, [allDone, pendingDownloads, batchId]);

  if (!products) {
    return (
      <div className="page">
        <p className="hint">Cargando progreso...</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const total = products.length;
  const done = products.filter((p) => TERMINAL_STATUSES.includes(p.status)).length;
  const errors = products.filter((p) => p.status === "error").length;
  const completed = products.filter((p) => p.status === "completed").length;

  return (
    <div className="page">
      <h1>Procesando {total} imágenes</h1>
      <p className="hint">
        {done} / {total} completadas{errors > 0 ? ` · ${errors} con error` : ""}
      </p>
      <progress value={done} max={total || 1} />
      {error && <p className="error">No se pudo actualizar el progreso ({error}); reintentando...</p>}

      <div className="processing-actions">
        <a
          className={completed === 0 ? "disabled-link" : undefined}
          href={completed === 0 ? undefined : api.downloadZipUrl(batchId)}
          aria-disabled={completed === 0}
        >
          {completed === 0 ? "Descargar ZIP (aún no hay listas)" : `Descargar las ${completed} listas (ZIP)`}
        </a>

        <label className="processing-autodownload">
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(e) => handleToggleAutoDownload(e.target.checked)}
          />
          Descargar cada foto automáticamente al terminar
        </label>
      </div>

      <p className="hint processing-autodownload-hint">
        {autoDownload
          ? "El navegador puede pedirte permiso para “descargar varios archivos”: acéptalo o las fotos siguientes no se guardarán. También puedes bajarlas una a una con el botón de cada fila."
          : "Las fotos no se descargarán solas. Usa el botón de cada fila o el ZIP para no perderlas."}
        {pendingDownloads > 0 ? ` Descargando... (${pendingDownloads} en cola)` : ""}
      </p>

      <ul className="processing-list">
        {products.map((product) => (
          <li key={product.id} className={`processing-item status-${product.status}`}>
            <span className={`processing-dot status-${product.status}`} />
            <span className="processing-sku">{product.sku}</span>
            <span className="processing-name">{product.product_name}</span>
            <span className="processing-status" title={product.error_message ?? undefined}>
              {STATUS_LABEL[product.status] ?? product.status}
            </span>
            <span className="processing-download">
              {product.status === "completed" && product.final_r2_key && (
                <a href={api.downloadUrl(product.id)} download={downloadFilename(product)}>
                  Descargar
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
