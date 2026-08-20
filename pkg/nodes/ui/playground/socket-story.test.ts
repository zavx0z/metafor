import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("Node Socket package-owned story boundary", () => {
  test("keeps metadata static and imports the production renderer only from the lazy story module", async () => {
    const metadata = await Bun.file(join(playgroundRoot, "stories.ts")).text()
    const story = await Bun.file(join(playgroundRoot, "stories/socket.ts")).text()
    expect(metadata).toContain('import("./stories/socket.ts")')
    expect(metadata).not.toContain('from "@nodes/ui/blender-node"')
    expect(story).toContain('from "@nodes/ui/blender-node"')
    expect(story).toContain("blenderSocketRenderer.render")
    expect(story).not.toContain('from "../blender-node.ts"')
  })

  test("loads remaining Node component story code through exact production subpaths", async () => {
    const metadata = await Bun.file(join(playgroundRoot, "stories.ts")).text()
    const story = await Bun.file(join(playgroundRoot, "stories/node-components.ts")).text()
    expect(metadata).toContain('import("@nodes/ui/node-editor")')
    expect(metadata).toContain('import("@nodes/ui/blender-node")')
    expect(metadata).toContain('import("@nodes/ui/link-curve")')
    expect(metadata).toContain('import("./stories/node-components.ts")')
    expect(story.split("\n").slice(0, 3).join("\n")).not.toContain('from "@nodes/ui/node-editor"')
    expect(story).toContain("Surface-based production previews")
  })

  test("uses one code/copy panel for every Node playground route", async () => {
    const client = await Bun.file(join(playgroundRoot, "client.ts")).text()
    const layout = await Bun.file(join(playgroundRoot, "layout.ts")).text()
    expect(client).toContain("new PlaygroundStoryPanelSurface(storyPanelOptions())")
    expect(client).toContain("loadNodePlaygroundStory(route)")
    expect(client).toContain("storyPreview.setStory(index, loaded, storyArgs)")
    expect(client).not.toContain("PlaygroundInfoSurface")
    expect(client).not.toContain("new SocketCatalogSurface")
    expect(layout).toContain("const story = shell.info")
  })
})
