import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const uiRoot = fileURLToPath(new URL("../", import.meta.url))
const packageRoots = Object.freeze({
  engine: join(uiRoot, "../engine"),
  elements: join(uiRoot, "elements"),
  components: join(uiRoot, "components"),
  nodeUi: join(uiRoot, "../nodes/ui"),
})

describe("production UI delivery baseline", () => {
  test("keeps every manifest export on an existing production source", async () => {
    for (const root of Object.values(packageRoots)) {
      const manifest = await Bun.file(join(root, "package.json")).json() as {
        exports?: Record<string, string | Readonly<{default?: string; types?: string}>>
      }
      for (const target of Object.values(manifest.exports ?? {})) {
        const values = typeof target === "string" ? [target] : [target.default, target.types]
        for (const value of new Set(values.filter((entry): entry is string => entry !== undefined))) {
          expect(value).not.toContain("playground")
          expect(await Bun.file(join(root, value)).exists(), `${root} exports missing ${value}`).toBeTrue()
        }
      }
    }
  })

  test("keeps production source independent from playground", async () => {
    for (const root of Object.values(packageRoots)) {
      const glob = new Bun.Glob("**/*.ts")
      for await (const relative of glob.scan({cwd: root})) {
        if (relative.startsWith("playground/") || relative.includes(".test.") || relative.includes(".spec.")) continue
        const source = await Bun.file(join(root, relative)).text()
        expect(source, `${root}/${relative}`).not.toMatch(/from\s+["']@ui\/playground(?:\/[^"']*)?["']/)
      }
    }
  })

  test("lets one runtime attach production surfaces without leaf runtime creation", async () => {
    const runtime = await Bun.file(join(packageRoots.elements, "runtime.ts")).text()
    const button = await Bun.file(join(packageRoots.components, "Button.ts")).text()
    const field = await Bun.file(join(packageRoots.components, "Field.ts")).text()
    const nodeEditor = await Bun.file(join(packageRoots.nodeUi, "node-editor.ts")).text()

    expect(runtime).toContain("surface.attachCanvas(this)")
    for (const [name, source] of Object.entries({button, field, nodeEditor})) {
      expect(source, name).not.toContain("UiRuntime.create")
      expect(source, name).not.toContain("new UiRuntime")
    }
  })

  test("keeps one canonical Engine package identity", async () => {
    const manifest = await Bun.file(join(packageRoots.engine, "package.json")).json() as {
      name: string
      exports: Record<string, unknown>
    }
    expect(manifest.name).toBe("@metafor/engine")
    expect(Object.keys(manifest.exports)).toEqual(["."])
  })
})
