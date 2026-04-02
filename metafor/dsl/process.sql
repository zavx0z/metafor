CREATE TABLE IF NOT EXISTS process
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta_src TEXT NOT NULL,
    key      TEXT NOT NULL CHECK (length(trim(key)) > 0),
    type     TEXT NOT NULL CHECK (type IN ('action', 'finally')),
    label    TEXT,
    desc     TEXT,
    UNIQUE (meta_src, key),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_env
(
    process_uuid TEXT NOT NULL CHECK (length(trim(process_uuid)) > 0),
    env          TEXT NOT NULL CHECK (env IN ('browser', 'node', 'worker', 'server', 'any')),
    PRIMARY KEY (process_uuid, env),
    FOREIGN KEY (process_uuid) REFERENCES process (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS process_by_meta_src
    ON process (meta_src);

CREATE INDEX IF NOT EXISTS process_env_by_process_uuid
    ON process_env (process_uuid);
