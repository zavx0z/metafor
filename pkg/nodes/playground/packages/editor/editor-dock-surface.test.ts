import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {planNodeTreeEditorDock} from "./editor-dock-surface.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("parent NodeTree editor dock", () => {
  test("keeps header and authoring body nested inside one bounded Pane", () => {
    expect(planNodeTreeEditorDock(800, 220)).toEqual({
      header: {x: 10, y: 10, w: 780, h: 30},
      body: {x: 10, y: 43, w: 780, h: 167},
    })
    const compact = planNodeTreeEditorDock(12, 20)
    expect(compact.header.w).toBe(0)
    expect(compact.body.h).toBe(0)
  })

  test("uses one retained Pane owner and shared collection, enum and Field controls", async () => {
    const source = await Bun.file(join(playgroundRoot, "editor-dock-surface.ts")).text()
    expect(source).toContain("this.createRetainedParent()")
    expect(source).toContain("this.materializeRetainedParent(this.#content")
    expect(source).toContain("Pane(this, 0, 0, this.rectW, this.rectH")
    expect(source).toContain("children: () => {")
    expect(source).toContain("CollectionInput(this")
    expect(source).toContain("EnumInput(this")
    expect(source).toContain("Field(this")
    expect(source).not.toContain("PlaygroundDockSurface")
  })
})
