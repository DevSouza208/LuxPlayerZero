CREATE TABLE IF NOT EXISTS guide_programs (
 id TEXT PRIMARY KEY, channel TEXT NOT NULL, title TEXT NOT NULL,
 starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, description TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL, CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS guide_channel_time ON guide_programs(channel,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS guide_time ON guide_programs(starts_at,ends_at);
CREATE TABLE IF NOT EXISTS profile_reminders (
 profile_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
 program_id TEXT NOT NULL REFERENCES guide_programs(id) ON DELETE CASCADE,
 PRIMARY KEY(profile_id,program_id)
);
CREATE TABLE IF NOT EXISTS sports_events (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, competition TEXT NOT NULL, sport TEXT NOT NULL,
 starts_at INTEGER NOT NULL, source_url TEXT NOT NULL, channels TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sports_time ON sports_events(starts_at);
