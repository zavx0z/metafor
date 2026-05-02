CREATE TABLE IF NOT EXISTS field_boolean_default
(
    field         TEXT PRIMARY KEY CHECK (length(trim(field)) > 0),
    default_value INTEGER NOT NULL CHECK (default_value IN (0, 1)),
    FOREIGN KEY (field) REFERENCES field_default (field) ON DELETE CASCADE
);
