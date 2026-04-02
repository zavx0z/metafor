CREATE TABLE IF NOT EXISTS process_finally
(
    process TEXT PRIMARY KEY CHECK (length(trim(process)) > 0),
    before  TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS process_finally_read_by_process
    ON process_finally_read (process);
