CREATE TABLE IF NOT EXISTS reaction
(
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    wimp          TEXT NOT NULL,
    local_id      INTEGER,
    key           TEXT NOT NULL CHECK (length(trim(key)) > 0),
    label         TEXT NOT NULL,
    desc          TEXT,
    sources_json  TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS reaction_source_selector
(
    reaction       INTEGER NOT NULL,
    selector_order INTEGER NOT NULL CHECK (selector_order >= 0),
    atom_ref       TEXT,
    meta           TEXT,
    relation       TEXT CHECK (relation IN ('parent', 'child', 'descendant')),
    PRIMARY KEY (reaction, selector_order),
    FOREIGN KEY (reaction) REFERENCES reaction (id) ON DELETE CASCADE,
    CHECK (atom_ref IS NOT NULL OR meta IS NOT NULL OR relation IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS reaction_source_state
(
    reaction       INTEGER NOT NULL,
    selector_order INTEGER NOT NULL,
    state_order    INTEGER NOT NULL CHECK (state_order >= 0),
    state          TEXT NOT NULL CHECK (length(trim(state)) > 0),
    PRIMARY KEY (reaction, selector_order, state_order),
    FOREIGN KEY (reaction, selector_order)
      REFERENCES reaction_source_selector (reaction, selector_order) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_write
(
    reaction INTEGER NOT NULL,
    field    INTEGER NOT NULL,
    PRIMARY KEY (reaction, field),
    FOREIGN KEY (reaction) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_mass_read
(
    reaction INTEGER NOT NULL,
    mass     INTEGER NOT NULL,
    PRIMARY KEY (reaction, mass),
    FOREIGN KEY (reaction) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (mass) REFERENCES mass_declaration (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reaction_mass_write
(
    reaction INTEGER NOT NULL,
    mass     INTEGER NOT NULL,
    PRIMARY KEY (reaction, mass),
    FOREIGN KEY (reaction) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (mass) REFERENCES mass_declaration (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reaction_relation
(
    reaction   INTEGER NOT NULL,
    target_atom INTEGER NOT NULL,
    source_atom INTEGER NOT NULL,
    PRIMARY KEY (reaction, target_atom, source_atom),
    FOREIGN KEY (reaction) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (target_atom) REFERENCES atom (id) ON DELETE CASCADE,
    FOREIGN KEY (source_atom) REFERENCES atom (id) ON DELETE CASCADE,
    CHECK (target_atom <> source_atom)
);

CREATE TABLE IF NOT EXISTS reaction_relation_state
(
    reaction    INTEGER NOT NULL,
    target_atom INTEGER NOT NULL,
    source_atom INTEGER NOT NULL,
    state       INTEGER NOT NULL,
    PRIMARY KEY (reaction, target_atom, source_atom, state),
    FOREIGN KEY (reaction, target_atom, source_atom)
      REFERENCES reaction_relation (reaction, target_atom, source_atom) ON DELETE CASCADE,
    FOREIGN KEY (state) REFERENCES state (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS reaction_by_wimp
    ON reaction (wimp);

CREATE INDEX IF NOT EXISTS reaction_state_by_reaction
    ON reaction_state (reaction);

CREATE INDEX IF NOT EXISTS reaction_read_by_reaction
    ON reaction_read (reaction);

CREATE INDEX IF NOT EXISTS reaction_write_by_reaction
    ON reaction_write (reaction);

CREATE INDEX IF NOT EXISTS reaction_source_selector_by_reaction
    ON reaction_source_selector (reaction);

CREATE INDEX IF NOT EXISTS reaction_source_state_by_reaction
    ON reaction_source_state (reaction);

CREATE INDEX IF NOT EXISTS reaction_mass_read_by_reaction
    ON reaction_mass_read (reaction);

CREATE INDEX IF NOT EXISTS reaction_mass_write_by_reaction
    ON reaction_mass_write (reaction);

CREATE INDEX IF NOT EXISTS reaction_relation_by_source
    ON reaction_relation (source_atom, reaction, target_atom);

CREATE INDEX IF NOT EXISTS reaction_relation_by_target
    ON reaction_relation (target_atom, reaction, source_atom);

CREATE INDEX IF NOT EXISTS reaction_relation_state_by_source
    ON reaction_relation_state (source_atom, state, reaction, target_atom);
