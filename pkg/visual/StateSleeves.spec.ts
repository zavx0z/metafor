import {describe, expect, test} from "bun:test"
import type {
  BulkManifest,
  BulkTransitionChannel,
} from "@metafor/types/bulk/manifest"
import type {StateGraphRootLayout} from "./StateGraphLayout.ts"
import {
  buildStateSleeveEdges,
  indexStateSleeveTransitions,
} from "./internal/state-sleeves.ts"

const transition = (
  id: string,
  conditionFieldIds: readonly number[],
): BulkTransitionChannel => ({
  active: true,
  conditionFieldIds: [...conditionFieldIds],
  conditionIds: conditionFieldIds.map((fieldId) => fieldId + 100),
  fromOrbitalParticleId: "orbital:from",
  parentDarkParticleId: 2,
  sourceId: 7,
  toOrbitalParticleId: "orbital:to",
  transitionChannelId: id,
})

const manifest = (
  channels: readonly BulkTransitionChannel[],
): BulkManifest => ({
  darkParticles: [],
  fieldParticles: [],
  fieldProxies: [],
  orbitalParticles: [],
  relationChannels: [],
  rootSrc: "owner/root",
  transitionChannels: [...channels],
})

const layout = (
  conditionFieldIds: readonly number[],
): StateGraphRootLayout => ({
  edges: [{
    conditionCount: conditionFieldIds.length,
    conditionFieldIds,
    fromNodeId: "from",
    id: "edge:7",
    returning: false,
    toNodeId: "to",
    transitionId: 7,
  }],
  levels: [],
  nodes: [
    {
      color: [1, 0, 0],
      current: true,
      end: null,
      fieldRadius: 1,
      fields: [],
      id: "from",
      innerRadius: 1,
      label: "From",
      radius: 2,
      stateId: 1,
      step: 0,
      x: 0,
      y: 0,
      z: 0,
    },
    {
      color: [0, 1, 0],
      current: false,
      end: "terminal",
      fieldRadius: 1,
      fields: [],
      id: "to",
      innerRadius: 1,
      label: "To",
      radius: 2,
      stateId: 2,
      step: 1,
      x: 10,
      y: 0,
      z: 0,
    },
  ],
  rootStateId: 1,
})

const occurrences = [
  {nodeId: "from", orbitalParticleId: "orbital:from"},
  {nodeId: "to", orbitalParticleId: "orbital:to"},
] as const

describe("production State sleeve indexes", () => {
  test("resolves equal endpoints by the exact ordered condition key", () => {
    const index = indexStateSleeveTransitions(manifest([
      transition("transition:one", [1]),
      transition("transition:two", [2]),
    ]))
    const edges = buildStateSleeveEdges(
      index,
      2,
      layout([2]),
      occurrences,
    )

    expect(index.endpointKeys.size).toBe(1)
    expect(index.channelsByExactKey.size).toBe(2)
    expect(edges[0]!.transitionChannelId).toBe("transition:two")
    expect(edges[0]!.path).toHaveLength(65)
  })

  test("rejects a duplicate exact Transition key", () => {
    const index = indexStateSleeveTransitions(manifest([
      transition("transition:one", [2]),
      transition("transition:duplicate", [2]),
    ]))

    expect(() => buildStateSleeveEdges(
      index,
      2,
      layout([2]),
      occurrences,
    )).toThrow("does not match one canonical Transition")
  })
})
