CREATE TABLE IF NOT EXISTS topology_fuzzy_state
(
    topology       INTEGER PRIMARY KEY,
    selected_actor INTEGER,
    selected_topology INTEGER,
    FOREIGN KEY (topology) REFERENCES topology (id) ON DELETE CASCADE,
    FOREIGN KEY (selected_actor) REFERENCES actor (id) ON DELETE SET NULL,
    FOREIGN KEY (selected_topology) REFERENCES topology (id) ON DELETE SET NULL,
    CHECK (
        (selected_actor IS NULL AND selected_topology IS NULL) OR
        (selected_actor IS NOT NULL AND selected_topology IS NULL) OR
        (selected_actor IS NULL AND selected_topology IS NOT NULL)
        )
);
