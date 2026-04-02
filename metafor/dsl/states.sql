CREATE TABLE IF NOT EXISTS state
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta TEXT    NOT NULL,
    name     TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (meta, name),
    UNIQUE (meta, position),
    FOREIGN KEY (meta) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transition
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    from_state TEXT    NOT NULL CHECK (length(trim(from_state)) > 0),
    to_state   TEXT    NOT NULL CHECK (length(trim(to_state)) > 0),
    position        INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (from_state, position),
    FOREIGN KEY (from_state) REFERENCES state (uuid) ON DELETE CASCADE,
    FOREIGN KEY (to_state) REFERENCES state (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS condition
(
    transition TEXT NOT NULL CHECK (length(trim(transition)) > 0),
    field      TEXT NOT NULL CHECK (length(trim(field)) > 0),
    condition_json  TEXT NOT NULL CHECK (json_valid(condition_json)),
    PRIMARY KEY (transition, field),
    FOREIGN KEY (transition) REFERENCES transition (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS transition_states_share_meta_insert
    BEFORE INSERT
    ON transition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'transition states must belong to the same meta')
    WHERE COALESCE((SELECT meta FROM state WHERE uuid = NEW.from_state), '')
              <> COALESCE((SELECT meta FROM state WHERE uuid = NEW.to_state), '');
END;

CREATE TRIGGER IF NOT EXISTS transition_states_share_meta_update
    BEFORE UPDATE OF from_state, to_state
    ON transition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'transition states must belong to the same meta')
    WHERE COALESCE((SELECT meta FROM state WHERE uuid = NEW.from_state), '')
              <> COALESCE((SELECT meta FROM state WHERE uuid = NEW.to_state), '');
END;

CREATE TRIGGER IF NOT EXISTS condition_field_matches_transition_meta_insert
    BEFORE INSERT
    ON condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'condition.field must belong to transition meta')
    WHERE COALESCE((SELECT state.meta
                    FROM state
                             JOIN transition ON transition.from_state = state.uuid
                    WHERE transition.uuid = NEW.transition), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE TRIGGER IF NOT EXISTS condition_field_matches_transition_meta_update
    BEFORE UPDATE OF transition, field
    ON condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'condition.field must belong to transition meta')
    WHERE COALESCE((SELECT state.meta
                    FROM state
                             JOIN transition ON transition.from_state = state.uuid
                    WHERE transition.uuid = NEW.transition), '')
              <> COALESCE((SELECT meta FROM field WHERE uuid = NEW.field), '');
END;

CREATE INDEX IF NOT EXISTS state_by_meta
    ON state (meta);
