CREATE TABLE IF NOT EXISTS field
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta TEXT    NOT NULL,
    key      TEXT    NOT NULL CHECK (length(trim(key)) > 0),
    type     TEXT    NOT NULL CHECK (
        type IN ('string', 'number', 'boolean', 'array<string>', 'array<number>', 'enum<string>', 'enum<number>')
        ),
    required INTEGER NOT NULL CHECK (required IN (0, 1)),
    label    TEXT,
    UNIQUE (meta, key),
    FOREIGN KEY (meta) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_default
(
    field TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_string_default
(
    field     TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    default_value  TEXT NOT NULL,
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_number_default
(
    field     TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    default_value  REAL NOT NULL,
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_boolean_default
(
    field     TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    default_value  INTEGER NOT NULL CHECK (default_value IN (0, 1)),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default
(
    field TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default_item
(
    uuid       TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    field TEXT    NOT NULL CHECK (length(trim(field)) > 0),
    position   INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (field, position),
    FOREIGN KEY (field) REFERENCES field_array_default (field) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_string_default_item
(
    item   TEXT PRIMARY KEY CHECK (length(trim(item)) > 0),
    item_value  TEXT NOT NULL,
    FOREIGN KEY (item) REFERENCES field_array_default_item (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_number_default_item
(
    item   TEXT PRIMARY KEY CHECK (length(trim(item)) > 0),
    item_value  REAL NOT NULL,
    FOREIGN KEY (item) REFERENCES field_array_default_item (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_variant
(
    uuid       TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    field TEXT    NOT NULL CHECK (length(trim(field)) > 0),
    position   INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (field, position),
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_string_variant
(
    variant TEXT PRIMARY KEY CHECK (length(trim(variant)) > 0),
    item_value   TEXT NOT NULL,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_number_variant
(
    variant TEXT PRIMARY KEY CHECK (length(trim(variant)) > 0),
    item_value   REAL NOT NULL,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_default
(
    field   TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    variant TEXT NOT NULL CHECK (length(trim(variant)) > 0),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE,
    FOREIGN KEY (variant) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS field_default_requires_required_field_insert
    BEFORE INSERT
    ON field_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_default requires a required field')
    WHERE COALESCE((SELECT required FROM field WHERE uuid = NEW.field), -1) <> 1;
END;

CREATE TRIGGER IF NOT EXISTS field_default_requires_required_field_update
    BEFORE UPDATE OF field
    ON field_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_default requires a required field')
    WHERE COALESCE((SELECT required FROM field WHERE uuid = NEW.field), -1) <> 1;
END;

CREATE TRIGGER IF NOT EXISTS field_string_default_requires_string_field_insert
    BEFORE INSERT
    ON field_string_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_string_default requires field.type = string')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') <> 'string';
END;

CREATE TRIGGER IF NOT EXISTS field_string_default_requires_string_field_update
    BEFORE UPDATE OF field
    ON field_string_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_string_default requires field.type = string')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') <> 'string';
END;

CREATE TRIGGER IF NOT EXISTS field_number_default_requires_number_field_insert
    BEFORE INSERT
    ON field_number_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_number_default requires field.type = number')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') <> 'number';
END;

CREATE TRIGGER IF NOT EXISTS field_number_default_requires_number_field_update
    BEFORE UPDATE OF field
    ON field_number_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_number_default requires field.type = number')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') <> 'number';
END;

CREATE TRIGGER IF NOT EXISTS field_boolean_default_requires_boolean_field_insert
    BEFORE INSERT
    ON field_boolean_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_boolean_default requires field.type = boolean')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') <> 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS field_boolean_default_requires_boolean_field_update
    BEFORE UPDATE OF field
    ON field_boolean_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_boolean_default requires field.type = boolean')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') <> 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS field_array_default_requires_array_field_insert
    BEFORE INSERT
    ON field_array_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_default requires field.type = array<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') NOT IN ('array<string>', 'array<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_array_default_requires_array_field_update
    BEFORE UPDATE OF field
    ON field_array_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_default requires field.type = array<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') NOT IN ('array<string>', 'array<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_array_string_default_item_requires_string_array_insert
    BEFORE INSERT
    ON field_array_string_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_string_default_item requires field.type = array<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field = field.uuid
                    WHERE field_array_default_item.uuid = NEW.item), '') <> 'array<string>';
END;

CREATE TRIGGER IF NOT EXISTS field_array_string_default_item_requires_string_array_update
    BEFORE UPDATE OF item
    ON field_array_string_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_string_default_item requires field.type = array<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field = field.uuid
                    WHERE field_array_default_item.uuid = NEW.item), '') <> 'array<string>';
END;

CREATE TRIGGER IF NOT EXISTS field_array_number_default_item_requires_number_array_insert
    BEFORE INSERT
    ON field_array_number_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_number_default_item requires field.type = array<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field = field.uuid
                    WHERE field_array_default_item.uuid = NEW.item), '') <> 'array<number>';
END;

CREATE TRIGGER IF NOT EXISTS field_array_number_default_item_requires_number_array_update
    BEFORE UPDATE OF item
    ON field_array_number_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_number_default_item requires field.type = array<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field = field.uuid
                    WHERE field_array_default_item.uuid = NEW.item), '') <> 'array<number>';
END;

CREATE TRIGGER IF NOT EXISTS field_enum_variant_requires_enum_field_insert
    BEFORE INSERT
    ON field_enum_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_variant requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') NOT IN ('enum<string>', 'enum<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_enum_variant_requires_enum_field_update
    BEFORE UPDATE OF field
    ON field_enum_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_variant requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') NOT IN ('enum<string>', 'enum<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_enum_string_variant_requires_string_enum_insert
    BEFORE INSERT
    ON field_enum_string_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_string_variant requires field.type = enum<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field = field.uuid
                    WHERE field_enum_variant.uuid = NEW.variant), '') <> 'enum<string>';

    SELECT RAISE(ABORT, 'field_enum_string_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_string_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.uuid = existing.variant
                           JOIN field_enum_variant AS current_variant ON current_variant.uuid = NEW.variant
                  WHERE existing_variant.field = current_variant.field
                    AND existing.item_value = NEW.item_value
                    AND existing.variant <> NEW.variant);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_string_variant_requires_string_enum_update
    BEFORE UPDATE OF variant, item_value
    ON field_enum_string_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_string_variant requires field.type = enum<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field = field.uuid
                    WHERE field_enum_variant.uuid = NEW.variant), '') <> 'enum<string>';

    SELECT RAISE(ABORT, 'field_enum_string_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_string_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.uuid = existing.variant
                           JOIN field_enum_variant AS current_variant ON current_variant.uuid = NEW.variant
                  WHERE existing_variant.field = current_variant.field
                    AND existing.item_value = NEW.item_value
                    AND existing.variant <> NEW.variant);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_number_variant_requires_number_enum_insert
    BEFORE INSERT
    ON field_enum_number_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_number_variant requires field.type = enum<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field = field.uuid
                    WHERE field_enum_variant.uuid = NEW.variant), '') <> 'enum<number>';

    SELECT RAISE(ABORT, 'field_enum_number_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_number_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.uuid = existing.variant
                           JOIN field_enum_variant AS current_variant ON current_variant.uuid = NEW.variant
                  WHERE existing_variant.field = current_variant.field
                    AND existing.item_value = NEW.item_value
                    AND existing.variant <> NEW.variant);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_number_variant_requires_number_enum_update
    BEFORE UPDATE OF variant, item_value
    ON field_enum_number_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_number_variant requires field.type = enum<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field = field.uuid
                    WHERE field_enum_variant.uuid = NEW.variant), '') <> 'enum<number>';

    SELECT RAISE(ABORT, 'field_enum_number_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_number_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.uuid = existing.variant
                           JOIN field_enum_variant AS current_variant ON current_variant.uuid = NEW.variant
                  WHERE existing_variant.field = current_variant.field
                    AND existing.item_value = NEW.item_value
                    AND existing.variant <> NEW.variant);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_default_requires_matching_variant_insert
    BEFORE INSERT
    ON field_enum_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_default requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') NOT IN ('enum<string>', 'enum<number>');

    SELECT RAISE(ABORT, 'field_enum_default.variant must belong to the same field')
    WHERE COALESCE((SELECT field FROM field_enum_variant WHERE uuid = NEW.variant), '') <> NEW.field;
END;

CREATE TRIGGER IF NOT EXISTS field_enum_default_requires_matching_variant_update
    BEFORE UPDATE OF field, variant
    ON field_enum_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_default requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field), '') NOT IN ('enum<string>', 'enum<number>');

    SELECT RAISE(ABORT, 'field_enum_default.variant must belong to the same field')
    WHERE COALESCE((SELECT field FROM field_enum_variant WHERE uuid = NEW.variant), '') <> NEW.field;
END;

CREATE INDEX IF NOT EXISTS field_by_meta
    ON field (meta);
