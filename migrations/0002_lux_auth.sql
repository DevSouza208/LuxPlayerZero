-- Tabelas de contas do Lux Zero
CREATE TABLE IF NOT EXISTS lux_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, session_epoch INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lux_login_attempts (attempt_key TEXT PRIMARY KEY, failures INTEGER NOT NULL, expires_at INTEGER NOT NULL);
