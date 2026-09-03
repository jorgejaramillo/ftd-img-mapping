-- Aislamiento por usuario: cada producto pertenece al usuario que subió su
-- import. Antes el catálogo era un pozo común (cualquiera tomaba lotes de
-- 'pending' de cualquier import) y "borrar datos" arrasaba con el trabajo de
-- todos. Ahora cada usuario ve, asigna y borra únicamente lo suyo.
--
-- Eso obliga a bajar el UNIQUE del SKU de global a por-dueño: si dos personas
-- suben el mismo archivo, la segunda importaba 0 filas ("todo duplicado").
-- SQLite no permite eliminar un UNIQUE ya creado, así que se reconstruye la
-- tabla. Es seguro: ninguna otra tabla tiene FK hacia products.

CREATE TABLE products_new (
  id                    TEXT PRIMARY KEY,
  import_id             TEXT NOT NULL REFERENCES imports(id),
  owner_email           TEXT NOT NULL,
  ean                   TEXT NOT NULL,
  product_name          TEXT NOT NULL,
  sku                   TEXT NOT NULL,
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
  final_height          INTEGER,
  final_format          TEXT,
  final_filesize        INTEGER,
  error_message         TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at          TEXT,
  UNIQUE (owner_email, sku)
);

-- Backfill: el dueño es quien subió el import (imports.created_by), salvo que
-- la fila ya esté tomada por alguien — ahí manda assigned_to. Bajo el modelo
-- viejo de pozo común, una persona podía estar trabajando productos de un
-- import ajeno; dárselos a quien los tiene asignados preserva ese trabajo en
-- curso (y sus descargas ya procesadas) en vez de dejárselo a quien subió el
-- archivo. No puede chocar con UNIQUE(owner_email, sku): el SKU era único
-- global, así que cada par (dueño, sku) sigue siendo único.
INSERT INTO products_new (
  id, import_id, owner_email, ean, product_name, sku, status, assigned_to, assigned_at,
  candidates_json, candidates_fetched_at, selected_image_url, selected_source_url,
  no_suitable_image, processing_batch_id, original_width, original_height, original_format,
  original_filesize, final_r2_key, final_width, final_height, final_format, final_filesize,
  error_message, created_at, updated_at, processed_at
)
SELECT
  p.id, p.import_id, COALESCE(p.assigned_to, i.created_by), p.ean, p.product_name, p.sku, p.status, p.assigned_to, p.assigned_at,
  p.candidates_json, p.candidates_fetched_at, p.selected_image_url, p.selected_source_url,
  p.no_suitable_image, p.processing_batch_id, p.original_width, p.original_height, p.original_format,
  p.original_filesize, p.final_r2_key, p.final_width, p.final_height, p.final_format, p.final_filesize,
  p.error_message, p.created_at, p.updated_at, p.processed_at
FROM products p
JOIN imports i ON i.id = p.import_id;

DROP TABLE products;

ALTER TABLE products_new RENAME TO products;

CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_owner_status ON products(owner_email, status);
CREATE INDEX idx_products_assigned_status ON products(assigned_to, status);
CREATE INDEX idx_products_import_id ON products(import_id);
CREATE INDEX idx_products_processing_batch_id ON products(processing_batch_id);
