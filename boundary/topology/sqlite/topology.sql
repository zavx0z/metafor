CREATE TABLE IF NOT EXISTS topology
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    parent_actor    TEXT,
    parent_topology TEXT,
    kind            TEXT NOT NULL CHECK (kind IN ('fuzzy', 'axion', 'macho')),
    position        INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (parent_actor) REFERENCES actor (uuid) ON DELETE CASCADE,
    FOREIGN KEY (parent_topology) REFERENCES topology (uuid) ON DELETE CASCADE,
    CHECK (
        (parent_actor IS NULL AND parent_topology IS NULL) OR
        (parent_actor IS NOT NULL AND parent_topology IS NULL) OR
        (parent_actor IS NULL AND parent_topology IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS topology_by_parent_actor ON topology (parent_actor);
CREATE INDEX IF NOT EXISTS topology_by_parent_topology ON topology (parent_topology);
