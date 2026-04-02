CREATE TABLE IF NOT EXISTS matter_node
(
    uuid      TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta      TEXT NOT NULL,
    node_kind TEXT NOT NULL CHECK (node_kind IN ('meta', 'cond', 'log', 'map')),
    tag       TEXT,
    FOREIGN KEY (meta) REFERENCES meta (src) ON DELETE CASCADE,
    CHECK (
        (node_kind = 'meta' AND tag IS NOT NULL AND length(trim(tag)) > 0) OR
        (node_kind IN ('cond', 'log', 'map') AND tag IS NULL)
        )
);

CREATE TABLE IF NOT EXISTS matter_edge
(
    uuid        TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    root_meta   TEXT,
    parent_node TEXT,
    child_node  TEXT    NOT NULL CHECK (length(trim(child_node)) > 0),
    edge_slot   TEXT    NOT NULL CHECK (edge_slot IN ('root', 'child', 'then', 'else')),
    edge_order  INTEGER NOT NULL CHECK (edge_order >= 0),
    UNIQUE (child_node),
    FOREIGN KEY (root_meta) REFERENCES meta (src) ON DELETE CASCADE,
    FOREIGN KEY (parent_node) REFERENCES matter_node (uuid) ON DELETE CASCADE,
    FOREIGN KEY (child_node) REFERENCES matter_node (uuid) ON DELETE CASCADE,
    CHECK (
        (parent_node IS NULL AND root_meta IS NOT NULL AND edge_slot = 'root') OR
        (parent_node IS NOT NULL AND root_meta IS NULL AND edge_slot IN ('child', 'then', 'else'))
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS matter_root_order
    ON matter_edge (root_meta, edge_order)
    WHERE root_meta IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS matter_child_order
    ON matter_edge (parent_node, edge_order)
    WHERE edge_slot = 'child';

CREATE UNIQUE INDEX IF NOT EXISTS matter_cond_branch_slot
    ON matter_edge (parent_node, edge_slot)
    WHERE edge_slot IN ('then', 'else');

CREATE INDEX IF NOT EXISTS matter_edge_by_parent_node
    ON matter_edge (parent_node);

CREATE TABLE IF NOT EXISTS matter_binding
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta            TEXT NOT NULL,
    binding_kind    TEXT NOT NULL CHECK (binding_kind IN ('static', 'variable', 'dynamic')),
    literal_kind    TEXT CHECK (literal_kind IS NULL OR literal_kind IN ('text', 'boolean')),
    literal_text    TEXT,
    literal_boolean INTEGER CHECK (literal_boolean IS NULL OR literal_boolean IN (0, 1)),
    expr            TEXT,
    FOREIGN KEY (meta) REFERENCES meta (src) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS matter_node_by_meta
    ON matter_node (meta);

CREATE INDEX IF NOT EXISTS matter_binding_by_meta
    ON matter_binding (meta);

CREATE INDEX IF NOT EXISTS matter_binding_dep_by_binding
    ON matter_binding_dep (binding);

CREATE TABLE IF NOT EXISTS matter_meta
(
    node           TEXT PRIMARY KEY CHECK (length(trim(node)) > 0),
    src_binding    TEXT NOT NULL CHECK (length(trim(src_binding)) > 0),
    fields_binding TEXT,
    mass_binding   TEXT,
    FOREIGN KEY (node) REFERENCES matter_node (uuid) ON DELETE CASCADE,
    FOREIGN KEY (src_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE,
    FOREIGN KEY (fields_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE,
    FOREIGN KEY (mass_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_condition
(
    node              TEXT PRIMARY KEY CHECK (length(trim(node)) > 0),
    predicate_binding TEXT NOT NULL CHECK (length(trim(predicate_binding)) > 0),
    FOREIGN KEY (node) REFERENCES matter_node (uuid) ON DELETE CASCADE,
    FOREIGN KEY (predicate_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_logical
(
    node              TEXT PRIMARY KEY CHECK (length(trim(node)) > 0),
    predicate_binding TEXT NOT NULL CHECK (length(trim(predicate_binding)) > 0),
    FOREIGN KEY (node) REFERENCES matter_node (uuid) ON DELETE CASCADE,
    FOREIGN KEY (predicate_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_map
(
    node               TEXT PRIMARY KEY CHECK (length(trim(node)) > 0),
    collection_binding TEXT NOT NULL CHECK (length(trim(collection_binding)) > 0),
    FOREIGN KEY (node) REFERENCES matter_node (uuid) ON DELETE CASCADE,
    FOREIGN KEY (collection_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_attr
(
    uuid        TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    owner_node  TEXT NOT NULL CHECK (length(trim(owner_node)) > 0),
    attr_family TEXT NOT NULL CHECK (attr_family IN ('string', 'boolean', 'array', 'style', 'event')),
    attr_name   TEXT NOT NULL CHECK (length(trim(attr_name)) > 0),
    UNIQUE (owner_node, attr_family, attr_name),
    FOREIGN KEY (owner_node) REFERENCES matter_node (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_attr_binding
(
    attr    TEXT PRIMARY KEY CHECK (length(trim(attr)) > 0),
    binding TEXT NOT NULL CHECK (length(trim(binding)) > 0),
    FOREIGN KEY (attr) REFERENCES matter_attr (uuid) ON DELETE CASCADE,
    FOREIGN KEY (binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_attr_part
(
    attr       TEXT    NOT NULL CHECK (length(trim(attr)) > 0),
    part_order INTEGER NOT NULL CHECK (part_order >= 0),
    binding    TEXT    NOT NULL CHECK (length(trim(binding)) > 0),
    PRIMARY KEY (attr, part_order),
    FOREIGN KEY (attr) REFERENCES matter_attr (uuid) ON DELETE CASCADE,
    FOREIGN KEY (binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_style_prop
(
    attr      TEXT NOT NULL CHECK (length(trim(attr)) > 0),
    prop_name TEXT NOT NULL CHECK (length(trim(prop_name)) > 0),
    binding   TEXT NOT NULL CHECK (length(trim(binding)) > 0),
    PRIMARY KEY (attr, prop_name),
    FOREIGN KEY (attr) REFERENCES matter_attr (uuid) ON DELETE CASCADE,
    FOREIGN KEY (binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_event_update
(
    attr         TEXT    NOT NULL CHECK (length(trim(attr)) > 0),
    update_order INTEGER NOT NULL CHECK (update_order >= 0),
    field        TEXT    NOT NULL CHECK (length(trim(field)) > 0),
    PRIMARY KEY (attr, update_order),
    FOREIGN KEY (attr) REFERENCES matter_attr (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS matter_attr_by_owner_node
    ON matter_attr (owner_node, attr_family);

CREATE INDEX IF NOT EXISTS matter_event_update_by_attr
    ON matter_event_update (attr);
