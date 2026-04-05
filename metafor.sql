CREATE TABLE IF NOT EXISTS meta
(
    src           TEXT PRIMARY KEY CHECK (length(trim(src)) > 0),
    name          TEXT,
    desc          TEXT,
    view_css      TEXT,
    has_processes INTEGER NOT NULL DEFAULT 0 CHECK (has_processes IN (0, 1)),
    has_reactions INTEGER NOT NULL DEFAULT 0 CHECK (has_reactions IN (0, 1)),
    has_matter    INTEGER NOT NULL DEFAULT 0 CHECK (has_matter IN (0, 1))
);

CREATE TABLE IF NOT EXISTS meta_mass_value
(
    uuid          TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta          TEXT NOT NULL,
    parent_value  TEXT,
    value_kind    TEXT NOT NULL CHECK (value_kind IN ('object', 'array', 'string', 'number', 'boolean', 'null')),
    entry_key     TEXT,
    entry_order   INTEGER CHECK (entry_order IS NULL OR entry_order >= 0),
    text_value    TEXT,
    number_value  REAL,
    boolean_value INTEGER CHECK (boolean_value IS NULL OR boolean_value IN (0, 1)),
    FOREIGN KEY (meta) REFERENCES meta (src) ON DELETE CASCADE,
    FOREIGN KEY (parent_value) REFERENCES meta_mass_value (uuid) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS meta_mass_root_by_meta
    ON meta_mass_value (meta)
    WHERE parent_value IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS meta_mass_object_entry
    ON meta_mass_value (parent_value, entry_key)
    WHERE entry_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS meta_mass_array_entry
    ON meta_mass_value (parent_value, entry_order)
    WHERE entry_order IS NOT NULL;

CREATE INDEX IF NOT EXISTS meta_mass_by_meta
    ON meta_mass_value (meta);

CREATE INDEX IF NOT EXISTS meta_mass_by_parent
    ON meta_mass_value (parent_value);
