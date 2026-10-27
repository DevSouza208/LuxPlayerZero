-- Origem cifrada para baixar diariamente o mesmo M3U; entrega usa catalog_sources.catalog_id estável.
CREATE TABLE IF NOT EXISTS catalog_refresh_sources (
 source_hash TEXT PRIMARY KEY,
 source_cipher TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
