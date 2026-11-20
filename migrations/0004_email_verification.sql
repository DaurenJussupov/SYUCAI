-- Preserve existing accounts and access; email ownership is recorded separately.
ALTER TABLE accounts ADD COLUMN email_verified_at TEXT;
ALTER TABLE accounts ADD COLUMN email_verification_sent_at TEXT;
ALTER TABLE accounts ADD COLUMN email_verification_requested_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE email_verification_tokens (
 token TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 expires INTEGER NOT NULL
);
CREATE INDEX email_verification_account ON email_verification_tokens(account_id);
CREATE INDEX email_verification_expiry ON email_verification_tokens(expires);
