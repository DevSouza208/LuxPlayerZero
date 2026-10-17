-- Secondary metadata index. No changes to catalog_sources or R2 objects.
CREATE TABLE IF NOT EXISTS search_generations (
 id TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, snapshot_key TEXT NOT NULL,
 snapshot_time TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0,
 row_count INTEGER NOT NULL DEFAULT 0, group_name TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'building', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS search_generations_catalog ON search_generations(catalog_id,created_at);
CREATE TABLE IF NOT EXISTS search_heads (catalog_id TEXT PRIMARY KEY, generation_id TEXT NOT NULL REFERENCES search_generations(id));
CREATE TABLE IF NOT EXISTS search_entries (
 generation_id TEXT NOT NULL REFERENCES search_generations(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, title TEXT NOT NULL, display_title TEXT NOT NULL,
 group_name TEXT NOT NULL, kind TEXT NOT NULL, year INTEGER, search_text TEXT NOT NULL,
 PRIMARY KEY(generation_id,ordinal)
);
CREATE INDEX IF NOT EXISTS search_kind_title ON search_entries(generation_id,kind,display_title,ordinal);
CREATE INDEX IF NOT EXISTS search_kind_year ON search_entries(generation_id,kind,year,ordinal);
