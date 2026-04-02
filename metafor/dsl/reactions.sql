CREATE TABLE IF NOT EXISTS reaction
(
    uuid          TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta      TEXT NOT NULL,
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

CREATE TRIGGER IF NOT EXISTS reaction_state_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_state
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_state refs must belong to the same meta')
    WHERE COALESCE((SELECT meta FROM reaction WHERE uuid = NEW.reaction), '')
              <> COALESCE((SELECT meta FROM state WHERE uuid = NEW.state), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_state_requires_same_meta_refs_update
    BEFORE UPDATE OF reaction, state
    ON reaction_state
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_state refs must belong to the same meta')
    WHERE COALESCE((SELECT meta FROM reaction WHERE uuid = NEW.reaction), '')
              <> COALESCE((SELECT meta FROM state WHERE uuid = NEW.state), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_read_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_read refs must belong to the same meta')
    WHERE COALESCE((SELECT meta FROM reaction WHERE uuid = NEW.reaction), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_read_requires_same_meta_refs_update
    BEFORE UPDATE OF reaction, field
    ON reaction_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_read refs must belong to the same meta')
    WHERE COALESCE((SELECT meta FROM reaction WHERE uuid = NEW.reaction), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_write_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_write refs must belong to the same meta')
    WHERE COALESCE((SELECT meta FROM reaction WHERE uuid = NEW.reaction), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE TRIGGER IF NOT EXISTS reaction_write_requires_same_meta_refs_update
    BEFORE UPDATE OF reaction, field
    ON reaction_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_write refs must belong to the same meta')
    WHERE COALESCE((SELECT meta FROM reaction WHERE uuid = NEW.reaction), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE INDEX IF NOT EXISTS reaction_by_meta
    ON reaction (meta);

CREATE INDEX IF NOT EXISTS reaction_state_by_reaction
    ON reaction_state (reaction);

CREATE INDEX IF NOT EXISTS reaction_read_by_reaction
    ON reaction_read (reaction);

CREATE INDEX IF NOT EXISTS reaction_write_by_reaction
    ON reaction_write (reaction);
