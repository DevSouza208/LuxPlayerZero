-- Independent account subsystem: does not change catalog/snapshot/bridge tables.
CREATE TABLE IF NOT EXISTS account_users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_profiles (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT 'luxite', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_profiles_owner ON account_profiles(user_id);
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
 profile_id TEXT REFERENCES account_profiles(id) ON DELETE SET NULL,
 device TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_owner ON account_sessions(user_id,expires_at);
CREATE TABLE IF NOT EXISTS account_invites (
 token_hash TEXT PRIMARY KEY, created_by TEXT NOT NULL REFERENCES account_users(id),
 expires_at INTEGER NOT NULL, claimed_by TEXT UNIQUE REFERENCES account_users(id)
);
CREATE TABLE IF NOT EXISTS account_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS account_profile_state (
 profile_id TEXT PRIMARY KEY REFERENCES account_profiles(id) ON DELETE CASCADE,
 value TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS account_audit (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, created_at INTEGER NOT NULL
);
