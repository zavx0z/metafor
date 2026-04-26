CREATE TABLE IF NOT EXISTS actor_field
(
    uuid      TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    actor     TEXT    NOT NULL CHECK (length(trim(actor)) > 0),
    metaField TEXT    NOT NULL CHECK (length(trim(metaField)) > 0),
    position  INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (actor, metaField),
    UNIQUE (actor, position),
    FOREIGN KEY (actor) REFERENCES actor (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_value
(
    field   TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    kind    TEXT    NOT NULL CHECK (kind IN ('null', 'boolean', 'number', 'string', 'enum', 'list')),
    boolean INTEGER CHECK (boolean IS NULL OR boolean IN (0, 1)),
    number  REAL,
    text    TEXT,
    variant TEXT,
    FOREIGN KEY (field) REFERENCES actor_field (uuid) ON DELETE CASCADE,
    CHECK (
        (kind = 'null' AND boolean IS NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'boolean' AND boolean IS NOT NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'number' AND number IS NOT NULL AND boolean IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'string' AND text IS NOT NULL AND boolean IS NULL AND number IS NULL AND variant IS NULL) OR
        (kind = 'enum' AND variant IS NOT NULL AND boolean IS NULL AND number IS NULL AND text IS NULL) OR
        (kind = 'list' AND boolean IS NULL AND number IS NULL AND text IS NULL AND variant IS NULL)
        )
);

CREATE TABLE IF NOT EXISTS actor_value_item
(
    field    TEXT NOT NULL CHECK (length(trim(field)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    kind     TEXT NOT NULL CHECK (kind IN ('null', 'boolean', 'number', 'string', 'enum')),
    boolean  INTEGER CHECK (boolean IS NULL OR boolean IN (0, 1)),
    number   REAL,
    text     TEXT,
    variant  TEXT,
    PRIMARY KEY (field, position),
    FOREIGN KEY (field) REFERENCES actor_value (field) ON DELETE CASCADE,
    CHECK (
        (kind = 'null' AND boolean IS NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'boolean' AND boolean IS NOT NULL AND number IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'number' AND number IS NOT NULL AND boolean IS NULL AND text IS NULL AND variant IS NULL) OR
        (kind = 'string' AND text IS NOT NULL AND boolean IS NULL AND number IS NULL AND variant IS NULL) OR
        (kind = 'enum' AND variant IS NOT NULL AND boolean IS NULL AND number IS NULL AND text IS NULL)
        )
);

CREATE TABLE IF NOT EXISTS actor_source
(
    childField  TEXT PRIMARY KEY CHECK (length(trim(childField)) > 0),
    parentField TEXT NOT NULL CHECK (length(trim(parentField)) > 0),
    FOREIGN KEY (childField) REFERENCES actor_field (uuid) ON DELETE CASCADE,
    FOREIGN KEY (parentField) REFERENCES actor_field (uuid) ON DELETE CASCADE
);
