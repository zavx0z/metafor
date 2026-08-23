CREATE TABLE IF NOT EXISTS transition
(
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    wimp       TEXT,
    local_id   INTEGER,
    from_state INTEGER NOT NULL,
    to_state   INTEGER NOT NULL,
    position           INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (from_state, position),
    UNIQUE (wimp, local_id),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE,
    FOREIGN KEY (from_state) REFERENCES state (id) ON DELETE CASCADE,
    FOREIGN KEY (to_state) REFERENCES state (id) ON DELETE CASCADE
);
