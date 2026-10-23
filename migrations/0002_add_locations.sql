CREATE TABLE daily_state_with_locations (
  day TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'holyoke' CHECK (location IN ('holyoke', 'windsor')),
  status TEXT NOT NULL DEFAULT 'slack' CHECK (status IN ('slack', 'congested')),
  pressure_count INTEGER NOT NULL DEFAULT 0 CHECK (pressure_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, location)
);

INSERT INTO daily_state_with_locations
  (day, location, status, pressure_count, updated_at)
SELECT day, 'holyoke', status, pressure_count, updated_at
FROM daily_state;

DROP TABLE daily_state;
ALTER TABLE daily_state_with_locations RENAME TO daily_state;

CREATE TABLE offers_with_locations (
  id TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'holyoke' CHECK (location IN ('holyoke', 'windsor')),
  offered_by TEXT NOT NULL CHECK (length(offered_by) BETWEEN 1 AND 50),
  handoff_time TEXT NOT NULL,
  claimed_by TEXT CHECK (claimed_by IS NULL OR length(claimed_by) BETWEEN 1 AND 50),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT
);

INSERT INTO offers_with_locations
  (id, day, location, offered_by, handoff_time, claimed_by, created_at, updated_at, removed_at)
SELECT id, day, 'holyoke', offered_by, handoff_time, claimed_by, created_at, updated_at, removed_at
FROM offers;

DROP TABLE offers;
ALTER TABLE offers_with_locations RENAME TO offers;

CREATE INDEX idx_offers_active_location_day_time
ON offers(location, day, handoff_time)
WHERE removed_at IS NULL;

PRAGMA optimize;
