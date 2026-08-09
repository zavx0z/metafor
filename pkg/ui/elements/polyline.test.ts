import {describe, expect, test} from "bun:test"
import {createUiPolylineStrokeGeometry} from "./polyline.ts"

describe("UI polyline stroke geometry", () => {
  test("builds one indexed ribbon with shared join vertices", () => {
    const geometry = createUiPolylineStrokeGeometry([
      {x: 0, y: 0},
      {x: 10, y: 0},
      {x: 10, y: 10},
    ], 2)

    expect(geometry?.attributes.position?.count).toBe(6)
    expect(geometry?.attributes.normal?.count).toBe(6)
    expect(Array.from(geometry?.index?.array ?? [])).toEqual([
      0, 1, 2, 2, 1, 3,
      2, 3, 4, 4, 3, 5,
    ])
    expect(Array.from(geometry?.attributes.position?.array ?? []).every(Number.isFinite)).toBe(true)
  })

  test("rejects a stroke that cannot produce finite connected segments", () => {
    expect(createUiPolylineStrokeGeometry([{x: 0, y: 0}], 2)).toBeNull()
    expect(createUiPolylineStrokeGeometry([{x: 0, y: 0}, {x: 0, y: 0}], 2)).toBeNull()
    expect(createUiPolylineStrokeGeometry([{x: 0, y: 0}, {x: 1, y: 0}], 0)).toBeNull()
    expect(createUiPolylineStrokeGeometry([{x: 0, y: 0}, {x: Number.NaN, y: 0}], 2)).toBeNull()
  })

  test("drops a near-duplicate join without hiding the remaining stroke", () => {
    const geometry = createUiPolylineStrokeGeometry([
      {x: 0, y: 0},
      {x: 1e-9, y: 0},
      {x: 10, y: 0},
    ], 2)

    expect(geometry).not.toBeNull()
    expect(geometry?.attributes.position?.count).toBe(4)
    expect(Array.from(geometry?.index?.array ?? [])).toEqual([0, 1, 2, 2, 1, 3])
  })
})
