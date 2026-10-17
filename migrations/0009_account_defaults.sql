-- Default selection is account-owned; deleting a profile clears the preference.
CREATE TABLE IF NOT EXISTS account_preferences (
 user_id TEXT PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,
 default_profile_id TEXT REFERENCES account_profiles(id) ON DELETE SET NULL
);
