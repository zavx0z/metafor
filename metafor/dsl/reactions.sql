CREATE TABLE IF NOT EXISTS reaction
(
    id            INTEGER PRIMARY KEY,
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
    meta_src    TEXT    NOT NULL,
    reaction_id INTEGER NOT NULL,
    state_id    INTEGER NOT NULL,
    PRIMARY KEY (reaction_id, state_id),
    FOREIGN KEY (reaction_id) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (state_id) REFERENCES state (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_read
(
    meta_src    TEXT    NOT NULL,
    reaction_id INTEGER NOT NULL,
    field_id    INTEGER NOT NULL,
    PRIMARY KEY (reaction_id, field_id),
    FOREIGN KEY (reaction_id) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_write
(
    meta_src    TEXT    NOT NULL,
    reaction_id INTEGER NOT NULL,
    field_id    INTEGER NOT NULL,
    PRIMARY KEY (reaction_id, field_id),
    FOREIGN KEY (reaction_id) REFERENCES reaction (id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS reaction_state_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_state
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_state.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_state.state_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.state_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_state_requires_same_meta_refs_update
    BEFORE UPDATE OF meta_src, reaction_id, state_id
    ON reaction_state
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_state.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_state.state_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.state_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_read_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_read.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_read.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_read_requires_same_meta_refs_update
    BEFORE UPDATE OF meta_src, reaction_id, field_id
    ON reaction_read
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_read.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_read.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_write_requires_same_meta_refs_insert
    BEFORE INSERT
    ON reaction_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_write.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_write.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE TRIGGER IF NOT EXISTS reaction_write_requires_same_meta_refs_update
    BEFORE UPDATE OF meta_src, reaction_id, field_id
    ON reaction_write
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'reaction_write.reaction_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM reaction WHERE id = NEW.reaction_id), '') <> NEW.meta_src;

    SELECT RAISE(ABORT, 'reaction_write.field_id must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '') <> NEW.meta_src;
END;

CREATE INDEX IF NOT EXISTS reaction_by_meta_src
    ON reaction (meta_src);

CREATE INDEX IF NOT EXISTS reaction_state_by_meta_src
    ON reaction_state (meta_src);

CREATE INDEX IF NOT EXISTS reaction_read_by_meta_src
    ON reaction_read (meta_src);

CREATE INDEX IF NOT EXISTS reaction_write_by_meta_src
    ON reaction_write (meta_src);
