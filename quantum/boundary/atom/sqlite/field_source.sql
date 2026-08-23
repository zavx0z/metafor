CREATE TABLE IF NOT EXISTS atom_field_source
(
    child_atom  INTEGER NOT NULL,
    child_field INTEGER NOT NULL,
    parent_atom INTEGER NOT NULL,
    parent_field INTEGER NOT NULL,
    PRIMARY KEY (child_atom, child_field),
    FOREIGN KEY (child_atom, child_field)
        REFERENCES atom_value (atom, field) ON DELETE CASCADE,
    FOREIGN KEY (parent_atom, parent_field)
        REFERENCES atom_value (atom, field) ON DELETE CASCADE,
    CHECK (child_atom <> parent_atom OR child_field <> parent_field)
);

CREATE INDEX IF NOT EXISTS atom_field_source_by_parent
    ON atom_field_source (parent_atom, parent_field);
