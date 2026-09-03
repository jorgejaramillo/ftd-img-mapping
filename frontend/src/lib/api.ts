import type { ImageCandidate, Product } from "../types";

export class UnauthorizedError extends Error {}

interface ApiErrorBody {
  error?: string;
  message?: string;
  /** Consulta exacta enviada a Google Images (la reporta /search-images). */
  query?: string;
  /** status_code de DataForSEO — NO es el código HTTP. */
  statusCode?: number;
}

/** Conserva el cuerpo del error del backend en vez de aplastarlo a un string:
 * sin esto, datos de diagnóstico como la consulta que falló se pierden antes
 * de llegar a la pantalla. */
export class ApiError extends Error {
  readonly httpStatus: number;
  readonly code?: string;
  readonly query?: string;
  readonly statusCode?: number;

  constructor(httpStatus: number, body: ApiErrorBody) {
    super(body.message ?? `Error ${httpStatus}`);
    this.name = "ApiError";
    this.httpStatus = httpStatus;
    this.code = body.error;
    this.query = body.query;
    this.statusCode = body.statusCode;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;

  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    if (res.status === 401) {
      throw new UnauthorizedError(body.message ?? "No autenticado");
    }
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

export interface ImportSummary {
  importId: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  duplicateRows: number;
}

export const api = {
  me: () => request<{ user: { email: string; name?: string } }>("/me"),

  login: (email: string, password: string) =>
    request<{ user: { email: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  uploadImport: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<ImportSummary>("/imports", { method: "POST", body: formData });
  },

  clearAllData: () => request<{ ok: true }>("/imports/clear", { method: "POST" }),

  assignBatch: () => request<{ products: Product[] }>("/products/assign-batch", { method: "POST" }),

  getAssigned: () => request<{ products: Product[] }>("/products/assigned"),

  searchImages: (productId: string, offset = 0) =>
    request<{ candidates: ImageCandidate[]; hasMore: boolean; total: number; query: string }>(
      `/products/${productId}/search-images?offset=${offset}`,
      { method: "POST" },
    ),

  selectImage: (productId: string, selection: { imageUrl: string; sourceUrl: string } | { noSuitableImage: true }) =>
    request<{ product: Product }>(`/products/${productId}/select`, {
      method: "POST",
      body: JSON.stringify(selection),
    }),

  startProcessing: () => request<{ batchId: string; totalProducts: number }>("/processing/start", { method: "POST" }),

  getBatchStatus: (batchId: string) => request<{ counts: Record<string, number> }>(`/processing/${batchId}/status`),

  getBatchResults: (batchId: string) => request<{ products: Product[] }>(`/processing/${batchId}/results`),

  reprocess: (productId: string, selection: { imageUrl: string; sourceUrl: string }) =>
    request<{ ok: true }>(`/products/${productId}/reprocess`, {
      method: "POST",
      body: JSON.stringify(selection),
    }),

  retryErrors: (batchId: string) =>
    request<{ retried: number }>(`/processing/${batchId}/retry-errors`, { method: "POST" }),

  downloadUrl: (productId: string) => `/api/products/${productId}/download`,
  downloadZipUrl: (batchId: string) => `/api/processing/${batchId}/download-zip`,
  exportCsvUrl: (batchId: string) => `/api/processing/${batchId}/export-csv`,
};
