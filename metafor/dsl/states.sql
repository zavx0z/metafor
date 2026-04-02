CREATE TABLE IF NOT EXISTS state
(
    uuid     TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    meta_src TEXT    NOT NULL,
    name     TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (meta_src, name),
    UNIQUE (meta_src, position),
    FOREIGN KEY (meta_src) REFERENCES meta (src) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transition
(
    uuid            TEXT PRIMARY KEY CHECK (length(trim(uuid)) > 0),
    from_state_uuid TEXT    NOT NULL CHECK (length(trim(from_state_uuid)) > 0),
    to_state_uuid   TEXT    NOT NULL CHECK (length(trim(to_state_uuid)) > 0),
    position        INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (from_state_uuid, position),
    FOREIGN KEY (from_state_uuid) REFERENCES state (uuid) ON DELETE CASCADE,
    FOREIGN KEY (to_state_uuid) REFERENCES state (uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS condition
(
    transition_uuid TEXT NOT NULL CHECK (length(trim(transition_uuid)) > 0),
    field_uuid      TEXT NOT NULL CHECK (length(trim(field_uuid)) > 0),
    condition_json  TEXT NOT NULL CHECK (json_valid(condition_json)),
    PRIMARY KEY (transition_uuid, field_uuid),
    FOREIGN KEY (transition_uuid) REFERENCES transition (uuid) ON DELETE CASCADE,
    FOREIGN KEY (field_uuid) REFERENCES field (uuid) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS transition_states_share_meta_insert
    BEFORE INSERT
    ON transition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'transition states must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE uuid = NEW.from_state_uuid), '')
              <> COALESCE((SELECT meta_src FROM state WHERE uuid = NEW.to_state_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS transition_states_share_meta_update
    BEFORE UPDATE OF from_state_uuid, to_state_uuid
    ON transition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'transition states must belong to the same meta')
    WHERE COALESCE((SELECT meta_src FROM state WHERE uuid = NEW.from_state_uuid), '')
              <> COALESCE((SELECT meta_src FROM state WHERE uuid = NEW.to_state_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS condition_field_matches_transition_meta_insert
    BEFORE INSERT
    ON condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'condition.field_uuid must belong to transition meta')
    WHERE COALESCE((SELECT state.meta_src
                    FROM state
                             JOIN transition ON transition.from_state_uuid = state.uuid
                    WHERE transition.uuid = NEW.transition_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE TRIGGER IF NOT EXISTS condition_field_matches_transition_meta_update
    BEFORE UPDATE OF transition_uuid, field_uuid
    ON condition
    FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'condition.field_uuid must belong to transition meta')
    WHERE COALESCE((SELECT state.meta_src
                    FROM state
                             JOIN transition ON transition.from_state_uuid = state.uuid
                    WHERE transition.uuid = NEW.transition_uuid), '')
              <> COALESCE((SELECT meta_src FROM field WHERE uuid = NEW.field_uuid), '');
END;

CREATE INDEX IF NOT EXISTS state_by_meta_src
    ON state (meta_src);
