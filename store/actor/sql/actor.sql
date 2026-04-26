CREATE TABLE IF NOT EXISTS actor
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    world    TEXT    NOT NULL CHECK (length(trim(world)) > 0),
    metaSrc  TEXT    NOT NULL CHECK (length(trim(metaSrc)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0)
);

CREATE TABLE IF NOT EXISTS actor_edge
(
    child    TEXT PRIMARY KEY CHECK (length(trim(child)) > 0),
    parent   TEXT,
    position INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (child) REFERENCES actor (uuid) ON DELETE CASCADE,
    FOREIGN KEY (parent) REFERENCES actor (uuid) ON DELETE CASCADE
);
