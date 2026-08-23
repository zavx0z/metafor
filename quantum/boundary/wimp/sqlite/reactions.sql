CREATE TABLE IF NOT EXISTS reaction
(
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    wimp          TEXT NOT NULL,
    local_id      INTEGER,
    key           TEXT NOT NULL CHECK (length(trim(key)) > 0),
    label         TEXT NOT NULL,
    desc          TEXT,
    cond_source   TEXT NOT NULL,
    update_source TEXT NOT NULL,
    UNIQUE (wimp, key),
    UNIQUE (wimp, local_id),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_state
(
    reaction      INTEGER NOT NULL,
    state INTEGER NOT NULL,
    PRIMARY KEY (reaction, state),
    FOREIGN KEY (reaction) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (state) REFERENCES state (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_read
(
    reaction INTEGER NOT NULL,
    field    INTEGER NOT NULL,
    PRIMARY KEY (reaction, field),
    FOREIGN KEY (reaction) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_write
(
    reaction INTEGER NOT NULL,
    field    INTEGER NOT NULL,
    PRIMARY KEY (reaction, field),
    FOREIGN KEY (reaction) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS reaction_by_wimp
    ON reaction (wimp);

CREATE INDEX IF NOT EXISTS reaction_state_by_reaction
    ON reaction_state (reaction);

CREATE INDEX IF NOT EXISTS reaction_read_by_reaction
    ON reaction_read (reaction);

CREATE INDEX IF NOT EXISTS reaction_write_by_reaction
    ON reaction_write (reaction);
