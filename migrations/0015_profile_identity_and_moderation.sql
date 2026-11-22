-- Additive moderation state: keep accounts, files, reviews and profile IDs intact.
ALTER TABLE account_registrations ADD COLUMN application_status TEXT NOT NULL DEFAULT 'pending' CHECK(application_status IN ('pending','approved','rejected'));
ALTER TABLE account_registrations ADD COLUMN application_note TEXT NOT NULL DEFAULT '';
ALTER TABLE account_registrations ADD COLUMN application_submitted_at TEXT;
ALTER TABLE account_registrations ADD COLUMN rework_since TEXT;
ALTER TABLE account_registrations ADD COLUMN archived_at TEXT;
ALTER TABLE account_registrations ADD COLUMN deleted_at TEXT;
UPDATE account_registrations SET application_submitted_at=created_at;
UPDATE account_registrations SET application_status=COALESCE((SELECT CASE WHEN p.status='draft' THEN 'pending' ELSE p.status END FROM profiles p WHERE p.id=account_id),'pending'),application_note=COALESCE((SELECT moderation_note FROM profiles p WHERE p.id=account_id),''),rework_since=(SELECT CASE WHEN p.status='rejected' THEN p.updated_at ELSE NULL END FROM profiles p WHERE p.id=account_id) WHERE registration_type='master';
CREATE TRIGGER profile_application_insert AFTER INSERT ON profiles BEGIN
 UPDATE account_registrations SET application_status=CASE WHEN NEW.status='draft' THEN 'pending' ELSE NEW.status END,application_note=NEW.moderation_note,application_submitted_at=CURRENT_TIMESTAMP,rework_since=CASE WHEN NEW.status='rejected' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE account_id=NEW.id AND registration_type='master' AND archived_at IS NULL AND deleted_at IS NULL;
END;
CREATE TRIGGER profile_application_update AFTER UPDATE OF status,moderation_note ON profiles BEGIN
 UPDATE account_registrations SET application_status=CASE WHEN NEW.status='draft' THEN 'pending' ELSE NEW.status END,application_note=NEW.moderation_note,application_submitted_at=CASE WHEN NEW.status='pending' AND OLD.status<>'pending' THEN CURRENT_TIMESTAMP ELSE application_submitted_at END,rework_since=CASE WHEN NEW.status='rejected' THEN COALESCE(rework_since,CURRENT_TIMESTAMP) ELSE NULL END WHERE account_id=NEW.id AND registration_type='master' AND archived_at IS NULL AND deleted_at IS NULL;
END;
CREATE INDEX application_queue ON account_registrations(registration_type,application_status,archived_at,deleted_at);
CREATE TABLE profile_name_changes (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 registration_type TEXT NOT NULL CHECK(registration_type IN ('master','user')),
 given_name TEXT NOT NULL,
 last_name TEXT NOT NULL,
 previous_given TEXT NOT NULL,
 previous_last TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 completed_at INTEGER,
 completion_id TEXT
);
CREATE TABLE profile_name_change_limits (
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 registration_type TEXT NOT NULL,
 last_sent INTEGER NOT NULL,
 window_start INTEGER NOT NULL,
 hits INTEGER NOT NULL,
 PRIMARY KEY(account_id,registration_type)
);
ALTER TABLE account_registrations ADD COLUMN application_moderated_by TEXT;
ALTER TABLE account_registrations ADD COLUMN application_moderated_at TEXT;
