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

  test("gives the mobile viewport to NodeEditor without overflowing catalogs", () => {
    const frames = planNodeComponentPlaygroundFrames(390, 844)
    expect(frames.fields).toEqual({x: 0, y: 0, w: 0, h: 0, visible: false})
    expect(frames.sockets).toEqual({x: 0, y: 0, w: 0, h: 0, visible: false})
    expect(frames.editor).toEqual({x: 8, y: 70, w: 374, h: 766})
    expect(planNodeComponentPlaygroundFrames(844, 390).editor).toEqual({x: 8, y: 70, w: 828, h: 312})
  })
})
