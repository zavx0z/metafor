CREATE TABLE IF NOT EXISTS state
(
    id       INTEGER PRIMARY KEY,
    meta_src TEXT    NOT NULL,
    name     TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (meta_src, name),
    UNIQUE (meta_src, position),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transition
(
    id            INTEGER PRIMARY KEY,
    from_state_id INTEGER NOT NULL,
    to_state_id   INTEGER NOT NULL,
    position      INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (from_state_id, position),
    FOREIGN KEY (from_state_id) REFERENCES state (id) ON DELETE CASCADE,
    FOREIGN KEY (to_state_id) REFERENCES state (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS condition
(
    transition_id  INTEGER NOT NULL,
    field_id       INTEGER NOT NULL,
    condition_json TEXT    NOT NULL CHECK (json_valid(condition_json)),
    PRIMARY KEY (transition_id, field_id),
    FOREIGN KEY (transition_id) REFERENCES transition (id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES field (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS transition_states_share_meta_insert
    BEFORE INSERT
    ON transition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'transition states must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.from_state_id), '')
              <> COALESCE((SELECT meta_src FROM state WHERE id = NEW.to_state_id), '');
END;

CREATE TRIGGER IF NOT EXISTS transition_states_share_meta_update
    BEFORE UPDATE OF from_state_id, to_state_id
    ON transition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'transition states must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE id = NEW.from_state_id), '')
              <> COALESCE((SELECT meta_src FROM state WHERE id = NEW.to_state_id), '');
END;

CREATE TRIGGER IF NOT EXISTS condition_field_matches_transition_meta_insert
    BEFORE INSERT
    ON condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'condition.field_id must belong to transition meta')
    WHERE COALESCE((SELECT meta_src
                    FROM state
                    JOIN transition ON transition.from_state_id = state.id
                    WHERE transition.id = NEW.transition_id), '')
              <> COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '');
END;

CREATE TRIGGER IF NOT EXISTS condition_field_matches_transition_meta_update
    BEFORE UPDATE OF transition_id, field_id
    ON condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'condition.field_id must belong to transition meta')
    WHERE COALESCE((SELECT meta_src
                    FROM state
                    JOIN transition ON transition.from_state_id = state.id
                    WHERE transition.id = NEW.transition_id), '')
              <> COALESCE((SELECT meta_src FROM field WHERE id = NEW.field_id), '');
END;

CREATE INDEX IF NOT EXISTS state_by_meta_src
    ON state (meta_src);
