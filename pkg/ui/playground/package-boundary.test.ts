import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const root = fileURLToPath(new URL(".", import.meta.url))

describe("@ui/playground package boundary", () => {
  test("contains no consumer or product vocabulary", async () => {
    const files = ["index.ts", "router.ts", "layout.ts", "surfaces.ts", "theme.ts", "server.ts"]
    const source = (await Promise.all(files.map((path) => Bun.file(join(root, path)).text()))).join("\n")
    for (const forbidden of ["NodeEditor", "NodeCanvas", "Blender", "Socket", "Parameter", "Hamiltonian", "Bulk"]) {
      expect(source).not.toContain(forbidden)
    }
  })

  test("exports reusable router, layout and shell surfaces", async () => {
    const source = await Bun.file(join(root, "index.ts")).text()
    expect(source).toContain("router.ts")
    expect(source).toContain("story.ts")
    expect(source).toContain("layout.ts")
    expect(source).toContain("surfaces.ts")
  })

  test("builds one consumer without embedding package-specific vocabulary", async () => {
    const fixtureSource = await Bun.file(join(root, "fixture/entry.ts")).text()
    const fixtureServer = await Bun.file(join(root, "fixture/server.ts")).text()
    expect(fixtureSource).toContain("createRetainedParent")
    expect(fixtureSource).toContain("playgroundRetained")
    expect(fixtureSource).toContain("definePlaygroundRoutes({routes, fallback: \"overview\"})")
    expect(fixtureServer).toContain('packageName: "@ui/playground"')
    expect(fixtureServer).not.toContain("title:")
    const build = await Bun.build({
      entrypoints: [join(root, "fixture/entry.ts")],
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "none",
      loader: {".wgsl": "text"},
    })
    expect(build.success, build.logs.map(({message}) => message).join("\n")).toBeTrue()
    const source = await build.outputs[0]!.text()
    expect(source).toContain("PlaygroundNavigationSurface")
    for (const forbidden of ["NodeEditor", "BlenderSocket", "Hamiltonian", "Bulk"]) expect(source).not.toContain(forbidden)
  })

  test("lets a consumer add exact static assets without owning server mechanics", async () => {
    const source = await Bun.file(join(root, "server.ts")).text()
    expect(source).toContain("staticFiles")
    expect(source).toContain("staticRoutes")
    expect(source).toContain("development: {hmr: false}")
  })
})
