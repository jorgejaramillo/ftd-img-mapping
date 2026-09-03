export type ProductStatus =
  | "pending"
  | "assigned"
  | "selected"
  | "skipped"
  | "processing"
  | "completed"
  | "error";

export interface ImageCandidate {
  position: number;
  imageUrl: string;
  sourceUrl: string;
  title: string;
  domain: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  format: string | null;
  thumbnailUrl: string | null;
}

export interface SearchError {
  message: string;
  /** Consulta exacta que se envió a Google Images. Es el dato clave para
   * entender por qué un producto no encontró nada (ej. un EAN corrupto). */
  query?: string;
  /** status_code de DataForSEO — NO es el código HTTP. */
  statusCode?: number;
  /** false cuando reintentar la misma consulta daría exactamente lo mismo. */
  retryable: boolean;
}

export interface ProductSearchState {
  candidates: ImageCandidate[];
  hasMore: boolean;
  loadingMore: boolean;
  /** Consulta usada en esta búsqueda; se muestra cuando no hubo resultados. */
  query?: string;
  // Falla puntual de ESTE producto (ej. ya no existe porque se borró el
  // catálogo propio mientras la página estaba abierta) — nunca debe tumbar toda la
  // pantalla, solo esta tarjeta.
  error?: SearchError;
}

export interface Product {
  id: string;
  import_id: string;
  owner_email: string;
  ean: string;
  product_name: string;
  sku: string;
  status: ProductStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  candidates_json: string | null;
  candidates_fetched_at: string | null;
  selected_image_url: string | null;
  selected_source_url: string | null;
  no_suitable_image: number;
  processing_batch_id: string | null;
  original_width: number | null;
  original_height: number | null;
  original_format: string | null;
  original_filesize: number | null;
  final_r2_key: string | null;
  final_width: number | null;
  final_height: number | null;
  final_format: string | null;
  final_filesize: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}
