CREATE TABLE IF NOT EXISTS field
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
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
    field_uuid TEXT PRIMARY KEY CHECK (length(trim(field_uuid)) > 0),
    FOREIGN KEY (field_uuid) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_string_default
(
    field_uuid     TEXT PRIMARY KEY CHECK (length(trim(field_uuid)) > 0),
    default_value  TEXT NOT NULL,
    FOREIGN KEY (field_uuid) REFERENCES field_default (field_uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_number_default
(
    field_uuid     TEXT PRIMARY KEY CHECK (length(trim(field_uuid)) > 0),
    default_value  REAL NOT NULL,
    FOREIGN KEY (field_uuid) REFERENCES field_default (field_uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_boolean_default
(
    field_uuid     TEXT PRIMARY KEY CHECK (length(trim(field_uuid)) > 0),
    default_value  INTEGER NOT NULL CHECK (default_value IN (0, 1)),
    FOREIGN KEY (field_uuid) REFERENCES field_default (field_uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default
(
    field_uuid TEXT PRIMARY KEY CHECK (length(trim(field_uuid)) > 0),
    FOREIGN KEY (field_uuid) REFERENCES field_default (field_uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_default_item
(
    uuid       TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    field_uuid TEXT    NOT NULL CHECK (length(trim(field_uuid)) > 0),
    position   INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (field_uuid, position),
    FOREIGN KEY (field_uuid) REFERENCES field_array_default (field_uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_string_default_item
(
    item_uuid   TEXT PRIMARY KEY CHECK (length(trim(item_uuid)) > 0),
    item_value  TEXT NOT NULL,
    FOREIGN KEY (item_uuid) REFERENCES field_array_default_item (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_number_default_item
(
    item_uuid   TEXT PRIMARY KEY CHECK (length(trim(item_uuid)) > 0),
    item_value  REAL NOT NULL,
    FOREIGN KEY (item_uuid) REFERENCES field_array_default_item (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_variant
(
    uuid       TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    field_uuid TEXT    NOT NULL CHECK (length(trim(field_uuid)) > 0),
    position   INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (field_uuid, position),
    FOREIGN KEY (field_uuid) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_string_variant
(
    variant_uuid TEXT PRIMARY KEY CHECK (length(trim(variant_uuid)) > 0),
    item_value   TEXT NOT NULL,
    FOREIGN KEY (variant_uuid) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_number_variant
(
    variant_uuid TEXT PRIMARY KEY CHECK (length(trim(variant_uuid)) > 0),
    item_value   REAL NOT NULL,
    FOREIGN KEY (variant_uuid) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_default
(
    field_uuid   TEXT PRIMARY KEY CHECK (length(trim(field_uuid)) > 0),
    variant_uuid TEXT NOT NULL CHECK (length(trim(variant_uuid)) > 0),
    FOREIGN KEY (field_uuid) REFERENCES field_default (field_uuid) ON DELETE CASCADE,
    FOREIGN KEY (variant_uuid) REFERENCES field_enum_variant (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS field_default_requires_required_field_insert
    BEFORE INSERT
    ON field_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_default requires a required field')
    WHERE COALESCE((SELECT required FROM field WHERE uuid = NEW.field_uuid), -1) <> 1;
END;

CREATE TRIGGER IF NOT EXISTS field_default_requires_required_field_update
    BEFORE UPDATE OF field_uuid
    ON field_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_default requires a required field')
    WHERE COALESCE((SELECT required FROM field WHERE uuid = NEW.field_uuid), -1) <> 1;
END;

CREATE TRIGGER IF NOT EXISTS field_string_default_requires_string_field_insert
    BEFORE INSERT
    ON field_string_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_string_default requires field.type = string')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') <> 'string';
END;

CREATE TRIGGER IF NOT EXISTS field_string_default_requires_string_field_update
    BEFORE UPDATE OF field_uuid
    ON field_string_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_string_default requires field.type = string')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') <> 'string';
END;

CREATE TRIGGER IF NOT EXISTS field_number_default_requires_number_field_insert
    BEFORE INSERT
    ON field_number_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_number_default requires field.type = number')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') <> 'number';
END;

CREATE TRIGGER IF NOT EXISTS field_number_default_requires_number_field_update
    BEFORE UPDATE OF field_uuid
    ON field_number_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_number_default requires field.type = number')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') <> 'number';
END;

CREATE TRIGGER IF NOT EXISTS field_boolean_default_requires_boolean_field_insert
    BEFORE INSERT
    ON field_boolean_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_boolean_default requires field.type = boolean')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') <> 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS field_boolean_default_requires_boolean_field_update
    BEFORE UPDATE OF field_uuid
    ON field_boolean_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_boolean_default requires field.type = boolean')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') <> 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS field_array_default_requires_array_field_insert
    BEFORE INSERT
    ON field_array_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_default requires field.type = array<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') NOT IN ('array<string>', 'array<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_array_default_requires_array_field_update
    BEFORE UPDATE OF field_uuid
    ON field_array_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_default requires field.type = array<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') NOT IN ('array<string>', 'array<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_array_string_default_item_requires_string_array_insert
    BEFORE INSERT
    ON field_array_string_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_string_default_item requires field.type = array<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field_uuid = field.uuid
                    WHERE field_array_default_item.uuid = NEW.item_uuid), '') <> 'array<string>';
END;

CREATE TRIGGER IF NOT EXISTS field_array_string_default_item_requires_string_array_update
    BEFORE UPDATE OF item_uuid
    ON field_array_string_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_string_default_item requires field.type = array<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field_uuid = field.uuid
                    WHERE field_array_default_item.uuid = NEW.item_uuid), '') <> 'array<string>';
END;

CREATE TRIGGER IF NOT EXISTS field_array_number_default_item_requires_number_array_insert
    BEFORE INSERT
    ON field_array_number_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_number_default_item requires field.type = array<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field_uuid = field.uuid
                    WHERE field_array_default_item.uuid = NEW.item_uuid), '') <> 'array<number>';
END;

CREATE TRIGGER IF NOT EXISTS field_array_number_default_item_requires_number_array_update
    BEFORE UPDATE OF item_uuid
    ON field_array_number_default_item
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_array_number_default_item requires field.type = array<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_array_default_item ON field_array_default_item.field_uuid = field.uuid
                    WHERE field_array_default_item.uuid = NEW.item_uuid), '') <> 'array<number>';
END;

CREATE TRIGGER IF NOT EXISTS field_enum_variant_requires_enum_field_insert
    BEFORE INSERT
    ON field_enum_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_variant requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') NOT IN ('enum<string>', 'enum<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_enum_variant_requires_enum_field_update
    BEFORE UPDATE OF field_uuid
    ON field_enum_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_variant requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') NOT IN ('enum<string>', 'enum<number>');
END;

CREATE TRIGGER IF NOT EXISTS field_enum_string_variant_requires_string_enum_insert
    BEFORE INSERT
    ON field_enum_string_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_string_variant requires field.type = enum<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field_uuid = field.uuid
                    WHERE field_enum_variant.uuid = NEW.variant_uuid), '') <> 'enum<string>';

    SELECT RAISE(ABORT, 'field_enum_string_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_string_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.uuid = existing.variant_uuid
                           JOIN field_enum_variant AS current_variant ON current_variant.uuid = NEW.variant_uuid
                  WHERE existing_variant.field_uuid = current_variant.field_uuid
                    AND existing.item_value = NEW.item_value
                    AND existing.variant_uuid <> NEW.variant_uuid);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_string_variant_requires_string_enum_update
    BEFORE UPDATE OF variant_uuid, item_value
    ON field_enum_string_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_string_variant requires field.type = enum<string>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field_uuid = field.uuid
                    WHERE field_enum_variant.uuid = NEW.variant_uuid), '') <> 'enum<string>';

    SELECT RAISE(ABORT, 'field_enum_string_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_string_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.uuid = existing.variant_uuid
                           JOIN field_enum_variant AS current_variant ON current_variant.uuid = NEW.variant_uuid
                  WHERE existing_variant.field_uuid = current_variant.field_uuid
                    AND existing.item_value = NEW.item_value
                    AND existing.variant_uuid <> NEW.variant_uuid);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_number_variant_requires_number_enum_insert
    BEFORE INSERT
    ON field_enum_number_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_number_variant requires field.type = enum<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field_uuid = field.uuid
                    WHERE field_enum_variant.uuid = NEW.variant_uuid), '') <> 'enum<number>';

    SELECT RAISE(ABORT, 'field_enum_number_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_number_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.uuid = existing.variant_uuid
                           JOIN field_enum_variant AS current_variant ON current_variant.uuid = NEW.variant_uuid
                  WHERE existing_variant.field_uuid = current_variant.field_uuid
                    AND existing.item_value = NEW.item_value
                    AND existing.variant_uuid <> NEW.variant_uuid);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_number_variant_requires_number_enum_update
    BEFORE UPDATE OF variant_uuid, item_value
    ON field_enum_number_variant
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_number_variant requires field.type = enum<number>')
    WHERE COALESCE((SELECT field.type
                    FROM field
                             JOIN field_enum_variant ON field_enum_variant.field_uuid = field.uuid
                    WHERE field_enum_variant.uuid = NEW.variant_uuid), '') <> 'enum<number>';

    SELECT RAISE(ABORT, 'field_enum_number_variant.item_value must be unique within field')
    WHERE EXISTS (SELECT 1
                  FROM field_enum_number_variant AS existing
                           JOIN field_enum_variant AS existing_variant ON existing_variant.uuid = existing.variant_uuid
                           JOIN field_enum_variant AS current_variant ON current_variant.uuid = NEW.variant_uuid
                  WHERE existing_variant.field_uuid = current_variant.field_uuid
                    AND existing.item_value = NEW.item_value
                    AND existing.variant_uuid <> NEW.variant_uuid);
END;

CREATE TRIGGER IF NOT EXISTS field_enum_default_requires_matching_variant_insert
    BEFORE INSERT
    ON field_enum_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_default requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') NOT IN ('enum<string>', 'enum<number>');

    SELECT RAISE(ABORT, 'field_enum_default.variant_uuid must belong to the same field')
    WHERE COALESCE((SELECT field_uuid FROM field_enum_variant WHERE uuid = NEW.variant_uuid), '') <> NEW.field_uuid;
END;

CREATE TRIGGER IF NOT EXISTS field_enum_default_requires_matching_variant_update
    BEFORE UPDATE OF field_uuid, variant_uuid
    ON field_enum_default
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'field_enum_default requires field.type = enum<...>')
    WHERE COALESCE((SELECT type FROM field WHERE uuid = NEW.field_uuid), '') NOT IN ('enum<string>', 'enum<number>');

    SELECT RAISE(ABORT, 'field_enum_default.variant_uuid must belong to the same field')
    WHERE COALESCE((SELECT field_uuid FROM field_enum_variant WHERE uuid = NEW.variant_uuid), '') <> NEW.field_uuid;
END;

CREATE INDEX IF NOT EXISTS field_by_meta_src
    ON field (meta_src);
