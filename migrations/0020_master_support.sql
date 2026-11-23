CREATE TABLE support_tickets (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), subject TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','answered','customer_replied','closed')),
 version INTEGER NOT NULL DEFAULT 1, last_message_id TEXT NOT NULL,
 last_staff_version INTEGER NOT NULL DEFAULT 0, last_customer_version INTEGER NOT NULL DEFAULT 1,
 customer_read_version INTEGER NOT NULL DEFAULT 1, staff_read_version INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX support_owner ON support_tickets(account_id,updated_at);
CREATE INDEX support_queue ON support_tickets(status,updated_at);
CREATE TABLE support_messages (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
 author_type TEXT NOT NULL CHECK(author_type IN ('master','staff')), author_id TEXT NOT NULL,
 text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX support_thread ON support_messages(ticket_id,created_at);
CREATE TABLE support_attachments (
 id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES support_messages(id),
 object_key TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL
);
CREATE INDEX support_message_files ON support_attachments(message_id);
