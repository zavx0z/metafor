import {SQL} from "bun"
import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {open, type BoundaryDatabase} from "./sqlite.ts"

describe("Boundary Mass relations", () => {
  let boundary: BoundaryDatabase | undefined

  afterEach(async () => {
    await boundary?.close()
    boundary = undefined
  })

  test("keeps declaration identity separate from global key identity and records direct source", async () => {
    boundary = await open(":memory:")
    const apply = async (value: Record<string, unknown>) => await boundary!.materialize({parts: [{
      part: "inflaton", op: "add", path: "wimp", ts: 1, value,
    }]})
    await apply({src: "test/parent", name: "Parent", mass: [{key: "profile", format: "json"}]})
    await apply({src: "test/child", name: "Child", mass: [{key: "profile", format: "json"}]})
    await boundary.projection.mass.ensureIndependentMemberships(boundary.projection.sql)

    const rows = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom ORDER BY id
    `
    const parent = rows.find((row) => row.wimp === "test/parent")!.id
    const child = rows.find((row) => row.wimp === "test/child")!.id
    const parentMembership = (await boundary.projection.mass.memberships(parent))[0]!
    const childMembership = (await boundary.projection.mass.memberships(child))[0]!

    expect(parentMembership.declarationId).not.toBe(childMembership.declarationId)
    expect(parentMembership.keyId).not.toBe(childMembership.keyId)
    await boundary.projection.mass.source(child, childMembership.declarationId, parent, parentMembership.declarationId)
    expect((await boundary.projection.mass.memberships(child))[0]).toEqual({
      atomId: child, declarationId: childMembership.declarationId, keyId: parentMembership.keyId,
      source: {atomId: parent, declarationId: parentMembership.declarationId},
    })
  })

  test("detach publishes a new key only after the requested atomic copy", async () => {
    boundary = await open(":memory:")
    const store = boundary.projection.mass
    await boundary.projection.sql`INSERT INTO wimp (src, name, desc) VALUES (${"test/a"}, ${"A"}, NULL), (${"test/b"}, ${"B"}, NULL)`
    await store.synchronizeDeclarations(boundary.projection.sql, "test/a", [{key: "artifact", format: "binary"}])
    await store.synchronizeDeclarations(boundary.projection.sql, "test/b", [{key: "artifact", format: "binary"}])
    await boundary.projection.sql`INSERT INTO atom (wimp, parent_atom, parent_topology, position) VALUES (${"test/a"}, NULL, NULL, 0), (${"test/b"}, NULL, NULL, 0)`
    await store.ensureIndependentMemberships(boundary.projection.sql)
    const atoms = await boundary.projection.sql<Array<{id: number; wimp: string}>>`SELECT id, wimp FROM atom ORDER BY id DESC LIMIT 2`
    const parent = atoms.find((row) => row.wimp === "test/a")!.id
    const child = atoms.find((row) => row.wimp === "test/b")!.id
    const parentMember = (await store.memberships(parent))[0]!
    const childMember = (await store.memberships(child))[0]!
    await store.source(child, childMember.declarationId, parent, parentMember.declarationId)
    const plan = await store.prepareDetach(boundary.projection.sql, child, childMember.declarationId)
    expect(plan.sourceKey).toBe(parentMember.keyId)
    await boundary.projection.sql.begin(async (tx) => await store.commitDetachIn(tx, plan))
    expect((await store.memberships(child))[0]).toEqual({atomId: child, declarationId: childMember.declarationId, keyId: plan.nextKey})
  })

  test("drops legacy Mass MIME metadata when reopening Boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-mass-mime-"))
    const filename = join(directory, "boundary.sqlite")
    try {
      boundary = await open(filename)
      await boundary.close()
      boundary = undefined

      const legacy = new SQL(`sqlite://${filename}`)
      await legacy.unsafe("ALTER TABLE mass_declaration ADD COLUMN mime TEXT NOT NULL DEFAULT 'application/octet-stream'")
      await legacy.close()

      boundary = await open(filename)
      const columns = await boundary.projection.sql.unsafe<Array<{name: string}>>("PRAGMA table_info(mass_declaration)")
      expect(columns.map((column) => column.name)).not.toContain("mime")
    } finally {
      await boundary?.close()
      boundary = undefined
      await rm(directory, {recursive: true, force: true})
    }
  })
})

test("directory CHECK migration preserves old IDs, relationships, indexes and AUTOINCREMENT high-water mark", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-mass-directory-migration-"))
  const filename = join(directory, "boundary.sqlite")
  let database: BoundaryDatabase | undefined
  try {
    database = await open(filename)
    for (const src of ["parent", "child"]) await database.materialize({parts: [{part: "inflaton", op: "add", path: "wimp", ts: 1,
      value: {src, name: src, mass: [{key: "stats", format: "json"}, {key: "payload", format: "binary"}]}}]})
    const atoms = await database.projection.sql<Array<{id: number; wimp: string}>>`SELECT id,wimp FROM atom ORDER BY id`
    const parent = atoms.find(atom => atom.wimp === "parent")!.id
    const child = atoms.find(atom => atom.wimp === "child")!.id
    const source = (await database.projection.mass.memberships(parent))[0]!
    const target = (await database.projection.mass.memberships(child))[0]!
    await database.projection.mass.source(child, target.declarationId, parent, source.declarationId)
    const before = await database.projection.sql.unsafe("SELECT * FROM mass_membership ORDER BY atom,declaration")
    const sources = await database.projection.sql.unsafe("SELECT * FROM mass_key_source")
    await database.close()
    database = undefined

    const legacy = new SQL(`sqlite://${filename}`)
    await legacy.unsafe("PRAGMA foreign_keys=OFF")
    const definition = (await legacy<Array<{sql: string}>>`SELECT sql FROM sqlite_master WHERE name = ${"mass_declaration"}`)[0]!.sql
    await legacy.begin(async tx => {
      await tx.unsafe(definition.replace("mass_declaration", "mass_declaration_legacy").replace(", 'directory'", ""))
      await tx.unsafe("INSERT INTO mass_declaration_legacy SELECT * FROM mass_declaration")
      await tx.unsafe("DROP TABLE mass_declaration")
      await tx.unsafe("ALTER TABLE mass_declaration_legacy RENAME TO mass_declaration")
      await tx.unsafe("CREATE INDEX mass_fixture_active ON mass_declaration(active,id)")
      await tx`UPDATE sqlite_sequence SET seq = ${777} WHERE name = ${"mass_declaration"}`
    })
    await legacy.close()

    database = await open(filename)
    expect(await database.projection.sql.unsafe("SELECT * FROM mass_membership ORDER BY atom,declaration")).toEqual(before)
    expect(await database.projection.sql.unsafe("SELECT * FROM mass_key_source")).toEqual(sources)
    expect(await database.projection.sql.unsafe("PRAGMA foreign_key_check")).toHaveLength(0)
    expect(Number((await database.projection.sql.unsafe<Array<{foreign_keys: number}>>("PRAGMA foreign_keys"))[0]!.foreign_keys)).toBe(1)
    const indexes = await database.projection.sql<Array<{name: string}>>`SELECT name FROM sqlite_master WHERE type = ${"index"} AND tbl_name = ${"mass_declaration"}`
    expect(indexes.map(index => index.name)).toContain("mass_fixture_active")
    await database.projection.mass.synchronizeDeclarations(database.projection.sql, "parent", [
      {key: "stats", format: "json"}, {key: "payload", format: "binary"}, {key: "workspace", format: "directory"},
    ])
    await database.projection.mass.ensureIndependentMemberships(database.projection.sql)
    const workspace = (await database.projection.mass.authorized(parent)).find(item => item.key === "workspace")!
    expect(workspace.format).toBe("directory")
    expect(workspace.id).toBeGreaterThan(777)
    await database.projection.mass.synchronizeDeclarations(database.projection.sql, "child", [
      {key: "stats", format: "json"}, {key: "payload", format: "binary"}, {key: "workspace", format: "directory"},
    ])
    await database.projection.mass.ensureIndependentMemberships(database.projection.sql)
    const childDirectory = (await database.projection.mass.authorized(child)).find(item => item.key === "workspace")!
    await database.projection.mass.source(child, childDirectory.id, parent, workspace.id)
    const stable = await database.projection.mass.memberships(child)
    await expect(database.projection.mass.prepareDetach(database.projection.sql, child, childDirectory.id)).rejects.toThrow("temporarily unsupported")
    expect(await database.projection.mass.memberships(child)).toEqual(stable)
  } finally {await database?.close(); await rm(directory, {recursive: true, force: true})}
})

test("empty legacy Mass table keeps deleted-ID high-water and refuses unexpected triggers without disabling FK", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-mass-empty-migration-"))
  const filename = join(directory, "boundary.sqlite")
  const database = await open(filename)
  const sql = database.projection.sql
  try {
    await sql`INSERT INTO mass_declaration (id,wimp,local_id,local_key,format,active) VALUES (${777}, ${"fixture"}, ${1}, ${"deleted"}, ${"json"}, ${1})`
    await sql`DELETE FROM mass_declaration`
    const definition = (await sql<Array<{sql: string}>>`SELECT sql FROM sqlite_master WHERE name = ${"mass_declaration"}`)[0]!.sql
    await sql.unsafe("PRAGMA foreign_keys=OFF")
    await sql.begin(async tx => {
      await tx.unsafe(definition.replace("mass_declaration", "mass_declaration_old").replace(", 'directory'", ""))
      await tx.unsafe("DROP TABLE mass_declaration")
      await tx.unsafe("ALTER TABLE mass_declaration_old RENAME TO mass_declaration")
      await tx`DELETE FROM sqlite_sequence WHERE name = ${"mass_declaration"}`
      await tx`INSERT INTO sqlite_sequence (name,seq) VALUES (${"mass_declaration"}, ${777})`
      await tx.unsafe("CREATE TRIGGER mass_fixture_trigger AFTER INSERT ON mass_declaration BEGIN SELECT 1; END")
    })
    await sql.unsafe("PRAGMA foreign_keys=ON")
    await expect(database.projection.mass.init()).rejects.toThrow("unexpected triggers")
    expect(Number((await sql.unsafe<Array<{foreign_keys: number}>>("PRAGMA foreign_keys"))[0]!.foreign_keys)).toBe(1)
    expect((await sql<Array<{sql: string}>>`SELECT sql FROM sqlite_master WHERE name = ${"mass_declaration"}`)[0]!.sql).not.toContain("'directory'")
    expect(await sql<Array<{name: string}>>`SELECT name FROM sqlite_master WHERE type = ${"trigger"} AND name = ${"mass_fixture_trigger"}`).toHaveLength(1)
    await sql.unsafe("DROP TRIGGER mass_fixture_trigger")
    await database.projection.mass.init()
    await database.projection.mass.synchronizeDeclarations(sql, "fixture", [{key: "workspace", format: "directory"}])
    const rows = await sql<Array<{id: number}>>`SELECT id FROM mass_declaration`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBeGreaterThan(777)
    expect(Number((await sql.unsafe<Array<{foreign_keys: number}>>("PRAGMA foreign_keys"))[0]!.foreign_keys)).toBe(1)
    expect(await sql.unsafe("PRAGMA foreign_key_check")).toHaveLength(0)
  } finally {await database.close(); await rm(directory, {recursive: true, force: true})}
})

test("streamed file-directory conversion fails before canonical membership changes", async () => {
  const database = await open(":memory:")
  try {
    await database.materialize({parts: [{part: "inflaton", op: "add", path: "wimp", ts: 1, value: {src: "fixture", name: "Fixture", mass: [{key: "stats", format: "json"}]}}]})
    const atom = (await database.projection.sql<Array<{id: number}>>`SELECT id FROM atom`)[0]!.id
    const before = await database.projection.mass.memberships(atom)
    await expect(database.materialize({parts: [{part: "inflaton", op: "replace", path: "mass", ts: 2, value: {wimp: "fixture", id: 1, key: "stats", format: "directory"}}]})).rejects.toThrow("format conversion is not supported")
    expect(await database.projection.mass.memberships(atom)).toEqual(before)
    expect((await database.projection.mass.authorized(atom))[0]!.format).toBe("json")
  } finally {await database.close()}
})
