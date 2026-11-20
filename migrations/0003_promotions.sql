-- Additive: accounts, profiles, files and reviews remain intact.
CREATE TABLE promotions (
 id TEXT PRIMARY KEY,
 master_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 30),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','completed','rejected','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 starts_at TEXT,
 ends_at TEXT,
 moderation_note TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX promotions_open_request ON promotions(master_id) WHERE status IN ('pending','active');
CREATE INDEX promotions_search ON promotions(master_id,status,ends_at);
