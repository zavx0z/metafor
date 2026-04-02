CREATE TABLE IF NOT EXISTS process
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta TEXT NOT NULL,
    key      TEXT NOT NULL CHECK (length(trim(key)) > 0),
    type     TEXT NOT NULL CHECK (type IN ('action', 'finally')),
    label    TEXT,
    desc     TEXT,
    UNIQUE (meta, key),
    FOREIGN KEY (meta) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_env
(
    process TEXT NOT NULL CHECK (length(trim(process)) > 0),
    env          TEXT NOT NULL CHECK (env IN ('browser', 'node', 'worker', 'server', 'any')),
    PRIMARY KEY (process, env),
    FOREIGN KEY (process) REFERENCES process (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS process_by_meta
    ON process (meta);

CREATE INDEX IF NOT EXISTS process_env_by_process
    ON process_env (process);
