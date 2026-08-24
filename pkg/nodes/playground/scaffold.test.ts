import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("parent nodes playground scaffold", () => {
  test("is a private dev-only workspace with one shared server dependency", async () => {
    const manifest = await Bun.file(join(playgroundRoot, "package.json")).json() as {
      name?: string
      private?: boolean
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      exports?: Record<string, unknown>
    }

    expect(manifest.name).toBe("@nodes/playground")
    expect(manifest.private).toBeTrue()
    expect(manifest.scripts).toEqual({
      playground: "bun server.ts",
      test: "bun test .",
      typecheck: "tsc --noEmit --pretty false",
    })
    expect(manifest.dependencies).toEqual({
      "@nodes/core": "workspace:*",
      "@nodes/ui": "workspace:*",
      "@ui/elements": "workspace:*",
      "@ui/playground": "workspace:*",
    })
    expect(manifest.exports).toBeUndefined()
  })

  test("delegates HTML and no-HMR delivery to the shared package server", async () => {
    const server = await Bun.file(join(playgroundRoot, "server.ts")).text()
    const style = await Bun.file(join(playgroundRoot, "style.css")).text()

    expect(server).toContain('from "@ui/playground/server"')
    expect(server).toContain("startPlaygroundServer({")
    expect(server).toContain('packageName: "nodes"')
    expect(server).toContain('canvasId: "nodes-playground-canvas"')
    expect(server).toContain("Bun.env.NODES_PLAYGROUND_HOST")
    expect(server).toContain("Bun.env.NODES_PLAYGROUND_PORT ?? 4018")
    expect(server).toContain('entrypoint: join(import.meta.dir, "entry.ts")')
    expect(server).not.toContain("Bun.serve")
    expect(server).not.toContain("hmr: true")
    expect(style).toContain("#nodes-playground-canvas")
    expect(style).toContain("touch-action: none")
  })

  test("connects the live root runtime without a separate Field state map or manual Node coordinates", async () => {
    const entry = await Bun.file(join(playgroundRoot, "entry.ts")).text()

    expect(entry).toContain('from "@nodes/core/node-tree"')
    expect(entry).toContain('from "@nodes/core/parameter"')
    expect(entry).toContain('from "@nodes/ui/blender-projection"')
    expect(entry).toContain("tree.project(projector")
    expect(entry).toContain("editor.setProjection(projection)")
    expect(entry).toContain("gain.set(value)")
    expect(entry).toContain('event.key === "F8"')
    expect(entry).toContain("nodeTreeMaterializations")
    expect(entry).toContain("return applyProjection()")
    expect(entry).not.toContain("NodeFieldValueState")
    expect(entry).not.toContain("bindNodeFieldValueState")
    expect(entry).not.toContain("positionBlenderNode")
  })
})
