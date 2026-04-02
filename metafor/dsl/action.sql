CREATE TABLE IF NOT EXISTS process_action
(
    process             TEXT PRIMARY KEY CHECK (length(trim(process)) > 0),
    action               TEXT NOT NULL,
    action_import_specifier  TEXT,
    success              TEXT,
    error                TEXT,
    CHECK (action IS NOT NULL OR action_import_specifier IS NULL),
    FOREIGN KEY (process) REFERENCES process (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_read
(
    process TEXT NOT NULL CHECK (length(trim(process)) > 0),
    field   TEXT NOT NULL CHECK (length(trim(field)) > 0),
    phase        TEXT NOT NULL CHECK (phase IN ('action', 'success', 'error')),
    PRIMARY KEY (process, phase, field),
    FOREIGN KEY (process) REFERENCES process_action (process) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_write
(
    process TEXT NOT NULL CHECK (length(trim(process)) > 0),
    field   TEXT NOT NULL CHECK (length(trim(field)) > 0),
    phase        TEXT NOT NULL CHECK (phase IN ('success', 'error')),
    PRIMARY KEY (process, phase, field),
    FOREIGN KEY (process) REFERENCES process_action (process) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS process_action_requires_action_process_insert
    BEFORE INSERT
    ON process_action
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action requires process.type = action')
    WHERE COALESCE((SELECT type FROM process WHERE uuid = NEW.process), '') <> 'action';
END;

CREATE TRIGGER IF NOT EXISTS process_action_requires_action_process_update
    BEFORE UPDATE OF process
    ON process_action
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action requires process.type = action')
    WHERE COALESCE((SELECT type FROM process WHERE uuid = NEW.process), '') <> 'action';
END;

CREATE TRIGGER IF NOT EXISTS process_action_read_requires_same_meta_field_insert
    BEFORE INSERT
    ON process_action_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_read.field must belong to the same meta')
    WHERE COALESCE((SELECT process.meta
                    FROM process
                             JOIN process_action ON process_action.process = process.uuid
                    WHERE process_action.process = NEW.process), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE TRIGGER IF NOT EXISTS process_action_read_requires_same_meta_field_update
    BEFORE UPDATE OF process, field
    ON process_action_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_read.field must belong to the same meta')
    WHERE COALESCE((SELECT process.meta
                    FROM process
                             JOIN process_action ON process_action.process = process.uuid
                    WHERE process_action.process = NEW.process), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE TRIGGER IF NOT EXISTS process_action_write_requires_same_meta_field_insert
    BEFORE INSERT
    ON process_action_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_write.field must belong to the same meta')
    WHERE COALESCE((SELECT process.meta
                    FROM process
                             JOIN process_action ON process_action.process = process.uuid
                    WHERE process_action.process = NEW.process), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE TRIGGER IF NOT EXISTS process_action_write_requires_same_meta_field_update
    BEFORE UPDATE OF process, field
    ON process_action_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_action_write.field must belong to the same meta')
    WHERE COALESCE((SELECT process.meta
                    FROM process
                             JOIN process_action ON process_action.process = process.uuid
                    WHERE process_action.process = NEW.process), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE INDEX IF NOT EXISTS process_action_read_by_process
    ON process_action_read (process);

CREATE INDEX IF NOT EXISTS process_action_write_by_process
    ON process_action_write (process);
