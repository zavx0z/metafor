import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("central Nodes playground scaffold", () => {
  test("is one private dev-only workspace that composes every package", async () => {
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
      "@metafor/engine": "workspace:*",
      "@nodes/core": "workspace:*",
      "@nodes/editor": "workspace:*",
      "@nodes/layout": "workspace:*",
      "@nodes/layout-worker": "workspace:*",
      "@nodes/ui": "workspace:*",
      "@ui/components": "workspace:*",
      "@ui/elements": "workspace:*",
      "@ui/playground": "workspace:*",
    })
    expect(manifest.exports).toBeUndefined()
  })

  test("delegates one no-HMR origin and six independent pages to the shared hub server", async () => {
    const server = await Bun.file(join(playgroundRoot, "server.ts")).text()
    const registry = await Bun.file(join(playgroundRoot, "server/page-registry.ts")).text()
    const catalog = await Bun.file(join(playgroundRoot, "catalog/package-catalog.ts")).text()

    expect(server).toContain('from "@ui/playground/server"')
    expect(server).toContain("startPlaygroundHubServer({")
    expect(server).toContain("createNodesPlaygroundPages()")
    expect(server).toContain("Bun.env.NODES_PLAYGROUND_HOST")
    expect(server).toContain("Bun.env.NODES_PLAYGROUND_PORT ?? 4018")
    expect(server).not.toContain("Bun.serve")
    expect(server).not.toContain("hmr: true")
    expect(registry).toContain('mountPath: "/"')
    expect(registry).toContain('canvasId: "nodes-playground-canvas"')
    for (const id of ["core", "editor", "layout", "layout-worker", "ui"]) {
      expect(catalog).toContain(`id: ${JSON.stringify(id)}`)
      expect(registry).toContain(id === "layout-worker" ? '"layout-worker":' : `${id}:`)
    }
  })

  test("keeps editor integration isolated in its clearly named package module", async () => {
    const entry = await Bun.file(join(
      playgroundRoot,
      "packages/editor/editor-playground.ts",
    )).text()

    expect(entry).toContain('from "@nodes/core/node-tree"')
    expect(entry).toContain('from "@nodes/core/parameter"')
    expect(entry).toContain('from "@nodes/editor"')
    expect(entry).toContain('from "@nodes/ui/blender-projection"')
    expect(entry).toContain("tree.project(projector")
    expect(entry).toContain("editor.setProjection(projection)")
    expect(entry).toContain("new NodeTreeEditor(tree)")
    expect(entry).toContain("new NodeTreeEditorDockSurface(dockOptions())")
    expect(entry).toContain("author.addParameter({")
    expect(entry).toContain("author.connect({")
    expect(entry).toContain("author.markLayoutApplied(projection)")
    expect(entry).toContain('event.key === "F6"')
    expect(entry).toContain('event.key === "F7"')
    expect(entry).toContain('event.key === "F8"')
    expect(entry).toContain('event.key === "F9"')
    expect(entry).toContain("nodeTreeMaterializations")
    expect(entry).toContain("return applyProjection()")
    expect(entry).not.toContain("gain.set(value)")
    expect(entry).not.toContain("NodeFieldValueState")
    expect(entry).not.toContain("bindNodeFieldValueState")
    expect(entry).not.toContain("positionBlenderNode")
  })

  test("removes package-local playground servers after centralization", async () => {
    for (const path of [
      "../layout/playground/server.ts",
      "../layout/playground/tsconfig.json",
      "../ui/playground/server.ts",
      "../ui/playground/tsconfig.json",
    ]) expect(await Bun.file(join(playgroundRoot, path)).exists(), path).toBeFalse()
  })
})
