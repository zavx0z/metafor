CREATE TABLE IF NOT EXISTS field_array_default_item
(
    uuid       TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    field      TEXT    NOT NULL CHECK (length(trim(field)) > 0),
    position   INTEGER NOT NULL CHECK (position >= 0),
    item_value TEXT    NOT NULL,
    UNIQUE (field, position),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);
