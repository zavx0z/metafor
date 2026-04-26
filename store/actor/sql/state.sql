CREATE TABLE IF NOT EXISTS actor_state
(
    actor     TEXT PRIMARY KEY CHECK (length(trim(actor)) > 0),
    metaState TEXT NOT NULL CHECK (length(trim(metaState)) > 0),
    FOREIGN KEY (actor) REFERENCES actor (uuid) ON DELETE CASCADE
);
