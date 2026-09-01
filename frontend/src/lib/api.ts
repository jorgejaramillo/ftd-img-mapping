import type { ImageCandidate, Product } from "../types";

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
    const body = await res.json().catch(() => ({}) as { message?: string });
    throw new Error(body.message ?? `Error ${res.status}`);
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

  uploadImport: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<ImportSummary>("/imports", { method: "POST", body: formData });
  },

  assignBatch: () => request<{ products: Product[] }>("/products/assign-batch", { method: "POST" }),

  getAssigned: () => request<{ products: Product[] }>("/products/assigned"),

  searchImages: (productId: string, offset = 0) =>
    request<{ candidates: ImageCandidate[]; hasMore: boolean; total: number }>(
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

  downloadUrl: (productId: string) => `/api/products/${productId}/download`,
  downloadZipUrl: (batchId: string) => `/api/processing/${batchId}/download-zip`,
  exportCsvUrl: (batchId: string) => `/api/processing/${batchId}/export-csv`,
};
