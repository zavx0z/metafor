CREATE TABLE IF NOT EXISTS process_action
(
    process                 TEXT PRIMARY KEY CHECK (length(trim(process)) > 0),
    action                  TEXT NOT NULL,
    action_import_specifier TEXT,
    action_wrapper_src      TEXT,
    success                 TEXT,
    error                   TEXT,
    CHECK (action IS NOT NULL OR action_import_specifier IS NULL),
    FOREIGN KEY (process) REFERENCES process (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_read
(
    process TEXT NOT NULL CHECK (length(trim(process)) > 0),
    field   TEXT NOT NULL CHECK (length(trim(field)) > 0),
    phase   TEXT NOT NULL CHECK (phase IN ('action', 'success', 'error')),
    PRIMARY KEY (process, phase, field),
    FOREIGN KEY (process) REFERENCES process_action (process) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_action_write
(
    process TEXT NOT NULL CHECK (length(trim(process)) > 0),
    field   TEXT NOT NULL CHECK (length(trim(field)) > 0),
    phase   TEXT NOT NULL CHECK (phase IN ('success', 'error')),
    PRIMARY KEY (process, phase, field),
    FOREIGN KEY (process) REFERENCES process_action (process) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS process_action_read_by_process
    ON process_action_read (process);

CREATE INDEX IF NOT EXISTS process_action_write_by_process
    ON process_action_write (process);
