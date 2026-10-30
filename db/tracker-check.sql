-- Execute once in the Cloudflare D1 console.
-- A session row is retained and reset to false after each successful check.
CREATE TABLE IF NOT EXISTS tracker_probe (
  session_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL DEFAULT '',
  value INTEGER NOT NULL DEFAULT 0 CHECK (value IN (0, 1))
);
