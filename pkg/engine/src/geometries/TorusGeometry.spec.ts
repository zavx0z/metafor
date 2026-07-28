import {describe, expect, test} from "bun:test"
import {TorusGeometry} from "./TorusGeometry"

describe("TorusGeometry", () => {
  test("provides one unit normal for every mesh vertex", () => {
    const geometry = new TorusGeometry({
      radius: 3,
      tube: 1,
      radialSegments: 6,
      tubularSegments: 8,
    })
    const positions = geometry.attributes.position
    const normals = geometry.attributes.normal
    const values = normals?.array

    expect(normals?.count).toBe(positions?.count)
    expect(values?.[0]).toBeCloseTo(1)
    expect(values?.[1]).toBeCloseTo(0)
    expect(values?.[2]).toBeCloseTo(0)
    for (let index = 0; index < (normals?.count ?? 0); index += 1) {
      expect(Math.hypot(
        values![index * 3]!,
        values![index * 3 + 1]!,
        values![index * 3 + 2]!,
      )).toBeCloseTo(1)
    }
  })

  test("draws each closed wireframe seam exactly once", () => {
    const radialSegments = 3
    const tubularSegments = 4
    const geometry = new TorusGeometry({
      radialSegments,
      tubularSegments,
    }).toWireframe()

    expect(geometry.attributes.position?.count).toBe(
      radialSegments * tubularSegments * 2 * 2,
    )
  })
})
