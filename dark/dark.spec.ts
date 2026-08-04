import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {DeclarationPath} from "shared/protocol/force/declaration"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {Force} from "shared/transport/force"
import type {MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {createForceTestFixture, type ForceTestFixture} from "./force/fixture.ts"

const dsl = ({
  name,
  fields = [],
  states = [],
  matter,
  mass,
  energy,
  bulk,
}: {
  name: string
  fields?: Record<string, unknown>[]
  states?: Record<string, unknown>[]
  matter?: MatterParticle[]
  mass?: Record<string, unknown>
  energy?: Record<string, unknown>
  bulk?: {view: string}
}): MetaDSL => ({
  name,
  fields,
  superposition: states,
  matter,
  mass,
  energy,
  bulk,
}) as unknown as MetaDSL

const loader = (declarations: Map<string, MetaDSL>) => async (src: string): Promise<MetaDSL> => {
  const declaration = declarations.get(src)
  if (!declaration) throw new Error(`Missing test declaration: ${src}`)
  return structuredClone(declaration)
}

type BareParticle = Omit<Particle, "ts" | "by">

const bare = (part: Particle): BareParticle => {
  const {ts, by: _by, ...value} = part
  expect(Number.isSafeInteger(ts)).toBe(true)
  return value
}

const matches = (
  part: BareParticle,
  path: DeclarationPath,
  wimp: string,
  id?: number,
): boolean => part.path === path && isRecord(part.value) && (
  path === "wimp"
    ? part.value.src === wimp
    : part.value.wimp === wimp && part.value.id === id
)

describe("Dark incremental Inflaton projection", () => {
  let fixture: ForceTestFixture
  let applyAuthoredMatterProjection: typeof import("./dark.ts").applyAuthoredMatterProjection
  let applyAuthoredDeclarationProjection: typeof import("./dark.ts").applyAuthoredDeclarationProjection
  let matterParticles: typeof import("./dark.ts").matterParticles
  let reconcileAuthoredMatterProjection: typeof import("./dark.ts").reconcileAuthoredMatterProjection
  let stopRuntime: typeof import("./dark.ts").stopDarkRuntime
  let force: Force

  beforeAll(async () => {
    fixture = createForceTestFixture()
    const dark = await import("./dark.ts")
    applyAuthoredMatterProjection = dark.applyAuthoredMatterProjection
    applyAuthoredDeclarationProjection = dark.applyAuthoredDeclarationProjection
    matterParticles = dark.matterParticles
    reconcileAuthoredMatterProjection = dark.reconcileAuthoredMatterProjection
    stopRuntime = dark.stopDarkRuntime
    force = new Force("dark")
    dark.startDarkRuntime(force)
    await fixture.waitForClient("dark", 5_000)
  })

  afterAll(() => {
    stopRuntime(force)
    fixture.close()
  })

  const read = async (root: string, load: (src: string) => Promise<MetaDSL>): Promise<BareParticle[]> => {
    const result: BareParticle[] = []
    for await (const part of matterParticles(root, load)) result.push(bare(part))
    return result
  }

  const forceParticles = (messages: ForceMessage[]): BareParticle[] => messages.map((message) => {
    expect(message.parts).toHaveLength(1)
    expect(message.parts[0]!.by).toBe("dark")
    return bare(message.parts[0]!)
  })

  test("agent WIMP add is applied locally and re-emitted by Dark with the original timestamp", async () => {
    const fromIndex = fixture.messages.length
    const ts = 1_700_000_000_123
    fixture.impulse("dark", {
      parts: [{
        part: "inflaton",
        op: "add",
        path: "wimp",
        by: "agent",
        ts,
        value: {src: "capsule", name: "Capsule"},
      }],
    })

    const emitted = await fixture.waitForMessage(
      ({domain, message}) => domain === "dark" &&
        message.parts[0]?.part === "inflaton" && message.parts[0].path === "wimp" &&
        isRecord(message.parts[0].value) && message.parts[0].value.src === "capsule" &&
        message.parts[0].by === "dark",
      fromIndex,
      5_000,
    )
    expect(emitted.message).toEqual({parts: [{
      part: "inflaton",
      op: "add",
      path: "wimp",
      by: "dark",
      ts,
      value: {src: "capsule", name: "Capsule", desc: null},
    }]})
    expect(fixture.messages.slice(fromIndex).some(({domain, message}) =>
      domain === "dark" && message.parts[0]?.part === "inflaton" && message.parts[0].op === "test"
    )).toBe(false)
  })

  test("agent root WIMP remove is re-emitted by Dark for Boundary with the original timestamp", async () => {
    const fromIndex = fixture.messages.length
    const ts = 1_700_000_000_124
    fixture.impulse("dark", {
      parts: [{
        part: "inflaton",
        op: "remove",
        path: "wimp",
        by: "agent",
        ts,
        value: {src: "zavx0z/capsule"},
      }],
    })

    const emitted = await fixture.waitForMessage(
      ({domain, message}) => domain === "dark" &&
        message.parts[0]?.part === "inflaton" && message.parts[0].op === "remove" &&
        message.parts[0].path === "wimp" && message.parts[0].by === "dark",
      fromIndex,
      1_000,
    )
    expect(emitted.message).toEqual({parts: [{
      part: "inflaton",
      op: "remove",
      path: "wimp",
      by: "dark",
      ts,
      value: {src: "zavx0z/capsule"},
    }]})
  })

  test("cold read emits categorical entities root-first and the WIMP edge before its child", async () => {
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
        matter: [{
          kind: "wimp",
          src: child,
          massBinding: {
            data: "/mass/cache",
            expr: "{cache: _[0]}",
            directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]},
          },
          energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
        }],
        mass: {ready: true},
        bulk: {view: ".root {}"},
      })],
      [child, dsl({name: "Child", fields: [{key: "label", type: "string"}]})],
    ])
    const additions = await read(root, loader(declarations))

    expect(additions.every((part) => part.part === "inflaton" && part.op === "add")).toBe(true)
    expect(additions.map((part) => part.path).slice(0, 9)).toEqual([
      "wimp", "field", "variant", "variant", "field", "state", "state", "transition", "condition",
    ])
    expect(additions.find((part) => matches(part, "condition", root, 1))?.value).toEqual({
      wimp: root,
      id: 1,
      transition: 1,
      field: 1,
      position: 0,
      predicate: {eq: "ready"},
    })
    const rootMatter = additions.findIndex((part) => matches(part, "matter", root, 1))
    const childWimp = additions.findIndex((part) => matches(part, "wimp", child))
    const childField = additions.findIndex((part) => matches(part, "field", child, 1))
    expect(rootMatter).toBeGreaterThan(-1)
    expect(additions[rootMatter]?.value).toEqual({
      wimp: root,
      id: 1,
      parent: null,
      edgeSlot: "root",
      position: 0,
      kind: "wimp",
      src: child,
      massBinding: {
        data: "/mass/cache",
        expr: "{cache: _[0]}",
        directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]},
      },
      energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
    })
    expect(rootMatter).toBeLessThan(childWimp)
    expect(childWimp).toBeLessThan(childField)
    expect(additions.some((part) => part.op === "test")).toBe(false)
    expect(additions.some((part) => isSectionSnapshot(part.value))).toBe(false)
  })

  test("applies the accepted Matter patch directly and reconciles only reachable declarations", async () => {
    const root = "test/dark-authored-root"
    const child = "test/dark-authored-child"
    const before = new Map<string, MetaDSL>([[root, dsl({name: "Root", bulk: {view: ".root {}"}})]])
    await read(root, loader(before))

    const acceptedAdd = {
      part: "inflaton",
      op: "add",
      path: "matter",
      by: "dark",
      ts: 31,
      value: {
        wimp: root,
        id: 1,
        parent: null,
        edgeSlot: "root",
        position: 0,
        kind: "wimp",
        src: child,
      },
    } as const
    const owningRoot = await applyAuthoredMatterProjection(acceptedAdd)
    const afterAdd = new Map<string, MetaDSL>([
      [root, dsl({name: "Root", matter: [{kind: "wimp", src: child}], bulk: {view: ".root {}"}})],
      [child, dsl({name: "Child", bulk: {view: ".child {}"}})],
    ])
    const additions: BareParticle[] = []
    const reconciliationReads: string[] = []
    await reconcileAuthoredMatterProjection(owningRoot, async (input) => {
      additions.push(bare(input.parts[0]!))
    }, async (src) => {
      reconciliationReads.push(src)
      return await loader(afterAdd)(src)
    })

    expect(owningRoot.root).toBe(root)
    expect(reconciliationReads).toEqual([child])
    expect(additions.some((part) => matches(part, "matter", root, 1))).toBe(false)
    expect(additions.map((part) => [part.op, part.path])).toEqual([
      ["add", "wimp"],
      ["add", "bulk"],
    ])

    const acceptedRemove = {
      part: "inflaton",
      op: "remove",
      path: "matter",
      by: "dark",
      ts: 32,
      value: {wimp: root, id: 1, src: child},
    } as const
    const removalRoot = await applyAuthoredMatterProjection(acceptedRemove)
    const removals: BareParticle[] = []
    await reconcileAuthoredMatterProjection(removalRoot, async (input) => {
      removals.push(bare(input.parts[0]!))
    }, loader(before))

    expect(removals.some((part) => matches(part, "matter", root, 1))).toBe(false)
    expect(removals.map((part) => [part.op, part.path])).toEqual([
      ["remove", "bulk"],
      ["remove", "wimp"],
    ])

    const repeatedRemoval = await applyAuthoredMatterProjection(acceptedRemove)
    const repeatedRemovals: BareParticle[] = []
    await reconcileAuthoredMatterProjection(repeatedRemoval, async (input) => {
      repeatedRemovals.push(bare(input.parts[0]!))
    }, loader(before))
    expect(repeatedRemovals).toEqual([])
  })

  test("applies one accepted Field composition without reading the live world again", async () => {
    const root = "test/dark-authored-field"
    await read(root, loader(new Map([[root, dsl({name: "Root"})]])))

    await applyAuthoredDeclarationProjection({
      part: "inflaton",
      op: "add",
      path: "field",
      by: "dark",
      ts: 41,
      value: {
        wimp: root,
        id: 1,
        key: "mode",
        type: "enum",
        required: false,
        default: "idle",
        variants: [
          {id: 1, position: 0, value: "idle"},
          {id: 2, position: 1, value: "ready"},
        ],
      },
    })
    expect(await read(root, loader(new Map([[root, dsl({
      name: "Root",
      fields: [{key: "mode", type: "enum", default: "idle", values: ["idle", "ready"]}],
    })]])))).toEqual([])

    await applyAuthoredDeclarationProjection({
      part: "inflaton",
      op: "replace",
      path: "field",
      by: "dark",
      ts: 42,
      value: {
        wimp: root,
        id: 1,
        key: "mode",
        type: "enum",
        required: false,
        default: "idle",
        variants: [
          {id: 1, position: 0, value: "idle"},
          {id: 2, position: 1, value: "ready"},
          {id: 3, position: 2, value: "paused"},
        ],
      },
    })
    expect(await read(root, loader(new Map([[root, dsl({
      name: "Root",
      fields: [{key: "mode", type: "enum", default: "idle", values: ["idle", "ready", "paused"]}],
    })]])))).toEqual([])

    await applyAuthoredDeclarationProjection({
      part: "inflaton",
      op: "remove",
      path: "field",
      by: "dark",
      ts: 43,
      value: {wimp: root, id: 1},
    })
    expect(await read(root, loader(new Map([[root, dsl({name: "Root"})]])))).toEqual([])
  })

  test("hydrates a lost source projection once and applies accepted Field patches directly", async () => {
    const root = "test/dark-authored-recovered-field"
    const declarations = new Map<string, MetaDSL>([[root, dsl({name: "Recovered"})]])
    const reads: string[] = []
    const load = async (src: string): Promise<MetaDSL> => {
      reads.push(src)
      return await loader(declarations)(src)
    }
    await applyAuthoredDeclarationProjection({
      part: "inflaton",
      op: "add",
      path: "field",
      by: "dark",
      ts: 44,
      value: {
        wimp: root,
        id: 1,
        key: "mode",
        type: "enum",
        required: false,
        default: "idle",
        variants: [{id: 1, position: 0, value: "idle"}],
      },
    }, load)
    await applyAuthoredDeclarationProjection({
      part: "inflaton",
      op: "replace",
      path: "field",
      by: "dark",
      ts: 45,
      value: {
        wimp: root,
        id: 1,
        key: "mode",
        type: "enum",
        required: false,
        default: "idle",
        variants: [
          {id: 1, position: 0, value: "idle"},
          {id: 2, position: 1, value: "ready"},
        ],
      },
    }, load)

    expect(reads).toEqual([root])
    expect(await read(root, loader(new Map([[root, dsl({
      name: "Recovered",
      fields: [{key: "mode", type: "enum", default: "idle", values: ["idle", "ready"]}],
    })]])))).toEqual([])
  })

  test("seeds an addressed source parent before applying an accepted Matter patch", async () => {
    const root = "test/dark-authored-detached"
    const child = "test/dark-authored-detached-child"
    const declarations = new Map<string, MetaDSL>([[root, dsl({name: "Detached"})]])
    const reads: string[] = []
    const owningRoot = await applyAuthoredMatterProjection({
      part: "inflaton",
      op: "add",
      path: "matter",
      by: "dark",
      ts: 33,
      value: {
        wimp: root,
        id: 1,
        parent: null,
        edgeSlot: "root",
        position: 0,
        kind: "wimp",
        src: child,
      },
    }, async (src) => {
      reads.push(src)
      return await loader(declarations)(src)
    })

    expect(owningRoot.root).toBe(root)
    expect(reads).toEqual([root])
  })

  test("reapplies an accepted move after its final projection state already exists", async () => {
    const root = "test/dark-authored-move-root"
    const nested = "test/dark-authored-move-nested"
    const child = "test/dark-authored-move-child"
    const declarations = new Map<string, MetaDSL>([
      [root, dsl({
        name: "Root",
        matter: [{kind: "wimp", src: nested}, {kind: "wimp", src: child}],
      })],
      [nested, dsl({name: "Nested"})],
      [child, dsl({name: "Child"})],
    ])
    await read(root, loader(declarations))
    const acceptedMove = {
      part: "inflaton",
      op: "move",
      path: "matter",
      by: "dark",
      ts: 34,
      from: `${root}#2`,
      value: {
        wimp: nested,
        id: 1,
        parent: null,
        edgeSlot: "root",
        position: 0,
        kind: "wimp",
        src: child,
      },
    } as const

    const first = await applyAuthoredMatterProjection(acceptedMove)
    await reconcileAuthoredMatterProjection(first, async () => {})
    const repeated = await applyAuthoredMatterProjection(acceptedMove)
    const repeatedParticles: Particle[] = []
    await reconcileAuthoredMatterProjection(repeated, async (input) => {
      repeatedParticles.push(input.parts[0]!)
    })

    expect(repeated).toEqual(first)
    expect(repeatedParticles).toEqual([])
  })

  test("yields the parent WIMP edge before the next WIMP layer starts loading", async () => {
    const root = "test/dark-stream-root"
    const child = "test/dark-stream-child"
    let childStarted = false
    const stream = matterParticles(root, async (src) => {
      if (src === root) return dsl({name: "Streaming root", matter: [{kind: "wimp", src: child}]})
      childStarted = true
      return dsl({name: "Streaming child"})
    })

    const parent = bare((await stream.next()).value!)
    const edge = bare((await stream.next()).value!)
    expect(matches(parent, "wimp", root)).toBe(true)
    expect(matches(edge, "matter", root, 1)).toBe(true)
    expect(childStarted).toBe(false)
    const childWimp = bare((await stream.next()).value!)
    expect(childStarted).toBe(true)
    expect(matches(childWimp, "wimp", child)).toBe(true)
    expect((await stream.next()).done).toBe(true)
  })

  test("yields dependency-free topology and its WIMP edge before loading the target", async () => {
    const root = "test/dark-topology-root"
    const child = "test/dark-topology-child"
    let childStarted = false
    const stream = matterParticles(root, async (src) => {
      if (src === root) return dsl({
        name: "Topology root",
        fields: [{key: "items", type: "array", default: ["one"]}],
        matter: [{
          kind: "macho",
          collectionBinding: {data: "items"},
          children: [{edgeSlot: "child", particle: {kind: "wimp", src: child}}],
        }],
      })
      childStarted = true
      return dsl({name: "Topology child"})
    })

    const ready: BareParticle[] = []
    for (let index = 0; index < 4; index++) ready.push(bare((await stream.next()).value!))
    expect(ready.some((part) => matches(part, "matter", root, 1))).toBe(true)
    expect(ready.some((part) => matches(part, "matter", root, 2))).toBe(true)
    expect(childStarted).toBe(false)
    expect(matches(bare((await stream.next()).value!), "wimp", child)).toBe(true)
    expect(childStarted).toBe(true)
    expect((await stream.next()).done).toBe(true)
  })

  test("reads sibling WIMPs before descendants of the next breadth-first layer", async () => {
    const root = "test/dark-bfs-root"
    const left = "test/dark-bfs-left"
    const right = "test/dark-bfs-right"
    const leaf = "test/dark-bfs-leaf"
    const declarations = new Map<string, MetaDSL>([
      [root, dsl({name: "Root", matter: [{kind: "wimp", src: left}, {kind: "wimp", src: right}]})],
      [left, dsl({name: "Left", matter: [{kind: "wimp", src: leaf}]})],
      [right, dsl({name: "Right"})],
      [leaf, dsl({name: "Leaf"})],
    ])
    const readOrder: string[] = []
    await read(root, async (src) => {
      readOrder.push(src)
      return await loader(declarations)(src)
    })
    expect(readOrder).toEqual([root, left, right, leaf])
  })

  test("repeated reads skip unchanged subtrees and replace one complete entity", async () => {
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
    const load = loader(declarations)
    await read(root, load)
    declarations.set(root, dsl({
      name: "Root",
      fields: [
        {key: "title", type: "string", label: "After"},
        {key: "count", type: "number", label: "Count"},
      ],
      matter: [{kind: "wimp", src: child}],
    }))
    expect(await read(root, load)).toEqual([{
      part: "inflaton",
      op: "replace",
      path: "field",
      value: {wimp: root, id: 1, key: "title", type: "string", label: "After"},
    }])
    expect(await read(root, load)).toEqual([])
  })

  test("appends and removes one entity without changing existing local identities", async () => {
    const root = "test/dark-identity"
    const declarations = new Map<string, MetaDSL>([[root, dsl({
      name: "Identity",
      fields: [{key: "first", type: "string"}, {key: "second", type: "number"}],
    })]])
    const load = loader(declarations)
    await read(root, load)
    declarations.set(root, dsl({
      name: "Identity",
      fields: [
        {key: "first", type: "string"},
        {key: "second", type: "number"},
        {key: "third", type: "boolean"},
      ],
    }))
    expect(await read(root, load)).toEqual([{
      part: "inflaton", op: "add", path: "field",
      value: {wimp: root, id: 3, key: "third", type: "boolean"},
    }])
    declarations.set(root, dsl({
      name: "Identity",
      fields: [{key: "first", type: "string"}, {key: "second", type: "number"}],
    }))
    expect(await read(root, load)).toEqual([{
      part: "inflaton", op: "remove", path: "field", value: {wimp: root, id: 3},
    }])
  })

  test("keeps working Mass and Energy types out of WIMP declarations", async () => {
    const root = "test/dark-singletons"
    const declarations = new Map<string, MetaDSL>([[root, dsl({name: "Singletons"})]])
    const load = loader(declarations)
    expect((await read(root, load)).some((part) => part.path === "mass" || part.path === "bulk")).toBe(false)
    declarations.set(root, dsl({
      name: "Singletons",
      mass: {cache: true},
      energy: {socket: "type-placeholder"},
      bulk: {view: ".single {}"},
    }))
    expect(await read(root, load)).toEqual([
      {part: "inflaton", op: "add", path: "bulk", value: {wimp: root, id: 1, view: ".single {}"}},
    ])
    declarations.set(root, dsl({name: "Singletons"}))
    expect(await read(root, load)).toEqual([
      {part: "inflaton", op: "remove", path: "bulk", value: {wimp: root, id: 1}},
    ])
  })

  test("removing a branch detaches parent Matter before child declarations", async () => {
    const root = "test/dark-tree-root"
    const child = "test/dark-tree-child"
    const leaf = "test/dark-tree-leaf"
    const declarations = new Map<string, MetaDSL>([
      [root, dsl({name: "Root", matter: [{kind: "wimp", src: child}]})],
      [child, dsl({name: "Child", matter: [{kind: "wimp", src: leaf}]})],
      [leaf, dsl({name: "Leaf"})],
    ])
    const load = loader(declarations)
    const added = await read(root, load)
    expect(added.findIndex((part) => matches(part, "matter", root, 1))).toBeLessThan(
      added.findIndex((part) => matches(part, "wimp", child)),
    )
    expect(added.findIndex((part) => matches(part, "matter", child, 1))).toBeLessThan(
      added.findIndex((part) => matches(part, "wimp", leaf)),
    )

    declarations.set(root, dsl({name: "Root", matter: []}))
    const removed = (await read(root, load)).filter((part) => part.op === "remove")
    const rootEdge = removed.findIndex((part) => matches(part, "matter", root, 1))
    const childEdge = removed.findIndex((part) => matches(part, "matter", child, 1))
    const leafWimp = removed.findIndex((part) => matches(part, "wimp", leaf))
    const childWimp = removed.findIndex((part) => matches(part, "wimp", child))
    expect(rootEdge).toBeGreaterThan(-1)
    expect(childEdge).toBeGreaterThan(rootEdge)
    expect(leafWimp).toBeGreaterThan(childEdge)
    expect(childWimp).toBeGreaterThan(leafWimp)
  })

  test("retargeting emits the changed edge before reading the new child and then removes the old child", async () => {
    const root = "test/dark-retarget-root"
    const oldChild = "test/dark-retarget-old"
    const newChild = "test/dark-retarget-new"
    const declarations = new Map<string, MetaDSL>([
      [root, dsl({name: "Root", matter: [{kind: "wimp", src: oldChild}]})],
      [oldChild, dsl({name: "Old"})],
      [newChild, dsl({name: "New"})],
    ])
    const load = loader(declarations)
    await read(root, load)
    declarations.set(root, dsl({name: "Root", matter: [{kind: "wimp", src: newChild}]}))
    const changed = await read(root, load)
    const edge = changed.findIndex((part) => matches(part, "matter", root, 1) && part.op === "replace")
    const newWimp = changed.findIndex((part) => matches(part, "wimp", newChild) && part.op === "add")
    const oldWimp = changed.findIndex((part) => matches(part, "wimp", oldChild) && part.op === "remove")
    expect(edge).toBeGreaterThan(-1)
    expect(edge).toBeLessThan(newWimp)
    expect(newWimp).toBeLessThan(oldWimp)
    expect(changed[edge]?.value).toEqual({
      wimp: root, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: newChild,
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
    const load = loader(declarations)
    await read(rootA, load)
    const secondRoot = await read(rootB, load)
    expect(secondRoot.some((part) => matches(part, "wimp", child) || matches(part, "field", child, 1))).toBe(false)
    declarations.set(rootA, dsl({name: "A", matter: []}))
    const detached = await read(rootA, load)
    expect(detached.some((part) => matches(part, "wimp", child) || matches(part, "field", child, 1))).toBe(false)
    expect(detached).toContainEqual({
      part: "inflaton", op: "remove", path: "matter", value: {wimp: rootA, id: 1},
    })
  })

})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isSectionSnapshot = (value: unknown): boolean =>
  isRecord(value) && ["fields", "variants", "states", "transitions", "conditions", "processes", "reactions", "matter"]
    .some((section) => Object.hasOwn(value, section))
