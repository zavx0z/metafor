CREATE TABLE IF NOT EXISTS condition
(
    uuid       TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    transition TEXT    NOT NULL CHECK (length(trim(transition)) > 0),
    field      TEXT    NOT NULL CHECK (length(trim(field)) > 0),
    position   INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (transition, field),
    UNIQUE (transition, position),
    FOREIGN KEY (transition) REFERENCES transition (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS condition_by_transition
    ON condition (transition);
