import {describe, expect, test} from "bun:test"
import "../.."
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_DECLARATION_WRITE_CAPABILITY,
  type MetaDeclarationRequest,
  type MetaSourceRevision,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import {evaluateMetaSource} from "../../quantum/dark/load.ts"
import {
  DeclarationPatchError,
  planMetaDeclarationPatch,
  type DeclarationMetaSnapshot,
} from "../src/declaration.ts"

const ROOT = parseMetaAddress("example/root")!
const TARGET = parseMetaAddress("example/target")!
const REVISION = `sha256:${"1".repeat(64)}` as MetaSourceRevision

const source = (fields: string): string => `export default MetaFor("test", {desc: ""})
  .fields((field) => (${fields}))
  .superposition({})
  .mass((mass) => ({}))
  .energy()
  .processes(() => [])
  .reactions((reaction) => [])
  .matter(({ html }) => html\`\`)
  .bulk()
`

const snapshot = async (address: MetaAddress, input: string): Promise<DeclarationMetaSnapshot> => {
  const declaration = await evaluateMetaSource(input)
  return {
    address,
    targetPath: `/cluster/${address}/meta.ts`,
    source: input,
    name: declaration.name,
    ...(declaration.desc === undefined ? {} : {description: declaration.desc}),
    fields: declaration.fields,
    states: declaration.superposition,
    ...(declaration.mass === undefined ? {} : {mass: declaration.mass}),
    ...(declaration.processes === undefined ? {} : {processes: declaration.processes}),
    ...(declaration.reactions === undefined ? {} : {reactions: declaration.reactions}),
    ...(declaration.bulk === undefined ? {} : {bulk: declaration.bulk}),
  }
}

const base = {
  contractVersion: META_AUTHORING_CONTRACT_VERSION,
  capability: META_DECLARATION_WRITE_CAPABILITY,
  entity: "field" as const,
}

const definitions = async (input: string) => (await evaluateMetaSource(input)).fields

describe("Field declaration patch planner", () => {
  test("adds, replaces and removes one optional tail Field", async () => {
    const empty = await snapshot(ROOT, source("{}"))
    const add: MetaDeclarationRequest = {
      ...base,
      operationId: "field-add",
      operation: "add",
      address: ROOT,
      field: {key: "note", type: "string", required: false, label: "Note"},
      revisions: [{address: ROOT, revision: REVISION}],
    }
    const added = planMetaDeclarationPatch(add, [empty], 10)
    expect(added.particle).toEqual({parts: [{
      part: "inflaton",
      op: "add",
      path: "field",
      ts: 10,
      value: {
        wimp: ROOT,
        id: 1,
        key: "note",
        type: "string",
        required: false,
        label: "Note",
        variants: [],
      },
    }]})
    expect(await definitions(added.sourceEdits[0]!.afterSource)).toEqual([{
      key: "note", type: "string", label: "Note",
    }])

    const current = await snapshot(ROOT, added.sourceEdits[0]!.afterSource)
    const replaced = planMetaDeclarationPatch({
      ...base,
      operationId: "field-replace",
      operation: "replace",
      address: ROOT,
      key: "note",
      field: {key: "count", type: "number", required: false, default: 2},
      revisions: [{address: ROOT, revision: REVISION}],
    }, [current], 11)
    expect(replaced.particle.parts[0]).toMatchObject({
      op: "replace",
      value: {wimp: ROOT, id: 1, key: "count", type: "number", default: 2},
    })
    expect(await definitions(replaced.sourceEdits[0]!.afterSource)).toEqual([{
      key: "count", type: "number", default: 2,
    }])

    const changed = await snapshot(ROOT, replaced.sourceEdits[0]!.afterSource)
    const removed = planMetaDeclarationPatch({
      ...base,
      operationId: "field-remove",
      operation: "remove",
      address: ROOT,
      key: "count",
      revisions: [{address: ROOT, revision: REVISION}],
    }, [changed], 12)
    expect(removed.particle.parts[0]).toEqual({
      part: "inflaton", op: "remove", path: "field", ts: 12, value: {wimp: ROOT, id: 1},
    })
    expect(await definitions(removed.sourceEdits[0]!.afterSource)).toEqual([])
  })

  test("keeps enum variants inside the one Field Particle", async () => {
    const current = await snapshot(ROOT, source("{}"))
    const planned = planMetaDeclarationPatch({
      ...base,
      operationId: "field-enum",
      operation: "add",
      address: ROOT,
      field: {
        key: "mode",
        type: "enum",
        required: false,
        values: ["idle", "ready"],
        default: "idle",
      },
      revisions: [{address: ROOT, revision: REVISION}],
    }, [current], 20)

    expect(planned.particle.parts).toHaveLength(1)
    expect(planned.particle.parts[0]).toMatchObject({value: {
      wimp: ROOT,
      id: 1,
      key: "mode",
      type: "enum",
      default: "idle",
      variants: [
        {id: 1, position: 0, value: "idle"},
        {id: 2, position: 1, value: "ready"},
      ],
    }})
    expect(await definitions(planned.sourceEdits[0]!.afterSource)).toEqual([{
      key: "mode", type: "enum", values: ["idle", "ready"], default: "idle",
    }])
  })

  test("moves only the optional tail Field and appends it to the target", async () => {
    const root = await snapshot(ROOT, source(`{
    stable: field.boolean.required(false),
    note: field.string.optional({ label: "Note" }),
  }`))
    const target = await snapshot(TARGET, source(`{
    count: field.number.optional(1),
  }`))
    const planned = planMetaDeclarationPatch({
      ...base,
      operationId: "field-move",
      operation: "move",
      fromAddress: ROOT,
      toAddress: TARGET,
      key: "note",
      revisions: [
        {address: ROOT, revision: REVISION},
        {address: TARGET, revision: REVISION},
      ],
    }, [root, target], 30)

    expect(planned.particle.parts[0]).toMatchObject({
      op: "move",
      path: "field",
      from: `${ROOT}#2`,
      value: {wimp: TARGET, id: 2, key: "note"},
    })
    expect(planned.sourceEdits.map(({address}) => address)).toEqual([ROOT, TARGET])
    expect(await definitions(planned.sourceEdits[0]!.afterSource)).toEqual([{
      key: "stable", type: "boolean", required: true, default: false,
    }])
    expect(await definitions(planned.sourceEdits[1]!.afterSource)).toEqual([
      {key: "count", type: "number", default: 1},
      {key: "note", type: "string", label: "Note"},
    ])
  })

  test("rejects removal or move that would renumber another Field", async () => {
    const root = await snapshot(ROOT, source(`{
    first: field.string.optional(),
    second: field.string.optional(),
  }`))
    const target = await snapshot(TARGET, source("{}"))
    for (const request of [
      {
        ...base,
        operationId: "field-remove",
        operation: "remove" as const,
        address: ROOT,
        key: "first",
        revisions: [{address: ROOT, revision: REVISION}],
      },
      {
        ...base,
        operationId: "field-move",
        operation: "move" as const,
        fromAddress: ROOT,
        toAddress: TARGET,
        key: "first",
        revisions: [
          {address: ROOT, revision: REVISION},
          {address: TARGET, revision: REVISION},
        ],
      },
    ]) {
      expect(() => planMetaDeclarationPatch(request, [root, target])).toThrow(DeclarationPatchError)
      try {
        planMetaDeclarationPatch(request, [root, target])
      } catch (error) {
        expect(error).toMatchObject({code: "field_not_tail"})
      }
    }
  })
})

describe("Meta declaration entity patch planner", () => {
  const requestBase = {
    contractVersion: META_AUTHORING_CONTRACT_VERSION,
    capability: META_DECLARATION_WRITE_CAPABILITY,
  }

  test("projects metadata, State composition, Mass, Reaction and Bulk from one-entity patches", async () => {
    let current = await snapshot(ROOT, source(`{
    status: field.string.optional(),
  }`).replace(".superposition({})", ".superposition({ idle: null })"))

    const metadata = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "metadata-replace",
      entity: "metadata",
      operation: "replace",
      address: ROOT,
      metadata: {name: "Changed", description: "Edited through RPC"},
      revisions: [{address: ROOT, revision: REVISION}],
    }, [current], 40)
    expect(metadata.particle.parts[0]).toMatchObject({
      op: "replace", path: "wimp", value: {src: ROOT, name: "Changed", desc: "Edited through RPC"},
    })
    current = await snapshot(ROOT, metadata.sourceEdits[0]!.afterSource)
    expect(current).toMatchObject({name: "Changed", description: "Edited through RPC"})

    const state = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "state-add",
      entity: "state",
      operation: "add",
      address: ROOT,
      state: {name: "ready", transitions: {idle: {status: {eq: "ok"}}}},
      revisions: [{address: ROOT, revision: REVISION}],
    }, [current], 41)
    expect(state.particle.parts).toEqual([expect.objectContaining({
      op: "add", path: "state", value: expect.objectContaining({
        wimp: ROOT, id: 2, name: "ready",
        transitions: [{id: 1, position: 0, to: 1, conditions: [{id: 1, position: 0, field: 1, predicate: {eq: "ok"}}]}],
      }),
    })])
    current = await snapshot(ROOT, state.sourceEdits[0]!.afterSource)
    expect(current.states).toEqual([
      {name: "idle", transitions: null},
      {name: "ready", transitions: {idle: {status: {eq: "ok"}}}},
    ])

    const mass = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "mass-add",
      entity: "mass",
      operation: "add",
      address: ROOT,
      mass: {key: "memory", format: "json", label: "Memory"},
      revisions: [{address: ROOT, revision: REVISION}],
    }, [current], 42)
    expect(mass.particle.parts[0]).toMatchObject({
      op: "add", path: "mass", value: {wimp: ROOT, id: 1, key: "memory", format: "json"},
    })
    current = await snapshot(ROOT, mass.sourceEdits[0]!.afterSource)
    expect(current.mass).toEqual([{key: "memory", format: "json", label: "Memory"}])

    const reaction = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "reaction-add",
      entity: "reaction",
      operation: "add",
      address: ROOT,
      reaction: {
        key: "remember",
        label: "Remember",
        states: ["ready"],
        filterSource: "({ value }) => value.status === 'ok'",
        updateSource: "({ self }) => self",
        read: ["status"],
        write: [],
      },
      revisions: [{address: ROOT, revision: REVISION}],
    }, [current], 43)
    expect(reaction.particle.parts[0]).toMatchObject({
      op: "add", path: "reaction", value: {wimp: ROOT, id: 1, key: "remember", read: [1], states: [2]},
    })
    current = await snapshot(ROOT, reaction.sourceEdits[0]!.afterSource)
    expect(current.reactions?.[0]).toMatchObject({key: "remember", label: "Remember", states: ["ready"]})

    const bulk = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "bulk-add",
      entity: "bulk",
      operation: "add",
      address: ROOT,
      bulk: {view: ".ready { color: green; }"},
      revisions: [{address: ROOT, revision: REVISION}],
    }, [current], 44)
    expect(bulk.particle.parts[0]).toMatchObject({
      op: "add", path: "bulk", value: {wimp: ROOT, id: 1, view: ".ready { color: green; }"},
    })
    current = await snapshot(ROOT, bulk.sourceEdits[0]!.afterSource)
    expect(current.bulk).toEqual({view: ".ready{color:green;}"})
  })

  test("adds and updates Process through meta.ts plus one owned action artifact", async () => {
    const initialSource = source(`{
    status: field.string.optional(),
  }`).replace(".superposition({})", ".superposition({ ready: null })")
    const initial = await snapshot(ROOT, initialSource)
    const added = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "process-add",
      entity: "process",
      operation: "add",
      address: ROOT,
      process: {
        key: "ready",
        type: "action",
        label: "Run",
        env: ["server"],
        artifact: {
          path: "actions/run.ts",
          revision: "absent",
          exportName: "default",
          source: "export default async ({ signal }: { signal: AbortSignal }) => ({ aborted: signal.aborted })\n",
        },
        successSource: "({ update }) => update({ status: 'done' })",
      },
      revisions: [{address: ROOT, revision: REVISION}],
    }, [initial], 50)

    expect(added.particle.parts).toEqual([expect.objectContaining({
      op: "add",
      path: "process",
      value: expect.objectContaining({
        wimp: ROOT,
        id: 1,
        key: "ready",
        type: "action",
        env: ["server"],
        action: expect.objectContaining({src: "./actions/run.ts", importSpecifier: "default", read: [1]}),
        success: expect.objectContaining({write: [1]}),
      }),
    })])
    expect(added.sourceEdits).toHaveLength(2)
    expect(added.sourceEdits.find((edit) => edit.relativePath === "actions/run.ts")).toMatchObject({
      expectedRevision: "absent",
      afterSource: expect.stringContaining("export default async"),
    })
    const metaEdit = added.sourceEdits.find((edit) => edit.relativePath === undefined)!
    const current = await snapshot(ROOT, metaEdit.afterSource)
    expect(current.processes?.[0]).toMatchObject({
      key: "ready",
      declaration: {type: "action", label: "Run", env: ["server"]},
    })

    const replaced = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "process-replace",
      entity: "process",
      operation: "replace",
      address: ROOT,
      key: "ready",
      process: {key: "ready", type: "action", label: "Run updated"},
      revisions: [{address: ROOT, revision: REVISION}],
    }, [current], 51)
    expect(replaced.particle.parts[0]).toMatchObject({
      op: "replace", path: "process", value: {wimp: ROOT, id: 1, key: "ready", label: "Run updated"},
    })
    expect(replaced.sourceEdits).toHaveLength(1)
    const updated = await snapshot(ROOT, replaced.sourceEdits[0]!.afterSource)
    expect(updated.processes?.[0]).toMatchObject({
      key: "ready", declaration: {type: "action", label: "Run updated"},
    })
    expect(updated.processes?.[0]?.declaration.type === "action"
      ? updated.processes[0].declaration.success
      : null).toBeUndefined()
  })

  test("adds a finally Process with a deterministic cleanup wrapper", async () => {
    const initial = await snapshot(
      ROOT,
      source("{}").replace(".superposition({})", ".superposition({ cleanup: null })"),
    )
    const planned = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "process-finally-add",
      entity: "process",
      operation: "add",
      address: ROOT,
      process: {
        key: "cleanup",
        type: "finally",
        env: ["server"],
        artifact: {
          path: "actions/cleanup.ts",
          revision: "absent",
          exportName: "run",
          source: "export const run = async () => {}\n",
        },
      },
      revisions: [{address: ROOT, revision: REVISION}],
    }, [initial], 52)

    expect(planned.particle.parts[0]).toMatchObject({
      op: "add",
      path: "process",
      value: {
        wimp: ROOT,
        id: 1,
        key: "cleanup",
        type: "finally",
        env: ["server"],
        before: {src: expect.stringContaining('import("./actions/cleanup.ts")'), read: []},
      },
    })
    const metaEdit = planned.sourceEdits.find((edit) => edit.relativePath === undefined)!
    const current = await snapshot(ROOT, metaEdit.afterSource)
    expect(current.processes?.[0]).toMatchObject({
      key: "cleanup",
      declaration: {type: "finally", env: ["server"], before: {src: expect.stringContaining("./actions/cleanup.ts")}},
    })
  })

  test("restores existing State source bytes after a tail add and remove", async () => {
    const before = source(`{
    status: field.string.optional(),
  }`).replace(".superposition({})", `.superposition({
    "idle": {
      "ready": { status: { eq: "ready" } },
    },
    "ready": null,
  })`)
    const initial = await snapshot(ROOT, before)
    const added = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "state-round-trip-add",
      entity: "state",
      operation: "add",
      address: ROOT,
      state: {name: "terminal", transitions: null},
      revisions: [{address: ROOT, revision: REVISION}],
    }, [initial], 45)
    const changed = await snapshot(ROOT, added.sourceEdits[0]!.afterSource)
    expect(changed.states?.map((state) => state.name)).toEqual(["idle", "ready", "terminal"])

    const removed = planMetaDeclarationPatch({
      ...requestBase,
      operationId: "state-round-trip-remove",
      entity: "state",
      operation: "remove",
      address: ROOT,
      name: "terminal",
      revisions: [{address: ROOT, revision: REVISION}],
    }, [changed], 46)
    expect(removed.sourceEdits[0]!.afterSource).toBe(before)
  })
})
