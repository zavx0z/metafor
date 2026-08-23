CREATE TABLE IF NOT EXISTS state
(
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    wimp     TEXT    NOT NULL,
    local_id INTEGER,
    name     TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (wimp, name),
    UNIQUE (wimp, position),
    UNIQUE (wimp, local_id),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS state_by_wimp
    ON state (wimp);
