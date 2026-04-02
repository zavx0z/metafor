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

CREATE INDEX IF NOT EXISTS process_by_meta_src
    ON process (meta_src);

CREATE INDEX IF NOT EXISTS process_action_by_meta_src
    ON process_action (meta_src);

CREATE INDEX IF NOT EXISTS process_env_by_meta_src
    ON process_env (meta_src);

CREATE INDEX IF NOT EXISTS process_action_read_by_meta_src
    ON process_action_read (meta_src);

CREATE INDEX IF NOT EXISTS process_action_write_by_meta_src
    ON process_action_write (meta_src);
