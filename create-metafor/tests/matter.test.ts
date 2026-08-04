import {describe, expect, test} from "bun:test"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_MATTER_WRITE_CAPABILITY,
  type MetaMatterAddRequest,
  type MetaMatterMoveRequest,
  type MetaMatterRemoveRequest,
  type MetaMatterRequest,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import type {MatterParticle} from "@metafor/types/metafor/matter"
import {
  MatterPatchError,
  planMetaMatterPatch,
  type MatterParentSnapshot,
} from "../src/matter.ts"

const ROOT = parseMetaAddress("example/root")!
const NESTED = parseMetaAddress("example/nested")!
const CHILD = parseMetaAddress("example/child")!
const EXISTING = parseMetaAddress("example/existing")!

type MatterOperation =
  | Pick<MetaMatterAddRequest, "operation" | "child" | "toParent">
  | Pick<MetaMatterMoveRequest, "operation" | "child" | "fromParent" | "toParent">
  | Pick<MetaMatterRemoveRequest, "operation" | "child" | "fromParent">

const request = (value: MatterOperation): MetaMatterRequest => ({
  contractVersion: META_AUTHORING_CONTRACT_VERSION,
  operationId: `matter-${value.operation}`,
  capability: META_MATTER_WRITE_CAPABILITY,
  revisions: [],
  ...value,
} as unknown as MetaMatterRequest)

const snapshot = (
  address: MetaAddress,
  source: string,
  matter: readonly MatterParticle[],
): MatterParentSnapshot => ({address, targetPath: `/cluster/${address}/meta.ts`, source, matter})

const emptySource = `export default MetaFor("empty", {desc: ""})
  .matter(({ html }) => html\`\`)
  .bulk()
`

describe("Matter source patch", () => {
  test("adds one inert root WIMP as the last sibling", () => {
    const plan = planMetaMatterPatch(
      request({operation: "add", child: CHILD, toParent: ROOT}),
      [snapshot(ROOT, emptySource, [])],
      17,
    )

    expect(plan.particle).toEqual({parts: [{
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
        kind: "wimp",
        src: CHILD,
      },
    }]})
    expect(plan.sourceEdits[0]!.afterSource).toContain(`html\`\n    <meta-for src="${CHILD}" />\n  \``)
    expect(plan.sourceEdits[0]!.beforeSource).toBe(emptySource)
  })

  test("moves one inert occurrence and derives both local identities from source", () => {
    const rootSource = `export default MetaFor("root", {desc: ""})
  .matter(({ value, html }) => html\`
    <meta-for src="${EXISTING}" fields=\${{ label: value.label }} />
    <meta-for src="${CHILD}" />
  \`)
  .bulk()
`
    const targetSource = `export default MetaFor("nested", {desc: ""})
  .matter(({ html }) => html\`
    <meta-for src="${EXISTING}" />
  \`)
  .bulk()
`
    const plan = planMetaMatterPatch(
      request({operation: "move", child: CHILD, fromParent: ROOT, toParent: NESTED}),
      [
        snapshot(ROOT, rootSource, [
          {kind: "wimp", src: EXISTING, fieldsBinding: {data: "/fields/label"}},
          {kind: "wimp", src: CHILD},
        ]),
        snapshot(NESTED, targetSource, [{kind: "wimp", src: EXISTING}]),
      ],
      23,
    )

    expect(plan.particle).toEqual({parts: [{
      part: "inflaton",
      op: "move",
      path: "matter",
      from: `${ROOT}#2`,
      ts: 23,
      value: {
        wimp: NESTED,
        id: 2,
        parent: null,
        edgeSlot: "root",
        position: 1,
        kind: "wimp",
        src: CHILD,
      },
    }]})
    expect(plan.sourceEdits.map(({address}) => address)).toEqual([NESTED, ROOT])
    expect(plan.sourceEdits.find(({address}) => address === ROOT)!.afterSource).not.toContain(`src="${CHILD}"`)
    expect(plan.sourceEdits.find(({address}) => address === NESTED)!.afterSource).toContain(`src="${CHILD}"`)
  })

  test("removes source text without deleting the peer repository", () => {
    const source = emptySource.replace("html``", `html\`\n    <meta-for src="${CHILD}" />\n  \``)
    const plan = planMetaMatterPatch(
      request({operation: "remove", child: CHILD, fromParent: ROOT}),
      [snapshot(ROOT, source, [{kind: "wimp", src: CHILD}])],
      29,
    )

    expect(plan.particle.parts[0]).toEqual({
      part: "inflaton",
      op: "remove",
      path: "matter",
      ts: 29,
      value: {wimp: ROOT, id: 1},
    })
    expect(plan.sourceEdits[0]!.afterSource).not.toContain(`src="${CHILD}"`)
  })

  test("rejects a bound occurrence outside the first contract slice", () => {
    expect(() => planMetaMatterPatch(
      request({operation: "remove", child: CHILD, fromParent: ROOT}),
      [snapshot(ROOT, emptySource, [{kind: "wimp", src: CHILD, massBinding: {data: "/mass"}}])],
    )).toThrow(MatterPatchError)
  })

  test("rejects removal before a later sibling whose cold-read identity would shift", () => {
    const source = emptySource.replace(
      "html``",
      `html\`\n    <meta-for src="${CHILD}" />\n    <meta-for src="${EXISTING}" />\n  \``,
    )
    expect(() => planMetaMatterPatch(
      request({operation: "remove", child: CHILD, fromParent: ROOT}),
      [snapshot(ROOT, source, [{kind: "wimp", src: CHILD}, {kind: "wimp", src: EXISTING}])],
    )).toThrow("must be the last root Matter child")
  })
})
