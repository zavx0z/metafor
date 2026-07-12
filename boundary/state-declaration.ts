import type {SQL} from "bun"

/**
 * Keeps the relational `state` table aligned with incremental State declarations.
 *
 * `boundary_declaration_entity` remains the declaration source of truth. The
 * relational row exists so runtime `actor_state` can retain a foreign-keyed
 * canonical State. Triggers run in the same SQLite transaction as declaration
 * insert/update/remove; they do not create another declaration store.
 */
export async function initBoundaryStateDeclarations(sql: SQL): Promise<void> {
  await sql.unsafe(`
    INSERT INTO state (id, wimp, local_id, name, position)
    SELECT
      CAST(json_extract(canonical_json, '$.id') AS INTEGER),
      src,
      CAST(local_id AS INTEGER),
      CAST(json_extract(canonical_json, '$.name') AS TEXT),
      CAST(COALESCE(json_extract(canonical_json, '$.position'), local_id) AS INTEGER)
    FROM boundary_declaration_entity
    WHERE section = 'states'
      AND json_type(canonical_json, '$.id') = 'integer'
      AND json_type(canonical_json, '$.name') = 'text'
    ON CONFLICT(id) DO UPDATE SET
      wimp = excluded.wimp,
      local_id = excluded.local_id,
      name = excluded.name,
      position = excluded.position;

    CREATE TRIGGER IF NOT EXISTS boundary_state_declaration_insert
    AFTER INSERT ON boundary_declaration_entity
    WHEN NEW.section = 'states'
    BEGIN
      INSERT INTO state (id, wimp, local_id, name, position)
      VALUES (
        CAST(json_extract(NEW.canonical_json, '$.id') AS INTEGER),
        NEW.src,
        CAST(NEW.local_id AS INTEGER),
        CAST(json_extract(NEW.canonical_json, '$.name') AS TEXT),
        CAST(COALESCE(json_extract(NEW.canonical_json, '$.position'), NEW.local_id) AS INTEGER)
      )
      ON CONFLICT(id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        name = excluded.name,
        position = excluded.position;
    END;

    CREATE TRIGGER IF NOT EXISTS boundary_state_declaration_update
    AFTER UPDATE OF canonical_json, src, local_id, section ON boundary_declaration_entity
    WHEN NEW.section = 'states'
    BEGIN
      INSERT INTO state (id, wimp, local_id, name, position)
      VALUES (
        CAST(json_extract(NEW.canonical_json, '$.id') AS INTEGER),
        NEW.src,
        CAST(NEW.local_id AS INTEGER),
        CAST(json_extract(NEW.canonical_json, '$.name') AS TEXT),
        CAST(COALESCE(json_extract(NEW.canonical_json, '$.position'), NEW.local_id) AS INTEGER)
      )
      ON CONFLICT(id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        name = excluded.name,
        position = excluded.position;
    END;

    CREATE TRIGGER IF NOT EXISTS boundary_state_declaration_delete
    AFTER DELETE ON boundary_declaration_entity
    WHEN OLD.section = 'states'
    BEGIN
      DELETE FROM state
       WHERE id = CAST(json_extract(OLD.canonical_json, '$.id') AS INTEGER);
    END;
  `)
}
