CREATE TABLE IF NOT EXISTS meta
(
    src         TEXT PRIMARY KEY CHECK (length(trim(src)) > 0),
    name        TEXT,
    desc        TEXT,
    view_css    TEXT,
    mass_source TEXT
);

CREATE TABLE IF NOT EXISTS field
(
    id          INTEGER PRIMARY KEY,
    meta_src    TEXT    NOT NULL,
    key         TEXT    NOT NULL CHECK (length(trim(key)) > 0),
    type        TEXT    NOT NULL CHECK (
        type IN ('string', 'number', 'boolean', 'array<string>', 'array<number>', 'enum<string>', 'enum<number>')
    ),
    required    INTEGER NOT NULL CHECK (required IN (0, 1)),
    label       TEXT,
    identifier  INTEGER NOT NULL DEFAULT 0 CHECK (identifier IN (0, 1)),
    data_source TEXT,
    UNIQUE (id, meta_src),
    UNIQUE (id, meta_src, type),
    UNIQUE (meta_src, key),
    CHECK (data_source IS NULL OR type IN ('array<string>', 'array<number>')),
    CHECK (
        identifier = 0
        OR (required = 1 AND type IN ('string', 'number', 'boolean', 'enum<string>', 'enum<number>'))
    ),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_string_default
(
    field_id      INTEGER PRIMARY KEY,
    meta_src      TEXT NOT NULL,
    field_type    TEXT NOT NULL DEFAULT 'string' CHECK (field_type = 'string'),
    default_value TEXT NOT NULL,
    UNIQUE (field_id, meta_src, field_type),
    FOREIGN KEY (field_id, meta_src, field_type) REFERENCES field (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_number_default
(
    field_id      INTEGER PRIMARY KEY,
    meta_src      TEXT NOT NULL,
    field_type    TEXT NOT NULL DEFAULT 'number' CHECK (field_type = 'number'),
    default_value REAL NOT NULL,
    UNIQUE (field_id, meta_src, field_type),
    FOREIGN KEY (field_id, meta_src, field_type) REFERENCES field (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_boolean_default
(
    field_id      INTEGER PRIMARY KEY,
    meta_src      TEXT    NOT NULL,
    field_type    TEXT    NOT NULL DEFAULT 'boolean' CHECK (field_type = 'boolean'),
    default_value INTEGER NOT NULL CHECK (default_value IN (0, 1)),
    UNIQUE (field_id, meta_src, field_type),
    FOREIGN KEY (field_id, meta_src, field_type) REFERENCES field (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default
(
    field_id   INTEGER PRIMARY KEY,
    meta_src   TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('array<string>', 'array<number>')),
    UNIQUE (field_id, meta_src, field_type),
    FOREIGN KEY (field_id, meta_src, field_type) REFERENCES field (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default_item
(
    id         INTEGER PRIMARY KEY,
    field_id   INTEGER NOT NULL,
    meta_src   TEXT    NOT NULL,
    field_type TEXT    NOT NULL CHECK (field_type IN ('array<string>', 'array<number>')),
    position   INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (field_id, position),
    UNIQUE (id, field_id, meta_src, field_type),
    FOREIGN KEY (field_id, meta_src, field_type) REFERENCES field_array_default (field_id, meta_src, field_type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_string_default_item
(
    item_id     INTEGER PRIMARY KEY,
    field_id    INTEGER NOT NULL,
    meta_src    TEXT NOT NULL,
    field_type  TEXT NOT NULL DEFAULT 'array<string>' CHECK (field_type = 'array<string>'),
    item_value  TEXT NOT NULL,
    FOREIGN KEY (item_id, field_id, meta_src, field_type) REFERENCES field_array_default_item (id, field_id, meta_src, field_type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_number_default_item
(
    item_id     INTEGER PRIMARY KEY,
    field_id    INTEGER NOT NULL,
    meta_src    TEXT NOT NULL,
    field_type  TEXT NOT NULL DEFAULT 'array<number>' CHECK (field_type = 'array<number>'),
    item_value  REAL NOT NULL,
    FOREIGN KEY (item_id, field_id, meta_src, field_type) REFERENCES field_array_default_item (id, field_id, meta_src, field_type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_variant
(
    id         INTEGER PRIMARY KEY,
    field_id   INTEGER NOT NULL,
    meta_src   TEXT    NOT NULL,
    field_type TEXT    NOT NULL CHECK (field_type IN ('enum<string>', 'enum<number>')),
    UNIQUE (id, field_id),
    UNIQUE (id, field_id, meta_src, field_type),
    FOREIGN KEY (field_id, meta_src, field_type) REFERENCES field (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_string_variant
(
    variant_id  INTEGER PRIMARY KEY,
    field_id    INTEGER NOT NULL,
    meta_src    TEXT NOT NULL,
    field_type  TEXT NOT NULL DEFAULT 'enum<string>' CHECK (field_type = 'enum<string>'),
    item_value  TEXT NOT NULL,
    UNIQUE (field_id, item_value),
    FOREIGN KEY (variant_id, field_id, meta_src, field_type) REFERENCES field_enum_variant (id, field_id, meta_src, field_type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_number_variant
(
    variant_id  INTEGER PRIMARY KEY,
    field_id    INTEGER NOT NULL,
    meta_src    TEXT NOT NULL,
    field_type  TEXT NOT NULL DEFAULT 'enum<number>' CHECK (field_type = 'enum<number>'),
    item_value  REAL NOT NULL,
    UNIQUE (field_id, item_value),
    FOREIGN KEY (variant_id, field_id, meta_src, field_type) REFERENCES field_enum_variant (id, field_id, meta_src, field_type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_default
(
    field_id    INTEGER PRIMARY KEY,
    meta_src    TEXT    NOT NULL,
    field_type  TEXT    NOT NULL CHECK (field_type IN ('enum<string>', 'enum<number>')),
    variant_id  INTEGER NOT NULL,
    UNIQUE (field_id, meta_src, field_type),
    FOREIGN KEY (field_id, meta_src, field_type) REFERENCES field (id, meta_src, type) ON DELETE CASCADE,
    FOREIGN KEY (variant_id, field_id) REFERENCES field_enum_variant (id, field_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS state
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT    NOT NULL,
    name     TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (id, meta_src),
    UNIQUE (meta_src, name),
    UNIQUE (meta_src, position),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transition
(
    id            INTEGER PRIMARY KEY,
    meta_src      TEXT    NOT NULL,
    from_state_id INTEGER NOT NULL,
    to_state_id   INTEGER NOT NULL,
    position      INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (id, meta_src),
    UNIQUE (from_state_id, position),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE,
    FOREIGN KEY (from_state_id, meta_src) REFERENCES state (id, meta_src) ON DELETE CASCADE,
    FOREIGN KEY (to_state_id, meta_src) REFERENCES state (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS condition
(
    meta_src       TEXT    NOT NULL,
    transition_id  INTEGER NOT NULL,
    field_id       INTEGER NOT NULL,
    condition_json TEXT    NOT NULL CHECK (json_valid(condition_json)),
    PRIMARY KEY (transition_id, field_id),
    FOREIGN KEY (transition_id, meta_src) REFERENCES transition (id, meta_src) ON DELETE CASCADE,
    FOREIGN KEY (field_id, meta_src) REFERENCES field (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT    NOT NULL,
    key      TEXT    NOT NULL CHECK (length(trim(key)) > 0),
    type     TEXT    NOT NULL CHECK (type IN ('action', 'finally')),
    label    TEXT,
    desc     TEXT,
    UNIQUE (id, meta_src),
    UNIQUE (id, meta_src, type),
    UNIQUE (meta_src, key),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action
(
    process_id               INTEGER PRIMARY KEY,
    meta_src                 TEXT NOT NULL,
    type                     TEXT NOT NULL DEFAULT 'action' CHECK (type = 'action'),
    action_src               TEXT NOT NULL,
    action_import_specifier  TEXT,
    success_src              TEXT,
    error_src                TEXT,
    UNIQUE (process_id, meta_src, type),
    CHECK (action_src IS NOT NULL OR action_import_specifier IS NULL),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_finally
(
    process_id  INTEGER PRIMARY KEY,
    meta_src    TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'finally' CHECK (type = 'finally'),
    before_src  TEXT NOT NULL,
    UNIQUE (process_id, meta_src, type),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_env
(
    meta_src    TEXT    NOT NULL,
    process_id  INTEGER NOT NULL,
    env         TEXT    NOT NULL CHECK (env IN ('browser', 'node', 'worker', 'server', 'any')),
    PRIMARY KEY (process_id, env),
    FOREIGN KEY (process_id, meta_src) REFERENCES process (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_read
(
    meta_src    TEXT    NOT NULL,
    process_id  INTEGER NOT NULL,
    type        TEXT    NOT NULL DEFAULT 'action' CHECK (type = 'action'),
    field_id    INTEGER NOT NULL,
    phase       TEXT    NOT NULL CHECK (phase IN ('action', 'success', 'error')),
    PRIMARY KEY (process_id, phase, field_id),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process_action (process_id, meta_src, type) ON DELETE CASCADE,
    FOREIGN KEY (field_id, meta_src) REFERENCES field (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_write
(
    meta_src    TEXT    NOT NULL,
    process_id  INTEGER NOT NULL,
    type        TEXT    NOT NULL DEFAULT 'action' CHECK (type = 'action'),
    field_id    INTEGER NOT NULL,
    phase       TEXT    NOT NULL CHECK (phase IN ('success', 'error')),
    PRIMARY KEY (process_id, phase, field_id),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process_action (process_id, meta_src, type) ON DELETE CASCADE,
    FOREIGN KEY (field_id, meta_src) REFERENCES field (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_finally_read
(
    meta_src    TEXT    NOT NULL,
    process_id  INTEGER NOT NULL,
    type        TEXT    NOT NULL DEFAULT 'finally' CHECK (type = 'finally'),
    field_id    INTEGER NOT NULL,
    PRIMARY KEY (process_id, field_id),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process_finally (process_id, meta_src, type) ON DELETE CASCADE,
    FOREIGN KEY (field_id, meta_src) REFERENCES field (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction
(
    id            INTEGER PRIMARY KEY,
    meta_src      TEXT    NOT NULL,
    key           TEXT    NOT NULL CHECK (length(trim(key)) > 0),
    label         TEXT    NOT NULL,
    desc          TEXT,
    cond_source   TEXT    NOT NULL,
    update_source TEXT    NOT NULL,
    UNIQUE (id, meta_src),
    UNIQUE (meta_src, key),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_state
(
    meta_src     TEXT    NOT NULL,
    reaction_id  INTEGER NOT NULL,
    state_id     INTEGER NOT NULL,
    PRIMARY KEY (reaction_id, state_id),
    FOREIGN KEY (reaction_id, meta_src) REFERENCES reaction (id, meta_src) ON DELETE CASCADE,
    FOREIGN KEY (state_id, meta_src) REFERENCES state (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_read
(
    meta_src     TEXT    NOT NULL,
    reaction_id  INTEGER NOT NULL,
    field_id     INTEGER NOT NULL,
    PRIMARY KEY (reaction_id, field_id),
    FOREIGN KEY (reaction_id, meta_src) REFERENCES reaction (id, meta_src) ON DELETE CASCADE,
    FOREIGN KEY (field_id, meta_src) REFERENCES field (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_write
(
    meta_src     TEXT    NOT NULL,
    reaction_id  INTEGER NOT NULL,
    field_id     INTEGER NOT NULL,
    PRIMARY KEY (reaction_id, field_id),
    FOREIGN KEY (reaction_id, meta_src) REFERENCES reaction (id, meta_src) ON DELETE CASCADE,
    FOREIGN KEY (field_id, meta_src) REFERENCES field (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS particle
(
    id        INTEGER PRIMARY KEY,
    meta_src  TEXT    NOT NULL,
    parent_id INTEGER,
    position  INTEGER NOT NULL CHECK (position >= 0),
    type      TEXT    NOT NULL CHECK (type IN ('wimp', 'fuzzy', 'axion', 'macho')),
    UNIQUE (id, meta_src),
    UNIQUE (id, meta_src, type),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE,
    FOREIGN KEY (parent_id, meta_src) REFERENCES particle (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wimp
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'wimp' CHECK (type = 'wimp'),
    src      TEXT NOT NULL CHECK (length(trim(src)) > 0),
    fields   TEXT CHECK (fields IS NULL OR (json_valid(fields) AND json_type(fields) IN ('text', 'object'))),
    mass     TEXT CHECK (mass IS NULL OR (json_valid(mass) AND json_type(mass) IN ('text', 'object'))),
    FOREIGN KEY (id, meta_src, type) REFERENCES particle (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fuzzy
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'fuzzy' CHECK (type = 'fuzzy'),
    kind     TEXT NOT NULL CHECK (kind IN ('condition', 'meta')),
    UNIQUE (id, meta_src, type, kind),
    FOREIGN KEY (id, meta_src, type) REFERENCES particle (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fuzzy_condition
(
    fuzzy_id  INTEGER PRIMARY KEY,
    meta_src  TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'fuzzy' CHECK (type = 'fuzzy'),
    kind      TEXT NOT NULL DEFAULT 'condition' CHECK (kind = 'condition'),
    data      TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) IN ('text', 'array')),
    expr      TEXT,
    FOREIGN KEY (fuzzy_id, meta_src, type, kind) REFERENCES fuzzy (id, meta_src, type, kind) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fuzzy_meta
(
    fuzzy_id  INTEGER PRIMARY KEY,
    meta_src  TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'fuzzy' CHECK (type = 'fuzzy'),
    kind      TEXT NOT NULL DEFAULT 'meta' CHECK (kind = 'meta'),
    src       TEXT NOT NULL CHECK (json_valid(src) AND json_type(src) = 'object'),
    fields    TEXT CHECK (fields IS NULL OR (json_valid(fields) AND json_type(fields) IN ('text', 'object'))),
    mass      TEXT CHECK (mass IS NULL OR (json_valid(mass) AND json_type(mass) IN ('text', 'object'))),
    FOREIGN KEY (fuzzy_id, meta_src, type, kind) REFERENCES fuzzy (id, meta_src, type, kind) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS axion
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'axion' CHECK (type = 'axion'),
    data     TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) IN ('text', 'array')),
    expr     TEXT,
    FOREIGN KEY (id, meta_src, type) REFERENCES particle (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS macho
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'macho' CHECK (type = 'macho'),
    data     TEXT NOT NULL CHECK (length(trim(data)) > 0),
    FOREIGN KEY (id, meta_src, type) REFERENCES particle (id, meta_src, type) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS field_by_meta_src
    ON field (meta_src);

CREATE INDEX IF NOT EXISTS field_array_default_by_meta_src
    ON field_array_default (meta_src);

CREATE INDEX IF NOT EXISTS field_array_default_item_by_meta_src
    ON field_array_default_item (meta_src);

CREATE INDEX IF NOT EXISTS field_enum_variant_by_meta_src
    ON field_enum_variant (meta_src);

CREATE INDEX IF NOT EXISTS field_enum_default_by_meta_src
    ON field_enum_default (meta_src);

CREATE INDEX IF NOT EXISTS state_by_meta_src
    ON state (meta_src);

CREATE INDEX IF NOT EXISTS transition_by_meta_src
    ON transition (meta_src);

CREATE INDEX IF NOT EXISTS condition_by_meta_src
    ON condition (meta_src);

CREATE INDEX IF NOT EXISTS process_by_meta_src
    ON process (meta_src);

CREATE INDEX IF NOT EXISTS process_action_by_meta_src
    ON process_action (meta_src);

CREATE INDEX IF NOT EXISTS process_finally_by_meta_src
    ON process_finally (meta_src);

CREATE INDEX IF NOT EXISTS process_env_by_meta_src
    ON process_env (meta_src);

CREATE INDEX IF NOT EXISTS process_action_read_by_meta_src
    ON process_action_read (meta_src);

CREATE INDEX IF NOT EXISTS process_action_write_by_meta_src
    ON process_action_write (meta_src);

CREATE INDEX IF NOT EXISTS process_finally_read_by_meta_src
    ON process_finally_read (meta_src);

CREATE INDEX IF NOT EXISTS reaction_by_meta_src
    ON reaction (meta_src);

CREATE INDEX IF NOT EXISTS reaction_state_by_meta_src
    ON reaction_state (meta_src);

CREATE INDEX IF NOT EXISTS reaction_read_by_meta_src
    ON reaction_read (meta_src);

CREATE INDEX IF NOT EXISTS reaction_write_by_meta_src
    ON reaction_write (meta_src);

CREATE INDEX IF NOT EXISTS particle_by_meta_src
    ON particle (meta_src);

CREATE INDEX IF NOT EXISTS fuzzy_by_meta_src
    ON fuzzy (meta_src);

CREATE UNIQUE INDEX IF NOT EXISTS root_order
    ON particle (meta_src, position) WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS child_order
    ON particle (meta_src, parent_id, position) WHERE parent_id IS NOT NULL;
