CREATE TABLE IF NOT EXISTS value
(
    uuid    TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    kind    TEXT NOT NULL CHECK (kind IN ('null', 'boolean', 'number', 'string', 'enum', 'list')),
    boolean INTEGER CHECK (boolean IS NULL OR boolean IN (0, 1)),
    number  REAL,
    text    TEXT,
    variant TEXT,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE,
    CHECK (
        (kind = 'null' AND boolean IS NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'boolean' AND boolean IS NOT NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'number' AND number IS NOT NULL AND boolean IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'string' AND text IS NOT NULL AND boolean IS NULL AND number IS NULL AND variant IS NULL) OR
        (kind = 'enum' AND variant IS NOT NULL AND boolean IS NULL AND number IS NULL AND text IS NULL) OR
        (kind = 'list' AND boolean IS NULL AND number IS NULL AND text IS NULL AND variant IS NULL)
        )
);

CREATE TABLE IF NOT EXISTS value_item
(
    value    TEXT NOT NULL CHECK (length(trim(value)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    kind     TEXT NOT NULL CHECK (kind IN ('null', 'boolean', 'number', 'string', 'enum')),
    boolean  INTEGER CHECK (boolean IS NULL OR boolean IN (0, 1)),
    number   REAL,
    text     TEXT,
    variant  TEXT,
    PRIMARY KEY (value, position),
    FOREIGN KEY (value) REFERENCES value (uuid) ON DELETE CASCADE,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE,
    CHECK (
        (kind = 'null' AND boolean IS NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'boolean' AND boolean IS NOT NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'number' AND number IS NOT NULL AND boolean IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'string' AND text IS NOT NULL AND boolean IS NULL AND number IS NULL AND variant IS NULL) OR
        (kind = 'enum' AND variant IS NOT NULL AND boolean IS NULL AND number IS NULL AND text IS NULL)
        )
);
