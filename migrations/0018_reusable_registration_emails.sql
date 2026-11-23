-- Public login emails belong to a registration, not to the legacy shared parent.
-- Keep historical IDs/files/reviews and the opposite registration intact.
ALTER TABLE account_registrations ADD COLUMN email TEXT NOT NULL DEFAULT '';
UPDATE account_registrations SET email=LOWER((SELECT a.email FROM accounts a WHERE a.id=account_id));
CREATE UNIQUE INDEX active_registration_email ON account_registrations(email COLLATE NOCASE,registration_type) WHERE deleted_at IS NULL;
CREATE INDEX registration_email_history ON account_registrations(email COLLATE NOCASE,registration_type);
-- Support legacy inserts during rollout and existing import/fixture paths.
CREATE TRIGGER registration_email_default AFTER INSERT ON account_registrations WHEN NEW.email='' BEGIN
 UPDATE account_registrations SET email=LOWER((SELECT email FROM accounts WHERE id=NEW.account_id)) WHERE account_id=NEW.account_id AND registration_type=NEW.registration_type;
END;
-- Close only the deleted section's sessions and outstanding proof/recovery codes.
DELETE FROM scoped_sessions WHERE EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=scoped_sessions.account_id AND g.registration_type=scoped_sessions.registration_type AND g.deleted_at IS NOT NULL);
DELETE FROM sessions WHERE EXISTS(SELECT 1 FROM accounts a JOIN account_registrations g ON g.account_id=a.id AND g.registration_type=a.registration_type WHERE a.id=sessions.account_id AND g.deleted_at IS NOT NULL);
DELETE FROM email_confirmation_codes WHERE EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=email_confirmation_codes.account_id AND g.registration_type=email_confirmation_codes.registration_type AND g.deleted_at IS NOT NULL);
DELETE FROM email_confirmation_limits WHERE EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=email_confirmation_limits.account_id AND g.registration_type=email_confirmation_limits.registration_type AND g.deleted_at IS NOT NULL);
DELETE FROM email_verification_tokens WHERE EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=email_verification_tokens.account_id AND g.registration_type=email_verification_tokens.registration_type AND g.deleted_at IS NOT NULL);
DELETE FROM password_recoveries WHERE EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=password_recoveries.account_id AND g.registration_type=password_recoveries.registration_type AND g.deleted_at IS NOT NULL);
DELETE FROM profile_name_changes WHERE EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=profile_name_changes.account_id AND g.registration_type=profile_name_changes.registration_type AND g.deleted_at IS NOT NULL);
DELETE FROM profile_name_change_limits WHERE EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=profile_name_change_limits.account_id AND g.registration_type=profile_name_change_limits.registration_type AND g.deleted_at IS NOT NULL);
UPDATE profiles SET status='draft' WHERE EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=profiles.id AND g.registration_type='master' AND g.deleted_at IS NOT NULL);
UPDATE promotions SET status='cancelled' WHERE status IN ('pending','active') AND EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=promotions.master_id AND g.registration_type='master' AND g.deleted_at IS NOT NULL);
-- Refresh retired contacts as ineligible for newsletters, retaining historical rows.
INSERT INTO contact_sync_jobs(account_id) SELECT DISTINCT account_id FROM account_registrations WHERE deleted_at IS NOT NULL ON CONFLICT(account_id) DO UPDATE SET status=CASE WHEN contact_sync_jobs.status='running' THEN 'running' ELSE 'pending' END,rerun=CASE WHEN contact_sync_jobs.status='running' THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP;
