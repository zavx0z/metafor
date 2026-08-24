import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const packageRoot = fileURLToPath(new URL(".", import.meta.url))

describe("@nodes/editor package boundary", () => {
  test("publishes exact headless entrypoints with only @nodes/core as a dependency", async () => {
    const manifest = await Bun.file(join(packageRoot, "package.json")).json() as {
      name?: string
      dependencies?: Record<string, string>
      exports?: Record<string, string>
    }
    expect(manifest.name).toBe("@nodes/editor")
    expect(manifest.dependencies).toEqual({"@nodes/core": "workspace:*"})
    expect(manifest.exports).toEqual({
      ".": "./index.ts",
      "./node-tree-editor": "./node-tree-editor.ts",
    })
  })

  test("keeps production authoring code free of UI, layout, DOM and product imports", async () => {
    const source = await Bun.file(join(packageRoot, "node-tree-editor.ts")).text()
    expect(source).toContain('from "@nodes/core/node-tree"')
    expect(source).toContain('from "@nodes/core/json-patch"')
    expect(source).not.toMatch(/from ["']@nodes\/(?:layout|ui)/)
    expect(source).not.toMatch(/from ["']@ui\//)
    expect(source).not.toMatch(/from ["']@metafor\/engine/)
    expect(source).not.toMatch(/\b(?:window\.|globalThis\.document|HTMLElement|WebGPU|Blender|Hamiltonian)\b/)
    expect(source).not.toContain("selection")
  })
})
