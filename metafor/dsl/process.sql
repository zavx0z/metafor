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

CREATE INDEX IF NOT EXISTS process_by_meta_src
    ON process (meta_src);

CREATE INDEX IF NOT EXISTS process_env_by_meta_src
    ON process_env (meta_src);
