CREATE TABLE IF NOT EXISTS topology_fuzzy_state
(
    topology       INTEGER PRIMARY KEY,
    selected_atom INTEGER,
    selected_topology INTEGER,
    FOREIGN KEY (topology) REFERENCES topology (id) ON DELETE CASCADE,
    FOREIGN KEY (selected_atom) REFERENCES atom (id) ON DELETE SET NULL,
    FOREIGN KEY (selected_topology) REFERENCES topology (id) ON DELETE SET NULL,
    CHECK (
        (selected_atom IS NULL AND selected_topology IS NULL) OR
        (selected_atom IS NOT NULL AND selected_topology IS NULL) OR
        (selected_atom IS NULL AND selected_topology IS NOT NULL)
        )
);
