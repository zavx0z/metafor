CREATE TABLE IF NOT EXISTS actor
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    parent   TEXT,
    meta     TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (parent) REFERENCES actor (uuid) ON DELETE CASCADE,
    FOREIGN KEY (meta) REFERENCES meta (src) ON DELETE CASCADE
);
