CREATE TABLE IF NOT EXISTS process
(
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    wimp  TEXT NOT NULL,
    local_id INTEGER,
    key   TEXT NOT NULL CHECK (length(trim(key)) > 0),
    type  TEXT NOT NULL CHECK (type IN ('action', 'finally')),
    label TEXT,
    desc  TEXT,
    UNIQUE (wimp, key),
    UNIQUE (wimp, local_id),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_env
(
    process INTEGER NOT NULL,
    env     TEXT NOT NULL CHECK (env IN ('browser', 'node', 'worker', 'server', 'any')),
    PRIMARY KEY (process, env),
    FOREIGN KEY (process) REFERENCES process (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS process_by_wimp
    ON process (wimp);

CREATE INDEX IF NOT EXISTS process_env_by_process
    ON process_env (process);
