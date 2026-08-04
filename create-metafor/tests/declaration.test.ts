import {describe, expect, test} from "bun:test"
import "../.."
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_DECLARATION_WRITE_CAPABILITY,
  type MetaDeclarationRequest,
  type MetaSourceRevision,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import {evaluateMetaSource} from "../../dark/load.ts"
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
  .mass(() => ({}))
  .energy()
  .processes(() => [])
  .reactions(() => [])
  .matter(({ html }) => html\`\`)
  .bulk()
`

const snapshot = async (address: MetaAddress, input: string): Promise<DeclarationMetaSnapshot> => ({
  address,
  targetPath: `/cluster/${address}/meta.ts`,
  source: input,
  fields: (await evaluateMetaSource(input)).fields,
})

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
