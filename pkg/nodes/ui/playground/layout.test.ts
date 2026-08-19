import {describe, expect, test} from "bun:test"
import {planNodeComponentPlaygroundFrames} from "./layout.ts"

describe("Node component playground Flexbox regions", () => {
  test("plans fields, editor and sockets without overlap", () => {
    const frames = planNodeComponentPlaygroundFrames(1920, 1080)
    expect(frames.fields).toEqual({x: 16, y: 70, w: 520, h: 994})
    expect(frames.editor.x).toBe(552)
    expect(frames.editor.y).toBe(70)
    expect(frames.editor.w).toBe(1352)
    expect(frames.editor.h).toBeCloseTo(654.667, 3)
    expect(frames.sockets.x).toBe(552)
    expect(frames.sockets.y).toBeCloseTo(736.667, 3)
    expect(frames.sockets.w).toBe(1352)
    expect(frames.sockets.h).toBeCloseTo(327.333, 3)
  })
})
