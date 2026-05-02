CREATE TABLE IF NOT EXISTS transition
(
    uuid               TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    from_superposition TEXT    NOT NULL CHECK (length(trim(from_superposition)) > 0),
    to_superposition   TEXT    NOT NULL CHECK (length(trim(to_superposition)) > 0),
    position           INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (from_superposition, position),
    FOREIGN KEY (from_superposition) REFERENCES superposition (uuid) ON DELETE CASCADE,
    FOREIGN KEY (to_superposition) REFERENCES superposition (uuid) ON DELETE CASCADE
);
