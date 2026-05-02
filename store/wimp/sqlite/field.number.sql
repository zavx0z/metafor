CREATE TABLE IF NOT EXISTS field_number_default
(
    field         TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    default_value REAL NOT NULL,
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);
