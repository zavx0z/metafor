import {describe, expect, test} from "bun:test"
import {
  ADAPTIVE_CANDIDATE_BUDGET,
  AdaptiveLayoutError,
  layoutAdaptive,
  layoutAdaptiveWithDiagnostics,
  type AdaptiveLayoutGraph,
  type AdaptiveLayoutPort,
} from "@nodes/layout/adaptive"

const node = (id: string) => ({id, width: 120, height: 80})
const port = (
  id: string,
  nodeId: string,
  capability: AdaptiveLayoutPort["capability"],
  allowedSides: AdaptiveLayoutPort["allowedSides"],
): AdaptiveLayoutPort => ({id, nodeId, y: 40, capability, allowedSides})

function oneEdge(
  source: AdaptiveLayoutPort,
  target: AdaptiveLayoutPort,
  viewport = {width: 900, height: 500},
): AdaptiveLayoutGraph {
  return {
    viewport,
    nodes: [node(source.nodeId), node(target.nodeId)],
    ports: [source, target],
    edges: [{id: "edge", sourcePortId: source.id, targetPortId: target.id}],
  }
}

describe("adaptive layout policy", () => {
  test("selects EAST and WEST for inout sockets from the common geometry objective", () => {
    const sourceAdaptive = layoutAdaptiveWithDiagnostics(oneEdge(
      port("source/socket", "source", "inout", ["WEST", "EAST"]),
      port("target/socket", "target", "in", ["WEST"]),
    ))
    const targetAdaptive = layoutAdaptiveWithDiagnostics(oneEdge(
      port("source/socket", "source", "out", ["EAST"]),
      port("target/socket", "target", "inout", ["WEST", "EAST"]),
    ))

    expect(sourceAdaptive.result.ports.find(({id}) => id === "source/socket")?.side).toBe("EAST")
    expect(targetAdaptive.result.ports.find(({id}) => id === "target/socket")?.side).toBe("WEST")
    expect(sourceAdaptive.diagnostics.dynamicPortCount).toBe(1)
    expect(targetAdaptive.diagnostics.dynamicPortCount).toBe(1)
    expect(sourceAdaptive.diagnostics.attemptedCandidates).toBe(2)
    expect(targetAdaptive.diagnostics.attemptedCandidates).toBe(2)
  })

  test("assigns one side to a shared inout port used by every incident edge", () => {
    const graph: AdaptiveLayoutGraph = {
      viewport: {width: 920, height: 520},
      nodes: [node("shared"), node("target-a"), node("target-b")],
      ports: [
        port("shared/io", "shared", "inout", ["WEST", "EAST"]),
        port("target-a/in", "target-a", "in", ["WEST"]),
        port("target-b/in", "target-b", "in", ["WEST"]),
      ],
      edges: [
        {id: "to-a", sourcePortId: "shared/io", targetPortId: "target-a/in"},
        {id: "to-b", sourcePortId: "shared/io", targetPortId: "target-b/in"},
      ],
    }

    const outcome = layoutAdaptiveWithDiagnostics(graph)
    const shared = outcome.result.ports.find(({id}) => id === "shared/io")!
    const incidentPoints = outcome.result.edges.flatMap(({sections}) => {
      const section = sections[0]
      return section === undefined ? [] : [section.startPoint, section.endPoint]
    }).filter(({x, y}) => x === shared.x && y === shared.y)

    expect(outcome.result.ports.filter(({id}) => id === "shared/io")).toHaveLength(1)
    expect(incidentPoints).toHaveLength(2)
    expect(outcome.diagnostics.selectedSides.filter(({portId}) => portId === "shared/io")).toEqual([
      {portId: "shared/io", side: shared.side},
    ])
  })

  test("keeps fixed and adaptive constraints together and routes same-side endpoints", () => {
    const graph: AdaptiveLayoutGraph = {
      viewport: {width: 900, height: 500},
      nodes: [node("source"), node("middle"), node("target")],
      ports: [
        port("source/east", "source", "out", ["EAST"]),
        port("middle/io", "middle", "inout", ["WEST", "EAST"]),
        port("middle/east", "middle", "out", ["EAST"]),
        port("target/east", "target", "in", ["EAST"]),
      ],
      edges: [
        {id: "adaptive", sourcePortId: "source/east", targetPortId: "middle/io"},
        {id: "same-side", sourcePortId: "middle/east", targetPortId: "target/east"},
      ],
    }

    const outcome = layoutAdaptiveWithDiagnostics(graph)
    const sameSide = outcome.result.edges.find(({id}) => id === "same-side")!.sections[0]
    const middle = outcome.result.ports.find(({id}) => id === "middle/east")!
    const target = outcome.result.ports.find(({id}) => id === "target/east")!

    expect(outcome.diagnostics.fixedPortCount).toBe(3)
    expect(outcome.diagnostics.dynamicPortCount).toBe(1)
    expect(outcome.result.ports.find(({id}) => id === "middle/east")?.side).toBe("EAST")
    expect(outcome.result.ports.find(({id}) => id === "target/east")?.side).toBe("EAST")
    expect(sameSide.startPoint.x).toBe(middle.x)
    expect(sameSide.endPoint.x).toBe(target.x)
  })

  test("keeps capability independent from a fixed visual side", () => {
    const outcome = layoutAdaptiveWithDiagnostics(oneEdge(
      port("source/out-west", "source", "out", ["WEST"]),
      port("target/in-east", "target", "in", ["EAST"]),
    ))

    expect(outcome.result.ports).toEqual([
      {id: "source/out-west", x: 56, y: 96, side: "WEST"},
      {id: "target/in-east", x: 324, y: 96, side: "EAST"},
    ])
    expect(outcome.diagnostics).toMatchObject({
      theoreticalCandidateCount: "1",
      fixedPortCount: 2,
      dynamicPortCount: 0,
      generatedCandidates: 1,
      attemptedCandidates: 1,
      routableCandidates: 1,
    })
  })

  test("rejects capability-role conflicts with an exact witness", () => {
    const graph = oneEdge(
      port("source/in", "source", "in", ["EAST"]),
      port("target/in", "target", "in", ["WEST"]),
    )

    try {
      layoutAdaptive(graph)
      throw new Error("expected adaptive layout to reject the capability conflict")
    } catch (error) {
      expect(error).toBeInstanceOf(AdaptiveLayoutError)
      const adaptive = error as AdaptiveLayoutError
      expect(adaptive.witness).toMatchObject({
        code: "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT",
        reason: "CAPABILITY_ROLE_CONFLICT",
        candidateBudget: ADAPTIVE_CANDIDATE_BUDGET,
        theoreticalCandidateCount: "1",
        dynamicPortIds: [],
        portId: "source/in",
        edgeId: "edge",
        role: "source",
        attempts: [],
      })
    }
  })

  test("is repeatable and independent of node, port and edge input order", () => {
    const graph: AdaptiveLayoutGraph = {
      viewport: {width: 840, height: 520},
      nodes: [node("a"), node("b"), node("c")],
      ports: [
        port("a/io", "a", "inout", ["WEST", "EAST"]),
        port("b/io", "b", "inout", ["EAST", "WEST"]),
        port("c/in", "c", "in", ["WEST"]),
      ],
      edges: [
        {id: "a-b", sourcePortId: "a/io", targetPortId: "b/io"},
        {id: "a-c", sourcePortId: "a/io", targetPortId: "c/in"},
      ],
    }
    const permuted: AdaptiveLayoutGraph = {
      ...graph,
      nodes: [...graph.nodes].reverse(),
      ports: [...graph.ports].reverse(),
      edges: [...graph.edges].reverse(),
    }

    const first = layoutAdaptiveWithDiagnostics(graph)
    expect(layoutAdaptiveWithDiagnostics(graph)).toEqual(first)
    expect(layoutAdaptiveWithDiagnostics(permuted)).toEqual(first)
    expect(layoutAdaptive(graph)).toEqual(first.result)
  })

  test("reports an exact machine-readable witness for an impossible side constraint", () => {
    const graph = oneEdge(
      port("source/io", "source", "inout", []),
      port("target/in", "target", "in", ["WEST"]),
    )

    try {
      layoutAdaptive(graph)
      throw new Error("expected adaptive layout to reject the graph")
    } catch (error) {
      expect(error).toBeInstanceOf(AdaptiveLayoutError)
      const adaptive = error as AdaptiveLayoutError
      expect(adaptive.code).toBe("NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT")
      expect(adaptive.witness).toEqual({
        code: "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT",
        reason: "PORT_HAS_NO_ALLOWED_SIDE",
        candidateBudget: ADAPTIVE_CANDIDATE_BUDGET,
        theoreticalCandidateCount: "0",
        dynamicPortIds: [],
        portId: "source/io",
        attempts: [],
      })
    }
  })

  test("never exceeds the fixed candidate budget when theoretical assignments grow", () => {
    const dynamicCount = 6
    const graph: AdaptiveLayoutGraph = {
      viewport: {width: 1200, height: 700},
      nodes: [
        ...Array.from({length: dynamicCount}, (_, index) => node(`source-${index}`)),
        ...Array.from({length: dynamicCount}, (_, index) => node(`target-${index}`)),
      ],
      ports: [
        ...Array.from({length: dynamicCount}, (_, index) =>
          port(`source-${index}/io`, `source-${index}`, "inout", ["WEST", "EAST"])),
        ...Array.from({length: dynamicCount}, (_, index) =>
          port(`target-${index}/in`, `target-${index}`, "in", ["WEST"])),
      ],
      edges: Array.from({length: dynamicCount}, (_, index) => ({
        id: `edge-${index}`,
        sourcePortId: `source-${index}/io`,
        targetPortId: `target-${index}/in`,
      })),
    }

    const outcome = layoutAdaptiveWithDiagnostics(graph)
    expect(outcome.diagnostics.theoreticalCandidateCount).toBe("64")
    expect(outcome.diagnostics.generatedCandidates).toBeLessThanOrEqual(ADAPTIVE_CANDIDATE_BUDGET)
    expect(outcome.diagnostics.attemptedCandidates).toBeLessThanOrEqual(ADAPTIVE_CANDIDATE_BUDGET)
  })
})
