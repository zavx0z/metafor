import {afterAll, describe, expect, test} from "bun:test"
import {mkdtemp, readdir, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"

const temporaryRoots: string[] = []

afterAll(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, {recursive: true, force: true})))
})

describe("Bulk production DOM boundary", () => {
  test("has zero retained UI imports in source and package manifests", async () => {
    const bulkRoot = new URL("../", import.meta.url)
    const sources = await Array.fromAsync(new Bun.Glob("**/*.{ts,tsx}").scan({
      cwd: bulkRoot.pathname,
      absolute: true,
      onlyFiles: true,
    }))
    const productionSources = sources.filter((path) =>
      !path.endsWith(".spec.ts") && !path.endsWith(".test.ts")
    )
    const forbidden = ["@layout/core", "@ui/elements", "@ui/hud"]

    for (const path of productionSources) {
      const source = await Bun.file(path).text()
      for (const specifier of forbidden) expect(source, path).not.toContain(specifier)
      expect(source, path).not.toMatch(/from\s+["']@ui\/components\/theme["']/u)
    }

    const bulkManifest = await Bun.file(new URL("../package.json", import.meta.url)).json() as {
      dependencies: Record<string, string>
    }
    const typesManifest = await Bun.file(new URL("../types/package.json", import.meta.url)).json() as {
      dependencies: Record<string, string>
      exports: Record<string, string>
    }
    for (const specifier of forbidden) {
      expect(bulkManifest.dependencies[specifier]).toBeUndefined()
      expect(typesManifest.dependencies[specifier]).toBeUndefined()
    }
    expect(typesManifest.exports["./hud"]).toBeUndefined()
    expect(bulkManifest.dependencies["@zavx0z/renderer-browser"])
      .toBe("link:@zavx0z/renderer-browser")
    expect(await Bun.file(new URL("../types/hud.ts", import.meta.url)).exists()).toBeFalse()
  })

  test("browser bundle contains the DOM overlay and no retained HUD graph", async () => {
    const root = await mkdtemp(join(tmpdir(), "metafor-bulk-dom-bundle-"))
    temporaryRoots.push(root)
    const result = await Bun.build({
      entrypoints: [new URL("../client.ts", import.meta.url).pathname],
      outdir: root,
      target: "browser",
      format: "esm",
      splitting: true,
      minify: false,
      sourcemap: "none",
    })

    expect(result.success, result.logs.map(String).join("\n")).toBeTrue()
    const sources = await Promise.all((await javascriptFiles(root)).map((path) => Bun.file(path).text()))
    const bundle = sources.join("\n")
    expect(bundle).toContain("createBulkHudController")
    expect(bundle).toContain("RendererWebGpuScreenOverlay")
    expect(bundle).toContain("HudWindow")
    expect(bundle).toContain("Timeline")
    expect(bundle).toContain("createBrowserLinkedAuthorStyleSheetHost")
    for (const forbidden of [
      "@layout/core",
      "@ui/elements",
      "@ui/hud",
      "BulkViewportHudRuntime",
      "BulkRadialMenuPane",
      "UiSurface",
      "HudTimelinePanel",
      "createHudWindow",
    ]) expect(bundle).not.toContain(forbidden)
  }, 30_000)
})

async function javascriptFiles(root: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(root, {withFileTypes: true})) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) result.push(...await javascriptFiles(path))
    else if (entry.isFile() && entry.name.endsWith(".js")) result.push(path)
  }
  return result.sort()
}
