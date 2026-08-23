CREATE TABLE IF NOT EXISTS process_finally
(
    process INTEGER PRIMARY KEY,
    before  TEXT NOT NULL,
    FOREIGN KEY (process) REFERENCES process (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_finally_read
(
    process INTEGER NOT NULL,
    field   INTEGER NOT NULL,
    PRIMARY KEY (process, field),
    FOREIGN KEY (process) REFERENCES process_finally (process) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS process_finally_read_by_process
    ON process_finally_read (process);
