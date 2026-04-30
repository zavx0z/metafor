CREATE TABLE IF NOT EXISTS actor_state
(
    actor     TEXT PRIMARY KEY CHECK (length(trim(actor)) > 0),
    metaState TEXT,
    FOREIGN KEY (actor) REFERENCES actor (uuid) ON DELETE CASCADE,
    FOREIGN KEY (metaState) REFERENCES superposition (uuid) ON DELETE CASCADE
);
