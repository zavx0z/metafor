import {describe, expect, test} from "bun:test"
import {createSceneUniformLayout} from "./scene-uniform-layout"

describe("scene uniform layout", () => {
  test("places camera after the complete aligned light array", () => {
    expect(createSceneUniformLayout(4, 32)).toEqual({
      byteSize: 288,
      cameraFloatOffset: 68,
      lightsFloatOffset: 36,
    })
  })
})
