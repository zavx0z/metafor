CREATE TABLE IF NOT EXISTS field
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta     TEXT    NOT NULL,
    key      TEXT    NOT NULL CHECK (length(trim(key)) > 0),
    type     TEXT    NOT NULL CHECK (
        type IN ('string', 'number', 'boolean', 'array<string>', 'array<number>', 'enum<string>', 'enum<number>')
        ),
    required INTEGER NOT NULL CHECK (required IN (0, 1)),
    label    TEXT,
    UNIQUE (meta, key),
    FOREIGN KEY (meta) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_default
(
    field TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_string_default
(
    field         TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    default_value TEXT NOT NULL,
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_number_default
(
    field         TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    default_value REAL NOT NULL,
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_boolean_default
(
    field         TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    default_value INTEGER NOT NULL CHECK (default_value IN (0, 1)),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default
(
    field TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default_item
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    field    TEXT    NOT NULL CHECK (length(trim(field)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (field, position),
    FOREIGN KEY (field) REFERENCES field_array_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_string_default_item
(
    item       TEXT PRIMARY KEY CHECK (length(trim(item)) > 0),
    item_value TEXT NOT NULL,
    FOREIGN KEY (item) REFERENCES field_array_default_item (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_number_default_item
(
    item       TEXT PRIMARY KEY CHECK (length(trim(item)) > 0),
    item_value REAL NOT NULL,
    FOREIGN KEY (item) REFERENCES field_array_default_item (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_variant
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    field    TEXT    NOT NULL CHECK (length(trim(field)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (field, position),
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_string_variant
(
    variant    TEXT PRIMARY KEY CHECK (length(trim(variant)) > 0),
    item_value TEXT NOT NULL,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_number_variant
(
    variant    TEXT PRIMARY KEY CHECK (length(trim(variant)) > 0),
    item_value REAL NOT NULL,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_default
(
    field   TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    variant TEXT NOT NULL CHECK (length(trim(variant)) > 0),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS field_by_meta
    ON field (meta);
