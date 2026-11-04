-- Cache WebP com deduplicacao por titulo TMDB; sem alterar URLs da playlist.
CREATE TABLE IF NOT EXISTS vod_image_jobs(
 tipo TEXT NOT NULL CHECK(tipo IN ('movie','tv')),
 tmdb_id INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('poster','backdrop')),
 source_url TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 r2_key TEXT,
 bytes INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 retry_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tipo,tmdb_id,kind)
);
CREATE INDEX IF NOT EXISTS vod_image_next ON vod_image_jobs(status,retry_at,lease_until,updated_at);
CREATE TABLE IF NOT EXISTS vod_image_budget(
 period TEXT PRIMARY KEY,
 conversions INTEGER NOT NULL DEFAULT 0,
 bytes INTEGER NOT NULL DEFAULT 0,
 processing_ms INTEGER NOT NULL DEFAULT 0
);