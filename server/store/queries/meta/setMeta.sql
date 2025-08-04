INSERT INTO meta (tag, fingerprint) 
VALUES (?, ?)
ON CONFLICT(tag) DO UPDATE SET 
  fingerprint = excluded.fingerprint,
  timestamp = CURRENT_TIMESTAMP;
