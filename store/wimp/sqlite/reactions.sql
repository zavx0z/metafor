CREATE TABLE IF NOT EXISTS reaction
(
    uuid          TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    wimp          TEXT NOT NULL,
    key           TEXT NOT NULL CHECK (length(trim(key)) > 0),
    label         TEXT NOT NULL,
    desc          TEXT,
    cond_source   TEXT NOT NULL,
    update_source TEXT NOT NULL,
    UNIQUE (wimp, key),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_superposition
(
    reaction      TEXT NOT NULL CHECK (length(trim(reaction)) > 0),
    superposition TEXT NOT NULL CHECK (length(trim(superposition)) > 0),
    PRIMARY KEY (reaction, superposition),
    FOREIGN KEY (reaction) REFERENCES reaction (uuid) ON DELETE CASCADE,
    FOREIGN KEY (superposition) REFERENCES superposition (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_read
(
    reaction TEXT NOT NULL CHECK (length(trim(reaction)) > 0),
    field    TEXT NOT NULL CHECK (length(trim(field)) > 0),
    PRIMARY KEY (reaction, field),
    FOREIGN KEY (reaction) REFERENCES reaction (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_write
(
    reaction TEXT NOT NULL CHECK (length(trim(reaction)) > 0),
    field    TEXT NOT NULL CHECK (length(trim(field)) > 0),
    PRIMARY KEY (reaction, field),
    FOREIGN KEY (reaction) REFERENCES reaction (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS reaction_by_wimp
    ON reaction (wimp);

CREATE INDEX IF NOT EXISTS reaction_superposition_by_reaction
    ON reaction_superposition (reaction);

CREATE INDEX IF NOT EXISTS reaction_read_by_reaction
    ON reaction_read (reaction);

CREATE INDEX IF NOT EXISTS reaction_write_by_reaction
    ON reaction_write (reaction);
