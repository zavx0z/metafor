CREATE TABLE IF NOT EXISTS matter_node
(
    id        INTEGER PRIMARY KEY,
    meta_src  TEXT NOT NULL,
    node_kind TEXT NOT NULL CHECK (node_kind IN ('meta', 'cond', 'log', 'map')),
    tag       TEXT,
    UNIQUE (id, meta_src),
    UNIQUE (id, meta_src, node_kind),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE,
    CHECK (
        (node_kind = 'meta' AND tag IS NOT NULL AND length(trim(tag)) > 0) OR
        (node_kind IN ('cond', 'log', 'map') AND tag IS NULL)
        )
);

CREATE TABLE IF NOT EXISTS matter_edge
(
    id             INTEGER PRIMARY KEY,
    meta_src       TEXT    NOT NULL,
    parent_node_id INTEGER,
    child_node_id  INTEGER NOT NULL,
    edge_slot      TEXT    NOT NULL CHECK (edge_slot IN ('root', 'child', 'then', 'else')),
    edge_order     INTEGER NOT NULL CHECK (edge_order >= 0),
    UNIQUE (id, meta_src),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE,
    FOREIGN KEY (parent_node_id, meta_src) REFERENCES matter_node (id, meta_src) ON DELETE CASCADE,
    FOREIGN KEY (child_node_id, meta_src) REFERENCES matter_node (id, meta_src) ON DELETE CASCADE,
    CHECK (
        (parent_node_id IS NULL AND edge_slot = 'root') OR
        (parent_node_id IS NOT NULL AND edge_slot IN ('child', 'then', 'else'))
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS matter_edge_one_parent
    ON matter_edge (meta_src, child_node_id);

CREATE UNIQUE INDEX IF NOT EXISTS matter_root_order
    ON matter_edge (meta_src, edge_order)
    WHERE parent_node_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS matter_child_order
    ON matter_edge (meta_src, parent_node_id, edge_order)
    WHERE edge_slot = 'child';

CREATE UNIQUE INDEX IF NOT EXISTS matter_cond_branch_slot
    ON matter_edge (meta_src, parent_node_id, edge_slot)
    WHERE edge_slot IN ('then', 'else');

CREATE TRIGGER IF NOT EXISTS matter_edge_slot_insert
    BEFORE INSERT
    ON matter_edge
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_edge cond parent requires then/else slots')
    WHERE NEW.parent_node_id IS NOT NULL
      AND COALESCE((SELECT node_kind
                    FROM matter_node
                    WHERE id = NEW.parent_node_id
                      AND meta_src = NEW.meta_src), '') = 'cond'
      AND NEW.edge_slot NOT IN ('then', 'else');

    SELECT RAISE(ABORT, 'matter_edge non-cond parent requires child slot')
    WHERE NEW.parent_node_id IS NOT NULL
      AND COALESCE((SELECT node_kind
                    FROM matter_node
                    WHERE id = NEW.parent_node_id
                      AND meta_src = NEW.meta_src), '') <> 'cond'
      AND NEW.edge_slot <> 'child';
END;

CREATE TRIGGER IF NOT EXISTS matter_edge_slot_update
    BEFORE UPDATE OF meta_src, parent_node_id, edge_slot
    ON matter_edge
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_edge cond parent requires then/else slots')
    WHERE NEW.parent_node_id IS NOT NULL
      AND COALESCE((SELECT node_kind
                    FROM matter_node
                    WHERE id = NEW.parent_node_id
                      AND meta_src = NEW.meta_src), '') = 'cond'
      AND NEW.edge_slot NOT IN ('then', 'else');

    SELECT RAISE(ABORT, 'matter_edge non-cond parent requires child slot')
    WHERE NEW.parent_node_id IS NOT NULL
      AND COALESCE((SELECT node_kind
                    FROM matter_node
                    WHERE id = NEW.parent_node_id
                      AND meta_src = NEW.meta_src), '') <> 'cond'
      AND NEW.edge_slot <> 'child';
END;

CREATE TABLE IF NOT EXISTS matter_binding
(
    id              INTEGER PRIMARY KEY,
    meta_src        TEXT NOT NULL,
    binding_kind    TEXT NOT NULL CHECK (binding_kind IN ('static', 'variable', 'dynamic')),
    literal_kind    TEXT CHECK (literal_kind IS NULL OR literal_kind IN ('text', 'boolean')),
    literal_text    TEXT,
    literal_boolean INTEGER CHECK (literal_boolean IS NULL OR literal_boolean IN (0, 1)),
    expr            TEXT,
    UNIQUE (id, meta_src),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE,
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
    binding_id INTEGER NOT NULL,
    meta_src   TEXT    NOT NULL,
    dep_order  INTEGER NOT NULL CHECK (dep_order >= 0),
    path       TEXT    NOT NULL CHECK (length(trim(path)) > 0),
    PRIMARY KEY (binding_id, dep_order),
    FOREIGN KEY (binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS matter_node_by_meta_src
    ON matter_node (meta_src);

CREATE INDEX IF NOT EXISTS matter_edge_by_meta_src
    ON matter_edge (meta_src);

CREATE INDEX IF NOT EXISTS matter_binding_by_meta_src
    ON matter_binding (meta_src);

CREATE INDEX IF NOT EXISTS matter_binding_dep_by_meta_path
    ON matter_binding_dep (meta_src, path);

CREATE TRIGGER IF NOT EXISTS matter_binding_dep_insert
    BEFORE INSERT
    ON matter_binding_dep
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_binding_dep requires variable or dynamic binding')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), '') = 'static';

    SELECT RAISE(ABORT, 'matter_binding variable kind supports exactly one dependency')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), '') = 'variable'
      AND COALESCE((SELECT COUNT(*)
                    FROM matter_binding_dep
                    WHERE binding_id = NEW.binding_id
                      AND meta_src = NEW.meta_src), 0) >= 1;
END;

CREATE TRIGGER IF NOT EXISTS matter_binding_dep_update
    BEFORE UPDATE OF binding_id, meta_src, dep_order
    ON matter_binding_dep
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_binding_dep requires variable or dynamic binding')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), '') = 'static';

    SELECT RAISE(ABORT, 'matter_binding variable kind supports exactly one dependency')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), '') = 'variable'
      AND COALESCE((SELECT COUNT(*)
                    FROM matter_binding_dep
                    WHERE binding_id = NEW.binding_id
                      AND meta_src = NEW.meta_src
                      AND NOT (binding_id = OLD.binding_id AND dep_order = OLD.dep_order)), 0) >= 1;
END;

CREATE TRIGGER IF NOT EXISTS matter_binding_kind_update
    BEFORE UPDATE OF binding_kind
    ON matter_binding
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_binding static kind cannot own dependencies')
    WHERE NEW.binding_kind = 'static'
      AND EXISTS(SELECT 1
                 FROM matter_binding_dep
                 WHERE binding_id = NEW.id
                   AND meta_src = NEW.meta_src);

    SELECT RAISE(ABORT, 'matter_binding variable kind supports exactly one dependency')
    WHERE NEW.binding_kind = 'variable'
      AND COALESCE((SELECT COUNT(*)
                    FROM matter_binding_dep
                    WHERE binding_id = NEW.id
                      AND meta_src = NEW.meta_src), 0) > 1;
END;

CREATE TABLE IF NOT EXISTS matter_meta
(
    node_id           INTEGER PRIMARY KEY,
    meta_src          TEXT    NOT NULL,
    node_kind         TEXT    NOT NULL DEFAULT 'meta' CHECK (node_kind = 'meta'),
    src_binding_id    INTEGER NOT NULL,
    fields_binding_id INTEGER,
    mass_binding_id   INTEGER,
    FOREIGN KEY (node_id, meta_src, node_kind) REFERENCES matter_node (id, meta_src, node_kind) ON DELETE CASCADE,
    FOREIGN KEY (src_binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE,
    FOREIGN KEY (fields_binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE,
    FOREIGN KEY (mass_binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_condition
(
    node_id              INTEGER PRIMARY KEY,
    meta_src             TEXT    NOT NULL,
    node_kind            TEXT    NOT NULL DEFAULT 'cond' CHECK (node_kind = 'cond'),
    predicate_binding_id INTEGER NOT NULL,
    FOREIGN KEY (node_id, meta_src, node_kind) REFERENCES matter_node (id, meta_src, node_kind) ON DELETE CASCADE,
    FOREIGN KEY (predicate_binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_logical
(
    node_id              INTEGER PRIMARY KEY,
    meta_src             TEXT    NOT NULL,
    node_kind            TEXT    NOT NULL DEFAULT 'log' CHECK (node_kind = 'log'),
    predicate_binding_id INTEGER NOT NULL,
    FOREIGN KEY (node_id, meta_src, node_kind) REFERENCES matter_node (id, meta_src, node_kind) ON DELETE CASCADE,
    FOREIGN KEY (predicate_binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_map
(
    node_id               INTEGER PRIMARY KEY,
    meta_src              TEXT    NOT NULL,
    node_kind             TEXT    NOT NULL DEFAULT 'map' CHECK (node_kind = 'map'),
    collection_binding_id INTEGER NOT NULL,
    FOREIGN KEY (node_id, meta_src, node_kind) REFERENCES matter_node (id, meta_src, node_kind) ON DELETE CASCADE,
    FOREIGN KEY (collection_binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS matter_meta_binding_insert
    BEFORE INSERT
    ON matter_meta
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_meta.src requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.src_binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_meta.fields requires text-compatible binding')
    WHERE NEW.fields_binding_id IS NOT NULL
      AND COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.fields_binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_meta.mass requires text-compatible binding')
    WHERE NEW.mass_binding_id IS NOT NULL
      AND COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.mass_binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_meta_binding_update
    BEFORE UPDATE OF src_binding_id, fields_binding_id, mass_binding_id, meta_src
    ON matter_meta
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_meta.src requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.src_binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_meta.fields requires text-compatible binding')
    WHERE NEW.fields_binding_id IS NOT NULL
      AND COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.fields_binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_meta.mass requires text-compatible binding')
    WHERE NEW.mass_binding_id IS NOT NULL
      AND COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.mass_binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_condition_binding_insert
    BEFORE INSERT
    ON matter_condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_condition requires variable or dynamic predicate binding')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.predicate_binding_id
                      AND meta_src = NEW.meta_src), '') NOT IN ('variable', 'dynamic');
END;

CREATE TRIGGER IF NOT EXISTS matter_condition_binding_update
    BEFORE UPDATE OF predicate_binding_id, meta_src
    ON matter_condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_condition requires variable or dynamic predicate binding')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.predicate_binding_id
                      AND meta_src = NEW.meta_src), '') NOT IN ('variable', 'dynamic');
END;

CREATE TRIGGER IF NOT EXISTS matter_logical_binding_insert
    BEFORE INSERT
    ON matter_logical
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_logical requires variable or dynamic predicate binding')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.predicate_binding_id
                      AND meta_src = NEW.meta_src), '') NOT IN ('variable', 'dynamic');
END;

CREATE TRIGGER IF NOT EXISTS matter_logical_binding_update
    BEFORE UPDATE OF predicate_binding_id, meta_src
    ON matter_logical
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_logical requires variable or dynamic predicate binding')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.predicate_binding_id
                      AND meta_src = NEW.meta_src), '') NOT IN ('variable', 'dynamic');
END;

CREATE TRIGGER IF NOT EXISTS matter_map_binding_insert
    BEFORE INSERT
    ON matter_map
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_map requires variable collection binding')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.collection_binding_id
                      AND meta_src = NEW.meta_src), '') <> 'variable';
END;

CREATE TRIGGER IF NOT EXISTS matter_map_binding_update
    BEFORE UPDATE OF collection_binding_id, meta_src
    ON matter_map
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_map requires variable collection binding')
    WHERE COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.collection_binding_id
                      AND meta_src = NEW.meta_src), '') <> 'variable';
END;

CREATE TABLE IF NOT EXISTS matter_attr
(
    id              INTEGER PRIMARY KEY,
    meta_src        TEXT    NOT NULL,
    owner_node_id   INTEGER NOT NULL,
    owner_node_kind TEXT    NOT NULL DEFAULT 'meta' CHECK (owner_node_kind = 'meta'),
    attr_family     TEXT    NOT NULL CHECK (attr_family IN ('string', 'boolean', 'array', 'style', 'event')),
    attr_name       TEXT    NOT NULL CHECK (length(trim(attr_name)) > 0),
    UNIQUE (id, meta_src),
    UNIQUE (id, meta_src, attr_family),
    UNIQUE (owner_node_id, attr_family, attr_name),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE,
    FOREIGN KEY (owner_node_id, meta_src, owner_node_kind) REFERENCES matter_node (id, meta_src, node_kind) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_attr_binding
(
    owner_attr_id INTEGER PRIMARY KEY,
    meta_src      TEXT    NOT NULL,
    attr_family   TEXT    NOT NULL CHECK (attr_family IN ('string', 'boolean', 'event')),
    binding_id    INTEGER NOT NULL,
    FOREIGN KEY (owner_attr_id, meta_src, attr_family) REFERENCES matter_attr (id, meta_src, attr_family) ON DELETE CASCADE,
    FOREIGN KEY (binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_attr_part
(
    owner_attr_id INTEGER NOT NULL,
    meta_src      TEXT    NOT NULL,
    attr_family   TEXT    NOT NULL DEFAULT 'array' CHECK (attr_family = 'array'),
    part_order    INTEGER NOT NULL CHECK (part_order >= 0),
    binding_id    INTEGER NOT NULL,
    PRIMARY KEY (owner_attr_id, part_order),
    FOREIGN KEY (owner_attr_id, meta_src, attr_family) REFERENCES matter_attr (id, meta_src, attr_family) ON DELETE CASCADE,
    FOREIGN KEY (binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_style_prop
(
    owner_attr_id INTEGER NOT NULL,
    meta_src      TEXT    NOT NULL,
    attr_family   TEXT    NOT NULL DEFAULT 'style' CHECK (attr_family = 'style'),
    prop_name     TEXT    NOT NULL CHECK (length(trim(prop_name)) > 0),
    binding_id    INTEGER NOT NULL,
    PRIMARY KEY (owner_attr_id, prop_name),
    FOREIGN KEY (owner_attr_id, meta_src, attr_family) REFERENCES matter_attr (id, meta_src, attr_family) ON DELETE CASCADE,
    FOREIGN KEY (binding_id, meta_src) REFERENCES matter_binding (id, meta_src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_event_update
(
    owner_attr_id INTEGER NOT NULL,
    meta_src      TEXT    NOT NULL,
    attr_family   TEXT    NOT NULL DEFAULT 'event' CHECK (attr_family = 'event'),
    update_order  INTEGER NOT NULL CHECK (update_order >= 0),
    field_key     TEXT    NOT NULL CHECK (length(trim(field_key)) > 0),
    PRIMARY KEY (owner_attr_id, update_order),
    FOREIGN KEY (owner_attr_id, meta_src, attr_family) REFERENCES matter_attr (id, meta_src, attr_family) ON DELETE CASCADE,
    FOREIGN KEY (meta_src, field_key) REFERENCES field (meta_src, key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS matter_attr_by_node
    ON matter_attr (meta_src, owner_node_id, attr_family);

CREATE INDEX IF NOT EXISTS matter_event_update_by_meta_src
    ON matter_event_update (meta_src);

CREATE TRIGGER IF NOT EXISTS matter_attr_binding_insert
    BEFORE INSERT
    ON matter_attr_binding
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr string requires text-compatible binding')
    WHERE NEW.attr_family = 'string'
      AND COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_attr boolean requires boolean-compatible binding')
    WHERE NEW.attr_family = 'boolean'
      AND COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), 'boolean') = 'text'
      AND COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), '') = 'static';

    SELECT RAISE(ABORT, 'matter_attr event requires variable or dynamic binding')
    WHERE NEW.attr_family = 'event'
      AND COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), '') = 'static';
END;

CREATE TRIGGER IF NOT EXISTS matter_attr_binding_update
    BEFORE UPDATE OF binding_id, meta_src, attr_family
    ON matter_attr_binding
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr string requires text-compatible binding')
    WHERE NEW.attr_family = 'string'
      AND COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_attr boolean requires boolean-compatible binding')
    WHERE NEW.attr_family = 'boolean'
      AND COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), 'boolean') = 'text'
      AND COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), '') = 'static';

    SELECT RAISE(ABORT, 'matter_attr event requires variable or dynamic binding')
    WHERE NEW.attr_family = 'event'
      AND COALESCE((SELECT binding_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), '') = 'static';
END;

CREATE TRIGGER IF NOT EXISTS matter_attr_part_insert
    BEFORE INSERT
    ON matter_attr_part
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr_part requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_attr_part_update
    BEFORE UPDATE OF binding_id, meta_src
    ON matter_attr_part
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr_part requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_style_prop_insert
    BEFORE INSERT
    ON matter_style_prop
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_style_prop requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_style_prop_update
    BEFORE UPDATE OF binding_id, meta_src
    ON matter_style_prop
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_style_prop requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind
                    FROM matter_binding
                    WHERE id = NEW.binding_id
                      AND meta_src = NEW.meta_src), 'text') = 'boolean';
END;
