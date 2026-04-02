CREATE TABLE IF NOT EXISTS matter_node
(
    uuid      TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta  TEXT NOT NULL,
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
    uuid             TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    root_meta    TEXT,
    parent_node TEXT,
    child_node  TEXT    NOT NULL CHECK (length(trim(child_node)) > 0),
    edge_slot        TEXT    NOT NULL CHECK (edge_slot IN ('root', 'child', 'then', 'else')),
    edge_order       INTEGER NOT NULL CHECK (edge_order >= 0),
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

CREATE TRIGGER IF NOT EXISTS matter_edge_insert_guards
    BEFORE INSERT
    ON matter_edge
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_edge root_meta must match child node meta')
    WHERE NEW.parent_node IS NULL
      AND COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.child_node), '') <> NEW.root_meta;

    SELECT RAISE(ABORT, 'matter_edge parent and child nodes must belong to the same meta')
    WHERE NEW.parent_node IS NOT NULL
      AND COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.parent_node), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.child_node), '');

    SELECT RAISE(ABORT, 'matter_edge cond parent requires then/else slots')
    WHERE NEW.parent_node IS NOT NULL
      AND COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.parent_node), '') = 'cond'
      AND NEW.edge_slot NOT IN ('then', 'else');

    SELECT RAISE(ABORT, 'matter_edge non-cond parent requires child slot')
    WHERE NEW.parent_node IS NOT NULL
      AND COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.parent_node), '') <> 'cond'
      AND NEW.edge_slot <> 'child';
END;

CREATE TRIGGER IF NOT EXISTS matter_edge_update_guards
    BEFORE UPDATE OF root_meta, parent_node, child_node, edge_slot
    ON matter_edge
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_edge root_meta must match child node meta')
    WHERE NEW.parent_node IS NULL
      AND COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.child_node), '') <> NEW.root_meta;

    SELECT RAISE(ABORT, 'matter_edge parent and child nodes must belong to the same meta')
    WHERE NEW.parent_node IS NOT NULL
      AND COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.parent_node), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.child_node), '');

    SELECT RAISE(ABORT, 'matter_edge cond parent requires then/else slots')
    WHERE NEW.parent_node IS NOT NULL
      AND COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.parent_node), '') = 'cond'
      AND NEW.edge_slot NOT IN ('then', 'else');

    SELECT RAISE(ABORT, 'matter_edge non-cond parent requires child slot')
    WHERE NEW.parent_node IS NOT NULL
      AND COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.parent_node), '') <> 'cond'
      AND NEW.edge_slot <> 'child';
END;

CREATE TABLE IF NOT EXISTS matter_binding
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta        TEXT NOT NULL,
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
        (binding_kind = 'variable' AND literal_kind IS NULL AND literal_text IS NULL AND literal_boolean IS NULL AND expr IS NULL) OR
        (binding_kind = 'dynamic' AND literal_kind IS NULL AND literal_text IS NULL AND literal_boolean IS NULL AND expr IS NOT NULL)
        )
);

CREATE TABLE IF NOT EXISTS matter_binding_dep
(
    binding TEXT NOT NULL CHECK (length(trim(binding)) > 0),
    dep_order    INTEGER NOT NULL CHECK (dep_order >= 0),
    path         TEXT    NOT NULL CHECK (length(trim(path)) > 0),
    PRIMARY KEY (binding, dep_order),
    FOREIGN KEY (binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS matter_node_by_meta
    ON matter_node (meta);

CREATE INDEX IF NOT EXISTS matter_binding_by_meta
    ON matter_binding (meta);

CREATE INDEX IF NOT EXISTS matter_binding_dep_by_binding
    ON matter_binding_dep (binding);

CREATE TRIGGER IF NOT EXISTS matter_binding_dep_insert
    BEFORE INSERT
    ON matter_binding_dep
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_binding_dep requires variable or dynamic binding')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.binding), '') = 'static';

    SELECT RAISE(ABORT, 'matter_binding variable kind supports exactly one dependency')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.binding), '') = 'variable'
      AND COALESCE((SELECT COUNT(*)
                    FROM matter_binding_dep
                    WHERE binding = NEW.binding), 0) >= 1;
END;

CREATE TRIGGER IF NOT EXISTS matter_binding_dep_update
    BEFORE UPDATE OF binding, dep_order
    ON matter_binding_dep
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_binding_dep requires variable or dynamic binding')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.binding), '') = 'static';

    SELECT RAISE(ABORT, 'matter_binding variable kind supports exactly one dependency')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.binding), '') = 'variable'
      AND COALESCE((SELECT COUNT(*)
                    FROM matter_binding_dep
                    WHERE binding = NEW.binding
                      AND NOT (binding = OLD.binding AND dep_order = OLD.dep_order)), 0) >= 1;
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
                 WHERE binding = NEW.uuid);

    SELECT RAISE(ABORT, 'matter_binding variable kind supports exactly one dependency')
    WHERE NEW.binding_kind = 'variable'
      AND COALESCE((SELECT COUNT(*)
                    FROM matter_binding_dep
                    WHERE binding = NEW.uuid), 0) > 1;
END;

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
    node               TEXT PRIMARY KEY CHECK (length(trim(node)) > 0),
    predicate_binding  TEXT NOT NULL CHECK (length(trim(predicate_binding)) > 0),
    FOREIGN KEY (node) REFERENCES matter_node (uuid) ON DELETE CASCADE,
    FOREIGN KEY (predicate_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_logical
(
    node               TEXT PRIMARY KEY CHECK (length(trim(node)) > 0),
    predicate_binding  TEXT NOT NULL CHECK (length(trim(predicate_binding)) > 0),
    FOREIGN KEY (node) REFERENCES matter_node (uuid) ON DELETE CASCADE,
    FOREIGN KEY (predicate_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_map
(
    node                TEXT PRIMARY KEY CHECK (length(trim(node)) > 0),
    collection_binding  TEXT NOT NULL CHECK (length(trim(collection_binding)) > 0),
    FOREIGN KEY (node) REFERENCES matter_node (uuid) ON DELETE CASCADE,
    FOREIGN KEY (collection_binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS matter_meta_insert_guards
    BEFORE INSERT
    ON matter_meta
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_meta requires node_kind = meta')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.node), '') <> 'meta';

    SELECT RAISE(ABORT, 'matter_meta bindings must belong to node meta')
    WHERE COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.src_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_meta bindings must belong to node meta')
    WHERE NEW.fields_binding IS NOT NULL
      AND COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.fields_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_meta bindings must belong to node meta')
    WHERE NEW.mass_binding IS NOT NULL
      AND COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.mass_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_meta src requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.src_binding), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_meta fields requires text-compatible binding')
    WHERE NEW.fields_binding IS NOT NULL
      AND COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.fields_binding), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_meta mass requires text-compatible binding')
    WHERE NEW.mass_binding IS NOT NULL
      AND COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.mass_binding), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_meta_update_guards
    BEFORE UPDATE OF node, src_binding, fields_binding, mass_binding
    ON matter_meta
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_meta requires node_kind = meta')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.node), '') <> 'meta';

    SELECT RAISE(ABORT, 'matter_meta bindings must belong to node meta')
    WHERE COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.src_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_meta bindings must belong to node meta')
    WHERE NEW.fields_binding IS NOT NULL
      AND COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.fields_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_meta bindings must belong to node meta')
    WHERE NEW.mass_binding IS NOT NULL
      AND COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.mass_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_meta src requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.src_binding), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_meta fields requires text-compatible binding')
    WHERE NEW.fields_binding IS NOT NULL
      AND COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.fields_binding), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_meta mass requires text-compatible binding')
    WHERE NEW.mass_binding IS NOT NULL
      AND COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.mass_binding), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_condition_insert_guards
    BEFORE INSERT
    ON matter_condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_condition requires node_kind = cond')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.node), '') <> 'cond';

    SELECT RAISE(ABORT, 'matter_condition binding must belong to node meta')
    WHERE COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.predicate_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_condition requires variable or dynamic predicate binding')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.predicate_binding), '') NOT IN ('variable', 'dynamic');
END;

CREATE TRIGGER IF NOT EXISTS matter_condition_update_guards
    BEFORE UPDATE OF node, predicate_binding
    ON matter_condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_condition requires node_kind = cond')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.node), '') <> 'cond';

    SELECT RAISE(ABORT, 'matter_condition binding must belong to node meta')
    WHERE COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.predicate_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_condition requires variable or dynamic predicate binding')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.predicate_binding), '') NOT IN ('variable', 'dynamic');
END;

CREATE TRIGGER IF NOT EXISTS matter_logical_insert_guards
    BEFORE INSERT
    ON matter_logical
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_logical requires node_kind = log')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.node), '') <> 'log';

    SELECT RAISE(ABORT, 'matter_logical binding must belong to node meta')
    WHERE COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.predicate_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_logical requires variable or dynamic predicate binding')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.predicate_binding), '') NOT IN ('variable', 'dynamic');
END;

CREATE TRIGGER IF NOT EXISTS matter_logical_update_guards
    BEFORE UPDATE OF node, predicate_binding
    ON matter_logical
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_logical requires node_kind = log')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.node), '') <> 'log';

    SELECT RAISE(ABORT, 'matter_logical binding must belong to node meta')
    WHERE COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.predicate_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_logical requires variable or dynamic predicate binding')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.predicate_binding), '') NOT IN ('variable', 'dynamic');
END;

CREATE TRIGGER IF NOT EXISTS matter_map_insert_guards
    BEFORE INSERT
    ON matter_map
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_map requires node_kind = map')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.node), '') <> 'map';

    SELECT RAISE(ABORT, 'matter_map binding must belong to node meta')
    WHERE COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.collection_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_map requires variable collection binding')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.collection_binding), '') <> 'variable';
END;

CREATE TRIGGER IF NOT EXISTS matter_map_update_guards
    BEFORE UPDATE OF node, collection_binding
    ON matter_map
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_map requires node_kind = map')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.node), '') <> 'map';

    SELECT RAISE(ABORT, 'matter_map binding must belong to node meta')
    WHERE COALESCE((SELECT meta FROM matter_binding WHERE uuid = NEW.collection_binding), '')
              <> COALESCE((SELECT meta FROM matter_node WHERE uuid = NEW.node), '');

    SELECT RAISE(ABORT, 'matter_map requires variable collection binding')
    WHERE COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.collection_binding), '') <> 'variable';
END;

CREATE TABLE IF NOT EXISTS matter_attr
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    owner_node TEXT NOT NULL CHECK (length(trim(owner_node)) > 0),
    attr_family     TEXT NOT NULL CHECK (attr_family IN ('string', 'boolean', 'array', 'style', 'event')),
    attr_name       TEXT NOT NULL CHECK (length(trim(attr_name)) > 0),
    UNIQUE (owner_node, attr_family, attr_name),
    FOREIGN KEY (owner_node) REFERENCES matter_node (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_attr_binding
(
    attr     TEXT PRIMARY KEY CHECK (length(trim(attr)) > 0),
    binding  TEXT NOT NULL CHECK (length(trim(binding)) > 0),
    FOREIGN KEY (attr) REFERENCES matter_attr (uuid) ON DELETE CASCADE,
    FOREIGN KEY (binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_attr_part
(
    attr     TEXT NOT NULL CHECK (length(trim(attr)) > 0),
    part_order    INTEGER NOT NULL CHECK (part_order >= 0),
    binding  TEXT NOT NULL CHECK (length(trim(binding)) > 0),
    PRIMARY KEY (attr, part_order),
    FOREIGN KEY (attr) REFERENCES matter_attr (uuid) ON DELETE CASCADE,
    FOREIGN KEY (binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_style_prop
(
    attr     TEXT NOT NULL CHECK (length(trim(attr)) > 0),
    prop_name     TEXT NOT NULL CHECK (length(trim(prop_name)) > 0),
    binding  TEXT NOT NULL CHECK (length(trim(binding)) > 0),
    PRIMARY KEY (attr, prop_name),
    FOREIGN KEY (attr) REFERENCES matter_attr (uuid) ON DELETE CASCADE,
    FOREIGN KEY (binding) REFERENCES matter_binding (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_event_update
(
    attr     TEXT NOT NULL CHECK (length(trim(attr)) > 0),
    update_order  INTEGER NOT NULL CHECK (update_order >= 0),
    field    TEXT NOT NULL CHECK (length(trim(field)) > 0),
    PRIMARY KEY (attr, update_order),
    FOREIGN KEY (attr) REFERENCES matter_attr (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS matter_attr_by_owner_node
    ON matter_attr (owner_node, attr_family);

CREATE INDEX IF NOT EXISTS matter_event_update_by_attr
    ON matter_event_update (attr);

CREATE TRIGGER IF NOT EXISTS matter_attr_insert_guards
    BEFORE INSERT
    ON matter_attr
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr requires meta owner node')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.owner_node), '') <> 'meta';
END;

CREATE TRIGGER IF NOT EXISTS matter_attr_update_guards
    BEFORE UPDATE OF owner_node
    ON matter_attr
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr requires meta owner node')
    WHERE COALESCE((SELECT node_kind FROM matter_node WHERE uuid = NEW.owner_node), '') <> 'meta';
END;

CREATE TRIGGER IF NOT EXISTS matter_attr_binding_insert_guards
    BEFORE INSERT
    ON matter_attr_binding
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr_binding requires string/boolean/event attr family')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') NOT IN ('string', 'boolean', 'event');

    SELECT RAISE(ABORT, 'matter_attr_binding binding must belong to attr owner meta')
    WHERE COALESCE((SELECT matter_binding.meta
                    FROM matter_binding
                    WHERE matter_binding.uuid = NEW.binding), '')
              <> COALESCE((SELECT matter_node.meta
                           FROM matter_node
                                    JOIN matter_attr ON matter_attr.owner_node = matter_node.uuid
                           WHERE matter_attr.uuid = NEW.attr), '');

    SELECT RAISE(ABORT, 'matter_attr string requires text-compatible binding')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') = 'string'
      AND COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.binding), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_attr boolean requires boolean-compatible binding')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') = 'boolean'
      AND COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.binding), '') = 'static'
      AND COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.binding), 'boolean') = 'text';

    SELECT RAISE(ABORT, 'matter_attr event requires variable or dynamic binding')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') = 'event'
      AND COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.binding), '') = 'static';
END;

CREATE TRIGGER IF NOT EXISTS matter_attr_binding_update_guards
    BEFORE UPDATE OF attr, binding
    ON matter_attr_binding
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr_binding requires string/boolean/event attr family')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') NOT IN ('string', 'boolean', 'event');

    SELECT RAISE(ABORT, 'matter_attr_binding binding must belong to attr owner meta')
    WHERE COALESCE((SELECT matter_binding.meta
                    FROM matter_binding
                    WHERE matter_binding.uuid = NEW.binding), '')
              <> COALESCE((SELECT matter_node.meta
                           FROM matter_node
                                    JOIN matter_attr ON matter_attr.owner_node = matter_node.uuid
                           WHERE matter_attr.uuid = NEW.attr), '');

    SELECT RAISE(ABORT, 'matter_attr string requires text-compatible binding')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') = 'string'
      AND COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.binding), 'text') = 'boolean';

    SELECT RAISE(ABORT, 'matter_attr boolean requires boolean-compatible binding')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') = 'boolean'
      AND COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.binding), '') = 'static'
      AND COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.binding), 'boolean') = 'text';

    SELECT RAISE(ABORT, 'matter_attr event requires variable or dynamic binding')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') = 'event'
      AND COALESCE((SELECT binding_kind FROM matter_binding WHERE uuid = NEW.binding), '') = 'static';
END;

CREATE TRIGGER IF NOT EXISTS matter_attr_part_insert_guards
    BEFORE INSERT
    ON matter_attr_part
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr_part requires array attr family')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') <> 'array';

    SELECT RAISE(ABORT, 'matter_attr_part binding must belong to attr owner meta')
    WHERE COALESCE((SELECT matter_binding.meta
                    FROM matter_binding
                    WHERE matter_binding.uuid = NEW.binding), '')
              <> COALESCE((SELECT matter_node.meta
                           FROM matter_node
                                    JOIN matter_attr ON matter_attr.owner_node = matter_node.uuid
                           WHERE matter_attr.uuid = NEW.attr), '');

    SELECT RAISE(ABORT, 'matter_attr_part requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.binding), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_attr_part_update_guards
    BEFORE UPDATE OF attr, binding
    ON matter_attr_part
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_attr_part requires array attr family')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') <> 'array';

    SELECT RAISE(ABORT, 'matter_attr_part binding must belong to attr owner meta')
    WHERE COALESCE((SELECT matter_binding.meta
                    FROM matter_binding
                    WHERE matter_binding.uuid = NEW.binding), '')
              <> COALESCE((SELECT matter_node.meta
                           FROM matter_node
                                    JOIN matter_attr ON matter_attr.owner_node = matter_node.uuid
                           WHERE matter_attr.uuid = NEW.attr), '');

    SELECT RAISE(ABORT, 'matter_attr_part requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.binding), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_style_prop_insert_guards
    BEFORE INSERT
    ON matter_style_prop
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_style_prop requires style attr family')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') <> 'style';

    SELECT RAISE(ABORT, 'matter_style_prop binding must belong to attr owner meta')
    WHERE COALESCE((SELECT matter_binding.meta
                    FROM matter_binding
                    WHERE matter_binding.uuid = NEW.binding), '')
              <> COALESCE((SELECT matter_node.meta
                           FROM matter_node
                                    JOIN matter_attr ON matter_attr.owner_node = matter_node.uuid
                           WHERE matter_attr.uuid = NEW.attr), '');

    SELECT RAISE(ABORT, 'matter_style_prop requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.binding), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_style_prop_update_guards
    BEFORE UPDATE OF attr, binding
    ON matter_style_prop
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_style_prop requires style attr family')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') <> 'style';

    SELECT RAISE(ABORT, 'matter_style_prop binding must belong to attr owner meta')
    WHERE COALESCE((SELECT matter_binding.meta
                    FROM matter_binding
                    WHERE matter_binding.uuid = NEW.binding), '')
              <> COALESCE((SELECT matter_node.meta
                           FROM matter_node
                                    JOIN matter_attr ON matter_attr.owner_node = matter_node.uuid
                           WHERE matter_attr.uuid = NEW.attr), '');

    SELECT RAISE(ABORT, 'matter_style_prop requires text-compatible binding')
    WHERE COALESCE((SELECT literal_kind FROM matter_binding WHERE uuid = NEW.binding), 'text') = 'boolean';
END;

CREATE TRIGGER IF NOT EXISTS matter_event_update_insert_guards
    BEFORE INSERT
    ON matter_event_update
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_event_update requires event attr family')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') <> 'event';

    SELECT RAISE(ABORT, 'matter_event_update field must belong to attr owner meta')
    WHERE COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '')
              <> COALESCE((SELECT matter_node.meta
                           FROM matter_node
                                    JOIN matter_attr ON matter_attr.owner_node = matter_node.uuid
                           WHERE matter_attr.uuid = NEW.attr), '');
END;

CREATE TRIGGER IF NOT EXISTS matter_event_update_update_guards
    BEFORE UPDATE OF attr, field
    ON matter_event_update
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'matter_event_update requires event attr family')
    WHERE COALESCE((SELECT attr_family FROM matter_attr WHERE uuid = NEW.attr), '') <> 'event';

    SELECT RAISE(ABORT, 'matter_event_update field must belong to attr owner meta')
    WHERE COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '')
              <> COALESCE((SELECT matter_node.meta
                           FROM matter_node
                                    JOIN matter_attr ON matter_attr.owner_node = matter_node.uuid
                           WHERE matter_attr.uuid = NEW.attr), '');
END;
