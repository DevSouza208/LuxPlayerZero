-- D1: índice privado de playlists M3U. O arquivo real fica no R2.
-- Esta tabela também é criada na primeira sincronização, caso ainda não exista.
CREATE TABLE IF NOT EXISTS catalog_sources (
  source_hash TEXT PRIMARY KEY,
  catalog_id TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL
);
