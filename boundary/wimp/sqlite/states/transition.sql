CREATE TABLE IF NOT EXISTS transition
(
    uuid               TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    from_state TEXT    NOT NULL CHECK (length(trim(from_state)) > 0),
    to_state   TEXT    NOT NULL CHECK (length(trim(to_state)) > 0),
    position           INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (from_state, position),
    FOREIGN KEY (from_state) REFERENCES state (uuid) ON DELETE CASCADE,
    FOREIGN KEY (to_state) REFERENCES state (uuid) ON DELETE CASCADE
);
