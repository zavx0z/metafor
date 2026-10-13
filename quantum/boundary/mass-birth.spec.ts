import {expect, test} from "bun:test"
import {open} from "./sqlite.ts"
import type {DeclarationPath} from "shared/protocol/force/declaration"

test("streamed direct Mass inputs wait for declarations and bind before the first Atom projection", async () => {
  const boundary = await open(":memory:")
  const apply = async (path: DeclarationPath, value: Record<string, unknown>) =>
    await boundary.materialize({parts: [{part: "inflaton", op: "add", path, value, by: "dark", ts: 1}]})
  try {
    await apply("wimp", {src: "test/level", name: "Level"})
    await apply("mass", {wimp: "test/level", id: 1, key: "providers", format: "json"})
    await apply("matter", {wimp: "test/level", id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: "test/consumer",
      massBinding: {data: "/mass/providers", expr: "{registry:_[0]}", directMass: {kind: "keys", entries: [{target: "registry", source: "providers"}]}}})
    const early = await apply("wimp", {src: "test/consumer", name: "Consumer"})
    expect(early?.messages.filter(message => String(message.parts[0].path).startsWith("atom/"))).toHaveLength(0)
    await apply("state", {wimp: "test/consumer", id: 1, name: "ready", position: 0})
    expect((await boundary.initialState()).atoms).toHaveLength(1)
    const ready = await apply("mass", {wimp: "test/consumer", id: 1, key: "registry", format: "json"})
    const atoms = (await boundary.initialState()).atoms
    expect(atoms).toHaveLength(2)
    const parent = atoms.find(atom => atom.wimp === "test/level")!
    const child = atoms.find(atom => atom.wimp === "test/consumer")!
    const expected = (await boundary.projection.mass.memberships(parent.id))[0]!.keyId
    expect((await boundary.projection.mass.memberships(child.id))[0]!.keyId).toBe(expected)
    const first = ready?.messages.find(message => message.parts[0].path === `atom/${child.id}` && message.parts[0].op === "add")?.parts[0].value as {mass: {key: string; keyId: string}[]}
    expect(first.mass).toContainEqual(expect.objectContaining({key: "registry", keyId: expected}))
    await expect(boundary.projection.mass.sourceMappedKey(boundary.projection.sql, child.id, parent.id, "unknown", "providers")).rejects.toThrow("undeclared key")
  } finally {await boundary.close()}
})

test("Mass through a State topology comes from the enclosing Atom, not the child itself", async () => {
  const boundary = await open(":memory:")
  const apply = async (path: DeclarationPath, value: Record<string, unknown>) =>
    await boundary.materialize({parts: [{part: "inflaton", op: "add", path, value, by: "dark", ts: 1}]})
  try {
    await apply("wimp", {src: "test/slot", name: "Slot"})
    await apply("state", {wimp: "test/slot", id: 1, name: "connected", position: 0})
    const rootAtom = (await boundary.initialState()).atoms[0]!.id
    await boundary.materialize({parts: [{part: "photon", op: "replace", path: rootAtom,
      from: "state-connected", ts: 2, value: "connected"}]})
    await apply("mass", {wimp: "test/slot", id: 1, key: "providers", format: "json"})
    await apply("matter", {wimp: "test/slot", id: 1, parent: null, edgeSlot: "root", position: 0, kind: "axion",
      predicateBinding: {data: "/state", expr: '_[0] === "connected"'}})
    await apply("matter", {wimp: "test/slot", id: 2, parent: 1, edgeSlot: "then", position: 0, kind: "wimp", src: "test/executor",
      massBinding: {data: "/mass/providers", expr: "{registry:_[0]}", directMass: {kind: "keys", entries: [{target: "registry", source: "providers"}]}}})
    await apply("wimp", {src: "test/executor", name: "Executor"})
    await apply("mass", {wimp: "test/executor", id: 1, key: "registry", format: "json"})
    const atoms = (await boundary.initialState()).atoms
    const parent = atoms.find(atom => atom.wimp === "test/slot")!
    const child = atoms.find(atom => atom.wimp === "test/executor")!
    expect(child).toBeDefined()
    const source = (await boundary.projection.mass.memberships(parent.id))[0]!
    const target = (await boundary.projection.mass.memberships(child.id))[0]!
    expect(target.keyId).toBe(source.keyId)
    expect(target.source?.atomId).toBe(parent.id)
  } finally {await boundary.close()}
})
