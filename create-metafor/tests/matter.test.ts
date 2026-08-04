import {describe, expect, test} from "bun:test"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_MATTER_WRITE_CAPABILITY,
  type MetaMatterOccurrenceLocator,
  type MetaMatterPlacement,
  type MetaMatterRequest,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress, type MetaMatterParticle} from "@metafor/types/metafor/graph"
import type {MatterFields, MatterParticle} from "@metafor/types/metafor/matter"
import {
  MatterPatchError,
  planMetaMatterPatch,
  type MatterParentSnapshot,
} from "../src/matter.ts"

const ROOT = parseMetaAddress("example/root")!
const NESTED = parseMetaAddress("example/nested")!
const CHILD = parseMetaAddress("example/child")!
const EXISTING = parseMetaAddress("example/existing")!

const locator = (
  address: MetaAddress,
  ...path: MetaMatterOccurrenceLocator["path"]
): MetaMatterOccurrenceLocator => ({address, path})

const placement = (
  address: MetaAddress,
  parent: MetaMatterOccurrenceLocator | null,
  edgeSlot: MetaMatterPlacement["edgeSlot"],
  position: number,
): MetaMatterPlacement => ({address, parent, edgeSlot, position})

type MatterOperation<T> = T extends MetaMatterRequest
  ? Omit<T, "contractVersion" | "operationId" | "capability" | "revisions">
  : never

const request = (value: MatterOperation<MetaMatterRequest>): MetaMatterRequest => ({
  contractVersion: META_AUTHORING_CONTRACT_VERSION,
  operationId: `matter-${value.operation}`,
  capability: META_MATTER_WRITE_CAPABILITY,
  revisions: [],
  ...value,
} as unknown as MetaMatterRequest)

const snapshot = (
  address: MetaAddress,
  matter: readonly MatterParticle[],
  fields: MatterFields = {},
): MatterParentSnapshot => ({
  address,
  targetPath: `/cluster/${address}/meta.ts`,
  source: `export default MetaFor("test")\n  .matter()\n  .bulk()\n`,
  matter,
  fields,
})

describe("Matter source patch", () => {
  test("inserts a bound WIMP at a significant root position", () => {
    const particle: MetaMatterParticle = {
      kind: "wimp",
      src: CHILD,
      fieldsBinding: {data: "title", expr: "{title: _[0]}"},
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
      energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
    }
    const plan = planMetaMatterPatch(
      request({operation: "add", particle, to: placement(ROOT, null, "root", 0)}),
      [snapshot(ROOT, [{kind: "wimp", src: EXISTING}])],
      17,
    )

    expect(plan.particle.parts[0]).toMatchObject({
      part: "inflaton",
      op: "add",
      path: "matter",
      ts: 17,
      value: {
        wimp: ROOT,
        id: 1,
        parent: null,
        edgeSlot: "root",
        position: 0,
        ...particle,
      },
    })
    expect(plan.sourceEdits[0]!.afterSource).toContain(
      `<meta-for src="${CHILD}" fields=\${{title: value["title"]}} mass=\${mass} energy=\${{socket: energy["socket"]}} />`,
    )
    expect((plan.particle.parts[0]!.value as any).treePatch.after[0].entries).toEqual([
      expect.objectContaining({id: 1, src: CHILD, position: 0}),
      expect.objectContaining({id: 2, src: EXISTING, position: 1}),
    ])
  })

  test("adds a nested Axion subtree with then and else siblings", () => {
    const particle: MetaMatterParticle = {
      kind: "axion",
      predicateBinding: {data: "/state", expr: "_[0] === \"ready\""},
      children: [
        {edgeSlot: "then", particle: {kind: "wimp", src: CHILD}},
        {edgeSlot: "else", particle: {kind: "wimp", src: EXISTING}},
      ],
    }
    const parentParticle: MetaMatterParticle = {kind: "macho", collectionBinding: {data: "items"}}
    const plan = planMetaMatterPatch(
      request({
        operation: "add",
        particle,
        to: placement(ROOT, locator(ROOT, {edgeSlot: "root", position: 0}), "child", 0),
      }),
      [snapshot(ROOT, [parentParticle])],
    )

    expect(plan.sourceEdits[0]!.afterSource).toContain("value[\"items\"].map")
    expect(plan.sourceEdits[0]!.afterSource).toContain("state === \"ready\"")
    expect((plan.particle.parts[0]!.value as any).treePatch.after[0].entries).toHaveLength(4)
  })

  test("moves an exact nested occurrence across Meta parents", () => {
    const particle: MetaMatterParticle = {kind: "wimp", src: CHILD}
    const sourceMatter: MatterParticle[] = [{
      kind: "axion",
      predicateBinding: {data: "/state"},
      children: [{edgeSlot: "child", particle}],
    }]
    const from = locator(
      ROOT,
      {edgeSlot: "root", position: 0},
      {edgeSlot: "child", position: 0},
    )
    const plan = planMetaMatterPatch(
      request({operation: "move", particle, from, to: placement(NESTED, null, "root", 0)}),
      [snapshot(ROOT, sourceMatter), snapshot(NESTED, [])],
      23,
    )

    expect(plan.particle.parts[0]).toMatchObject({
      op: "move",
      from: `${ROOT}#2`,
      value: {wimp: NESTED, id: 1, parent: null, edgeSlot: "root", position: 0, src: CHILD},
    })
    expect(plan.sourceEdits.map(({address}) => address)).toEqual([NESTED, ROOT])
    expect(plan.sourceEdits.find(({address}) => address === ROOT)!.afterSource).not.toContain(`src="${CHILD}"`)
    expect(plan.sourceEdits.find(({address}) => address === NESTED)!.afterSource).toContain(`src="${CHILD}"`)
  })

  test("keeps the target parent when an earlier root moves inside it", () => {
    const particle: MetaMatterParticle = {kind: "wimp", src: CHILD}
    const parentParticle: MetaMatterParticle = {kind: "macho", collectionBinding: {data: "items"}}
    const plan = planMetaMatterPatch(
      request({
        operation: "move",
        particle,
        from: locator(ROOT, {edgeSlot: "root", position: 0}),
        to: placement(ROOT, locator(ROOT, {edgeSlot: "root", position: 1}), "child", 0),
      }),
      [snapshot(ROOT, [particle, parentParticle])],
    )

    expect((plan.particle.parts[0]!.value as any).treePatch.after[0].entries).toEqual([
      expect.objectContaining({id: 1, kind: "macho", parent: null, position: 0}),
      expect.objectContaining({id: 2, kind: "wimp", src: CHILD, parent: 1, position: 0}),
    ])
    expect(plan.particle.parts[0]).toMatchObject({
      op: "move",
      value: {wimp: ROOT, id: 2, parent: 1, edgeSlot: "child", position: 0, src: CHILD},
    })
  })

  test("removes only the exact duplicated occurrence named by the locator", () => {
    const particle: MetaMatterParticle = {kind: "wimp", src: CHILD}
    const plan = planMetaMatterPatch(
      request({
        operation: "remove",
        particle,
        target: locator(ROOT, {edgeSlot: "root", position: 1}),
      }),
      [snapshot(ROOT, [particle, particle])],
      29,
    )

    expect(plan.particle.parts[0]).toMatchObject({
      op: "remove",
      value: {wimp: ROOT, id: 2, src: CHILD},
    })
    expect((plan.particle.parts[0]!.value as any).treePatch.after[0].entries).toHaveLength(1)
  })

  test("serializes a Fuzzy only when enum variants match its branches", () => {
    const particle: MetaMatterParticle = {
      kind: "fuzzy",
      fuzzyKind: "dynamic-meta",
      predicateBinding: {data: "mode", expr: "example/${_[0]}"},
      children: [
        {edgeSlot: "branch", particle: {kind: "wimp", src: parseMetaAddress("example/card")!}},
        {edgeSlot: "branch", particle: {kind: "wimp", src: parseMetaAddress("example/table")!}},
      ],
    }
    const fields: MatterFields = {mode: {type: "enum", values: ["card", "table"]}}
    const plan = planMetaMatterPatch(
      request({operation: "add", particle, to: placement(ROOT, null, "root", 0)}),
      [snapshot(ROOT, [], fields)],
    )

    expect(plan.sourceEdits[0]!.afterSource).toContain('src="${`example/${value["mode"]}`}"')
    expect(() => planMetaMatterPatch(
      request({
        operation: "add",
        particle: {...particle, children: particle.children!.toReversed()},
        to: placement(ROOT, null, "root", 0),
      }),
      [snapshot(ROOT, [], fields)],
    )).toThrow(MatterPatchError)
  })

  test("rejects a stale particle and a move into its own subtree", () => {
    const particle: MetaMatterParticle = {
      kind: "axion",
      predicateBinding: {data: "/state"},
      children: [{edgeSlot: "child", particle: {kind: "wimp", src: CHILD}}],
    }
    const root = locator(ROOT, {edgeSlot: "root", position: 0})
    expect(() => planMetaMatterPatch(
      request({
        operation: "remove",
        particle: {kind: "wimp", src: CHILD},
        target: root,
      }),
      [snapshot(ROOT, [particle])],
    )).toThrow("does not match")
    expect(() => planMetaMatterPatch(
      request({
        operation: "move",
        particle,
        from: root,
        to: placement(ROOT, locator(ROOT, {edgeSlot: "root", position: 0}, {edgeSlot: "child", position: 0}), "child", 0),
      }),
      [snapshot(ROOT, [particle])],
    )).toThrow("own subtree")
  })
})
