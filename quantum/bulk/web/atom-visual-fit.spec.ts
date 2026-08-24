import {describe, expect, test} from "bun:test"
import {
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "@engine/core"
import {resolveOwnedAtomVisualFitBounds} from "./atom-visual-fit.ts"

describe("owning Atom visual fit", () => {
  test("collects only the requested Atom's surface geometry and spheres", () => {
    const scene = new Object3D()
    const atom = new Object3D()
    atom.position.set(10, -5, 3)
    scene.add(atom)

    const torus = new Object3D()
    atom.add(torus)
    const field = new Object3D()
    field.position.set(18, 0, 0)
    atom.add(field)
    const unrelated = new Object3D()
    unrelated.position.set(10_000, 0, 0)
    scene.add(unrelated)
    scene.updateWorldMatrix(true)

    const center = new Vector3(10, -5, 3)
    const bounds = resolveOwnedAtomVisualFitBounds(
      2,
      center,
      [
        {
          atomId: 2,
          geometry: new TorusGeometry({
            radius: 10,
            tube: 3,
            radialSegments: 12,
            tubularSegments: 24,
          }),
          node: torus,
        },
        {
          atomId: 99,
          geometry: new SphereGeometry({
            radius: 500,
            widthSegments: 8,
            heightSegments: 6,
          }),
          node: unrelated,
        },
      ],
      [{atomId: 2, node: field, radius: 2}],
    )

    expect(bounds.points.length).toBeGreaterThan(8)
    expect(bounds.radius).toBeGreaterThanOrEqual(20)
    expect(bounds.radius).toBeLessThan(30)
  })
})
