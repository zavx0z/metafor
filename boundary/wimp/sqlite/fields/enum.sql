CREATE TABLE IF NOT EXISTS field_enum_variant
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    field      INTEGER NOT NULL,
    position   INTEGER NOT NULL CHECK (position >= 0),
    item_value TEXT NOT NULL,
    UNIQUE (field, position),
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_default
(
    field   INTEGER PRIMARY KEY,
    variant INTEGER NOT NULL,
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (id) ON DELETE CASCADE
);
