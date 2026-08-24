import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))
const uiPlaygroundRoot = fileURLToPath(new URL("..", import.meta.url))

describe("Node Socket package-owned story boundary", () => {
  test("keeps metadata static and imports the production renderer only from the lazy story module", async () => {
    const metadata = await Bun.file(join(uiPlaygroundRoot, "ui-story-catalog.ts")).text()
    const story = await Bun.file(join(playgroundRoot, "socket.ts")).text()
    expect(metadata).toContain('import("./stories/socket.ts")')
    expect(metadata).not.toContain('from "@nodes/ui/blender-node"')
    expect(story).toContain('from "@nodes/ui/blender-node"')
    expect(story).toContain("blenderSocketRenderer.render")
    expect(story).not.toContain('from "../blender-node.ts"')
  })

  test("loads remaining Node component story code through exact production subpaths", async () => {
    const metadata = await Bun.file(join(uiPlaygroundRoot, "ui-story-catalog.ts")).text()
    const story = await Bun.file(join(playgroundRoot, "node-components.ts")).text()
    expect(metadata).toContain('import("@nodes/ui/node-editor")')
    expect(metadata).toContain('import("@nodes/ui/blender-node")')
    expect(metadata).toContain('import("@nodes/ui/link-curve")')
    expect(metadata).toContain('import("./stories/node-components.ts")')
    expect(story.split("\n").slice(0, 3).join("\n")).not.toContain('from "@nodes/ui/node-editor"')
    expect(story).toContain("Surface-based production previews")
  })

  test("keeps controlled Node state source on exact public production imports", async () => {
    const story = await Bun.file(join(playgroundRoot, "node-components.ts")).text()
    expect(story).toContain('from "@nodes/ui/node-editor"')
    expect(story).toContain('from "@nodes/ui/blender-node"')
    expect(story).not.toContain('from "../node-editor.ts"')
    expect(story).not.toContain('from "../blender-node.ts"')
  })

  test("uses one code/copy panel for every Node playground route", async () => {
    const client = await Bun.file(join(uiPlaygroundRoot, "ui-playground.ts")).text()
    const layout = await Bun.file(join(uiPlaygroundRoot, "ui-workbench-layout.ts")).text()
    expect(client).toContain("new PlaygroundStoryPanelSurface(storyPanelOptions())")
    expect(client).toContain("loadNodePlaygroundStory(route)")
    expect(client).toContain("storyPreview.setStory(index, loaded, storyArgs)")
    expect(client).not.toContain("PlaygroundInfoSurface")
    expect(client).not.toContain("new SocketCatalogSurface")
    expect(layout).toContain("const story = compact ? hidden() : shell.info")
  })
})
