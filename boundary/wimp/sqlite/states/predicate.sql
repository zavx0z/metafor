CREATE TABLE IF NOT EXISTS condition_predicate
(
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    condition       INTEGER NOT NULL,
    predicate_order INTEGER NOT NULL CHECK (predicate_order >= 0),
    subject_kind    TEXT    NOT NULL CHECK (subject_kind IN ('value', 'length')),
    operator        TEXT    NOT NULL CHECK (
        operator IN (
            'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'not_in',
            'include', 'not_include', 'is_empty', 'starts_with', 'ends_with',
            'not_starts_with', 'not_ends_with', 'pattern', 'length',
            'between', 'every', 'some'
        )
    ),
    value_kind      TEXT    NOT NULL CHECK (
        value_kind IN ('null', 'boolean', 'number', 'string', 'enum', 'list', 'json')
    ),
    value_boolean   INTEGER CHECK (value_boolean IS NULL OR value_boolean IN (0, 1)),
    value_number    REAL,
    value_text      TEXT,
    value_variant   INTEGER,
    value_json      TEXT,
    UNIQUE (condition, predicate_order),
    FOREIGN KEY (condition) REFERENCES condition (id) ON DELETE CASCADE,
    FOREIGN KEY (value_variant) REFERENCES field_enum_variant (id) ON DELETE CASCADE,
    CHECK (
        (value_kind = 'null' AND value_boolean IS NULL AND value_number IS NULL AND
         value_text IS NULL AND value_variant IS NULL AND value_json IS NULL) OR
        (value_kind = 'boolean' AND value_boolean IS NOT NULL AND value_number IS NULL AND
         value_text IS NULL AND value_variant IS NULL AND value_json IS NULL) OR
        (value_kind = 'number' AND value_number IS NOT NULL AND value_boolean IS NULL AND
         value_text IS NULL AND value_variant IS NULL AND value_json IS NULL) OR
        (value_kind = 'string' AND value_text IS NOT NULL AND value_boolean IS NULL AND
         value_number IS NULL AND value_variant IS NULL AND value_json IS NULL) OR
        (value_kind = 'enum' AND value_variant IS NOT NULL AND value_boolean IS NULL AND
         value_number IS NULL AND value_text IS NULL AND value_json IS NULL) OR
        (value_kind = 'list' AND value_boolean IS NULL AND value_number IS NULL AND
         value_text IS NULL AND value_variant IS NULL AND value_json IS NULL) OR
        (value_kind = 'json' AND value_json IS NOT NULL AND value_boolean IS NULL AND
         value_number IS NULL AND value_text IS NULL AND value_variant IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS condition_list_item
(
    predicate     INTEGER NOT NULL,
    item_order    INTEGER NOT NULL CHECK (item_order >= 0),
    value_kind    TEXT    NOT NULL CHECK (value_kind IN ('null', 'boolean', 'number', 'string', 'enum')),
    value_boolean INTEGER CHECK (value_boolean IS NULL OR value_boolean IN (0, 1)),
    value_number  REAL,
    value_text    TEXT,
    value_variant INTEGER,
    PRIMARY KEY (predicate, item_order),
    FOREIGN KEY (predicate) REFERENCES condition_predicate (id) ON DELETE CASCADE,
    FOREIGN KEY (value_variant) REFERENCES field_enum_variant (id) ON DELETE CASCADE,
    CHECK (
        (value_kind = 'null' AND value_boolean IS NULL AND value_number IS NULL AND value_text IS NULL AND
         value_variant IS NULL) OR
        (value_kind = 'boolean' AND value_boolean IS NOT NULL AND value_number IS NULL AND
         value_text IS NULL AND value_variant IS NULL) OR
        (value_kind = 'number' AND value_number IS NOT NULL AND value_boolean IS NULL AND value_text IS NULL AND
         value_variant IS NULL) OR
        (value_kind = 'string' AND value_text IS NOT NULL AND value_boolean IS NULL AND value_number IS NULL AND
         value_variant IS NULL) OR
        (value_kind = 'enum' AND value_variant IS NOT NULL AND value_boolean IS NULL AND
         value_number IS NULL AND value_text IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS condition_predicate_by_condition
    ON condition_predicate (condition);

CREATE INDEX IF NOT EXISTS condition_list_item_by_predicate
    ON condition_list_item (predicate);
