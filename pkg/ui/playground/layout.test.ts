import {describe, expect, test} from "bun:test"
import {planPlaygroundShell} from "./layout.ts"

describe("shared Playground FlexBox shell", () => {
  test("fills the available desktop with historical five-panel geometry", () => {
    const frames = planPlaygroundShell(1920, 1080)
    expect(frames.compact).toBeFalse()
    expect(frames.stage).toEqual({x: 16, y: 16, w: 1888, h: 1048})
    expect(frames.catalog).toEqual({x: 16, y: 16, w: 210, h: 1048})
    expect(frames.section).toEqual({x: 244, y: 16, w: 160, h: 1048})
    expect(frames.info).toEqual({x: 1464, y: 16, w: 440, h: 1048})
    expect(frames.preview).toEqual({x: 422, y: 16, w: 1024, h: 930})
    expect(frames.dock).toEqual({x: 422, y: 964, w: 1024, h: 100})
  })

  test("keeps desktop panel sizing configurable without restoring max caps", () => {
    const frames = planPlaygroundShell(1920, 1080, {
      padding: 12,
      gap: 12,
      catalogWidth: 260,
      sectionWidth: 210,
      infoWidth: 420,
      dockHeight: 104,
    })
    expect(frames.stage).toEqual({x: 12, y: 12, w: 1896, h: 1056})
    expect(frames.catalog).toEqual({x: 12, y: 12, w: 260, h: 1056})
    expect(frames.section).toEqual({x: 284, y: 12, w: 210, h: 1056})
    expect(frames.preview).toEqual({x: 506, y: 12, w: 970, h: 940})
    expect(frames.dock).toEqual({x: 506, y: 964, w: 970, h: 104})
    expect(frames.info).toEqual({x: 1488, y: 12, w: 420, h: 1056})
  })

  test("collapses optional desktop panels and gives their space to preview", () => {
    const frames = planPlaygroundShell(1920, 1080, {collapsed: ["catalog", "info"]})
    expect(frames.catalog.visible).toBeFalse()
    expect(frames.info.visible).toBeFalse()
    expect(frames.section).toEqual({x: 16, y: 16, w: 160, h: 1048})
    expect(frames.preview).toEqual({x: 194, y: 16, w: 1710, h: 930})
    expect(frames.dock).toEqual({x: 194, y: 964, w: 1710, h: 100})
  })
})
