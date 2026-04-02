CREATE TABLE IF NOT EXISTS reaction
(
    uuid          TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta_src      TEXT NOT NULL,
    key           TEXT NOT NULL CHECK (length(trim(key)) > 0),
    label         TEXT NOT NULL,
    desc          TEXT,
    cond_source   TEXT NOT NULL,
    update_source TEXT NOT NULL,
    UNIQUE (meta_src, key),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_state
(
    reaction_uuid TEXT NOT NULL CHECK (length(trim(reaction_uuid)) > 0),
    state_uuid    TEXT NOT NULL CHECK (length(trim(state_uuid)) > 0),
    PRIMARY KEY (reaction_uuid, state_uuid),
    FOREIGN KEY (reaction_uuid) REFERENCES reaction (uuid) ON DELETE CASCADE,
    FOREIGN KEY (state_uuid) REFERENCES state (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_read
(
    reaction_uuid TEXT NOT NULL CHECK (length(trim(reaction_uuid)) > 0),
    field_uuid    TEXT NOT NULL CHECK (length(trim(field_uuid)) > 0),
    PRIMARY KEY (reaction_uuid, field_uuid),
    FOREIGN KEY (reaction_uuid) REFERENCES reaction (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field_uuid) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_write
(
    reaction_uuid TEXT NOT NULL CHECK (length(trim(reaction_uuid)) > 0),
    field_uuid    TEXT NOT NULL CHECK (length(trim(field_uuid)) > 0),
    PRIMARY KEY (reaction_uuid, field_uuid),
    FOREIGN KEY (reaction_uuid) REFERENCES reaction (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field_uuid) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS reaction_state_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_state
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_state refs must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE uuid = NEW.reaction_uuid), '')
              <> COALESCE((SELECT meta_src FROM state WHERE uuid = NEW.state_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_state_requires_same_meta_refs_update
    BEFORE UPDATE OF reaction_uuid, state_uuid
    ON reaction_state
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_state refs must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE uuid = NEW.reaction_uuid), '')
              <> COALESCE((SELECT meta_src FROM state WHERE uuid = NEW.state_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_read_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_read refs must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE uuid = NEW.reaction_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_read_requires_same_meta_refs_update
    BEFORE UPDATE OF reaction_uuid, field_uuid
    ON reaction_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_read refs must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE uuid = NEW.reaction_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_write_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_write refs must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE uuid = NEW.reaction_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_write_requires_same_meta_refs_update
    BEFORE UPDATE OF reaction_uuid, field_uuid
    ON reaction_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_write refs must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE uuid = NEW.reaction_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE INDEX IF NOT EXISTS reaction_by_meta_src
    ON reaction (meta_src);

CREATE INDEX IF NOT EXISTS reaction_state_by_reaction_uuid
    ON reaction_state (reaction_uuid);

CREATE INDEX IF NOT EXISTS reaction_read_by_reaction_uuid
    ON reaction_read (reaction_uuid);

CREATE INDEX IF NOT EXISTS reaction_write_by_reaction_uuid
    ON reaction_write (reaction_uuid);
