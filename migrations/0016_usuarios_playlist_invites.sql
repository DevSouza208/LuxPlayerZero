-- Complementos mínimos para convites de M3U e atualização por conta.
-- A tabela usuarios original continua sendo a fonte de verdade.
CREATE TABLE IF NOT EXISTS usuarios_convites (
  token_hash TEXT PRIMARY KEY,
  source_cipher TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES usuarios(id),
  expires_at INTEGER NOT NULL,
  claimed_by INTEGER UNIQUE REFERENCES usuarios(id)
);
CREATE TABLE IF NOT EXISTS usuarios_atualizacoes (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  catalog_id TEXT,
  updated_at TEXT
);
