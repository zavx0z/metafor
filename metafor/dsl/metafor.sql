CREATE TABLE IF NOT EXISTS meta
(
    src         TEXT PRIMARY KEY CHECK (length(trim(src)) > 0),
    name        TEXT,
    desc        TEXT,
    view_css    TEXT,
    mass_source TEXT
);
