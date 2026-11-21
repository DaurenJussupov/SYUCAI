CREATE TABLE blog_likes (
 post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(post_id,account_id)
);
CREATE TABLE blog_comments (
 id TEXT PRIMARY KEY,
 post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES accounts(id),
 author TEXT NOT NULL,
 text TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TEXT,
 deleted_by TEXT
);
CREATE INDEX blog_comments_post ON blog_comments(post_id,deleted_at,created_at);
CREATE TABLE comment_blocks (
 account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 indefinite INTEGER NOT NULL DEFAULT 0 CHECK(indefinite IN (0,1)),
 months INTEGER NOT NULL DEFAULT 0,
 days INTEGER NOT NULL DEFAULT 1,
 blocked_until TEXT,
 reason TEXT NOT NULL DEFAULT '',
 moderated_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE blog_images (
 id TEXT PRIMARY KEY,
 post_id TEXT NOT NULL UNIQUE REFERENCES blog_posts(id) ON DELETE CASCADE,
 object_key TEXT NOT NULL,
 mime TEXT NOT NULL,
 uploaded_by TEXT NOT NULL
);
