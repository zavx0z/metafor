import {describe, expect, test} from "bun:test"
import {planPlaygroundShell} from "./layout.ts"

describe("shared Playground FlexBox shell", () => {
  test("plans historical five-panel desktop geometry", () => {
    const frames = planPlaygroundShell(1920, 1080)
    expect(frames.compact).toBeFalse()
    expect(frames.stage).toEqual({x: 130, y: 110, w: 1660, h: 860})
    expect(frames.catalog).toEqual({x: 130, y: 110, w: 210, h: 860})
    expect(frames.section).toEqual({x: 358, y: 110, w: 160, h: 860})
    expect(frames.info).toEqual({x: 1490, y: 110, w: 300, h: 860})
    expect(frames.preview.x).toBe(536)
    expect(frames.preview.y).toBe(110)
    expect(frames.preview.w).toBe(936)
    expect(frames.preview.h).toBe(742)
    expect(frames.dock).toEqual({x: 536, y: 870, w: 936, h: 100})
  })

  test("gives mobile viewport only to consumer preview", () => {
    const frames = planPlaygroundShell(390, 844)
    expect(frames.compact).toBeTrue()
    expect(frames.preview).toEqual({x: 8, y: 8, w: 374, h: 828})
    for (const frame of [frames.catalog, frames.section, frames.dock, frames.info]) expect(frame.visible).toBeFalse()
  })
})
