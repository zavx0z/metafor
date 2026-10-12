import {afterAll, beforeAll, expect, test} from "bun:test"
import {Force} from "shared/transport/force"
import type {BoundaryInitialState} from "shared/protocol/boundary/initial"
import type {Particle} from "shared/protocol/force/particle"
import {createForceTestFixture, type ForceTestFixture, type ForceTestClient} from "../dark/force/fixture"
import {prepareMatrixBirthFixture} from "./tests/shared/fixtures"
import {weak$} from "./weak"
import {readMatrixProcessFields} from "./graph/projection"

let fixture: ForceTestFixture
const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
beforeAll(() => {
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
  fixture = createForceTestFixture()
})
afterAll(() => {
  weak$.dispose()
  fixture.close()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

function initial(value = 0): BoundaryInitialState {
  return {
    version: 3, pendingProcessExecutions: [], reactionRelations: [], unfinishedReactionExecutions: [],
    atoms: [17, 18, 19].map((id, index) => ({id, wimp: `input/process-${id}`, state: null,
      values: [{field: 101 + index * 100, valueId: id === 19 ? 1002 : 1001, value}]})),
    declarations: [17, 18, 19].flatMap((id, index) => [
      {src: `input/process-${id}`, section: "fields" as const, localId: "1", value: {id: 101 + index * 100, key: "requestId", type: "number", default: 0, position: 0}},
      {src: `input/process-${id}`, section: "states" as const, localId: "1", value: {id: 501 + index, name: "ready", position: 0}},
      {src: `input/process-${id}`, section: "processes" as const, localId: "1", value: {id: 601 + index, key: "ready", state: "ready"}},
    ]),
  }
}

const send = (client: ForceTestClient, part: Omit<Particle, "ts" | "by">) => fixture.impulse(client, {parts: [{ts: 1, by: part.part === "z" ? "energy" : "boundary", ...part}]})
const wait = async (client: ForceTestClient, predicate: (part: Particle) => boolean, from: number) =>
  (await fixture.waitForMessage(entry => entry.client === client && predicate(entry.message.parts[0]), from)).message.parts[0]
const settle = async () => { await Bun.sleep(0); await Bun.sleep(0) }

for (const precise of [false, true]) for (const alias of [false, true]) {
  const kind = "gluon"
  test(`${kind} ${precise ? "same-F32 distinct-f64" : "integer"} consequence on ${alias ? "child alias" : "origin"} replaces only affected other execution`, async () => {
    const before = precise ? 0.1 : 0
    const next = precise ? 0.10000000150000002 : 1
    if (precise) expect(Math.fround(before)).toBe(Math.fround(next))
    await prepareMatrixBirthFixture(initial(before))
    const start = fixture.messages.length
    const connected = fixture.nextClient("matrix")
    const runtime = await import(`./matrix.ts?process-input=${crypto.randomUUID()}`)
    await runtime.startMatrixForce(() => new Force("matrix"))
    const client = await connected
    const parent = await wait(client, part => part.part === "photon" && part.path === 17, start)
    const child = await wait(client, part => part.part === "photon" && part.path === 18, start)
    await wait(client, part => part.part === "photon" && part.path === 19, start)
    for (const execution of [parent, child]) {
      const from = fixture.messages.length
      send(client, {part: "z", op: "test", path: execution.path, value: {energy: "energy-input", processExecutionId: execution.from}})
      const granted = await wait(client, part => part.part === "z" && part.op === "copy" && part.path === execution.path, from)
      expect(granted.value).toEqual({processExecutionId: execution.from, fields: {[execution.path === 17 ? "101" : "201"]: before}})
    }
    const changed = fixture.messages.length
    send(client, {part: kind, op: "replace", path: alias ? 18 : 17, from: parent.from!,
      value: {fields: {[alias ? "201" : "101"]: next}}})
    const fresh = await wait(client, part => part.part === "photon" && part.op === "test" && part.path === 18, changed)
    expect(fresh.from).not.toBe(child.from)
    expect(fresh.value).toBe("ready")
    await settle()
    expect(fixture.messages.slice(changed).filter(entry => entry.client === client && entry.message.parts[0].part === "photon").map(entry => entry.message.parts[0].path)).toEqual([18])
    const oldClaim = fixture.messages.length
    send(client, {part: "z", op: "test", path: 18, value: {energy: "energy-input", processExecutionId: child.from}})
    await settle()
    expect(fixture.messages.slice(oldClaim).filter(entry => entry.client === client && entry.message.parts[0].part === "z")).toEqual([])
    send(client, {part: kind, op: "replace", path: 18, from: child.from!, value: {fields: {"201": 999}}})
    send(client, {part: "w+", op: "copy", path: 18, from: child.from!, value: {processExecutionId: child.from, processId: 602, energy: "energy-input"}})
    // The valid grant is an ordered transport witness that both stale messages
    // were processed first; a timer alone cannot prove Force queue completion.
    send(client, {part: kind, op: "replace", path: alias ? 17 : 18, from: parent.from!, value: {fields: {[alias ? "101" : "201"]: next}}})
    const newClaim = fixture.messages.length
    send(client, {part: "z", op: "test", path: 18, value: {energy: "energy-input", processExecutionId: fresh.from}})
    const grant = await wait(client, part => part.part === "z" && part.op === "copy" && part.path === 18, newClaim)
    expect(grant.value).toEqual({processExecutionId: fresh.from, fields: {"201": next}})
    expect(fixture.messages.slice(changed).filter(entry => entry.client === client && entry.message.parts[0].part === "photon")).toHaveLength(1)
    const childIndex = runtime.gravity$.getBraneIndexByAtomId(18)!
    expect(runtime.matrix$.branes[childIndex]!.lock).toBeTrue()
    const fieldIndex = runtime.strong$.runtimeFieldIndexByAtomFieldId.get("18\0" + "201")!
    expect(runtime.matrix$.getFieldValue(childIndex, fieldIndex)).toEqual(Math.fround(next))
  })
}

test("Process grant keeps canonical enum, optional, defaults and arrays outside Weak encoding", async () => {
  const source = initial()
  const root = source.atoms[0]!
  for (const [id, key, type, value, defaultValue] of [
    [102, "optional", "string", undefined, undefined],
    [103, "defaulted", "string", undefined, "fallback"],
    [104, "precise", "number", 0.1, 0],
    [105, "false", "boolean", false, true],
    [106, "numbers", "array", [0.1, 0.10000000150000002], []],
    [107, "enum", "enum", {kind: "enum", variant: 802}, {kind: "enum", variant: 801}],
    [108, "null", "string", null, "wrong"],
    [109, "empty", "string", "", "wrong"],
    [110, "emptyArray", "array", [], [1]],
    [111, "defaultNumber", "number", undefined, 0.1],
  ] as const) {
    source.declarations.push({src: root.wimp, section: "fields", localId: String(id), value: {id, key, type,
      ...(type === "array" ? {elementType: "number"} : {}), ...(defaultValue === undefined ? {} : {default: defaultValue})}})
    if (value !== undefined) root.values.push({field: id, valueId: 2000 + id, value})
  }
  source.declarations.push(
    {src: root.wimp, section: "variants", localId: "1", value: {id: 801, field: 107, itemValue: "first", position: 0}},
    {src: root.wimp, section: "variants", localId: "2", value: {id: 802, field: 107, itemValue: "second", position: 1}},
  )
  await prepareMatrixBirthFixture(source)
  const connected = fixture.nextClient("matrix")
  const start = fixture.messages.length
  const runtime = await import(`./matrix.ts?canonical-fields=${crypto.randomUUID()}`)
  await runtime.startMatrixForce(() => new Force("matrix"))
  const client = await connected
  const execution = await wait(client, part => part.part === "photon" && part.path === 17, start)
  const claim = fixture.messages.length
  send(client, {part: "z", op: "test", path: 17, value: {energy: "energy-input", processExecutionId: execution.from}})
  const grant = await wait(client, part => part.part === "z" && part.path === 17, claim)
  expect(grant.value).toEqual({processExecutionId: execution.from, fields: {
    "101": 0, "102": null, "103": "fallback", "104": 0.1, "105": false,
    "106": [0.1, 0.10000000150000002], "107": "second", "108": null, "109": "", "110": [], "111": 0.1,
  }})
  const detached = readMatrixProcessFields(17)
  const numbers = detached["106"] as number[]
  numbers.push(999)
  expect(readMatrixProcessFields(17)["106"]).toEqual([0.1, 0.10000000150000002])
})

test("explicit runtime removal grants null instead of reapplying a Field default", async () => {
  await prepareMatrixBirthFixture(initial())
  const start = fixture.messages.length
  const connected = fixture.nextClient("matrix")
  const runtime = await import(`./matrix.ts?removed-input=${crypto.randomUUID()}`)
  await runtime.startMatrixForce(() => new Force("matrix"))
  const client = await connected
  const previous = await wait(client, part => part.part === "photon" && part.path === 19, start)
  const from = fixture.messages.length
  send(client, {part: "gluon", op: "remove", path: 19, from: "boundary:remove", value: {fields: {"301": null}}})
  const fresh = await wait(client, part => part.part === "photon" && part.path === 19, from)
  expect(fresh.from).not.toBe(previous.from)
  const claim = fixture.messages.length
  send(client, {part: "z", op: "test", path: 19, value: {energy: "energy-input", processExecutionId: fresh.from}})
  const grant = await wait(client, part => part.part === "z" && part.path === 19, claim)
  expect(grant.value).toEqual({processExecutionId: fresh.from, fields: {"301": null}})
})
