-- Execute once in the Cloudflare D1 console.
-- The row starts at false and is deleted after successful verification.
CREATE TABLE IF NOT EXISTS tracker_probe (
  session_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL DEFAULT '',
  value INTEGER NOT NULL DEFAULT 0 CHECK (value IN (0, 1))
);
