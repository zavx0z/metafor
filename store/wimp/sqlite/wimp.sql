CREATE TABLE IF NOT EXISTS wimp
(
    src      TEXT PRIMARY KEY CHECK (length(trim(src)) > 0),
    name     TEXT,
    desc     TEXT,
    view_css TEXT
);

CREATE TABLE IF NOT EXISTS wimp_mass_value
(
    uuid          TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    wimp          TEXT NOT NULL,
    parent_value  TEXT,
    value_kind    TEXT NOT NULL CHECK (value_kind IN ('object', 'array', 'string', 'number', 'boolean', 'null')),
    entry_key     TEXT,
    entry_order   INTEGER CHECK (entry_order IS NULL OR entry_order >= 0),
    text_value    TEXT,
    number_value  REAL,
    boolean_value INTEGER CHECK (boolean_value IS NULL OR boolean_value IN (0, 1)),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE,
    FOREIGN KEY (parent_value) REFERENCES wimp_mass_value (uuid) ON DELETE CASCADE,
    CHECK (
        (parent_value IS NULL AND entry_key IS NULL AND entry_order IS NULL AND value_kind = 'object') OR
        (parent_value IS NOT NULL AND (
            (entry_key IS NOT NULL AND entry_order IS NULL) OR
            (entry_key IS NULL AND entry_order IS NOT NULL)
            ))
        ),
    CHECK (
        (value_kind IN ('object', 'array', 'null') AND text_value IS NULL AND number_value IS NULL AND boolean_value IS NULL) OR
        (value_kind = 'string' AND text_value IS NOT NULL AND number_value IS NULL AND boolean_value IS NULL) OR
        (value_kind = 'number' AND text_value IS NULL AND number_value IS NOT NULL AND boolean_value IS NULL) OR
        (value_kind = 'boolean' AND text_value IS NULL AND number_value IS NULL AND boolean_value IS NOT NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS wimp_mass_root_by_wimp
    ON wimp_mass_value (wimp)
    WHERE parent_value IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wimp_mass_object_entry
    ON wimp_mass_value (parent_value, entry_key)
    WHERE entry_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wimp_mass_array_entry
    ON wimp_mass_value (parent_value, entry_order)
    WHERE entry_order IS NOT NULL;

CREATE INDEX IF NOT EXISTS wimp_mass_by_wimp
    ON wimp_mass_value (wimp);

CREATE INDEX IF NOT EXISTS wimp_mass_by_parent
    ON wimp_mass_value (parent_value);
