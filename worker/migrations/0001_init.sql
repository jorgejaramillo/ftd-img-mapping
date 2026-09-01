PRAGMA foreign_keys = ON;

CREATE TABLE imports (
  id              TEXT PRIMARY KEY,
  filename        TEXT NOT NULL,
  total_rows      INTEGER NOT NULL DEFAULT 0,
  imported_rows   INTEGER NOT NULL DEFAULT 0,
  skipped_rows    INTEGER NOT NULL DEFAULT 0,
  duplicate_rows  INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE processing_batches (
  id              TEXT PRIMARY KEY,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  total_products  INTEGER NOT NULL
);

CREATE TABLE products (
  id                    TEXT PRIMARY KEY,
  import_id             TEXT NOT NULL REFERENCES imports(id),
  ean                   TEXT NOT NULL,
  product_name          TEXT NOT NULL,
  sku                   TEXT NOT NULL UNIQUE,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','assigned','selected','skipped','processing','completed','error')),
  assigned_to           TEXT,
  assigned_at           TEXT,
  candidates_json       TEXT,
  candidates_fetched_at TEXT,
  selected_image_url    TEXT,
  selected_source_url   TEXT,
  no_suitable_image     INTEGER NOT NULL DEFAULT 0,
  processing_batch_id   TEXT REFERENCES processing_batches(id),
  original_width        INTEGER,
  original_height       INTEGER,
  original_format       TEXT,
  original_filesize     INTEGER,
  final_r2_key          TEXT,
  final_width           INTEGER,
  final_height           INTEGER,
  final_format          TEXT,
  final_filesize        INTEGER,
  error_message         TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at          TEXT
);

CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_assigned_status ON products(assigned_to, status);
CREATE INDEX idx_products_import_id ON products(import_id);
CREATE INDEX idx_products_processing_batch_id ON products(processing_batch_id);
