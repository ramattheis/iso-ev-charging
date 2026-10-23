CREATE TABLE IF NOT EXISTS daily_state (
  day TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'slack' CHECK (status IN ('slack', 'congested')),
  pressure_count INTEGER NOT NULL DEFAULT 0 CHECK (pressure_count >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  offered_by TEXT NOT NULL CHECK (length(offered_by) BETWEEN 1 AND 50),
  handoff_time TEXT NOT NULL,
  claimed_by TEXT CHECK (claimed_by IS NULL OR length(claimed_by) BETWEEN 1 AND 50),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_offers_active_day_time
ON offers(day, handoff_time)
WHERE removed_at IS NULL;

PRAGMA optimize;
