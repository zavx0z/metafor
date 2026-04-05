CREATE TABLE IF NOT EXISTS meta
(
    src           TEXT PRIMARY KEY CHECK (length(trim(src)) > 0),
    name          TEXT,
    desc          TEXT,
    view_css      TEXT,
    mass_source   TEXT,
    has_processes INTEGER NOT NULL DEFAULT 0 CHECK (has_processes IN (0, 1)),
    has_reactions INTEGER NOT NULL DEFAULT 0 CHECK (has_reactions IN (0, 1)),
    has_matter    INTEGER NOT NULL DEFAULT 0 CHECK (has_matter IN (0, 1))
);
