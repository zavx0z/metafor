CREATE TABLE IF NOT EXISTS atom
(
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_atom    INTEGER,
    parent_topology INTEGER,
    wimp            TEXT NOT NULL,
    position        INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (parent_atom) REFERENCES atom (id) ON DELETE CASCADE,
    FOREIGN KEY (parent_topology) REFERENCES topology (id) ON DELETE CASCADE,
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE,
    CHECK (
        (parent_atom IS NULL AND parent_topology IS NULL) OR
        (parent_atom IS NOT NULL AND parent_topology IS NULL) OR
        (parent_atom IS NULL AND parent_topology IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS atom_by_parent_atom ON atom (parent_atom);
CREATE INDEX IF NOT EXISTS atom_by_parent_topology ON atom (parent_topology);
CREATE INDEX IF NOT EXISTS atom_by_wimp ON atom (wimp);
