import {describe, expect, test} from "bun:test"
import {Color, ThinFilmMaterial} from "@metafor/engine"
import type {
  StateGraphLayoutEdge,
  StateGraphLayoutNode,
} from "./StateGraphLayout.ts"
import {
  buildStateGraphEdgeCurve,
  groupStateGraphEdges,
  stateGraphFieldColor,
  stateGraphFieldSphereLayout,
  stateGraphNodeFormDimensions,
} from "./StateGraphViewport.ts"
import {
  createQuantumFilmMaterial,
  createQuantumSphereMaterial,
  SPHERE_QUANTUM_HIGHLIGHT_SIZE,
} from "./QuantumFilm.ts"

const node = (
  id: string,
  x: number,
  y: number,
): StateGraphLayoutNode => ({
  color: [1, 1, 1],
  current: false,
  end: null,
  fieldRadius: 0.32,
  fields: [],
  id,
  innerRadius: 0.35584,
  label: id,
  radius: 3.2,
  stateId: Number(id),
  step: 0,
  x,
  y,
  z: 0,
})

const edge = (returning: boolean): StateGraphLayoutEdge => ({
  conditionCount: 0,
  conditionFieldIds: [],
  fromNodeId: "5",
  id: "transition:5",
  returning,
  toNodeId: "4",
  transitionId: 5,
})

describe("State Graph viewport edge geometry", () => {
  test("reuses the quantum ThinFilm skin for graph and context Torus forms", () => {
    const material = createQuantumFilmMaterial(
      new Color(0.2, 0.6, 0.9),
      {glowIntensity: 3, opacity: 0.7},
    )

    expect(material).toBeInstanceOf(ThinFilmMaterial)
    expect(material.opacity).toBe(0.7)
    expect(material.filmThickness).toBe(0.88)
    expect(material.iridescence).toBe(0.86)
    expect(createQuantumFilmMaterial(new Color(0.2, 0.6, 0.9)).highlightSize)
      .toBe(0)
  })

  test("fixes the shared Sphere highlight size at one", () => {
    const material = createQuantumSphereMaterial(
      new Color(0.2, 0.6, 0.9),
      {glowIntensity: 3, opacity: 0.7},
    )

    expect(SPHERE_QUANTUM_HIGHLIGHT_SIZE).toBe(1)
    expect(material).toBeInstanceOf(ThinFilmMaterial)
    expect(material.highlightSize).toBe(1)
  })

  test("fits the code-owned Torus proportions and exposes its hole for Fields", () => {
    const form = stateGraphNodeFormDimensions(3.2, 0.35584)

    expect(form.torusRadius + form.torusTube).toBeCloseTo(3.2)
    expect(form.holeRadius).toBeGreaterThan(0)
    expect(form.holeRadius).toBeCloseTo(
      form.torusRadius - form.torusTube,
    )
  })

  test("lays fixed-size condition Fields out without fitting them to the hole", () => {
    const fields = stateGraphFieldSphereLayout([
      {id: 1, key: "name", label: "Name", type: "string"},
      {id: 2, key: "ready", label: "Ready", type: "boolean"},
      {id: 3, key: "count", label: "Count", type: "number"},
    ], 0.4)

    expect(fields).toHaveLength(3)
    expect(stateGraphFieldColor(fields[0]!.type)).not.toEqual(
      stateGraphFieldColor(fields[1]!.type),
    )
    for (const field of fields) {
      expect(field.radius).toBe(0.4)
      expect(field.z).toBe(0)
    }
    let minimumDistance = Number.POSITIVE_INFINITY
    for (let left = 0; left < fields.length; left += 1) {
      for (let right = left + 1; right < fields.length; right += 1) {
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(
            fields[left]!.x - fields[right]!.x,
            fields[left]!.y - fields[right]!.y,
            fields[left]!.z - fields[right]!.z,
          ),
        )
      }
    }
    expect(minimumDistance).toBeCloseTo(0.8)
  })

  test("draws a returning edge as a front arc and a top-view straight line", () => {
    const points = buildStateGraphEdgeCurve(
      edge(true),
      node("5", 44, 0),
      node("4", 22, 7.5),
    )

    expect(points[0]).toMatchObject({x: 44, y: 0, z: 0})
    expect(points.at(-1)).toMatchObject({x: 22, y: 7.5, z: 0})
    expect(Math.max(...points.map((point) => point.z))).toBe(10.5)

    const from = points[0]!
    const to = points.at(-1)!
    const chordX = to.x - from.x
    const chordY = to.y - from.y
    for (const point of points) {
      const cross = (point.x - from.x) * chordY -
        (point.y - from.y) * chordX
      expect(cross).toBeCloseTo(0)
    }
  })

  test("keeps an ordinary edge close to the graph plane", () => {
    const points = buildStateGraphEdgeCurve(
      edge(false),
      node("5", 0, 0),
      node("4", 22, 0),
    )

    expect(Math.max(...points.map((point) => point.z))).toBeCloseTo(0.7)
  })

  test("compiles all Transition into at most two render batches", () => {
    const batches = groupStateGraphEdges([
      edge(false),
      {...edge(false), id: "transition:6", transitionId: 6},
      edge(true),
    ])

    expect(batches).toHaveLength(2)
    expect(batches[0]).toMatchObject({returning: false})
    expect(batches[0]!.edges).toHaveLength(2)
    expect(batches[1]).toMatchObject({returning: true})
    expect(batches[1]!.edges).toHaveLength(1)
  })
})
