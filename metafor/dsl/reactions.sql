CREATE TABLE IF NOT EXISTS reaction
(
    uuid          TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta          TEXT NOT NULL,
    key           TEXT NOT NULL CHECK (length(trim(key)) > 0),
    label         TEXT NOT NULL,
    desc          TEXT,
    cond_source   TEXT NOT NULL,
    update_source TEXT NOT NULL,
    UNIQUE (meta, key),
    FOREIGN KEY (meta) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_state
(
    reaction TEXT NOT NULL CHECK (length(trim(reaction)) > 0),
    state    TEXT NOT NULL CHECK (length(trim(state)) > 0),
    PRIMARY KEY (reaction, state),
    FOREIGN KEY (reaction) REFERENCES reaction (uuid) ON DELETE CASCADE,
    FOREIGN KEY (state) REFERENCES state (uuid) ON DELETE CASCADE
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

CREATE INDEX IF NOT EXISTS reaction_by_meta
    ON reaction (meta);

CREATE INDEX IF NOT EXISTS reaction_state_by_reaction
    ON reaction_state (reaction);

CREATE INDEX IF NOT EXISTS reaction_read_by_reaction
    ON reaction_read (reaction);

CREATE INDEX IF NOT EXISTS reaction_write_by_reaction
    ON reaction_write (reaction);
