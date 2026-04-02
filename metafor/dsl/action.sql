CREATE TABLE IF NOT EXISTS process_action
(
    process_uuid             TEXT PRIMARY KEY CHECK (length(trim(process_uuid)) > 0),
    action_src               TEXT NOT NULL,
    action_import_specifier  TEXT,
    success_src              TEXT,
    error_src                TEXT,
    CHECK (action_src IS NOT NULL OR action_import_specifier IS NULL),
    FOREIGN KEY (process_uuid) REFERENCES process (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_read
(
    process_uuid TEXT NOT NULL CHECK (length(trim(process_uuid)) > 0),
    field_uuid   TEXT NOT NULL CHECK (length(trim(field_uuid)) > 0),
    phase        TEXT NOT NULL CHECK (phase IN ('action', 'success', 'error')),
    PRIMARY KEY (process_uuid, phase, field_uuid),
    FOREIGN KEY (process_uuid) REFERENCES process_action (process_uuid) ON DELETE CASCADE,
    FOREIGN KEY (field_uuid) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_write
(
    process_uuid TEXT NOT NULL CHECK (length(trim(process_uuid)) > 0),
    field_uuid   TEXT NOT NULL CHECK (length(trim(field_uuid)) > 0),
    phase        TEXT NOT NULL CHECK (phase IN ('success', 'error')),
    PRIMARY KEY (process_uuid, phase, field_uuid),
    FOREIGN KEY (process_uuid) REFERENCES process_action (process_uuid) ON DELETE CASCADE,
    FOREIGN KEY (field_uuid) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS process_action_requires_action_process_insert
    BEFORE INSERT
    ON process_action
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action requires process.type = action')
    WHERE COALESCE((SELECT type FROM process WHERE uuid = NEW.process_uuid), '') <> 'action';
END;

CREATE TRIGGER IF NOT EXISTS process_action_requires_action_process_update
    BEFORE UPDATE OF process_uuid
    ON process_action
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action requires process.type = action')
    WHERE COALESCE((SELECT type FROM process WHERE uuid = NEW.process_uuid), '') <> 'action';
END;

CREATE TRIGGER IF NOT EXISTS process_action_read_requires_same_meta_field_insert
    BEFORE INSERT
    ON process_action_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_read.field_uuid must belong to the same meta')
    WHERE COALESCE((SELECT process.meta_src
                    FROM process
                             JOIN process_action ON process_action.process_uuid = process.uuid
                    WHERE process_action.process_uuid = NEW.process_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS process_action_read_requires_same_meta_field_update
    BEFORE UPDATE OF process_uuid, field_uuid
    ON process_action_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_read.field_uuid must belong to the same meta')
    WHERE COALESCE((SELECT process.meta_src
                    FROM process
                             JOIN process_action ON process_action.process_uuid = process.uuid
                    WHERE process_action.process_uuid = NEW.process_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS process_action_write_requires_same_meta_field_insert
    BEFORE INSERT
    ON process_action_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_write.field_uuid must belong to the same meta')
    WHERE COALESCE((SELECT process.meta_src
                    FROM process
                             JOIN process_action ON process_action.process_uuid = process.uuid
                    WHERE process_action.process_uuid = NEW.process_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS process_action_write_requires_same_meta_field_update
    BEFORE UPDATE OF process_uuid, field_uuid
    ON process_action_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_write.field_uuid must belong to the same meta')
    WHERE COALESCE((SELECT process.meta_src
                    FROM process
                             JOIN process_action ON process_action.process_uuid = process.uuid
                    WHERE process_action.process_uuid = NEW.process_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE INDEX IF NOT EXISTS process_action_read_by_process_uuid
    ON process_action_read (process_uuid);

CREATE INDEX IF NOT EXISTS process_action_write_by_process_uuid
    ON process_action_write (process_uuid);
