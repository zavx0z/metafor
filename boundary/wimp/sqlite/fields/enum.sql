CREATE TABLE IF NOT EXISTS field_enum_variant
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    wimp       TEXT,
    local_id   INTEGER,
    field      INTEGER NOT NULL,
    position   INTEGER NOT NULL CHECK (position >= 0),
    item_value TEXT NOT NULL,
    UNIQUE (field, position),
    UNIQUE (wimp, local_id),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_default
(
    field   INTEGER PRIMARY KEY,
    variant INTEGER NOT NULL,
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (id) ON DELETE CASCADE
);
