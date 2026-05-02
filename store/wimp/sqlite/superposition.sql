CREATE TABLE IF NOT EXISTS superposition
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    wimp     TEXT    NOT NULL,
    name     TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (wimp, name),
    UNIQUE (wimp, position),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transition
(
    uuid               TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    from_superposition TEXT    NOT NULL CHECK (length(trim(from_superposition)) > 0),
    to_superposition   TEXT    NOT NULL CHECK (length(trim(to_superposition)) > 0),
    position           INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (from_superposition, position),
    FOREIGN KEY (from_superposition) REFERENCES superposition (uuid) ON DELETE CASCADE,
    FOREIGN KEY (to_superposition) REFERENCES superposition (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS condition
(
    uuid       TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    transition TEXT    NOT NULL CHECK (length(trim(transition)) > 0),
    field      TEXT    NOT NULL CHECK (length(trim(field)) > 0),
    position   INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (transition, field),
    UNIQUE (transition, position),
    FOREIGN KEY (transition) REFERENCES transition (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS condition_predicate
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    condition       TEXT    NOT NULL CHECK (length(trim(condition)) > 0),
    predicate_order INTEGER NOT NULL CHECK (predicate_order >= 0),
    subject_kind    TEXT    NOT NULL CHECK (subject_kind IN ('value', 'length')),
    operator        TEXT    NOT NULL CHECK (
        operator IN
        ('eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'not_in', 'include', 'not_include', 'is_empty')
        ),
    value_kind      TEXT    NOT NULL CHECK (value_kind IN ('null', 'boolean', 'number', 'string', 'enum', 'list')),
    value_boolean   INTEGER CHECK (value_boolean IS NULL OR value_boolean IN (0, 1)),
    value_number    REAL,
    value_text      TEXT,
    value_variant   TEXT,
    UNIQUE (condition, predicate_order),
    FOREIGN KEY (condition) REFERENCES condition (uuid) ON DELETE CASCADE,
    FOREIGN KEY (value_variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE,
    CHECK (
        (subject_kind = 'length' AND operator IN ('eq', 'neq', 'gt', 'lt', 'gte', 'lte') AND
         value_kind = 'number' AND value_number IS NOT NULL AND value_boolean IS NULL AND
         value_text IS NULL AND value_variant IS NULL) OR
        (subject_kind = 'value' AND (
            (operator IN ('eq', 'neq', 'gt', 'lt', 'gte', 'lte') AND (
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
                )) OR
            (operator IN ('in', 'not_in') AND value_kind = 'list' AND value_boolean IS NULL AND value_number IS NULL AND
             value_text IS NULL AND value_variant IS NULL) OR
            (operator IN ('include', 'not_include') AND (
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
                )) OR
            (operator = 'is_empty' AND value_kind = 'boolean' AND value_boolean IS NOT NULL AND value_number IS NULL AND
             value_text IS NULL AND value_variant IS NULL)
            ))
        )
);

CREATE TABLE IF NOT EXISTS condition_list_item
(
    predicate     TEXT    NOT NULL CHECK (length(trim(predicate)) > 0),
    item_order    INTEGER NOT NULL CHECK (item_order >= 0),
    value_kind    TEXT    NOT NULL CHECK (value_kind IN ('null', 'boolean', 'number', 'string', 'enum')),
    value_boolean INTEGER CHECK (value_boolean IS NULL OR value_boolean IN (0, 1)),
    value_number  REAL,
    value_text    TEXT,
    value_variant TEXT,
    PRIMARY KEY (predicate, item_order),
    FOREIGN KEY (predicate) REFERENCES condition_predicate (uuid) ON DELETE CASCADE,
    FOREIGN KEY (value_variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE,
    CHECK (
        (value_kind = 'null' AND value_boolean IS NULL AND value_number IS NULL AND value_text IS NULL AND
         value_variant IS NULL) OR
        (value_kind = 'boolean' AND value_boolean IS NOT NULL AND value_number IS NULL AND value_text IS NULL AND
         value_variant IS NULL) OR
        (value_kind = 'number' AND value_number IS NOT NULL AND value_boolean IS NULL AND value_text IS NULL AND
         value_variant IS NULL) OR
        (value_kind = 'string' AND value_text IS NOT NULL AND value_boolean IS NULL AND value_number IS NULL AND
         value_variant IS NULL) OR
        (value_kind = 'enum' AND value_variant IS NOT NULL AND value_boolean IS NULL AND value_number IS NULL AND
         value_text IS NULL)
        )
);

CREATE INDEX IF NOT EXISTS superposition_by_wimp
    ON superposition (wimp);

CREATE INDEX IF NOT EXISTS condition_by_transition
    ON condition (transition);

CREATE INDEX IF NOT EXISTS condition_predicate_by_condition
    ON condition_predicate (condition);

CREATE INDEX IF NOT EXISTS condition_list_item_by_predicate
    ON condition_list_item (predicate);
