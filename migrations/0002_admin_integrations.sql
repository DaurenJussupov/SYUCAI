-- Additive migration: existing accounts, profiles and R2 objects remain intact.
CREATE TABLE admin_sessions (token TEXT PRIMARY KEY, key_hash TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE oauth_states (state TEXT PRIMARY KEY, session TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE google_file_links (file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE, drive_id TEXT NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE google_sheet_rows (account_id TEXT PRIMARY KEY REFERENCES accounts(id), row_number INTEGER NOT NULL);
CREATE TABLE sync_jobs (account_id TEXT PRIMARY KEY REFERENCES accounts(id), status TEXT NOT NULL DEFAULT 'pending', rerun INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE admin_audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE profile_drafts (account_id TEXT PRIMARY KEY REFERENCES accounts(id), data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE profiles ADD COLUMN moderation_note TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected'));
CREATE INDEX reviews_visible ON reviews(master_id,status);
CREATE TABLE analytics_events (id TEXT PRIMARY KEY, event TEXT NOT NULL, path TEXT NOT NULL, session TEXT NOT NULL, referrer TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, device TEXT NOT NULL, country TEXT NOT NULL, language TEXT NOT NULL, master_id TEXT, duration INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX analytics_time ON analytics_events(created_at,event);
