CREATE TABLE IF NOT EXISTS process_finally
(
    process TEXT PRIMARY KEY CHECK (length(trim(process)) > 0),
    before   TEXT NOT NULL,
    FOREIGN KEY (process) REFERENCES process (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_finally_read
(
    process TEXT NOT NULL CHECK (length(trim(process)) > 0),
    field   TEXT NOT NULL CHECK (length(trim(field)) > 0),
    PRIMARY KEY (process, field),
    FOREIGN KEY (process) REFERENCES process_finally (process) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS process_finally_requires_finally_process_insert
    BEFORE INSERT
    ON process_finally
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally requires process.type = finally')
    WHERE COALESCE((SELECT type FROM process WHERE uuid = NEW.process), '') <> 'finally';
END;

CREATE TRIGGER IF NOT EXISTS process_finally_requires_finally_process_update
    BEFORE UPDATE OF process
    ON process_finally
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally requires process.type = finally')
    WHERE COALESCE((SELECT type FROM process WHERE uuid = NEW.process), '') <> 'finally';
END;

CREATE TRIGGER IF NOT EXISTS process_finally_read_requires_same_meta_field_insert
    BEFORE INSERT
    ON process_finally_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally_read.field must belong to the same meta')
    WHERE COALESCE((SELECT process.meta
                    FROM process
                             JOIN process_finally ON process_finally.process = process.uuid
                    WHERE process_finally.process = NEW.process), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE TRIGGER IF NOT EXISTS process_finally_read_requires_same_meta_field_update
    BEFORE UPDATE OF process, field
    ON process_finally_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally_read.field must belong to the same meta')
    WHERE COALESCE((SELECT process.meta
                    FROM process
                             JOIN process_finally ON process_finally.process = process.uuid
                    WHERE process_finally.process = NEW.process), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE INDEX IF NOT EXISTS process_finally_read_by_process
    ON process_finally_read (process);
