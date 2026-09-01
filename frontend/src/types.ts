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

export interface ProductSearchState {
  candidates: ImageCandidate[];
  hasMore: boolean;
  loadingMore: boolean;
}

export interface Product {
  id: string;
  import_id: string;
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
