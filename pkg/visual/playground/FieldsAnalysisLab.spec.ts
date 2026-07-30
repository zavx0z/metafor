import {describe, expect, test} from "bun:test"
import {
  FIELDS_PSEUDO_SPHERE_MARKER_RADIUS,
  distributeOnPseudoSphere,
  layoutFieldsInPseudoCircle,
  pseudoSphereRadiusForFieldCount,
} from "./FieldsAnalysisLab.ts"

describe("Fields Analysis Lab", () => {
  test("distributes every Field center on one deterministic pseudo-sphere", () => {
    const radius = pseudoSphereRadiusForFieldCount(54)
    const points = distributeOnPseudoSphere(54, radius)

    expect(points).toHaveLength(54)
    expect(new Set(points.map(({x, y, z}) =>
      `${x.toFixed(6)}:${y.toFixed(6)}:${z.toFixed(6)}`
    )).size).toBe(54)
    for (const point of points) {
      expect(Math.hypot(point.x, point.y, point.z))
        .toBeCloseTo(radius)
    }
    expect(distributeOnPseudoSphere(54, radius))
      .toEqual(points)
  })

  test("uses the smallest distribution radius at which Fibonacci neighbours do not overlap", () => {
    for (const count of [2, 17, 54, 128]) {
      const points = distributeOnPseudoSphere(
        count,
        pseudoSphereRadiusForFieldCount(count),
      )
      let minimumDistance = Number.POSITIVE_INFINITY
      for (let left = 0; left < points.length; left += 1) {
        for (let right = left + 1; right < points.length; right += 1) {
          const from = points[left]!
          const to = points[right]!
          minimumDistance = Math.min(
            minimumDistance,
            Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z),
          )
        }
      }
      expect(minimumDistance)
        .toBeCloseTo(FIELDS_PSEUDO_SPHERE_MARKER_RADIUS * 2)
    }
    expect(pseudoSphereRadiusForFieldCount(108))
      .toBeGreaterThan(pseudoSphereRadiusForFieldCount(54))
  })

  test("packs equal Fields across a flat circle on a dense hexagonal lattice", () => {
    for (const count of [2, 3, 17, 54, 128]) {
      const {points, radius} = layoutFieldsInPseudoCircle(count)
      expect(points).toHaveLength(count)
      expect(points.every((point) => point.z === 0)).toBe(true)
      let minimumDistance = Number.POSITIVE_INFINITY
      for (let left = 0; left < points.length; left += 1) {
        const point = points[left]!
        expect(Math.hypot(point.x, point.y) +
          FIELDS_PSEUDO_SPHERE_MARKER_RADIUS).toBeLessThanOrEqual(radius)
        for (let right = left + 1; right < points.length; right += 1) {
          const peer = points[right]!
          minimumDistance = Math.min(
            minimumDistance,
            Math.hypot(point.x - peer.x, point.y - peer.y),
          )
        }
      }
      expect(minimumDistance)
        .toBeCloseTo(FIELDS_PSEUDO_SPHERE_MARKER_RADIUS * 2)
    }
    const disk = layoutFieldsInPseudoCircle(54)
    expect(new Set(disk.points.map((point) =>
      Math.hypot(point.x, point.y).toFixed(3)
    )).size).toBeGreaterThan(3)
    expect(layoutFieldsInPseudoCircle(128).radius)
      .toBeGreaterThan(layoutFieldsInPseudoCircle(54).radius)
  })

  test("uses the fixed-highlight Sphere skin without an idle animation", async () => {
    const [source, page] = await Promise.all([
      Bun.file(new URL("./FieldsAnalysisLab.ts", import.meta.url)).text(),
      Bun.file(new URL("./index.html", import.meta.url)).text(),
    ])

    expect(source).toContain("createQuantumSphereMaterial")
    expect(source).not.toContain("createQuantumFilmMaterial")
    expect(source).not.toContain("highlightSize:")
    expect(source).not.toContain("renderLoop")
    expect(page).toContain('id="fields-analysis-stage"')
    expect(page).toContain('id="fields-analysis-canvas"')
    expect(page).toContain('id="fields-analysis-count-control"')
    expect(page).toContain('id="fields-analysis-title"')
  })
})
