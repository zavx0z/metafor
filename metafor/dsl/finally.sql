CREATE TABLE IF NOT EXISTS process_finally
(
    process_id INTEGER PRIMARY KEY,
    meta_src   TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'finally' CHECK (type = 'finally'),
    before_src TEXT NOT NULL,
    UNIQUE (process_id, meta_src, type),
    FOREIGN KEY (process_id, meta_src, type) REFERENCES process (id, meta_src, type) ON DELETE CASCADE
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

CREATE INDEX IF NOT EXISTS process_finally_by_meta_src
    ON process_finally (meta_src);

CREATE INDEX IF NOT EXISTS process_finally_read_by_meta_src
    ON process_finally_read (meta_src);
