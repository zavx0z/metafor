CREATE TABLE IF NOT EXISTS actor_value
(
    actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
    field TEXT NOT NULL CHECK (length(trim(field)) > 0),
    value TEXT NOT NULL CHECK (length(trim(value)) > 0),
    PRIMARY KEY (actor, field),
    FOREIGN KEY (actor) REFERENCES actor (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE,
    FOREIGN KEY (value) REFERENCES value (uuid) ON DELETE RESTRICT
);
