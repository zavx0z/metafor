CREATE TABLE IF NOT EXISTS field
(
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
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
    field INTEGER PRIMARY KEY,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS field_by_wimp
    ON field (wimp);
