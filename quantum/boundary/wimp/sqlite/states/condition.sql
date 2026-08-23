CREATE TABLE IF NOT EXISTS condition
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    wimp       TEXT,
    local_id   INTEGER,
    transition INTEGER NOT NULL,
    field      INTEGER NOT NULL,
    position   INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (transition, field),
    UNIQUE (transition, position),
    UNIQUE (wimp, local_id),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE,
    FOREIGN KEY (transition) REFERENCES transition (id) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS condition_by_transition
    ON condition (transition);
