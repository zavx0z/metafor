import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {forceReplayPath} from "@metafor/types/force/replay"
import type {MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {createForceTestFixture, type ForceTestFixture} from "force/fixture"

const dsl = ({
  name,
  fields = [],
  states = [],
  matter,
  mass,
  bulk,
}: {
  name: string
  fields?: Record<string, unknown>[]
  states?: Record<string, unknown>[]
  matter?: MatterParticle[]
  mass?: Record<string, unknown>
  bulk?: {view: string}
}): MetaDSL => ({
  name,
  fields,
  superposition: states,
  matter,
  mass,
  bulk,
}) as unknown as MetaDSL

const loader = (declarations: Map<string, MetaDSL>) => async (src: string): Promise<MetaDSL> => {
  const declaration = declarations.get(src)
  if (!declaration) throw new Error(`Missing test declaration: ${src}`)
  return structuredClone(declaration)
}

describe("Dark incremental Inflaton projection", () => {
  let fixture: ForceTestFixture
  let matter: typeof import("./dark.ts").matter

  beforeAll(async () => {
    fixture = createForceTestFixture()
    ;({matter} = await import("./dark.ts"))
    await fixture.waitForClient("dark", 5_000)
    await fixture.waitForMessage(
      ({domain, message}) => domain === "dark" && message.parts[0]?.part === "z" &&
        message.parts[0]?.op === "test" && String(message.parts[0]?.path).startsWith("force/replay/dark/"),
      0,
      5_000,
    )
  })

  afterAll(() => fixture.close())

  const run = async (root: string, action: () => Promise<void>): Promise<ForceMessage[]> => {
    const fromIndex = fixture.messages.length
    await action()
    await fixture.waitForMessage(
      ({domain, message}) => domain === "dark" &&
        message.parts.length === 1 &&
        message.parts[0]?.part === "inflaton" &&
        message.parts[0]?.op === "test" &&
        message.parts[0]?.path === root,
      fromIndex,
      5_000,
    )
    return fixture.messages.slice(fromIndex)
      .filter(({domain}) => domain === "dark")
      .map(({message}) => message)
  }

  const particles = (messages: ForceMessage[]): Array<Omit<Particle, "ts" | "by">> => messages.map((message) => {
    expect(message.parts).toHaveLength(1)
    const {ts, by, ...particle} = message.parts[0]!
    expect(Number.isSafeInteger(ts)).toBe(true)
    expect(by).toBe("dark")
    return particle
  })

  test("agent Meta add is applied locally and re-emitted by Dark with the original timestamp", async () => {
    const fromIndex = fixture.messages.length
    const ts = 1_700_000_000_123
    fixture.impulse("dark", {
      parts: [{
        part: "inflaton",
        op: "add",
        path: "capsule/meta",
        by: "agent",
        ts,
        value: {name: "Capsule"},
      }],
    })

    const emitted = await fixture.waitForMessage(
      ({domain, message}) => domain === "dark" &&
        message.parts[0]?.part === "inflaton" &&
        message.parts[0].path === "capsule/meta" &&
        message.parts[0].by === "dark",
      fromIndex,
      5_000,
    )

    expect(emitted.message).toEqual({
      parts: [{
        part: "inflaton",
        op: "add",
        path: "capsule/meta",
        by: "dark",
        ts,
        value: {name: "Capsule"},
      }],
    })
    const rootRequest = await fixture.waitForMessage(
      ({domain, message}) => domain === "dark" &&
        message.parts[0]?.part === "inflaton" &&
        message.parts[0].op === "test" &&
        message.parts[0].path === "capsule",
      fromIndex,
      5_000,
    )
    expect(rootRequest.message).toEqual({
      parts: [{part: "inflaton", op: "test", path: "capsule", by: "dark", ts}],
    })
  })

  test("cold read emits one add impulse per entity in dependency and root-first order", async () => {
    const root = "test/dark-cold-root"
    const child = "test/dark-cold-child"
    const declarations = new Map<string, MetaDSL>([
      [root, dsl({
        name: "Root",
        fields: [
          {key: "mode", type: "enum", values: ["idle", "ready"], label: "Mode"},
          {key: "title", type: "string"},
        ],
        states: [
          {name: "idle", transitions: {ready: {mode: {eq: "ready"}}}},
          {name: "ready"},
        ],
        matter: [{kind: "wimp", src: child}],
        mass: {ready: true},
        bulk: {view: ".root {}"},
      })],
      [child, dsl({name: "Child", fields: [{key: "label", type: "string"}]})],
    ])

    const result = particles(await run(root, () => matter(root, loader(declarations))))
    const marker = result.at(-1)!
    const additions = result.slice(0, -1)

    expect(marker).toEqual({part: "inflaton", op: "test", path: root})
    expect(additions.every((part) => part.part === "inflaton" && part.op === "add")).toBe(true)
    expect(additions.map((part) => part.path).slice(0, 8)).toEqual([
      `${root}/meta`,
      `${root}/fields/1`,
      `${root}/fields/2`,
      `${root}/variants/1`,
      `${root}/variants/2`,
      `${root}/states/1`,
      `${root}/states/2`,
      `${root}/transitions/1`,
    ])
    expect(additions.find((part) => part.path === `${root}/conditions/1`)?.value).toEqual({
      transition: "1",
      field: "1",
      position: 0,
      predicate: {eq: "ready"},
    })

    const rootMatter = additions.findIndex((part) => part.path === `${root}/matter/1`)
    const childMeta = additions.findIndex((part) => part.path === `${child}/meta`)
    expect(rootMatter).toBeGreaterThan(-1)
    expect(childMeta).toBeGreaterThan(-1)
    expect(rootMatter).toBeGreaterThan(childMeta)
    expect(additions.some((part) => part.path === root)).toBe(false)
    expect(additions.some((part) => isSectionSnapshot(part.value))).toBe(false)
  })

  test("repeated reads skip unchanged subtrees and replace only changed properties", async () => {
    const root = "test/dark-diff-root"
    const child = "test/dark-diff-child"
    const declarations = new Map<string, MetaDSL>([
      [root, dsl({
        name: "Root",
        fields: [
          {key: "title", type: "string", label: "Before"},
          {key: "count", type: "number", label: "Count"},
        ],
        matter: [{kind: "wimp", src: child}],
      })],
      [child, dsl({name: "Child", fields: [{key: "stable", type: "boolean"}]})],
    ])
    const read = loader(declarations)
    await run(root, () => matter(root, read))

    declarations.set(root, dsl({
      name: "Root",
      fields: [
        {key: "title", type: "string", label: "After"},
        {key: "count", type: "number", label: "Count"},
      ],
      matter: [{kind: "wimp", src: child}],
    }))
    const changed = particles(await run(root, () => matter(root, read)))

    expect(changed).toEqual([
      {
        part: "inflaton",
        op: "replace",
        path: `${root}/fields/1`,
        value: {label: "After"},
      },
      {part: "inflaton", op: "test", path: root},
    ])
    expect(changed.some((part) => String(part.path).startsWith(`${child}/`))).toBe(false)
    expect(changed.some((part) => part.path === `${root}/fields/2`)).toBe(false)

    expect(particles(await run(root, () => matter(root, read)))).toEqual([
      {part: "inflaton", op: "test", path: root},
    ])
  })

  test("appends and removes one entity without changing existing identity", async () => {
    const root = "test/dark-identity"
    const declarations = new Map<string, MetaDSL>([
      [root, dsl({
        name: "Identity",
        fields: [
          {key: "first", type: "string"},
          {key: "second", type: "number"},
        ],
      })],
    ])
    const read = loader(declarations)
    await run(root, () => matter(root, read))

    declarations.set(root, dsl({
      name: "Identity",
      fields: [
        {key: "first", type: "string"},
        {key: "second", type: "number"},
        {key: "third", type: "boolean"},
      ],
    }))
    expect(particles(await run(root, () => matter(root, read)))).toEqual([
      {
        part: "inflaton",
        op: "add",
        path: `${root}/fields/3`,
        value: {key: "third", type: "boolean"},
      },
      {part: "inflaton", op: "test", path: root},
    ])

    declarations.set(root, dsl({
      name: "Identity",
      fields: [
        {key: "first", type: "string"},
        {key: "second", type: "number"},
      ],
    }))
    const removed = particles(await run(root, () => matter(root, read)))
    expect(removed).toEqual([
      {part: "inflaton", op: "remove", path: `${root}/fields/3`},
      {part: "inflaton", op: "test", path: root},
    ])
    expect(Object.hasOwn(removed[0]!, "value")).toBe(false)
  })

  test("optional singleton declarations use add and remove instead of null placeholders", async () => {
    const root = "test/dark-singletons"
    const declarations = new Map<string, MetaDSL>([[root, dsl({name: "Singletons"})]])
    const read = loader(declarations)
    const cold = particles(await run(root, () => matter(root, read)))
    expect(cold.some((part) => part.path === `${root}/mass` || part.path === `${root}/bulk`)).toBe(false)

    declarations.set(root, dsl({
      name: "Singletons",
      mass: {cache: true},
      bulk: {view: ".single {}"},
    }))
    expect(particles(await run(root, () => matter(root, read)))).toEqual([
      {part: "inflaton", op: "add", path: `${root}/mass`, value: {cache: true}},
      {part: "inflaton", op: "add", path: `${root}/bulk`, value: {view: ".single {}"}},
      {part: "inflaton", op: "test", path: root},
    ])

    declarations.set(root, dsl({name: "Singletons"}))
    expect(particles(await run(root, () => matter(root, read)))).toEqual([
      {part: "inflaton", op: "remove", path: `${root}/bulk`},
      {part: "inflaton", op: "remove", path: `${root}/mass`},
      {part: "inflaton", op: "test", path: root},
    ])
  })

  test("removing a branch detaches parent edges before child declarations", async () => {
    const root = "test/dark-tree-root"
    const child = "test/dark-tree-child"
    const leaf = "test/dark-tree-leaf"
    const declarations = new Map<string, MetaDSL>([
      [root, dsl({name: "Root", matter: [{kind: "wimp", src: child}]})],
      [child, dsl({name: "Child", matter: [{kind: "wimp", src: leaf}]})],
      [leaf, dsl({name: "Leaf"})],
    ])
    const read = loader(declarations)
    const added = particles(await run(root, () => matter(root, read)))
    expect(added.findIndex((part) => part.path === `${root}/meta`)).toBeLessThan(
      added.findIndex((part) => part.path === `${child}/meta`),
    )
    expect(added.findIndex((part) => part.path === `${child}/meta`)).toBeLessThan(
      added.findIndex((part) => part.path === `${leaf}/meta`),
    )

    declarations.set(root, dsl({name: "Root", matter: []}))
    const removed = particles(await run(root, () => matter(root, read))).filter((part) => part.op === "remove")
    const rootEdge = removed.findIndex((part) => part.path === `${root}/matter/1`)
    const childEdge = removed.findIndex((part) => part.path === `${child}/matter/1`)
    const firstLeaf = removed.findIndex((part) => String(part.path).startsWith(`${leaf}/`))
    const firstChildDeclaration = removed.findIndex((part) =>
      String(part.path).startsWith(`${child}/`) && part.path !== `${child}/matter/1`
    )

    expect(rootEdge).toBeGreaterThan(-1)
    expect(childEdge).toBeGreaterThan(rootEdge)
    expect(firstLeaf).toBeGreaterThan(childEdge)
    expect(firstChildDeclaration).toBeGreaterThan(firstLeaf)
  })

  test("retargeting a parent edge creates the new child before replacing the edge and removing the old child", async () => {
    const root = "test/dark-retarget-root"
    const oldChild = "test/dark-retarget-old"
    const newChild = "test/dark-retarget-new"
    const declarations = new Map<string, MetaDSL>([
      [root, dsl({name: "Root", matter: [{kind: "wimp", src: oldChild}]})],
      [oldChild, dsl({name: "Old"})],
      [newChild, dsl({name: "New"})],
    ])
    const read = loader(declarations)
    await run(root, () => matter(root, read))

    declarations.set(root, dsl({name: "Root", matter: [{kind: "wimp", src: newChild}]}))
    const changed = particles(await run(root, () => matter(root, read)))
    const newMeta = changed.findIndex((part) => part.path === `${newChild}/meta` && part.op === "add")
    const edge = changed.findIndex((part) => part.path === `${root}/matter/1` && part.op === "replace")
    const oldMeta = changed.findIndex((part) => part.path === `${oldChild}/meta` && part.op === "remove")

    expect(newMeta).toBeGreaterThan(-1)
    expect(edge).toBeGreaterThan(newMeta)
    expect(oldMeta).toBeGreaterThan(edge)
    expect(changed[edge]).toEqual({
      part: "inflaton",
      op: "replace",
      path: `${root}/matter/1`,
      value: {src: newChild},
    })
  })

  test("shared child remains projected while another root still owns it", async () => {
    const rootA = "test/dark-owner-a"
    const rootB = "test/dark-owner-b"
    const child = "test/dark-shared-child"
    const declarations = new Map<string, MetaDSL>([
      [rootA, dsl({name: "A", matter: [{kind: "wimp", src: child}]})],
      [rootB, dsl({name: "B", matter: [{kind: "wimp", src: child}]})],
      [child, dsl({name: "Shared", fields: [{key: "value", type: "string"}]})],
    ])
    const read = loader(declarations)
    await run(rootA, () => matter(rootA, read))
    const secondRoot = particles(await run(rootB, () => matter(rootB, read)))
    expect(secondRoot.some((part) => String(part.path).startsWith(`${child}/`))).toBe(false)

    declarations.set(rootA, dsl({name: "A", matter: []}))
    const detached = particles(await run(rootA, () => matter(rootA, read)))
    expect(detached.some((part) => String(part.path).startsWith(`${child}/`))).toBe(false)
    expect(detached).toContainEqual({part: "inflaton", op: "remove", path: `${rootA}/matter/1`})
  })

  test("boundary reconnect replays the local projection as granular idempotent adds", async () => {
    const fromIndex = fixture.messages.length
    fixture.impulse("dark", {
      parts: [{part: "z", op: "test", path: forceReplayPath("boundary", "boundary-reconnect"), by: "force", ts: 1}],
    })
    await fixture.waitForMessage(
      ({domain, message}) => domain === "dark" && message.parts[0]?.part === "inflaton" &&
        message.parts[0]?.op === "test" && message.parts[0]?.path === "test/dark-owner-b",
      fromIndex,
      5_000,
    )
    const replay = particles(fixture.messages.slice(fromIndex)
      .filter(({domain}) => domain === "dark")
      .map(({message}) => message))
    const additions = replay.filter((part) => part.op === "add")

    expect(additions.length).toBeGreaterThan(0)
    expect(additions.every((part) => part.part === "inflaton" && part.op === "add")).toBe(true)
    expect(additions.some((part) => part.path === "test/dark-diff-root/fields/1" &&
      isRecord(part.value) && part.value.label === "After")).toBe(true)
    expect(replay.some((part) => part.op === "replace" || part.op === "remove")).toBe(false)
    expect(replay.findIndex((part) => part.path === "test/dark-retarget-new/meta")).toBeLessThan(
      replay.findIndex((part) => part.path === "test/dark-retarget-root/matter/1"),
    )
    expect(replay.findLastIndex((part) => part.op === "add")).toBeLessThan(
      replay.findIndex((part) => part.part === "inflaton" && part.op === "test"),
    )
  })
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isSectionSnapshot = (value: unknown): boolean =>
  isRecord(value) && ["fields", "variants", "states", "transitions", "conditions", "processes", "reactions", "matter"]
    .some((section) => Object.hasOwn(value, section))
