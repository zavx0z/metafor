import {describe, expect, test} from "bun:test"
import {
  HERMITE_EDGE_SEGMENTS,
  sampleHermiteEdgeCurve,
} from "../src/HermiteEdge.ts"
import {buildStateGraphProcessStand} from "./StateGraphProcessLab.ts"
import {writeStateGraphSphericalCurveSegments} from "./StateGraphViewport.ts"

describe("State Graph Process placement lab", () => {
  test("uses the recorded action Process with success and error handlers", () => {
    const stand = buildStateGraphProcessStand()

    expect(stand.process).toMatchObject({
      id: 12,
      ownerStateId: 19,
      ownerStateLabel: "обращение к модели",
    })
    expect(stand.handlers.map(({kind, fieldIds}) => ({kind, fieldIds})))
      .toEqual([
        {kind: "action", fieldIds: [45, 46, 47, 48, 49]},
        {kind: "success", fieldIds: [45, 47, 48, 49]},
        {kind: "error", fieldIds: [45, 49]},
      ])
  })

  test("centers the Atom projection in the same State volume", () => {
    const stand = buildStateGraphProcessStand()
    const owner = stand.layout.nodes.find((node) =>
      node.id === stand.process.ownerNodeId
    )
    expect(owner).toBeDefined()

    expect(stand.atom).toMatchObject({
      x: owner!.x,
      y: owner!.y,
      z: owner!.z,
    })
    expect(stand.atom.form.innerRadius).toBe(owner!.innerRadius)
    expect(stand.atom.form.outerRadius).toBeGreaterThan(owner!.innerRadius)
    expect(stand.atom.form.outerRadius).toBeLessThan(owner!.radius)
  })

  test("puts every Atom Field into the projection core", () => {
    const stand = buildStateGraphProcessStand()

    expect(stand.atomFields.map((field) => field.id)).toEqual(
      stand.graph.fields.map((field) => field.id),
    )
    for (const field of stand.atomFields) {
      const radialExtent = Math.hypot(
        field.x - stand.atom.x,
        field.y - stand.atom.y,
        field.z - stand.atom.z,
      ) + field.radius
      expect(radialExtent).toBeLessThan(stand.atom.form.innerRadius)
    }
  })

  test("places three handlers evenly on one inner State orbit after the Atom", () => {
    const stand = buildStateGraphProcessStand()
    const owner = stand.layout.nodes.find((node) =>
      node.id === stand.process.ownerNodeId
    )
    expect(owner).toBeDefined()

    const orbitRadii = stand.handlers.map((handler) => Math.hypot(
      handler.x - stand.atom.x,
      handler.y - stand.atom.y,
      handler.z - stand.atom.z,
    ))
    expect(orbitRadii[0]).toBeCloseTo(orbitRadii[1]!)
    expect(orbitRadii[1]).toBeCloseTo(orbitRadii[2]!)
    expect(orbitRadii[0]! - stand.handlers[0]!.form.outerRadius).toBeGreaterThan(
      stand.atom.form.outerRadius,
    )
    expect(orbitRadii[0]! + stand.handlers[0]!.form.outerRadius).toBeLessThan(
      owner!.radius,
    )

    const pairDistances = stand.handlers.map((handler, index) => {
      const next = stand.handlers[(index + 1) % stand.handlers.length]!
      return Math.hypot(handler.x - next.x, handler.y - next.y, handler.z - next.z)
    })
    expect(pairDistances[0]).toBeCloseTo(pairDistances[1]!)
    expect(pairDistances[1]).toBeCloseTo(pairDistances[2]!)
    expect(stand.context.orbits).toHaveLength(1)
    expect(stand.context.orbits?.[0]?.radius).toBeCloseTo(orbitRadii[0]!)
  })

  test("puts every handler Field inside its own Torus core", () => {
    const stand = buildStateGraphProcessStand()
    for (const handler of stand.handlers) {
      expect(handler.fields.map((field) => field.id)).toEqual([...handler.fieldIds])
      for (const field of handler.fields) {
        expect(stand.atomFields.map(({id}) => id)).toContain(field.id)
        const radialExtent = Math.hypot(
          field.x - handler.x,
          field.y - handler.y,
          field.z - handler.z,
        ) + field.radius
        expect(radialExtent).toBeLessThan(handler.form.innerRadius)
      }
    }
  })

  test("reads above the plane and writes below it to canonical Atom Fields", () => {
    const stand = buildStateGraphProcessStand()
    const atomFieldById = new Map(stand.atomFields.map((field) => [field.id, field]))

    for (const handler of stand.handlers) {
      expect(handler.curves).toHaveLength(handler.fields.length)
      for (const [index, curve] of handler.curves.entries()) {
        const field = handler.fields[index]!
        const atomField = atomFieldById.get(field.id)!
        const reads = handler.kind === "action"
        const from = reads ? atomField : field
        const to = reads ? field : atomField
        expect(curve.from).toEqual({x: from.x, y: from.y, z: from.z})
        expect(curve.to).toEqual({x: to.x, y: to.y, z: to.z})
        const path = sampleHermiteEdgeCurve(curve)
        const middle = path[Math.floor(path.length / 2)]!
        expect(Math.sign(middle.z)).toBe(reads ? 1 : -1)
      }
    }
  })

  test("routes matching action Fields through one compact spherical S-curve", () => {
    const stand = buildStateGraphProcessStand()
    const action = stand.handlers.find(({kind}) => kind === "action")!
    const targets = stand.handlers.filter(({kind}) => kind !== "action")
    const actionFieldById = new Map(action.fields.map((field) => [field.id, field]))
    const targetFields = targets.flatMap((handler) =>
      handler.fields.map((field) => ({field, handler}))
    )

    expect(stand.resultCurves).toHaveLength(targetFields.length)
    for (const [index, curve] of stand.resultCurves.entries()) {
      const {field: target, handler} = targetFields[index]!
      const source = actionFieldById.get(target.id)!
      expect(curve.fromTangent.z).toBeLessThan(0)
      expect(curve.toTangent.z).toBeLessThan(0)
      expect(curve.from).toEqual({
        x: source.x,
        y: source.y,
        z: source.z,
      })
      expect(curve.to).toEqual({
        x: target.x,
        y: target.y,
        z: target.z,
      })
      const path = sampleHermiteEdgeCurve(curve)
      expect(path[Math.floor(path.length / 4)]!.z).toBeLessThan(0)
      expect(path[Math.floor(path.length * 3 / 4)]!.z).toBeGreaterThan(0)
      expect(Math.hypot(
        curve.fromTangent.x,
        curve.fromTangent.y,
      )).toBeGreaterThan(0)
      expect(Math.hypot(
        curve.toTangent.x,
        curve.toTangent.y,
      )).toBeGreaterThan(0)
      expect(
        curve.fromTangent.x * (action.x - stand.atom.x) +
        curve.fromTangent.y * (action.y - stand.atom.y),
      ).toBeCloseTo(0)
      expect(
        curve.toTangent.x * (handler.x - stand.atom.x) +
        curve.toTangent.y * (handler.y - stand.atom.y),
      ).toBeCloseTo(0)
      const middle = path[Math.floor(path.length / 2)]!
      const chordMiddleRadius = Math.hypot(
        (curve.from.x + curve.to.x) / 2 - stand.atom.x,
        (curve.from.y + curve.to.y) / 2 - stand.atom.y,
      )
      expect(Math.hypot(
        middle.x - stand.atom.x,
        middle.y - stand.atom.y,
      )).toBeGreaterThan(chordMiddleRadius)
      expect(Math.abs(
        Math.hypot(
          middle.x - stand.atom.x,
          middle.y - stand.atom.y,
        ) - stand.context.orbits![0]!.radius,
      )).toBeLessThan(source.radius + target.radius)
    }

    for (const handler of targets) {
      const handlerCurves = stand.resultCurves.filter((curve) =>
        handler.fields.some((field) =>
          curve.to.x === field.x &&
          curve.to.y === field.y &&
          curve.to.z === field.z
        )
      )
      expect(handlerCurves.length).toBe(handler.fields.length)
      for (const curve of handlerCurves.slice(1)) {
        expect(curve.fromTangent.x).toBeCloseTo(
          handlerCurves[0]!.fromTangent.x,
        )
        expect(curve.fromTangent.y).toBeCloseTo(
          handlerCurves[0]!.fromTangent.y,
        )
        expect(curve.toTangent.x).toBeCloseTo(
          handlerCurves[0]!.toTangent.x,
        )
        expect(curve.toTangent.y).toBeCloseTo(
          handlerCurves[0]!.toTangent.y,
        )
      }
    }
  })

  test("draws three Field batches and one compact result-flow batch", () => {
    const stand = buildStateGraphProcessStand()
    const handlerFieldCount = stand.handlers.reduce(
      (count, handler) => count + handler.fields.length,
      0,
    )

    expect(stand.context.tori).toHaveLength(1 + stand.handlers.length)
    expect(stand.context.fields).toHaveLength(
      stand.atomFields.length + handlerFieldCount,
    )
    expect(stand.context.segments).toHaveLength(0)
    expect(stand.context.curves).toHaveLength(stand.handlers.length + 1)
    expect(stand.context.curves?.reduce(
      (count, batch) => count + batch.curves.length,
      0,
    )).toBe(handlerFieldCount + stand.resultCurves.length)
    expect(stand.context.curves?.at(-1)?.sphere).toEqual({
      fromAngle: Math.PI / 2,
      radius: stand.context.orbits![0]!.radius,
      toAngles: [
        ...Array(4).fill(Math.PI * 7 / 6),
        ...Array(2).fill(Math.PI * 11 / 6),
      ],
      x: stand.atom.x,
      y: stand.atom.y,
      z: stand.atom.z,
    })
    expect(stand.context.labels?.map((label) => label.text)).toEqual([
      `Atom projection · ${stand.atomFields.length} Fields`,
      "action",
      "success",
      "error",
    ])
  })

  test("lays the result S-curves smoothly onto the Handler orbit sphere", () => {
    const stand = buildStateGraphProcessStand()
    const sphere = stand.context.curves!.at(-1)!.sphere!

    for (const [curveIndex, curve] of stand.resultCurves.entries()) {
      const positions = new Float32Array(HERMITE_EDGE_SEGMENTS * 6)
      writeStateGraphSphericalCurveSegments(
        curve,
        positions,
        0,
        sphere,
        sphere.toAngles[curveIndex]!,
      )

      expect([...positions.slice(0, 3)]).toEqual([
        Math.fround(curve.from.x),
        Math.fround(curve.from.y),
        Math.fround(curve.from.z),
      ])
      expect([...positions.slice(-3)]).toEqual([
        Math.fround(curve.to.x),
        Math.fround(curve.to.y),
        Math.fround(curve.to.z),
      ])
      for (let index = 16; index <= 48; index += 1) {
        const offset = index === HERMITE_EDGE_SEGMENTS
          ? positions.length - 3
          : index * 6
        expect(Math.abs(Math.hypot(
          positions[offset]! - sphere.x,
          positions[offset + 1]! - sphere.y,
          positions[offset + 2]! - sphere.z,
        ) - sphere.radius)).toBeLessThan(0.05)
      }
      expect(positions[16 * 6 + 2]).toBeLessThan(sphere.z)
      expect(positions[48 * 6 + 2]).toBeGreaterThan(sphere.z)
    }
  })
})
