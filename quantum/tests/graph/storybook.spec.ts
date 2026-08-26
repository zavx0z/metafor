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

describe("Quantum Graph Storybook delivery", () => {
  test("defines one typed WebGPU diagnostic app at /graph", () => {
    const app = createQuantumStorybookApp()

    expect(app.id).toBe("quantum")
    expect(app.basePath).toBe("/graph")
    expect(app.home).toEqual({
      path: "/",
      label: "Главная",
      ariaLabel: "На главную лаборатории Quantum",
    })
    expect(app.footer).toEqual({
      lead: "Создано для",
      owner: {
        label: "MetaFor",
        href: "https://github.com/zavx0z/metafor",
      },
      detail: "лаборатория Graph для сравнения доменных проекций",
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

  test("uses canonical routes and rejects an unknown experiment", async () => {
    const app = createQuantumStorybookApp()
    const page = createStorybookPage(app, app.pages[0]!)
    const overview = await page.routeResponse("/graph")

    expect(overview?.status).toBe(308)
    expect(overview?.headers.get("location")).toBe("/graph/")
    expect((await page.routeResponse("/graph/document/current/complete"))?.status).toBe(200)
    expect((await page.routeResponse("/graph/unknown"))?.status).toBe(404)
  })

  test("browser-compiles the real Russian laboratory entry", async () => {
    const app = createQuantumStorybookApp()
    const page = createStorybookPage(app, app.pages[0]!)
    const html = await page.htmlResponse()
    const text = await html.text()

    expect(text).toContain("Quantum · лаборатория Graph")
    expect(text).toContain('id="quantum-storybook-canvas"')
    expect(text).toContain("Создано для")
    expect(text).toContain("лаборатория Graph для сравнения доменных проекций")
    expect(text).not.toContain("Built for MetaFor")
    expect(text).not.toContain("reusable WebGPU UI")

    const entry = await page.assetResponse("/graph/@storybook-assets/graph/entry.js")
    expect(entry?.status).toBe(200)
    const source = await entry!.text()
    expect(source).toContain("quantumStorybook")
    expect(source).toContain("StorybookBackdropSurface")
    expect(source).toContain("GraphLabState")
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
      expect((await fetch(new URL("/graph/unknown", server.url))).status).toBe(404)
      expect((await fetch(new URL("/graph/fonts/jetbrains-mono-bold.ttf", server.url))).status).toBe(200)
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
      "@layout/core",
      "@ui/workspace",
      "@zavx0z/highlighter",
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
      title: "Quantum · лаборатория Graph",
      basePath: "/graph",
    })
    expect(manifest.source).toEqual({revision, dirty: true})
    expect(manifest.dependencies.map(({name}) => name)).toEqual([...dependencyNames])
    expect(manifest.pages).toHaveLength(1)
    expect(manifest.pages[0]).toMatchObject({
      id: "graph",
      publicMountPath: "/graph",
      capability: "webgpu-diagnostic",
      readiness: {dataset: "quantumStorybook", value: "ready"},
      canvas: {id: "quantum-storybook-canvas", evidence: "non-black"},
      entry: "/graph/@storybook-assets/graph/entry.js",
    })
    expect(manifest.pages[0]!.chunks.length).toBeGreaterThanOrEqual(3)
    expect(manifest.assets.some(({path}) => path === "/graph/fonts/jetbrains-mono-bold.ttf")).toBe(true)
    expect(manifest.assets.every(({bytes, sha256}) => bytes >= 0 && /^[0-9a-f]{64}$/.test(sha256))).toBe(true)

    const recovery = await readFile(join(outputRoot, "404.html"), "utf8")
    expect(recovery).toContain("/graph/document/current/complete")
    expect(recovery).not.toContain("/graph/unknown")
  })

  test("keeps server and local build on direct shared delivery imports", async () => {
    const serverSource = await readFile(join(import.meta.dir, "../../storybook/server.ts"), "utf8")
    const buildSource = await readFile(join(import.meta.dir, "../../storybook/build.ts"), "utf8")
    const storybookPackage = JSON.parse(
      await readFile(join(import.meta.dir, "../../storybook/package.json"), "utf8"),
    ) as {name?: string; private?: boolean; scripts?: Record<string, string>}

    expect(serverSource).toContain('from "@zavx0z/storybook/server"')
    expect(serverSource).toContain("startStorybookPackageServer({")
    expect(serverSource).not.toContain("port:")
    expect(serverSource).not.toMatch(/QUANTUM_STORYBOOK_(?:HOST|PORT)/u)
    expect(serverSource).not.toContain('from "@ui/storybook/server"')
    expect(buildSource).toContain('from "@zavx0z/storybook/build"')
    expect(buildSource).toContain('join(import.meta.dir, "dist")')
    for (const dependency of [
      "@engine/core/default-font",
      "@layout/core/runtime",
      "@ui/elements/primitives",
      "@zavx0z/highlighter",
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
  })
})
