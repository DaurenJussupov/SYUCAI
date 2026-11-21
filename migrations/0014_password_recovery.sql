-- Recovery challenges are scoped to the existing master/user registration.
-- No plaintext email, code, grant, or password is stored in this table.
CREATE TABLE password_recoveries (
 id TEXT PRIMARY KEY,
 account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
 registration_type TEXT NOT NULL CHECK(registration_type IN ('master','user')),
 email_hash TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 password_version TEXT,
 created_at INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 verified_at INTEGER,
 reset_token TEXT,
 grant_expires INTEGER,
 completed_at INTEGER,
 completion_id TEXT
);
CREATE INDEX password_recovery_requests ON password_recoveries(email_hash,registration_type,created_at);
CREATE TABLE password_recovery_limits (
 email_hash TEXT NOT NULL,
 registration_type TEXT NOT NULL,
 last_sent INTEGER NOT NULL,
 window_start INTEGER NOT NULL,
 hits INTEGER NOT NULL,
 PRIMARY KEY(email_hash,registration_type)
);
