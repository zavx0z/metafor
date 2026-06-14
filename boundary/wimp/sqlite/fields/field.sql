CREATE TABLE IF NOT EXISTS field
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    wimp     TEXT    NOT NULL,
    key      TEXT    NOT NULL CHECK (length(trim(key)) > 0),
    type     TEXT    NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'array', 'enum')),
    required INTEGER NOT NULL CHECK (required IN (0, 1)),
    label    TEXT,
    UNIQUE (wimp, key),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_default
(
    field TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS field_by_wimp
    ON field (wimp);
