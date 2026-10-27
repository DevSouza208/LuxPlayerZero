-- Catálogo editorial persistente. Episódios e streams continuam somente na M3U/R2.
CREATE TABLE IF NOT EXISTS filmes (
 id TEXT PRIMARY KEY, titulo TEXT NOT NULL, titulo_normalizado TEXT NOT NULL, ano INTEGER, nome_original TEXT, id_provedor TEXT, fornecedor TEXT,
 tmdb_id INTEGER, capa TEXT, fundo TEXT, generos TEXT NOT NULL DEFAULT '[]',
 tags TEXT NOT NULL DEFAULT '[]', colecoes TEXT NOT NULL DEFAULT '[]', tags_fonte TEXT NOT NULL DEFAULT '[]',
 status_metadados TEXT NOT NULL DEFAULT 'pendente', consultar_apos INTEGER NOT NULL DEFAULT 0,
 metadados_em INTEGER, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS filmes_consulta ON filmes(status_metadados,consultar_apos,id);
CREATE INDEX IF NOT EXISTS filmes_titulo ON filmes(titulo_normalizado,ano);
CREATE TABLE IF NOT EXISTS series (
 id TEXT PRIMARY KEY, titulo TEXT NOT NULL, titulo_normalizado TEXT NOT NULL, ano INTEGER, nome_original TEXT, id_provedor TEXT, fornecedor TEXT,
 tmdb_id INTEGER, capa TEXT, fundo TEXT, generos TEXT NOT NULL DEFAULT '[]',
 tags TEXT NOT NULL DEFAULT '[]', colecoes TEXT NOT NULL DEFAULT '[]', tags_fonte TEXT NOT NULL DEFAULT '[]',
 status_metadados TEXT NOT NULL DEFAULT 'pendente', consultar_apos INTEGER NOT NULL DEFAULT 0,
 metadados_em INTEGER, criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS series_consulta ON series(status_metadados,consultar_apos,id);
CREATE INDEX IF NOT EXISTS series_titulo ON series(titulo_normalizado,ano);
CREATE TABLE IF NOT EXISTS vod_catalog_jobs (
 catalog_id TEXT PRIMARY KEY, generation TEXT NOT NULL, snapshot_key TEXT NOT NULL, snapshot_time TEXT NOT NULL,
 cursor INTEGER NOT NULL DEFAULT 0, entry_count INTEGER NOT NULL DEFAULT 0, group_name TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'building', lease_until INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vod_catalog_items (
 catalog_id TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('filmes','series')), item_id TEXT NOT NULL,
 generation TEXT NOT NULL, ids_provedor TEXT NOT NULL DEFAULT '[]', ordinal INTEGER, PRIMARY KEY(catalog_id,tipo,item_id)
);
CREATE INDEX IF NOT EXISTS vod_catalog_generation ON vod_catalog_items(catalog_id,generation);
CREATE TABLE IF NOT EXISTS vod_catalog_state (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS filmes_pendentes ON filmes(consultar_apos,id) WHERE status_metadados NOT IN ('encontrado','manual') AND tags='[]' AND generos='[]';
CREATE INDEX IF NOT EXISTS series_pendentes ON series(consultar_apos,id) WHERE status_metadados NOT IN ('encontrado','manual') AND tags='[]' AND generos='[]';
CREATE INDEX IF NOT EXISTS vod_catalog_lookup ON vod_catalog_items(tipo,item_id);
