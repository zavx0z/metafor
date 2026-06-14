CREATE TABLE IF NOT EXISTS actor
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    parent_actor    TEXT,
    parent_topology TEXT,
    wimp            TEXT NOT NULL,
    position        INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (parent_actor) REFERENCES actor (uuid) ON DELETE CASCADE,
    FOREIGN KEY (parent_topology) REFERENCES topology (uuid) ON DELETE CASCADE,
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE,
    CHECK (
        (parent_actor IS NULL AND parent_topology IS NULL) OR
        (parent_actor IS NOT NULL AND parent_topology IS NULL) OR
        (parent_actor IS NULL AND parent_topology IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS actor_by_parent_actor ON actor (parent_actor);
CREATE INDEX IF NOT EXISTS actor_by_parent_topology ON actor (parent_topology);
