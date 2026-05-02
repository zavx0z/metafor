CREATE TABLE IF NOT EXISTS field_enum_variant
(
    uuid       TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    field      TEXT NOT NULL CHECK (length(trim(field)) > 0),
    position   INTEGER NOT NULL CHECK (position >= 0),
    item_value TEXT NOT NULL,
    UNIQUE (field, position),
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_default
(
    field   TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    variant TEXT NOT NULL CHECK (length(trim(variant)) > 0),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);
