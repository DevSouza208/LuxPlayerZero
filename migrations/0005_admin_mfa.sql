CREATE TABLE IF NOT EXISTS account_mfa (
 user_id TEXT PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,
 secret TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, last_step INTEGER NOT NULL DEFAULT -1
);
CREATE TABLE IF NOT EXISTS account_recovery_codes (
 user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL, PRIMARY KEY(user_id,code_hash)
);
