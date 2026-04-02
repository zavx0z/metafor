CREATE TABLE IF NOT EXISTS process_finally
(
    process_uuid TEXT PRIMARY KEY CHECK (length(trim(process_uuid)) > 0),
    before_src   TEXT NOT NULL,
    FOREIGN KEY (process_uuid) REFERENCES process (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_finally_read
(
    process_uuid TEXT NOT NULL CHECK (length(trim(process_uuid)) > 0),
    field_uuid   TEXT NOT NULL CHECK (length(trim(field_uuid)) > 0),
    PRIMARY KEY (process_uuid, field_uuid),
    FOREIGN KEY (process_uuid) REFERENCES process_finally (process_uuid) ON DELETE CASCADE,
    FOREIGN KEY (field_uuid) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS process_finally_requires_finally_process_insert
    BEFORE INSERT
    ON process_finally
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally requires process.type = finally')
    WHERE COALESCE((SELECT type FROM process WHERE uuid = NEW.process_uuid), '') <> 'finally';
END;

CREATE TRIGGER IF NOT EXISTS process_finally_requires_finally_process_update
    BEFORE UPDATE OF process_uuid
    ON process_finally
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally requires process.type = finally')
    WHERE COALESCE((SELECT type FROM process WHERE uuid = NEW.process_uuid), '') <> 'finally';
END;

CREATE TRIGGER IF NOT EXISTS process_finally_read_requires_same_meta_field_insert
    BEFORE INSERT
    ON process_finally_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally_read.field_uuid must belong to the same meta')
    WHERE COALESCE((SELECT process.meta_src
                    FROM process
                             JOIN process_finally ON process_finally.process_uuid = process.uuid
                    WHERE process_finally.process_uuid = NEW.process_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS process_finally_read_requires_same_meta_field_update
    BEFORE UPDATE OF process_uuid, field_uuid
    ON process_finally_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'process_finally_read.field_uuid must belong to the same meta')
    WHERE COALESCE((SELECT process.meta_src
                    FROM process
                             JOIN process_finally ON process_finally.process_uuid = process.uuid
                    WHERE process_finally.process_uuid = NEW.process_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE INDEX IF NOT EXISTS process_finally_read_by_process_uuid
    ON process_finally_read (process_uuid);
