CREATE TABLE IF NOT EXISTS process_action
(
    process                 INTEGER PRIMARY KEY,
    action                  TEXT NOT NULL,
    action_import_specifier TEXT,
    action_wrapper_src      TEXT,
    success                 TEXT,
    error                   TEXT,
    CHECK (action IS NOT NULL OR action_import_specifier IS NULL),
    FOREIGN KEY (process) REFERENCES process (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_read
(
    process INTEGER NOT NULL,
    field   INTEGER NOT NULL,
    phase   TEXT NOT NULL CHECK (phase IN ('action', 'success', 'error')),
    PRIMARY KEY (process, phase, field),
    FOREIGN KEY (process) REFERENCES process_action (process) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_write
(
    process INTEGER NOT NULL,
    field   INTEGER NOT NULL,
    phase   TEXT NOT NULL CHECK (phase IN ('success', 'error')),
    PRIMARY KEY (process, phase, field),
    FOREIGN KEY (process) REFERENCES process_action (process) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS process_action_read_by_process
    ON process_action_read (process);

CREATE INDEX IF NOT EXISTS process_action_write_by_process
    ON process_action_write (process);
