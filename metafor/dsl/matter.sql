CREATE TABLE IF NOT EXISTS particle
(
    id        INTEGER PRIMARY KEY,
    meta_src  TEXT    NOT NULL,
    parent_id INTEGER,
    position  INTEGER NOT NULL CHECK (position >= 0),
    type      TEXT    NOT NULL CHECK (type IN ('wimp', 'fuzzy', 'axion', 'macho')),
    UNIQUE (id, meta_src, type),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES particle (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS particle_parent_requires_same_meta_insert
    BEFORE INSERT
    ON particle
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'particle.parent_id must belong to the same meta')
    WHERE NEW.parent_id IS NOT NULL
      AND COALESCE((SELECT meta_src FROM particle WHERE id = NEW.parent_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS particle_parent_requires_same_meta_update
    BEFORE UPDATE OF meta_src, parent_id
    ON particle
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'particle.parent_id must belong to the same meta')
    WHERE NEW.parent_id IS NOT NULL
      AND COALESCE((SELECT meta_src FROM particle WHERE id = NEW.parent_id), '') <> NEW.meta_src;
END;

CREATE TABLE IF NOT EXISTS wimp
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'wimp' CHECK (type = 'wimp'),
    src      TEXT NOT NULL CHECK (length(trim(src)) > 0),
    fields   TEXT CHECK (fields IS NULL OR (json_valid(fields) AND json_type(fields) IN ('text', 'object'))),
    mass     TEXT CHECK (mass IS NULL OR (json_valid(mass) AND json_type(mass) IN ('text', 'object'))),
    FOREIGN KEY (id, meta_src, type) REFERENCES particle (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fuzzy
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'fuzzy' CHECK (type = 'fuzzy'),
    kind     TEXT NOT NULL CHECK (kind IN ('condition', 'meta')),
    UNIQUE (id, meta_src, type, kind),
    FOREIGN KEY (id, meta_src, type) REFERENCES particle (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fuzzy_condition
(
    fuzzy_id INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'fuzzy' CHECK (type = 'fuzzy'),
    kind     TEXT NOT NULL DEFAULT 'condition' CHECK (kind = 'condition'),
    data     TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) IN ('text', 'array')),
    expr     TEXT,
    FOREIGN KEY (fuzzy_id, meta_src, type, kind) REFERENCES fuzzy (id, meta_src, type, kind) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fuzzy_meta
(
    fuzzy_id INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'fuzzy' CHECK (type = 'fuzzy'),
    kind     TEXT NOT NULL DEFAULT 'meta' CHECK (kind = 'meta'),
    src      TEXT NOT NULL CHECK (json_valid(src) AND json_type(src) = 'object'),
    fields   TEXT CHECK (fields IS NULL OR (json_valid(fields) AND json_type(fields) IN ('text', 'object'))),
    mass     TEXT CHECK (mass IS NULL OR (json_valid(mass) AND json_type(mass) IN ('text', 'object'))),
    FOREIGN KEY (fuzzy_id, meta_src, type, kind) REFERENCES fuzzy (id, meta_src, type, kind) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS axion
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'axion' CHECK (type = 'axion'),
    data     TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) IN ('text', 'array')),
    expr     TEXT,
    FOREIGN KEY (id, meta_src, type) REFERENCES particle (id, meta_src, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS macho
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'macho' CHECK (type = 'macho'),
    data     TEXT NOT NULL CHECK (length(trim(data)) > 0),
    FOREIGN KEY (id, meta_src, type) REFERENCES particle (id, meta_src, type) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS particle_by_meta_src
    ON particle (meta_src);

CREATE INDEX IF NOT EXISTS fuzzy_by_meta_src
    ON fuzzy (meta_src);

CREATE UNIQUE INDEX IF NOT EXISTS root_order
    ON particle (meta_src, position) WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS child_order
    ON particle (meta_src, parent_id, position) WHERE parent_id IS NOT NULL;
