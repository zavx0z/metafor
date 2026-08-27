import {mkdtemp, readFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {afterAll, describe, expect, test} from "bun:test"
import {buildStaticStorybook} from "@zavx0z/storybook/build"
import {
  createStorybookPage,
  startStorybookHubServer,
} from "@zavx0z/storybook/server"
import {createQuantumStorybookApp} from "../../storybook/app.ts"

const temporaryRoots: string[] = []

afterAll(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, {recursive: true, force: true})))
})

describe("Quantum DOM Storybook delivery", () => {
  test("keeps one typed WebGPU diagnostic page with Graph as its home", () => {
    const app = createQuantumStorybookApp()

    expect(app.id).toBe("quantum")
    expect(app.basePath).toBe("")
    expect(app.home).toEqual({
      path: "/graph/",
      label: "Главная",
      ariaLabel: "На главную лаборатории Quantum",
    })
    expect(app.footer).toEqual({
      lead: "Создано для",
      owner: {
        label: "MetaFor",
        href: "https://github.com/zavx0z/metafor",
      },
      detail: "лаборатории доменных проекций Quantum",
    })
    expect(app.head.meta).toEqual([{
      kind: "public-path",
      name: "engine-default-font",
      path: "/fonts/jetbrains-mono-bold.ttf",
    }])
    expect(app.pages).toHaveLength(1)
    expect(app.pages[0]).toMatchObject({
      id: "graph",
      mountPath: "/",
      capability: "webgpu-diagnostic",
      readiness: {dataset: "quantumStorybook", value: "ready"},
      canvas: {id: "quantum-storybook-canvas", evidence: "non-black"},
    })
  })

  test("preserves canonical Graph routes and accepts only the exact Bulk branch", async () => {
    const app = createQuantumStorybookApp()
    const page = createStorybookPage(app, app.pages[0]!)
    const overview = await page.routeResponse("/graph")

    expect(overview?.status).toBe(308)
    expect(overview?.headers.get("location")).toBe("/graph/")
    expect((await page.routeResponse("/graph/document/current/complete"))?.status).toBe(200)
    expect((await page.routeResponse("/graph/reaction/dependencies/complete"))?.status).toBe(200)
    expect((await page.routeResponse("/graph/node-tree/projection/live"))?.status).toBe(200)
    expect((await page.routeResponse("/bulk"))?.status).toBe(308)
    expect((await page.routeResponse("/bulk"))?.headers.get("location")).toBe("/bulk/")
    expect((await page.routeResponse("/bulk/hud"))?.status).toBe(308)
    expect((await page.routeResponse("/bulk/hud"))?.headers.get("location")).toBe("/bulk/hud/")
    expect((await page.routeResponse("/bulk/hud/default"))?.status).toBe(200)
    expect((await page.routeResponse("/bulk/hud/unknown"))?.status).toBe(404)
    expect((await page.routeResponse("/graph/unknown"))?.status).toBe(404)
  })

  test("browser-compiles the real Russian laboratory entry", async () => {
    const app = createQuantumStorybookApp()
    const page = createStorybookPage(app, app.pages[0]!)
    const html = await page.htmlResponse()
    const text = await html.text()

    expect(text).toContain("Quantum · лаборатория")
    expect(text).toContain('id="quantum-storybook-canvas"')
    expect(text).toContain('<meta name="storybook-status-bar-lead" content="Создано для">')
    expect(text).toContain('<meta name="storybook-status-bar-owner" content="MetaFor">')
    expect(text).toContain(
      '<meta name="storybook-status-bar-detail" content="лаборатории доменных проекций Quantum">',
    )
    expect(text).not.toContain("data-storybook-footer")
    expect(text).not.toContain("Built for MetaFor")
    expect(text).not.toContain("reusable WebGPU UI")

    const entry = await page.assetResponse("/@storybook-assets/graph/entry.js")
    expect(entry?.status).toBe(200)
    const source = await entry!.text()
    expect(source).toContain("bulkPathnames")
    expect(source).toContain("graphPathnames")
    expect(source.match(/await import\("\.\/chunk-[^"]+\.js"\)/gu)).toHaveLength(2)
    expect(source).not.toContain("StorybookBackdropSurface")
    expect(source).not.toContain("createBulkHudDocument")
    expect(source).not.toContain("UiRuntime")
    expect(page.diagnostics.builds).toBe(1)
  })

  test("serves the app through the shared no-HMR hub", async () => {
    const server = startStorybookHubServer({
      app: createQuantumStorybookApp(),
      hostname: "127.0.0.1",
      port: 0,
      staticFiles: [{
        publicPath: "/fonts/jetbrains-mono-bold.ttf",
        sourcePath: fileURLToPath(
          import.meta.resolve("@engine/core/fonts/jetbrains-mono-bold.ttf"),
        ),
      }],
    })
    try {
      expect((await fetch(new URL("/graph/", server.url))).status).toBe(200)
      expect((await fetch(new URL("/graph/document/current/complete", server.url))).status).toBe(200)
      expect((await fetch(new URL("/graph/node-tree/projection/live", server.url))).status).toBe(200)
      expect((await fetch(new URL("/bulk/hud/default", server.url))).status).toBe(200)
      expect((await fetch(new URL("/graph/unknown", server.url))).status).toBe(404)
      expect((await fetch(new URL("/fonts/jetbrains-mono-bold.ttf", server.url))).status).toBe(200)
    } finally {
      server.stop(true)
    }
  })

  test("builds a schema-1 local artifact with lazy story chunks", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "metafor-quantum-storybook-"))
    temporaryRoots.push(temporaryRoot)
    const outputRoot = join(temporaryRoot, "dist")
    const revision = "1".repeat(40)
    const dependencyNames = [
      "@engine/core",
      "@metafor/node-tree",
      "@ui/components",
      "@zavx0z/dom",
      "@zavx0z/highlighter",
      "@zavx0z/renderer",
      "@zavx0z/renderer-browser",
      "@zavx0z/renderer-webgpu",
      "@zavx0z/storybook",
    ] as const

    const manifest = await buildStaticStorybook({
      app: createQuantumStorybookApp(),
      outputRoot,
      source: {revision, dirty: true},
      dependencies: dependencyNames.map((name) => ({name, revision, dirty: false})),
      staticFiles: [{
        publicPath: "/fonts/jetbrains-mono-bold.ttf",
        sourcePath: fileURLToPath(
          import.meta.resolve("@engine/core/fonts/jetbrains-mono-bold.ttf"),
        ),
      }],
    })

    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.app).toEqual({
      id: "quantum",
      title: "Quantum · лаборатория",
      basePath: "",
    })
    expect(manifest.source).toEqual({revision, dirty: true})
    expect(manifest.dependencies.map(({name}) => name)).toEqual([...dependencyNames])
    expect(manifest.pages).toHaveLength(1)
    expect(manifest.pages[0]).toMatchObject({
      id: "graph",
      publicMountPath: "",
      capability: "webgpu-diagnostic",
      readiness: {dataset: "quantumStorybook", value: "ready"},
      canvas: {id: "quantum-storybook-canvas", evidence: "non-black"},
      entry: "/@storybook-assets/graph/entry.js",
    })
    expect(manifest.pages[0]!.routes).toContain("/graph/document/current/complete")
    expect(manifest.pages[0]!.routes).toContain("/bulk/hud/default")
    expect(manifest.pages[0]!.chunks.length).toBeGreaterThanOrEqual(5)
    expect(manifest.assets.some(({path}) => path === "/fonts/jetbrains-mono-bold.ttf")).toBe(true)
    expect(manifest.assets.every(({bytes, sha256}) => bytes >= 0 && /^[0-9a-f]{64}$/.test(sha256))).toBe(true)

    const builtEntry = await readFile(join(
      outputRoot,
      manifest.pages[0]!.entry.replace(/^\//u, ""),
    ), "utf8")
    const lazyChunks = await Promise.all(manifest.pages[0]!.chunks.map(async (path) =>
      await readFile(join(outputRoot, path.replace(/^\//u, "")), "utf8")))
    expect(builtEntry.match(/await import\("\.\/chunk-[^"]+\.js"\)/gu)).toHaveLength(2)
    expect(builtEntry).not.toContain("GraphLabState")
    expect(builtEntry).not.toContain("createBulkHudDocument")
    expect(lazyChunks.some((source) => source.includes("quantumStorybookNodeTree"))).toBe(true)
    expect(lazyChunks.some((source) => source.includes("createBulkHudDocument"))).toBe(true)
    expect(builtEntry).not.toContain("createGraphNodeTree(input)")
    expect(lazyChunks.some((source) => source.includes("createGraphNodeTree"))).toBe(true)
    for (const source of [builtEntry, ...lazyChunks]) {
      for (const forbidden of [
        "@layout/core",
        "@ui/elements",
        "UiSurface",
        "UiRuntime",
        "StorybookBackdropSurface",
        "StorybookNavigationSurface",
        "NodeEditor",
      ]) expect(source).not.toContain(forbidden)
    }

    const recovery = await readFile(join(outputRoot, "404.html"), "utf8")
    expect(recovery).toContain("/graph/document/current/complete")
    expect(recovery).toContain("/graph/node-tree/projection/live")
    expect(recovery).toContain("/bulk/hud/default")
    expect(recovery).not.toContain("/bulk/hud/unknown")
    expect(recovery).not.toContain("/graph/unknown")
  })

  test("keeps server and local build on direct shared delivery imports", async () => {
    const serverSource = await readFile(join(import.meta.dir, "../../storybook/server.ts"), "utf8")
    const buildSource = await readFile(join(import.meta.dir, "../../storybook/build.ts"), "utf8")
    const storiesSource = await readFile(join(import.meta.dir, "../../storybook/graph/stories.ts"), "utf8")
    const storybookPackage = JSON.parse(
      await readFile(join(import.meta.dir, "../../storybook/package.json"), "utf8"),
    ) as {
      name?: string
      private?: boolean
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
    }

    expect(serverSource).toContain('from "@zavx0z/storybook/server"')
    expect(serverSource).toContain("startStorybookPackageServer({")
    expect(serverSource).not.toContain("port:")
    expect(serverSource).not.toMatch(/QUANTUM_STORYBOOK_(?:HOST|PORT)/u)
    expect(serverSource).not.toContain('from "@ui/storybook/server"')
    expect(buildSource).toContain('from "@zavx0z/storybook/build"')
    expect(buildSource).toContain('join(import.meta.dir, "dist")')
    expect(storiesSource).toContain('from "@zavx0z/storybook/catalog"')
    expect(storiesSource).toContain('await import("./stories/node-tree.ts")')
    expect(storiesSource).not.toContain('from "./stories/node-tree.ts"')
    for (const dependency of [
      "@engine/core/default-font",
      "@metafor/node-tree/graph",
      "@ui/components/code-editor",
      "@zavx0z/dom",
      "@zavx0z/highlighter",
      "@zavx0z/renderer",
      "@zavx0z/renderer-browser",
      "@zavx0z/renderer-webgpu",
      "@zavx0z/storybook/app",
    ]) {
      expect(buildSource).toContain(`import.meta.resolve("${dependency}")`)
    }
    expect(storybookPackage).toMatchObject({
      name: "@quantum/storybook",
      private: true,
    })
    expect(storybookPackage.scripts?.storybook).toBe("bun server.ts")
    expect(storybookPackage.scripts?.check).toBe("bun run typecheck && bun run test && bun run build")
    expect(storybookPackage.dependencies).toMatchObject({
      "@metafor/node-tree": "workspace:*",
      "@ui/components": "link:@ui/components",
      "@zavx0z/dom": "link:@zavx0z/dom",
      "@zavx0z/renderer": "link:@zavx0z/renderer",
      "@zavx0z/renderer-browser": "link:@zavx0z/renderer-browser",
      "@zavx0z/renderer-webgpu": "link:@zavx0z/renderer-webgpu",
    })
    for (const forbidden of ["@layout/core", "@nodes/layout", "@nodes/ui", "@ui/elements"]) {
      expect(storybookPackage.dependencies?.[forbidden]).toBeUndefined()
    }
  })
})
