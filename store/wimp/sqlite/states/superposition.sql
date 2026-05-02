CREATE TABLE IF NOT EXISTS superposition
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    wimp     TEXT    NOT NULL,
    name     TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (wimp, name),
    UNIQUE (wimp, position),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS superposition_by_wimp
    ON superposition (wimp);
