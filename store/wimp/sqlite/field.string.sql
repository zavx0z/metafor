CREATE TABLE IF NOT EXISTS field_string_default
(
    field         TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    default_value TEXT NOT NULL,
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);
