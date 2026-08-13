import {describe, expect, test} from "bun:test"
import {planNodeSystemEdgeFlowMarker} from "./edge-flow-marker.ts"

const stroke = [{x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}]

describe("node-system edge flow markers", () => {
  test("moves one forward message along the complete route with a fading tail", () => {
    const plan = planNodeSystemEdgeFlowMarker(stroke, {
      id: "source:1",
      edgeId: "edge-a",
      direction: "forward",
      at: 1_000,
    }, 1_600, 1_200, 60, 6)
    expect(plan?.head).toEqual({x: 100, y: 0})
    expect(plan?.tail).toHaveLength(6)
    expect(plan!.tail[0]!.opacity).toBeGreaterThan(plan!.tail.at(-1)!.opacity)
    expect(plan!.tail[0]!.thickness).toBeGreaterThan(plan!.tail.at(-1)!.thickness)
    expect(plan!.tail[0]!.from).toEqual(plan!.head)
  })

  test("reverses the route without reversing the gradient behind the moving head", () => {
    const plan = planNodeSystemEdgeFlowMarker(stroke, {
      id: "source:2",
      edgeId: "edge-a",
      direction: "reverse",
      at: 1_000,
    }, 1_600, 1_200, 40, 4)
    expect(plan?.head).toEqual({x: 100, y: 0})
    expect(plan?.tail[0]!.from).toEqual(plan?.head)
    expect(plan?.tail[0]!.to.y).toBeGreaterThan(plan!.tail[0]!.from.y)
  })

  test("does not materialize a marker before or after its lifetime", () => {
    const message = {id: "source:3", edgeId: "edge-a", direction: "forward" as const, at: 1_000}
    expect(planNodeSystemEdgeFlowMarker(stroke, message, 999)).toBeNull()
    expect(planNodeSystemEdgeFlowMarker(stroke, message, 2_200)).toBeNull()
  })
})
