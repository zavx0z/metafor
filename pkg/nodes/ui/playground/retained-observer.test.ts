import {describe, expect, test} from "bun:test"
import {readRibbonEndpointCenters} from "./retained-observer.ts"

describe("Node component playground retained observer", () => {
  test("reads actual Link ribbon endpoint centers from paired geometry vertices", () => {
    const geometry = {
      attributes: {
        position: {
          itemSize: 3,
          array: new Float32Array([
            8, 19, 0,
            12, 21, 0,
            38, 49, 0,
            42, 51, 0,
            78, 89, 0,
            82, 91, 0,
          ]),
        },
      },
    }

    expect(readRibbonEndpointCenters(geometry)).toEqual({
      first: {x: 10, y: 20},
      last: {x: 80, y: 90},
    })
  })

  test("rejects non-ribbon geometry instead of inferring endpoint evidence", () => {
    expect(readRibbonEndpointCenters({attributes: {}})).toBeNull()
    expect(readRibbonEndpointCenters({
      attributes: {position: {itemSize: 2, array: new Float32Array(12)}},
    })).toBeNull()
  })
})
