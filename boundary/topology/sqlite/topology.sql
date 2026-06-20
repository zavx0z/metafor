CREATE TABLE IF NOT EXISTS topology
(
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_actor    INTEGER,
    parent_topology INTEGER,
    kind            TEXT NOT NULL CHECK (kind IN ('fuzzy', 'axion', 'macho')),
    position        INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (parent_actor) REFERENCES actor (id) ON DELETE CASCADE,
    FOREIGN KEY (parent_topology) REFERENCES topology (id) ON DELETE CASCADE,
    CHECK (
        (parent_actor IS NULL AND parent_topology IS NULL) OR
        (parent_actor IS NOT NULL AND parent_topology IS NULL) OR
        (parent_actor IS NULL AND parent_topology IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS topology_by_parent_actor ON topology (parent_actor);
CREATE INDEX IF NOT EXISTS topology_by_parent_topology ON topology (parent_topology);
