import type {SQL, ReservedSQL} from "bun"
import type {MetaMassDSL} from "@metafor/types/metafor/schema"

type Database = SQL | ReservedSQL

export type BoundaryMassDeclaration = MetaMassDSL & {id: number; wimp: string}
export type BoundaryMassMembership = {atomId: number; declarationId: number; keyId: string; source?: {atomId: number; declarationId: number}}

const keyId = (): string => crypto.randomUUID()

/**
 * Boundary's normalized Mass identities.  There deliberately is no Mass
 * container identity: a membership addresses an Atom declaration directly to
 * one global key/file identity.
 */
export class BoundaryMassStore {
  constructor(private readonly sql: SQL) {}

  async init(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS mass_declaration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wimp TEXT NOT NULL,
        local_key TEXT NOT NULL,
        format TEXT NOT NULL CHECK (format IN ('json', 'binary')),
        mime TEXT NOT NULL,
        label TEXT,
        description TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        UNIQUE (wimp, local_key)
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
        INSERT INTO mass_declaration (wimp, local_key, format, mime, label, description, active)
        VALUES (${wimp}, ${declaration.key}, ${declaration.format}, ${declaration.mime}, ${declaration.label ?? null}, ${declaration.description ?? null}, 1)
        ON CONFLICT (wimp, local_key) DO UPDATE SET
          format = excluded.format, mime = excluded.mime, label = excluded.label,
          description = excluded.description, active = 1
      `
      void position
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
      SELECT id, wimp, local_key AS key, format, mime, label, description
        FROM mass_declaration WHERE wimp = ${wimp} AND active = 1 ORDER BY id
    `
  }

  async authorized(atomId: number, sql: Database = this.sql): Promise<Array<BoundaryMassDeclaration & {keyId: string}>> {
    return await sql<Array<BoundaryMassDeclaration & {keyId: string}>>`
      SELECT declaration.id, declaration.wimp, declaration.local_key AS key,
             declaration.format, declaration.mime, declaration.label, declaration.description,
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

  /**
   * Splitting a direct source has the caller atomically publish the copied
   * file before Boundary makes the new key canonical.
   */
  async detach(childAtom: number, childDeclaration: number, copy: (from: string, to: string) => Promise<void>): Promise<string> {
    return await this.sql.begin(async (sql) => {
      const source = (await sql<Array<{key: string}>>`
        SELECT parent.key FROM mass_key_source AS relation
        JOIN mass_membership AS parent
          ON parent.atom = relation.parent_atom AND parent.declaration = relation.parent_declaration
       WHERE relation.child_atom = ${childAtom} AND relation.child_declaration = ${childDeclaration}
      `)[0]
      if (!source) throw new Error("Mass membership has no direct source to detach")
      const next = keyId()
      await copy(source.key, next)
      await sql`INSERT INTO mass_key (id) VALUES (${next})`
      await sql`UPDATE mass_membership SET key = ${next} WHERE atom = ${childAtom} AND declaration = ${childDeclaration}`
      await sql`DELETE FROM mass_key_source WHERE child_atom = ${childAtom} AND child_declaration = ${childDeclaration}`
      return next
    })
  }
}
