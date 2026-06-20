CREATE TABLE IF NOT EXISTS field_array_default_item
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    field      INTEGER NOT NULL,
    position   INTEGER NOT NULL CHECK (position >= 0),
    item_value TEXT    NOT NULL,
    UNIQUE (field, position),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);
