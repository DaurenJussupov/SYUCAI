-- Keep the email identity and every existing foreign key intact. Credentials,
-- verification, roles and preferences now belong to a registration in a section.
CREATE TABLE account_registrations (
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 registration_type TEXT NOT NULL CHECK(registration_type IN ('master','user')),
 password TEXT NOT NULL,
 salt TEXT NOT NULL,
 display_name TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','moderator')),
 newsletter_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(newsletter_opt_in IN (0,1)),
 newsletter_consent_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 email_verified_at TEXT,
 email_verification_sent_at TEXT,
 email_verification_requested_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(account_id,registration_type)
);
INSERT INTO account_registrations
 SELECT id,registration_type,password,salt,display_name,CASE WHEN registration_type='user' THEN role ELSE 'user' END,CASE WHEN registration_type='user' THEN newsletter_opt_in ELSE 0 END,CASE WHEN registration_type='user' THEN newsletter_consent_at ELSE NULL END,created_at,email_verified_at,email_verification_sent_at,email_verification_requested_at FROM accounts;
-- Preserve sections which were already used while the old account was shared.
INSERT OR IGNORE INTO account_registrations
 SELECT a.id,'master',a.password,a.salt,'','user',0,NULL,a.created_at,a.email_verified_at,a.email_verification_sent_at,a.email_verification_requested_at FROM accounts a
 WHERE EXISTS(SELECT 1 FROM profiles p WHERE p.id=a.id) OR EXISTS(SELECT 1 FROM profile_drafts d WHERE d.account_id=a.id) OR EXISTS(SELECT 1 FROM files f WHERE f.account_id=a.id);
INSERT OR IGNORE INTO account_registrations
 SELECT a.id,'user',a.password,a.salt,a.display_name,a.role,a.newsletter_opt_in,a.newsletter_consent_at,a.created_at,a.email_verified_at,a.email_verification_sent_at,a.email_verification_requested_at FROM accounts a
 WHERE a.role='moderator' OR a.newsletter_opt_in=1 OR a.display_name<>'' OR EXISTS(SELECT 1 FROM reviews r WHERE r.author_id=a.id);
CREATE TABLE scoped_sessions (
 token TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 registration_type TEXT NOT NULL CHECK(registration_type IN ('master','user')),
 expires INTEGER NOT NULL
);
CREATE INDEX scoped_sessions_account ON scoped_sessions(account_id,registration_type);
ALTER TABLE email_verification_tokens ADD COLUMN registration_type TEXT CHECK(registration_type IN ('master','user'));
UPDATE email_verification_tokens SET registration_type=(SELECT registration_type FROM accounts a WHERE a.id=email_verification_tokens.account_id);
CREATE TRIGGER verification_legacy_scope AFTER INSERT ON email_verification_tokens WHEN NEW.registration_type IS NULL BEGIN
 UPDATE email_verification_tokens SET registration_type=(SELECT registration_type FROM accounts a WHERE a.id=NEW.account_id) WHERE token=NEW.token;
END;
CREATE INDEX registration_roles ON account_registrations(registration_type,role);
-- Compatibility for a legacy Worker still serving requests during deployment.
CREATE TRIGGER accounts_legacy_registration_insert AFTER INSERT ON accounts BEGIN
 INSERT INTO account_registrations(account_id,registration_type,password,salt,display_name,role,newsletter_opt_in,newsletter_consent_at,created_at,email_verified_at,email_verification_sent_at,email_verification_requested_at)
 VALUES(NEW.id,NEW.registration_type,NEW.password,NEW.salt,NEW.display_name,CASE WHEN NEW.registration_type='user' THEN NEW.role ELSE 'user' END,CASE WHEN NEW.registration_type='user' THEN NEW.newsletter_opt_in ELSE 0 END,CASE WHEN NEW.registration_type='user' THEN NEW.newsletter_consent_at ELSE NULL END,NEW.created_at,NEW.email_verified_at,NEW.email_verification_sent_at,NEW.email_verification_requested_at);
END;
CREATE TRIGGER accounts_legacy_registration_update AFTER UPDATE OF password,salt,display_name,role,newsletter_opt_in,newsletter_consent_at,email_verified_at,email_verification_sent_at,email_verification_requested_at ON accounts BEGIN
 UPDATE account_registrations SET password=CASE WHEN NEW.password IS NOT OLD.password THEN NEW.password ELSE password END,salt=CASE WHEN NEW.salt IS NOT OLD.salt THEN NEW.salt ELSE salt END,display_name=CASE WHEN NEW.display_name IS NOT OLD.display_name THEN NEW.display_name ELSE display_name END,role=CASE WHEN NEW.registration_type='user' AND NEW.role IS NOT OLD.role THEN NEW.role ELSE role END,newsletter_opt_in=CASE WHEN NEW.registration_type='user' AND NEW.newsletter_opt_in IS NOT OLD.newsletter_opt_in THEN NEW.newsletter_opt_in ELSE newsletter_opt_in END,newsletter_consent_at=CASE WHEN NEW.registration_type='user' AND NEW.newsletter_consent_at IS NOT OLD.newsletter_consent_at THEN NEW.newsletter_consent_at ELSE newsletter_consent_at END,email_verified_at=CASE WHEN NEW.email_verified_at IS NOT OLD.email_verified_at THEN NEW.email_verified_at ELSE email_verified_at END,email_verification_sent_at=CASE WHEN NEW.email_verification_sent_at IS NOT OLD.email_verification_sent_at THEN NEW.email_verification_sent_at ELSE email_verification_sent_at END,email_verification_requested_at=CASE WHEN NEW.email_verification_requested_at IS NOT OLD.email_verification_requested_at THEN NEW.email_verification_requested_at ELSE email_verification_requested_at END WHERE account_id=NEW.id AND registration_type=NEW.registration_type;
END;

CREATE TRIGGER accounts_legacy_user_role_update AFTER UPDATE OF role ON accounts WHEN NEW.role IS NOT OLD.role BEGIN
 UPDATE account_registrations SET role=NEW.role WHERE account_id=NEW.id AND registration_type='user';
END;
