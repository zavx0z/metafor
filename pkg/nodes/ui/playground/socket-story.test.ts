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

  test("uses code/copy for Socket routes and leaves static info only to legacy routes", async () => {
    const client = await Bun.file(join(playgroundRoot, "client.ts")).text()
    const layout = await Bun.file(join(playgroundRoot, "layout.ts")).text()
    expect(client).toContain("new PlaygroundStoryPanelSurface(storyPanelOptions())")
    expect(client).toContain("NODE_SOCKET_STORIES.load(route)")
    expect(client).toContain("storyPreview.setStory(index, loaded, storyArgs)")
    expect(client).toContain("if (!isNodeSocketStoryRoute(route)) info.setOptions")
    expect(client).not.toContain("new SocketCatalogSurface")
    expect(layout).toContain("story = shell.info")
    expect(layout).toContain("info = hidden()")
  })
})
