-- Existing accounts, master profiles, review texts and files remain intact.
ALTER TABLE accounts ADD COLUMN registration_type TEXT NOT NULL DEFAULT 'master' CHECK(registration_type IN ('master','user'));
ALTER TABLE accounts ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','moderator'));
ALTER TABLE accounts ADD COLUMN newsletter_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(newsletter_opt_in IN (0,1));
ALTER TABLE accounts ADD COLUMN newsletter_consent_at TEXT;
ALTER TABLE reviews ADD COLUMN evidence_status TEXT NOT NULL DEFAULT 'unverified' CHECK(evidence_status IN ('unverified','pending','verified','rejected'));
ALTER TABLE reviews ADD COLUMN moderation_note TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN evidence_verified_at TEXT;
ALTER TABLE reviews ADD COLUMN moderated_by TEXT;
CREATE TABLE review_evidence (
 id TEXT PRIMARY KEY,
 review_id TEXT NOT NULL UNIQUE REFERENCES reviews(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES accounts(id),
 object_key TEXT NOT NULL,
 mime TEXT NOT NULL,
 name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX reviews_verified ON reviews(master_id,status,evidence_status);
CREATE TABLE blog_posts (
 id TEXT PRIMARY KEY,
 slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 excerpt TEXT NOT NULL DEFAULT '',
 content TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 author_id TEXT NOT NULL,
 published_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX blog_published ON blog_posts(status,published_at);
