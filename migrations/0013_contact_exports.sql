-- Separate consent-aware contact exports; existing Drive copies are untouched.
ALTER TABLE account_registrations ADD COLUMN last_name TEXT NOT NULL DEFAULT '';
CREATE TABLE contact_sync_jobs (
 account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending',
 rerun INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO site_settings(key,value) VALUES('google_contacts_sheet_id','1MW8RW3k-ri4x2-zkMmhKwWHmR9DoFRuEAmZOVqpgIXA') ON CONFLICT(key) DO NOTHING;
INSERT INTO contact_sync_jobs(account_id) SELECT DISTINCT account_id FROM account_registrations;
