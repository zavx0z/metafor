CREATE TABLE IF NOT EXISTS topology_fuzzy_state
(
    topology       TEXT PRIMARY KEY CHECK (length(trim(topology)) > 0),
    selected_actor TEXT,
    selected_topology TEXT,
    FOREIGN KEY (topology) REFERENCES topology (uuid) ON DELETE CASCADE,
    FOREIGN KEY (selected_actor) REFERENCES actor (uuid) ON DELETE SET NULL,
    FOREIGN KEY (selected_topology) REFERENCES topology (uuid) ON DELETE SET NULL,
    CHECK (
        (selected_actor IS NULL AND selected_topology IS NULL) OR
        (selected_actor IS NOT NULL AND selected_topology IS NULL) OR
        (selected_actor IS NULL AND selected_topology IS NOT NULL)
        )
);
