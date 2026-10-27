-- Apoio interno ao login da tabela usuarios. As sete colunas dela permanecem intactas.
-- Também criado automaticamente pelo servidor no primeiro acesso.
CREATE TABLE IF NOT EXISTS usuarios_sessoes (
 token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE,
 usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
 senha_marca TEXT NOT NULL, device TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios_limites (
 chave TEXT PRIMARY KEY, tentativas INTEGER NOT NULL, expira_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios_estado (
 usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
 valor TEXT NOT NULL DEFAULT '{}', versao INTEGER NOT NULL DEFAULT 0
);
