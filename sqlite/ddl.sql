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
    id       INTEGER PRIMARY KEY,
    meta_src TEXT    NOT NULL,
    key      TEXT    NOT NULL CHECK (length(trim(key)) > 0),
    type     TEXT    NOT NULL CHECK (
        type IN ('string', 'number', 'boolean', 'array<string>', 'array<number>', 'enum<string>', 'enum<number>')
        ),
    required INTEGER NOT NULL CHECK (required IN (0, 1)),
    label    TEXT,
    UNIQUE (meta_src, key),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_default
(
    field_id INTEGER PRIMARY KEY,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_string_default
(
    field_id      INTEGER PRIMARY KEY,
    default_value TEXT NOT NULL,
    FOREIGN KEY (field_id) REFERENCES field_default (field_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_number_default
(
    field_id      INTEGER PRIMARY KEY,
    default_value REAL NOT NULL,
    FOREIGN KEY (field_id) REFERENCES field_default (field_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_boolean_default
(
    field_id      INTEGER PRIMARY KEY,
    default_value INTEGER NOT NULL CHECK (default_value IN (0, 1)),
    FOREIGN KEY (field_id) REFERENCES field_default (field_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default
(
    field_id INTEGER PRIMARY KEY,
    FOREIGN KEY (field_id) REFERENCES field_default (field_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default_item
(
    id       INTEGER PRIMARY KEY,
    field_id INTEGER NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (field_id, position),
    FOREIGN KEY (field_id) REFERENCES field_array_default (field_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_string_default_item
(
    item_id    INTEGER PRIMARY KEY,
    item_value TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES field_array_default_item (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_number_default_item
(
    item_id    INTEGER PRIMARY KEY,
    item_value REAL NOT NULL,
    FOREIGN KEY (item_id) REFERENCES field_array_default_item (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_variant
(
    id       INTEGER PRIMARY KEY,
    field_id INTEGER NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (field_id, position),
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_string_variant
(
    variant_id INTEGER PRIMARY KEY,
    item_value TEXT NOT NULL,
    FOREIGN KEY (variant_id) REFERENCES field_enum_variant (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_number_variant
(
    variant_id INTEGER PRIMARY KEY,
    item_value REAL NOT NULL,
    FOREIGN KEY (variant_id) REFERENCES field_enum_variant (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_default
(
    field_id   INTEGER PRIMARY KEY,
    variant_id INTEGER NOT NULL,
    FOREIGN KEY (field_id) REFERENCES field_default (field_id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES field_enum_variant (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS field_default_requires_required_field_insert
    BEFORE INSERT
    ON field_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_default requires a required field')
    WHERE COALESCE((SELECT required FROM field WHERE id = NEW.field_id), -1) <> 1;
END;

CREATE TRIGGER IF NOT EXISTS field_default_requires_required_field_update
    BEFORE UPDATE OF field_id
    ON field_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_default requires a required field')
    WHERE COALESCE((SELECT required FROM field WHERE id = NEW.field_id), -1) <> 1;
END;

CREATE TRIGGER IF NOT EXISTS field_string_default_requires_string_field_insert
    BEFORE INSERT
    ON field_string_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_string_default requires field.type = string')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') <> 'string';
END;

CREATE TRIGGER IF NOT EXISTS field_string_default_requires_string_field_update
    BEFORE UPDATE OF field_id
    ON field_string_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_string_default requires field.type = string')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') <> 'string';
END;

CREATE TRIGGER IF NOT EXISTS field_number_default_requires_number_field_insert
    BEFORE INSERT
    ON field_number_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_number_default requires field.type = number')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') <> 'number';
END;

CREATE TRIGGER IF NOT EXISTS field_number_default_requires_number_field_update
    BEFORE UPDATE OF field_id
    ON field_number_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_number_default requires field.type = number')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') <> 'number';
END;

CREATE TRIGGER IF NOT EXISTS field_boolean_default_requires_boolean_field_insert
    BEFORE INSERT
    ON field_boolean_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_boolean_default requires field.type = boolean')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') <> 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS field_boolean_default_requires_boolean_field_update
    BEFORE UPDATE OF field_id
    ON field_boolean_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_boolean_default requires field.type = boolean')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') <> 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS field_array_default_requires_array_field_insert
    BEFORE INSERT
    ON field_array_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_default requires field.type = array<...>')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') NOT IN ('array<string>', 'array<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_array_default_requires_array_field_update
    BEFORE UPDATE OF field_id
    ON field_array_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_default requires field.type = array<...>')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') NOT IN ('array<string>', 'array<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_array_string_default_item_requires_string_array_insert
    BEFORE INSERT
    ON field_array_string_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_string_default_item requires field.type = array<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field_id = field.id
                    WHERE field_array_default_item.id = NEW.item_id), '') <> 'array<string>';
END;

CREATE TRIGGER IF NOT EXISTS field_array_string_default_item_requires_string_array_update
    BEFORE UPDATE OF item_id
    ON field_array_string_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_string_default_item requires field.type = array<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field_id = field.id
                    WHERE field_array_default_item.id = NEW.item_id), '') <> 'array<string>';
END;

CREATE TRIGGER IF NOT EXISTS field_array_number_default_item_requires_number_array_insert
    BEFORE INSERT
    ON field_array_number_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_number_default_item requires field.type = array<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field_id = field.id
                    WHERE field_array_default_item.id = NEW.item_id), '') <> 'array<number>';
END;

CREATE TRIGGER IF NOT EXISTS field_array_number_default_item_requires_number_array_update
    BEFORE UPDATE OF item_id
    ON field_array_number_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_number_default_item requires field.type = array<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field_id = field.id
                    WHERE field_array_default_item.id = NEW.item_id), '') <> 'array<number>';
END;

CREATE TRIGGER IF NOT EXISTS field_enum_variant_requires_enum_field_insert
    BEFORE INSERT
    ON field_enum_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_variant requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') NOT IN ('enum<string>', 'enum<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_enum_variant_requires_enum_field_update
    BEFORE UPDATE OF field_id
    ON field_enum_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_variant requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') NOT IN ('enum<string>', 'enum<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_enum_string_variant_requires_string_enum_insert
    BEFORE INSERT
    ON field_enum_string_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_string_variant requires field.type = enum<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field_id = field.id
                    WHERE field_enum_variant.id = NEW.variant_id), '') <> 'enum<string>';

    SELECT RAISE(ABORT, 'field_enum_string_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_string_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.id = existing.variant_id
                           JOIN field_enum_variant AS current_variant ON current_variant.id = NEW.variant_id
                  WHERE existing_variant.field_id = current_variant.field_id
                    AND existing.item_value = NEW.item_value
                    AND existing.variant_id <> NEW.variant_id);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_string_variant_requires_string_enum_update
    BEFORE UPDATE OF variant_id, item_value
    ON field_enum_string_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_string_variant requires field.type = enum<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field_id = field.id
                    WHERE field_enum_variant.id = NEW.variant_id), '') <> 'enum<string>';

    SELECT RAISE(ABORT, 'field_enum_string_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_string_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.id = existing.variant_id
                           JOIN field_enum_variant AS current_variant ON current_variant.id = NEW.variant_id
                  WHERE existing_variant.field_id = current_variant.field_id
                    AND existing.item_value = NEW.item_value
                    AND existing.variant_id <> NEW.variant_id);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_number_variant_requires_number_enum_insert
    BEFORE INSERT
    ON field_enum_number_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_number_variant requires field.type = enum<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field_id = field.id
                    WHERE field_enum_variant.id = NEW.variant_id), '') <> 'enum<number>';

    SELECT RAISE(ABORT, 'field_enum_number_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_number_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.id = existing.variant_id
                           JOIN field_enum_variant AS current_variant ON current_variant.id = NEW.variant_id
                  WHERE existing_variant.field_id = current_variant.field_id
                    AND existing.item_value = NEW.item_value
                    AND existing.variant_id <> NEW.variant_id);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_number_variant_requires_number_enum_update
    BEFORE UPDATE OF variant_id, item_value
    ON field_enum_number_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_number_variant requires field.type = enum<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field_id = field.id
                    WHERE field_enum_variant.id = NEW.variant_id), '') <> 'enum<number>';

    SELECT RAISE(ABORT, 'field_enum_number_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_number_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.id = existing.variant_id
                           JOIN field_enum_variant AS current_variant ON current_variant.id = NEW.variant_id
                  WHERE existing_variant.field_id = current_variant.field_id
                    AND existing.item_value = NEW.item_value
                    AND existing.variant_id <> NEW.variant_id);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_default_requires_matching_variant_insert
    BEFORE INSERT
    ON field_enum_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_default requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') NOT IN ('enum<string>', 'enum<number>');

    SELECT RAISE(ABORT, 'field_enum_default.variant_id must belong to the same field')
    WHERE COALESCE((SELECT field_id FROM field_enum_variant WHERE id = NEW.variant_id), -1) <> NEW.field_id;
END;

CREATE TRIGGER IF NOT EXISTS field_enum_default_requires_matching_variant_update
    BEFORE UPDATE OF field_id, variant_id
    ON field_enum_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_default requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE id = NEW.field_id), '') NOT IN ('enum<string>', 'enum<number>');

    SELECT RAISE(ABORT, 'field_enum_default.variant_id must belong to the same field')
    WHERE COALESCE((SELECT field_id FROM field_enum_variant WHERE id = NEW.variant_id), -1) <> NEW.field_id;
END;

CREATE TABLE IF NOT EXISTS state
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT    NOT NULL,
    name     TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
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
    UNIQUE (from_state_id, position),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE,
    FOREIGN KEY (from_state_id) REFERENCES state (id) ON DELETE CASCADE,
    FOREIGN KEY (to_state_id) REFERENCES state (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS condition
(
    meta_src       TEXT    NOT NULL,
    transition_id  INTEGER NOT NULL,
    field_id       INTEGER NOT NULL,
    condition_json TEXT    NOT NULL CHECK (json_valid(condition_json)),
    PRIMARY KEY (transition_id, field_id),
    FOREIGN KEY (transition_id) REFERENCES transition (id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS transition_requires_same_meta_states_insert
    BEFORE INSERT
    ON transition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'transition.from_state_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.from_state_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'transition.to_state_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.to_state_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS transition_requires_same_meta_states_update
    BEFORE UPDATE OF meta_src, from_state_id, to_state_id
    ON transition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'transition.from_state_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.from_state_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'transition.to_state_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.to_state_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS condition_requires_same_meta_refs_insert
    BEFORE INSERT
    ON condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'condition.transition_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM transition WHERE id = NEW.transition_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'condition.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS condition_requires_same_meta_refs_update
    BEFORE UPDATE OF meta_src, transition_id, field_id
    ON condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'condition.transition_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM transition WHERE id = NEW.transition_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'condition.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TABLE IF NOT EXISTS process
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    key      TEXT NOT NULL CHECK (length(trim(key)) > 0),
    type     TEXT NOT NULL CHECK (type IN ('action', 'finally')),
    label    TEXT,
    desc     TEXT,
    UNIQUE (id, meta_src, type),
    UNIQUE (meta_src, key),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action
(
    process_id              INTEGER PRIMARY KEY,
    meta_src                TEXT NOT NULL,
    type                    TEXT NOT NULL DEFAULT 'action' CHECK (type = 'action'),
    action_src              TEXT NOT NULL,
    action_import_specifier TEXT,
    success_src             TEXT,
    error_src               TEXT,
    UNIQUE (process_id, meta_src, type),
    CHECK (action_src IS NOT NULL OR action_import_specifier IS NULL),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_finally
(
    process_id INTEGER PRIMARY KEY,
    meta_src   TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'finally' CHECK (type = 'finally'),
    before_src TEXT NOT NULL,
    UNIQUE (process_id, meta_src, type),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_env
(
    meta_src   TEXT    NOT NULL,
    process_id INTEGER NOT NULL,
    env        TEXT    NOT NULL CHECK (env IN ('browser', 'node', 'worker', 'server', 'any')),
    PRIMARY KEY (process_id, env),
    FOREIGN KEY (process_id) REFERENCES process (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS process_env_requires_same_meta_process_insert
    BEFORE INSERT
    ON process_env
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_env.process_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM process WHERE id = NEW.process_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS process_env_requires_same_meta_process_update
    BEFORE UPDATE OF meta_src, process_id
    ON process_env
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_env.process_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM process WHERE id = NEW.process_id), '') <> NEW.meta_src;
END;

CREATE TABLE IF NOT EXISTS process_action_read
(
    meta_src   TEXT    NOT NULL,
    process_id INTEGER NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'action' CHECK (type = 'action'),
    field_id   INTEGER NOT NULL,
    phase      TEXT    NOT NULL CHECK (phase IN ('action', 'success', 'error')),
    PRIMARY KEY (process_id, phase, field_id),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process_action (process_id, meta_src, type) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_write
(
    meta_src   TEXT    NOT NULL,
    process_id INTEGER NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'action' CHECK (type = 'action'),
    field_id   INTEGER NOT NULL,
    phase      TEXT    NOT NULL CHECK (phase IN ('success', 'error')),
    PRIMARY KEY (process_id, phase, field_id),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process_action (process_id, meta_src, type) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_finally_read
(
    meta_src   TEXT    NOT NULL,
    process_id INTEGER NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'finally' CHECK (type = 'finally'),
    field_id   INTEGER NOT NULL,
    PRIMARY KEY (process_id, field_id),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process_finally (process_id, meta_src, type) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS process_action_read_requires_same_meta_field_insert
    BEFORE INSERT
    ON process_action_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_read.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS process_action_read_requires_same_meta_field_update
    BEFORE UPDATE OF meta_src, field_id
    ON process_action_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_read.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS process_action_write_requires_same_meta_field_insert
    BEFORE INSERT
    ON process_action_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_write.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS process_action_write_requires_same_meta_field_update
    BEFORE UPDATE OF meta_src, field_id
    ON process_action_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_write.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS process_finally_read_requires_same_meta_field_insert
    BEFORE INSERT
    ON process_finally_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally_read.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS process_finally_read_requires_same_meta_field_update
    BEFORE UPDATE OF meta_src, field_id
    ON process_finally_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally_read.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TABLE IF NOT EXISTS reaction
(
    id            INTEGER PRIMARY KEY,
    meta_src      TEXT NOT NULL,
    key           TEXT NOT NULL CHECK (length(trim(key)) > 0),
    label         TEXT NOT NULL,
    desc          TEXT,
    cond_source   TEXT NOT NULL,
    update_source TEXT NOT NULL,
    UNIQUE (meta_src, key),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_state
(
    meta_src    TEXT    NOT NULL,
    reaction_id INTEGER NOT NULL,
    state_id    INTEGER NOT NULL,
    PRIMARY KEY (reaction_id, state_id),
    FOREIGN KEY (reaction_id) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (state_id) REFERENCES state (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_read
(
    meta_src    TEXT    NOT NULL,
    reaction_id INTEGER NOT NULL,
    field_id    INTEGER NOT NULL,
    PRIMARY KEY (reaction_id, field_id),
    FOREIGN KEY (reaction_id) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_write
(
    meta_src    TEXT    NOT NULL,
    reaction_id INTEGER NOT NULL,
    field_id    INTEGER NOT NULL,
    PRIMARY KEY (reaction_id, field_id),
    FOREIGN KEY (reaction_id) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS reaction_state_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_state
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_state.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_state.state_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.state_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_state_requires_same_meta_refs_update
    BEFORE UPDATE OF meta_src, reaction_id, state_id
    ON reaction_state
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_state.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_state.state_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.state_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_read_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_read.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_read.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_read_requires_same_meta_refs_update
    BEFORE UPDATE OF meta_src, reaction_id, field_id
    ON reaction_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_read.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_read.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_write_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_write.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_write.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_write_requires_same_meta_refs_update
    BEFORE UPDATE OF meta_src, reaction_id, field_id
    ON reaction_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_write.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_write.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TABLE IF NOT EXISTS particle
(
    id        INTEGER PRIMARY KEY,
    meta_src  TEXT    NOT NULL,
    parent_id INTEGER,
    position  INTEGER NOT NULL CHECK (position >= 0),
    type      TEXT    NOT NULL CHECK (type IN ('wimp', 'fuzzy', 'axion', 'macho')),
    UNIQUE (id, meta_src, type),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES particle (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS particle_parent_requires_same_meta_insert
    BEFORE INSERT
    ON particle
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'particle.parent_id must belong to the same meta')
    WHERE NEW.parent_id IS NOT NULL
      AND COALESCE((SELECT meta_src FROM particle WHERE id = NEW.parent_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS particle_parent_requires_same_meta_update
    BEFORE UPDATE OF meta_src, parent_id
    ON particle
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'particle.parent_id must belong to the same meta')
    WHERE NEW.parent_id IS NOT NULL
      AND COALESCE((SELECT meta_src FROM particle WHERE id = NEW.parent_id), '') <> NEW.meta_src;
END;

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
    fuzzy_id INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'fuzzy' CHECK (type = 'fuzzy'),
    kind     TEXT NOT NULL DEFAULT 'condition' CHECK (kind = 'condition'),
    data     TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) IN ('text', 'array')),
    expr     TEXT,
    FOREIGN KEY (fuzzy_id, meta_src, type, kind) REFERENCES fuzzy (id, meta_src, type, kind) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fuzzy_meta
(
    fuzzy_id INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'fuzzy' CHECK (type = 'fuzzy'),
    kind     TEXT NOT NULL DEFAULT 'meta' CHECK (kind = 'meta'),
    src      TEXT NOT NULL CHECK (json_valid(src) AND json_type(src) = 'object'),
    fields   TEXT CHECK (fields IS NULL OR (json_valid(fields) AND json_type(fields) IN ('text', 'object'))),
    mass     TEXT CHECK (mass IS NULL OR (json_valid(mass) AND json_type(mass) IN ('text', 'object'))),
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
