CREATE TABLE IF NOT EXISTS matter_binding
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    wimp            TEXT NOT NULL,
    binding_kind    TEXT NOT NULL CHECK (binding_kind IN ('static', 'variable', 'dynamic')),
    literal_kind    TEXT CHECK (literal_kind IS NULL OR literal_kind IN ('text', 'boolean')),
    literal_text    TEXT,
    literal_boolean INTEGER CHECK (literal_boolean IS NULL OR literal_boolean IN (0, 1)),
    expr            TEXT,
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE,
    CHECK (
        (binding_kind = 'static' AND (
            (literal_kind = 'text' AND literal_text IS NOT NULL AND literal_boolean IS NULL AND expr IS NULL) OR
            (literal_kind = 'boolean' AND literal_boolean IS NOT NULL AND literal_text IS NULL AND expr IS NULL)
            )) OR
        (binding_kind = 'variable' AND literal_kind IS NULL AND literal_text IS NULL AND literal_boolean IS NULL AND
         expr IS NULL) OR
        (binding_kind = 'dynamic' AND literal_kind IS NULL AND literal_text IS NULL AND literal_boolean IS NULL AND
         expr IS NOT NULL)
        )
);

CREATE TABLE IF NOT EXISTS matter_binding_dep
(
    binding   TEXT    NOT NULL CHECK (length(trim(binding)) > 0),
    dep_order INTEGER NOT NULL CHECK (dep_order >= 0),
    path      TEXT    NOT NULL CHECK (length(trim(path)) > 0),
    PRIMARY KEY (binding, dep_order),
    FOREIGN KEY (binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS matter_binding_by_wimp
    ON matter_binding (wimp);

CREATE INDEX IF NOT EXISTS matter_binding_dep_by_binding
    ON matter_binding_dep (binding);

CREATE TABLE IF NOT EXISTS matter_particle
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    wimp            TEXT    NOT NULL,
    parent_particle TEXT,
    particle_kind   TEXT    NOT NULL CHECK (particle_kind IN ('wimp', 'fuzzy', 'axion', 'macho')),
    edge_slot       TEXT    NOT NULL CHECK (edge_slot IN ('root', 'child', 'then', 'else', 'branch')),
    particle_order  INTEGER NOT NULL CHECK (particle_order >= 0),
    FOREIGN KEY (wimp) REFERENCES wimp (src) ON DELETE CASCADE,
    FOREIGN KEY (parent_particle) REFERENCES matter_particle (uuid) ON DELETE CASCADE,
    CHECK (
        (parent_particle IS NULL AND edge_slot = 'root') OR
        (parent_particle IS NOT NULL AND edge_slot IN ('child', 'then', 'else', 'branch'))
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS matter_root_particle_order
    ON matter_particle (wimp, particle_order)
    WHERE parent_particle IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS matter_particle_child_order
    ON matter_particle (parent_particle, edge_slot, particle_order)
    WHERE parent_particle IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS matter_particle_branch_slot
    ON matter_particle (parent_particle, edge_slot)
    WHERE edge_slot IN ('then', 'else');

CREATE INDEX IF NOT EXISTS matter_particle_by_wimp
    ON matter_particle (wimp);

CREATE INDEX IF NOT EXISTS matter_particle_by_parent
    ON matter_particle (parent_particle);

CREATE TABLE IF NOT EXISTS matter_particle_wimp
(
    particle       TEXT PRIMARY KEY CHECK (length(trim(particle)) > 0),
    src            TEXT NOT NULL CHECK (length(trim(src)) > 0),
    fields_binding TEXT,
    mass_binding   TEXT,
    FOREIGN KEY (particle) REFERENCES matter_particle (uuid) ON DELETE CASCADE,
    FOREIGN KEY (fields_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE,
    FOREIGN KEY (mass_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_particle_fuzzy
(
    particle          TEXT PRIMARY KEY CHECK (length(trim(particle)) > 0),
    fuzzy_kind        TEXT NOT NULL CHECK (fuzzy_kind IN ('dynamic-meta', 'cond')),
    predicate_binding TEXT,
    FOREIGN KEY (particle) REFERENCES matter_particle (uuid) ON DELETE CASCADE,
    FOREIGN KEY (predicate_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE,
    CHECK (
        (fuzzy_kind = 'dynamic-meta' AND predicate_binding IS NULL) OR
        (fuzzy_kind = 'cond' AND predicate_binding IS NOT NULL)
        )
);

CREATE TABLE IF NOT EXISTS matter_particle_axion
(
    particle          TEXT PRIMARY KEY CHECK (length(trim(particle)) > 0),
    predicate_binding TEXT NOT NULL CHECK (length(trim(predicate_binding)) > 0),
    FOREIGN KEY (particle) REFERENCES matter_particle (uuid) ON DELETE CASCADE,
    FOREIGN KEY (predicate_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_particle_macho
(
    particle           TEXT PRIMARY KEY CHECK (length(trim(particle)) > 0),
    collection_binding TEXT NOT NULL CHECK (length(trim(collection_binding)) > 0),
    FOREIGN KEY (particle) REFERENCES matter_particle (uuid) ON DELETE CASCADE,
    FOREIGN KEY (collection_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);
