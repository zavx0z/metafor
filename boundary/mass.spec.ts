import {afterEach, describe, expect, test} from "bun:test"
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
    await apply({src: "test/parent", name: "Parent", mass: [{key: "profile", format: "json", mime: "application/json"}]})
    await apply({src: "test/child", name: "Child", mass: [{key: "profile", format: "json", mime: "application/json"}]})
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
    await store.synchronizeDeclarations(boundary.projection.sql, "test/a", [{key: "artifact", format: "binary", mime: "application/octet-stream"}])
    await store.synchronizeDeclarations(boundary.projection.sql, "test/b", [{key: "artifact", format: "binary", mime: "application/octet-stream"}])
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
})
