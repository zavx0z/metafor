CREATE TABLE IF NOT EXISTS condition
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    transition INTEGER NOT NULL,
    field      INTEGER NOT NULL,
    position   INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (transition, field),
    UNIQUE (transition, position),
    FOREIGN KEY (transition) REFERENCES transition (id) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS condition_by_transition
    ON condition (transition);
