CREATE TABLE IF NOT EXISTS wimp
(
    src      TEXT PRIMARY KEY CHECK (length(trim(src)) > 0),
    name     TEXT,
    desc     TEXT,
    view_css TEXT
);
