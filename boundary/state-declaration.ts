import type {SQL} from "bun"

type StoredStateDeclaration = {
  src: string
  localId: string
  canonicalJson: string
}

type CanonicalState = {
  id: number
  name: string
  position: number
}

const canonicalState = (row: StoredStateDeclaration): CanonicalState | null => {
  const value = JSON.parse(row.canonicalJson) as unknown
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const state = value as Record<string, unknown>
  if (
    typeof state.id !== "number" ||
    !Number.isSafeInteger(state.id) ||
    state.id <= 0 ||
    typeof state.name !== "string" ||
    state.name.trim().length === 0
  ) return null

  const localPosition = Number(row.localId)
  const position = typeof state.position === "number" && Number.isSafeInteger(state.position)
    ? state.position
    : localPosition
  if (!Number.isSafeInteger(position) || position < 0) return null
  return {id: state.id, name: state.name, position}
}

/**
 * Keeps the relational `state` projection aligned with incremental declarations.
 *
 * `boundary_declaration_entity` remains the declaration source of truth. The
 * relational row only gives `actor_state` a foreign-keyed canonical identity.
 * Triggers execute in the same SQLite transaction as declaration changes.
 */
export async function initBoundaryStateDeclarations(sql: SQL): Promise<void> {
  const existing = await sql<StoredStateDeclaration[]>`
    SELECT src, local_id AS localId, canonical_json AS canonicalJson
      FROM boundary_declaration_entity
     WHERE section = ${"states"}
     ORDER BY rowid
  `
  for (const row of existing) {
    const state = canonicalState(row)
    if (!state) continue
    await sql`
      INSERT INTO state (id, wimp, local_id, name, position)
      VALUES (${state.id}, ${row.src}, ${Number(row.localId)}, ${state.name}, ${state.position})
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        name = excluded.name,
        position = excluded.position
    `
  }

  await sql.unsafe("DROP TRIGGER IF EXISTS boundary_state_declaration_insert")
  await sql.unsafe("DROP TRIGGER IF EXISTS boundary_state_declaration_update")
  await sql.unsafe("DROP TRIGGER IF EXISTS boundary_state_declaration_delete")

  await sql.unsafe(`
    CREATE TRIGGER boundary_state_declaration_insert
    AFTER INSERT ON boundary_declaration_entity
    WHEN NEW.section = 'states'
    BEGIN
      INSERT OR IGNORE INTO state (id, wimp, local_id, name, position)
      VALUES (
        CAST(json_extract(NEW.canonical_json, '$.id') AS INTEGER),
        NEW.src,
        CAST(NEW.local_id AS INTEGER),
        CAST(json_extract(NEW.canonical_json, '$.name') AS TEXT),
        CAST(COALESCE(json_extract(NEW.canonical_json, '$.position'), NEW.local_id) AS INTEGER)
      );
      UPDATE state
         SET wimp = NEW.src,
             local_id = CAST(NEW.local_id AS INTEGER),
             name = CAST(json_extract(NEW.canonical_json, '$.name') AS TEXT),
             position = CAST(COALESCE(json_extract(NEW.canonical_json, '$.position'), NEW.local_id) AS INTEGER)
       WHERE id = CAST(json_extract(NEW.canonical_json, '$.id') AS INTEGER);
    END
  `)

  await sql.unsafe(`
    CREATE TRIGGER boundary_state_declaration_update
    AFTER UPDATE OF canonical_json, src, local_id, section ON boundary_declaration_entity
    WHEN NEW.section = 'states'
    BEGIN
      INSERT OR IGNORE INTO state (id, wimp, local_id, name, position)
      VALUES (
        CAST(json_extract(NEW.canonical_json, '$.id') AS INTEGER),
        NEW.src,
        CAST(NEW.local_id AS INTEGER),
        CAST(json_extract(NEW.canonical_json, '$.name') AS TEXT),
        CAST(COALESCE(json_extract(NEW.canonical_json, '$.position'), NEW.local_id) AS INTEGER)
      );
      UPDATE state
         SET wimp = NEW.src,
             local_id = CAST(NEW.local_id AS INTEGER),
             name = CAST(json_extract(NEW.canonical_json, '$.name') AS TEXT),
             position = CAST(COALESCE(json_extract(NEW.canonical_json, '$.position'), NEW.local_id) AS INTEGER)
       WHERE id = CAST(json_extract(NEW.canonical_json, '$.id') AS INTEGER);
    END
  `)

  await sql.unsafe(`
    CREATE TRIGGER boundary_state_declaration_delete
    AFTER DELETE ON boundary_declaration_entity
    WHEN OLD.section = 'states'
    BEGIN
      DELETE FROM state
       WHERE id = CAST(json_extract(OLD.canonical_json, '$.id') AS INTEGER);
    END
  `)
}
