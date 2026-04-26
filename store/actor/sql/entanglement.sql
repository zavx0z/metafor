CREATE TABLE IF NOT EXISTS actor_entanglement
(
    uuid      TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    world     TEXT NOT NULL CHECK (length(trim(world)) > 0),
    rootField TEXT NOT NULL CHECK (length(trim(rootField)) > 0),
    UNIQUE (rootField),
    FOREIGN KEY (rootField) REFERENCES actor_field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_entanglement_member
(
    entanglement TEXT NOT NULL CHECK (length(trim(entanglement)) > 0),
    actor        TEXT NOT NULL CHECK (length(trim(actor)) > 0),
    position     INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (entanglement, actor),
    FOREIGN KEY (entanglement) REFERENCES actor_entanglement (uuid) ON DELETE CASCADE,
    FOREIGN KEY (actor) REFERENCES actor (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_entanglement_field
(
    uuid         TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    entanglement TEXT NOT NULL CHECK (length(trim(entanglement)) > 0),
    metaField    TEXT NOT NULL CHECK (length(trim(metaField)) > 0),
    position     INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (entanglement, position),
    FOREIGN KEY (entanglement) REFERENCES actor_entanglement (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actor_entanglement_field_member
(
    entanglementField TEXT NOT NULL CHECK (length(trim(entanglementField)) > 0),
    actorField        TEXT NOT NULL CHECK (length(trim(actorField)) > 0),
    position          INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (entanglementField, actorField),
    UNIQUE (actorField),
    FOREIGN KEY (entanglementField) REFERENCES actor_entanglement_field (uuid) ON DELETE CASCADE,
    FOREIGN KEY (actorField) REFERENCES actor_field (uuid) ON DELETE CASCADE
);
