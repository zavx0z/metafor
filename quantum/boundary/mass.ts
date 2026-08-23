import type {SQL, ReservedSQL} from "bun"
import type {MetaMassDSL} from "@metafor/types/metafor/schema"
import {MassCatalog, type MassFileFormat} from "../../shared/mass.ts"

export type Database = SQL | ReservedSQL

export type BoundaryMassDeclaration = MetaMassDSL & {id: number; localId: number; wimp: string}
export type BoundaryMassMembership = {atomId: number; declarationId: number; keyId: string; source?: {atomId: number; declarationId: number}}
export type BoundaryMassDetachPlan = Readonly<{
  childAtom: number
  childDeclaration: number
  sourceAtom: number
  sourceDeclaration: number
  sourceKey: string
  nextKey: string
  format: MassFileFormat
}>

const keyId = (): string => crypto.randomUUID()

/**
 * Boundary's normalized Mass identities.  There deliberately is no Mass
 * container identity: a membership addresses an Atom declaration directly to
 * one global key/file identity.
 */
export class BoundaryMassStore {
  constructor(private readonly sql: SQL, readonly catalog: MassCatalog) {}

  async init(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS mass_declaration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wimp TEXT NOT NULL,
        local_id INTEGER NOT NULL,
        local_key TEXT NOT NULL,
        format TEXT NOT NULL CHECK (format IN ('json', 'binary')),
        label TEXT,
        description TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        UNIQUE (wimp, local_key),
        UNIQUE (wimp, local_id)
      );
      CREATE TABLE IF NOT EXISTS mass_key (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS mass_membership (
        atom INTEGER NOT NULL REFERENCES atom(id) ON DELETE CASCADE,
        declaration INTEGER NOT NULL REFERENCES mass_declaration(id),
        key TEXT NOT NULL REFERENCES mass_key(id),
        PRIMARY KEY (atom, declaration)
      );
      CREATE TABLE IF NOT EXISTS mass_key_source (
        child_atom INTEGER NOT NULL,
        child_declaration INTEGER NOT NULL,
        parent_atom INTEGER NOT NULL,
        parent_declaration INTEGER NOT NULL,
        PRIMARY KEY (child_atom, child_declaration),
        FOREIGN KEY (child_atom, child_declaration) REFERENCES mass_membership(atom, declaration) ON DELETE CASCADE,
        FOREIGN KEY (parent_atom, parent_declaration) REFERENCES mass_membership(atom, declaration) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS mass_membership_by_key ON mass_membership(key);
    `)
    const columns = await this.sql.unsafe<Array<{name: string}>>("PRAGMA table_info(mass_declaration)")
    if (!columns.some((column) => column.name === "local_id")) {
      await this.sql`ALTER TABLE mass_declaration ADD COLUMN local_id INTEGER`
      await this.sql.unsafe(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY wimp ORDER BY id) AS local_id
            FROM mass_declaration
        )
        UPDATE mass_declaration
           SET local_id = (SELECT ranked.local_id FROM ranked WHERE ranked.id = mass_declaration.id)
      `)
    }
    await this.sql.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS mass_declaration_by_local_id
        ON mass_declaration (wimp, local_id);
    `)
    if (columns.some((column) => column.name === "mime")) {
      await this.sql.unsafe("ALTER TABLE mass_declaration DROP COLUMN mime")
    }
    const formats = new Map<string, MassFileFormat>()
    for (const row of await this.sql<Array<{key: string; format: string}>>`
      SELECT membership.key, declaration.format
        FROM mass_membership AS membership
        JOIN mass_declaration AS declaration ON declaration.id = membership.declaration
       GROUP BY membership.key, declaration.format
    `) {
      if (row.format !== "json" && row.format !== "binary") throw new Error(`Unknown Mass format: ${row.format}`)
      const previous = formats.get(row.key)
      if (previous !== undefined && previous !== row.format) {
        throw new Error(`Mass key ${row.key} is associated with incompatible formats`)
      }
      formats.set(row.key, row.format)
    }
    for (const [id, format] of formats) await this.catalog.migrateLegacy(id, format)
  }

  async synchronizeDeclarations(sql: Database, wimp: string, declarations: readonly MetaMassDSL[]): Promise<void> {
    const seen = new Set<string>()
    for (const [position, declaration] of declarations.entries()) {
      if (!declaration || typeof declaration.key !== "string" || declaration.key.trim() === "") {
        throw new Error("Mass declaration key must be a non-empty string")
      }
      if (seen.has(declaration.key)) throw new Error(`Mass declaration key is duplicated: ${declaration.key}`)
      seen.add(declaration.key)
      await sql`
        INSERT INTO mass_declaration (wimp, local_id, local_key, format, label, description, active)
        VALUES (${wimp}, ${position + 1}, ${declaration.key}, ${declaration.format}, ${declaration.label ?? null}, ${declaration.description ?? null}, 1)
        ON CONFLICT (wimp, local_key) DO UPDATE SET
          local_id = excluded.local_id, format = excluded.format, label = excluded.label,
          description = excluded.description, active = 1
      `
    }
    const keys = [...seen]
    if (keys.length === 0) await sql`UPDATE mass_declaration SET active = 0 WHERE wimp = ${wimp}`
    else {
      const placeholders = keys.map(() => "?").join(", ")
      await sql.unsafe(`UPDATE mass_declaration SET active = 0 WHERE wimp = ? AND local_key NOT IN (${placeholders})`, [wimp, ...keys])
    }
  }

  async ensureIndependentMemberships(sql: Database): Promise<void> {
    for (const row of await sql<Array<{atomId: number; declarationId: number}>>`
      SELECT atom.id AS atomId, mass_declaration.id AS declarationId
        FROM atom JOIN mass_declaration ON mass_declaration.wimp = atom.wimp
       WHERE mass_declaration.active = 1
         AND NOT EXISTS (
           SELECT 1 FROM mass_membership
            WHERE mass_membership.atom = atom.id AND mass_membership.declaration = mass_declaration.id
         )
    `) {
      const id = keyId()
      await sql`INSERT INTO mass_key (id) VALUES (${id})`
      await sql`INSERT INTO mass_membership (atom, declaration, key) VALUES (${Number(row.atomId)}, ${Number(row.declarationId)}, ${id})`
    }
  }

  async memberships(atomId: number): Promise<BoundaryMassMembership[]> {
    const rows = await this.sql<Array<{
      atomId: number; declarationId: number; keyId: string; parentAtom: number | null; parentDeclaration: number | null
    }>>`
      SELECT membership.atom AS atomId, membership.declaration AS declarationId, membership.key AS keyId,
             source.parent_atom AS parentAtom, source.parent_declaration AS parentDeclaration
        FROM mass_membership AS membership
        LEFT JOIN mass_key_source AS source
          ON source.child_atom = membership.atom AND source.child_declaration = membership.declaration
       WHERE membership.atom = ${atomId} ORDER BY membership.declaration
    `
    return rows.map((row) => ({
      atomId: Number(row.atomId), declarationId: Number(row.declarationId), keyId: row.keyId,
      ...(row.parentAtom === null || row.parentDeclaration === null
        ? {} : {source: {atomId: Number(row.parentAtom), declarationId: Number(row.parentDeclaration)}}),
    }))
  }

  async declarations(wimp: string, sql: Database = this.sql): Promise<BoundaryMassDeclaration[]> {
    return await sql<Array<BoundaryMassDeclaration>>`
      SELECT id, local_id AS localId, wimp, local_key AS key, format, label, description
        FROM mass_declaration WHERE wimp = ${wimp} AND active = 1 ORDER BY id
    `
  }

  async authorized(atomId: number, sql: Database = this.sql): Promise<Array<BoundaryMassDeclaration & {keyId: string}>> {
    return await sql<Array<BoundaryMassDeclaration & {keyId: string}>>`
      SELECT declaration.id, declaration.local_id AS localId, declaration.wimp, declaration.local_key AS key,
             declaration.format, declaration.label, declaration.description,
             membership.key AS keyId
        FROM mass_membership AS membership
        JOIN mass_declaration AS declaration ON declaration.id = membership.declaration
       WHERE membership.atom = ${atomId} AND declaration.active = 1
       ORDER BY declaration.id
    `
  }

  /** Reuse one exact key identity; payload equality is never consulted. */
  async source(childAtom: number, childDeclaration: number, parentAtom: number, parentDeclaration: number): Promise<void> {
    await this.sql.begin(async (sql) => {
      await this.sourceIn(sql, childAtom, childDeclaration, parentAtom, parentDeclaration)
    })
  }

  async sourceIn(sql: Database, childAtom: number, childDeclaration: number, parentAtom: number, parentDeclaration: number): Promise<void> {
    const parent = (await sql<Array<{key: string}>>`
      SELECT key FROM mass_membership WHERE atom = ${parentAtom} AND declaration = ${parentDeclaration}
    `)[0]
    if (!parent) throw new Error("Mass source membership does not exist")
    await sql`UPDATE mass_membership SET key = ${parent.key} WHERE atom = ${childAtom} AND declaration = ${childDeclaration}`
    await sql`
      INSERT INTO mass_key_source (child_atom, child_declaration, parent_atom, parent_declaration)
      VALUES (${childAtom}, ${childDeclaration}, ${parentAtom}, ${parentDeclaration})
      ON CONFLICT (child_atom, child_declaration) DO UPDATE SET
        parent_atom = excluded.parent_atom, parent_declaration = excluded.parent_declaration
    `
  }

  /** A direct Matter rebind replaces its exact child mapping, never guesses by expression. */
  async clearSourcesIn(sql: Database, childAtom: number): Promise<void> {
    await sql`DELETE FROM mass_key_source WHERE child_atom = ${childAtom}`
  }

  /** Whole direct bindings share only declarations with identical codecs. */
  async sourceMatchingKeys(sql: Database, childAtom: number, parentAtom: number, key?: string): Promise<void> {
    const rows = await sql<Array<{childDeclaration: number; parentDeclaration: number}>>`
      SELECT child.declaration AS childDeclaration, parent.declaration AS parentDeclaration
        FROM mass_membership AS child
        JOIN mass_declaration AS child_declaration ON child_declaration.id = child.declaration
        JOIN mass_membership AS parent ON parent.atom = ${parentAtom}
        JOIN mass_declaration AS parent_declaration ON parent_declaration.id = parent.declaration
       WHERE child.atom = ${childAtom}
         AND child_declaration.local_key = parent_declaration.local_key
         AND child_declaration.format = parent_declaration.format
         AND (${key ?? null} IS NULL OR child_declaration.local_key = ${key ?? null})
    `
    for (const row of rows) await this.sourceIn(sql, childAtom, Number(row.childDeclaration), parentAtom, Number(row.parentDeclaration))
  }

  async sourceMappedKey(sql: Database, childAtom: number, parentAtom: number, target: string, source: string): Promise<void> {
    const row = (await sql<Array<{childDeclaration: number; parentDeclaration: number; childFormat: string; parentFormat: string}>>`
      SELECT child.declaration AS childDeclaration, parent.declaration AS parentDeclaration,
             child_declaration.format AS childFormat, parent_declaration.format AS parentFormat
        FROM mass_membership AS child JOIN mass_declaration AS child_declaration ON child_declaration.id = child.declaration
        JOIN mass_membership AS parent ON parent.atom = ${parentAtom}
        JOIN mass_declaration AS parent_declaration ON parent_declaration.id = parent.declaration
       WHERE child.atom = ${childAtom} AND child_declaration.local_key = ${target} AND parent_declaration.local_key = ${source}
    `)[0]
    if (!row) throw new Error("Direct Mass mapping references an undeclared key")
    if (row.childFormat !== row.parentFormat) {
      throw new Error("Direct Mass mapping requires matching formats")
    }
    await this.sourceIn(sql, childAtom, Number(row.childDeclaration), parentAtom, Number(row.parentDeclaration))
  }

  async prepareDetach(sql: Database, childAtom: number, childDeclaration: number): Promise<BoundaryMassDetachPlan> {
    const source = (await sql<Array<{sourceAtom: number; sourceDeclaration: number; sourceKey: string; format: MassFileFormat}>>`
      SELECT relation.parent_atom AS sourceAtom, relation.parent_declaration AS sourceDeclaration,
             parent.key AS sourceKey, declaration.format
        FROM mass_key_source AS relation JOIN mass_membership AS parent
          ON parent.atom = relation.parent_atom AND parent.declaration = relation.parent_declaration
        JOIN mass_declaration AS declaration ON declaration.id = relation.child_declaration
       WHERE relation.child_atom = ${childAtom} AND relation.child_declaration = ${childDeclaration}
    `)[0]
    if (!source) throw new Error("Mass membership has no direct source to detach")
    return Object.freeze({
      childAtom,
      childDeclaration,
      sourceAtom: Number(source.sourceAtom),
      sourceDeclaration: Number(source.sourceDeclaration),
      sourceKey: source.sourceKey,
      nextKey: keyId(),
      format: source.format,
    })
  }

  async commitDetachIn(sql: Database, plan: BoundaryMassDetachPlan): Promise<void> {
    const current = (await sql<Array<{key: string}>>`
      SELECT parent.key FROM mass_key_source AS relation JOIN mass_membership AS parent
        ON parent.atom = relation.parent_atom AND parent.declaration = relation.parent_declaration
       WHERE relation.child_atom = ${plan.childAtom} AND relation.child_declaration = ${plan.childDeclaration}
         AND relation.parent_atom = ${plan.sourceAtom} AND relation.parent_declaration = ${plan.sourceDeclaration}
    `)[0]
    if (!current || current.key !== plan.sourceKey) throw new Error("Mass detach source changed before commit")
    await sql`INSERT INTO mass_key (id) VALUES (${plan.nextKey})`
    await sql`UPDATE mass_membership SET key = ${plan.nextKey} WHERE atom = ${plan.childAtom} AND declaration = ${plan.childDeclaration}`
    await sql`DELETE FROM mass_key_source WHERE child_atom = ${plan.childAtom} AND child_declaration = ${plan.childDeclaration}`
  }
}
