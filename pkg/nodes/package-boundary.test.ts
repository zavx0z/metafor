import {describe, expect, test} from "bun:test"
import {mkdtemp, readdir, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, relative} from "node:path"
import {fileURLToPath} from "node:url"

const packageRoot = fileURLToPath(new URL(".", import.meta.url))
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))

describe("universal node-system package boundaries", () => {
  test("keeps the core package free of renderer, HUD and product imports", async () => {
    const packageJson = await Bun.file(join(packageRoot, "package.json")).json() as {
      dependencies?: Record<string, string>
    }
    expect(Object.keys(packageJson.dependencies ?? {}).sort()).toEqual(["@nodes/layout"])

    const files = (await sourceFiles(packageRoot))
      .filter((path) => !path.includes("/.agents/"))
      .filter((path) => !path.includes("/fixtures/"))
      .filter((path) => !path.includes("/layout/"))
      .filter((path) => !path.includes("/playground/"))
      .filter((path) => !path.includes("/ui/"))
      .filter((path) => !path.includes("/hud/"))
      .filter((path) => !path.endsWith(".test.ts"))
    const source = await readAll(files)
    expect(source).not.toMatch(/from ["']@nodes\/(?:ui|hud)/)
    expect(source).not.toMatch(/from ["']@ui\//)
    expect(source).not.toMatch(/from ["']@metafor\/engine/)
    expect(source).not.toContain("Hamiltonian")
  })

  test("keeps exact Node Editor rendering solver-free and isolates the explicit projection adapter", async () => {
    const uiRoot = join(packageRoot, "ui")
    const packageJson = await Bun.file(join(uiRoot, "package.json")).json() as {
      dependencies?: Record<string, string>
    }
    expect(packageJson.dependencies?.["@ui/hud"]).toBeUndefined()
    const production = (await sourceFiles(uiRoot))
      .filter((path) => !path.endsWith(".test.ts"))
      .filter((path) => !path.includes("/playground/"))
    const source = await readAll(production)
    const exactEditor = await Bun.file(join(uiRoot, "node-editor.ts")).text()
    const projection = await Bun.file(join(uiRoot, "blender-projection.ts")).text()
    expect(source).not.toMatch(/from ["']@ui\/hud/)
    expect(exactEditor).not.toMatch(/from ["'](?:nodes|@nodes\/layout)/)
    expect(projection).toContain('from "nodes/node-tree"')
    expect(projection).toContain('from "@nodes/layout/fixed"')
    expect(source).not.toMatch(/\b(?:NodeSystemSurface|NodeSystemCard|NodeSystemFact)\b/)
    for (const productTerm of [
      "service-worker-api",
      "oracle-rtc-data-channel",
      "force-rtc-data-channel",
      "HAMILTONIAN",
    ]) expect(source).not.toContain(productTerm)
  })

  test("publishes only existing independent entrypoints", async () => {
    for (const packagePath of ["pkg/nodes", "pkg/nodes/ui", "pkg/nodes/layout"]) {
      const root = join(repositoryRoot, packagePath)
      const packageJson = await Bun.file(join(root, "package.json")).json() as {
        exports?: Record<string, string | Readonly<{default?: string; types?: string}>>
      }
      for (const target of Object.values(packageJson.exports ?? {})) {
        const values = typeof target === "string" ? [target] : [target.default, target.types]
        for (const value of new Set(values.filter((entry): entry is string => entry !== undefined))) {
          expect(await Bun.file(join(root, value)).exists(), `${packagePath} exports missing ${value}`).toBeTrue()
        }
      }
    }
    const rootManifest = await Bun.file(join(packageRoot, "package.json")).json() as {
      exports: Record<string, unknown>
    }
    expect(Object.keys(rootManifest.exports).sort()).toEqual([
      ".",
      "./layout-worker",
      "./layout-worker/adaptive/client",
      "./layout-worker/adaptive/executor",
      "./layout-worker/fixed/client",
      "./layout-worker/fixed/executor",
      "./layout-worker/transport",
      "./layout-worker/types",
      "./node-tree",
      "./parameter",
      "./projection-types",
    ])
    for (const legacy of [
      "validation.ts",
      "containment.ts",
      "measured-layout.ts",
      "adaptive-layout.ts",
      "incremental-layout.ts",
      "types/model.ts",
      "types/measured.ts",
    ]) expect(await Bun.file(join(packageRoot, legacy)).exists(), legacy).toBeFalse()
  })

  test("builds independent core, layout policies and Blender Node Editor consumer", async () => {
    const core = await buildFixture("core-consumer.ts")
    const fixedLayout = await buildFixture("fixed-layout-consumer.ts")
    const adaptiveLayout = await buildFixture("adaptive-layout-consumer.ts")
    const nodeEditor = await buildFixture("blender-node-editor-consumer.ts")
    const blenderProjection = await buildFixture("blender-projection-consumer.ts")

    expect(core.source).toContain("Stale NodeTree projection")
    expect(core.source).toContain("must contain only finite numbers")
    expect(core.source).not.toContain("struct GlobalUniforms")
    expect(core.source).not.toContain("NO_LEGAL_LAYOUT")
    expect(fixedLayout.source).toContain("Port has conflicting edge roles")
    expect(fixedLayout.source).toContain("NO_LEGAL_LAYOUT")
    expect(fixedLayout.source).not.toContain("NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT")
    expect(fixedLayout.source).not.toContain("NodeSystemSurface")
    expect(adaptiveLayout.source).toContain("NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT")
    expect(adaptiveLayout.source).toContain("NO_LEGAL_LAYOUT")
    expect(adaptiveLayout.source).not.toContain("Port has conflicting edge roles")
    expect(adaptiveLayout.source).not.toContain("NodeSystemSurface")
    expect(adaptiveLayout.source).not.toContain("NodeInspectorSurface")
    expect(adaptiveLayout.source).not.toContain("struct GlobalUniforms")
    expect(nodeEditor.source).toContain("NodeEditor")
    expect(nodeEditor.source).toContain("NodeCanvas")
    expect(nodeEditor.source).toContain("Socket is detached")
    expect(nodeEditor.source).not.toContain("NO_LEGAL_LAYOUT")
    expect(nodeEditor.source).not.toContain("NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT")
    expect(blenderProjection.source).toContain("Stale NodeTree projection")
    expect(blenderProjection.source).toContain("Port has conflicting edge roles")
    expect(blenderProjection.source).toContain("Missing Blender Node")
    for (const legacy of [
      "NodeSystemSurface",
      "NodeSystemCard",
      "NodeSystemFact",
      "NodeInspectorSurface",
    ]) expect(nodeEditor.source).not.toContain(legacy)

    expect(core.bytes).toBeLessThan(20_000)
    expect(fixedLayout.bytes).toBeLessThan(100_000)
    expect(fixedLayout.gzipBytes).toBeLessThan(32_000)
    expect(adaptiveLayout.bytes).toBeLessThan(120_000)
    expect(adaptiveLayout.gzipBytes).toBeLessThan(36_000)
    expect(nodeEditor.bytes).toBeLessThan(350_000)
    expect(nodeEditor.gzipBytes).toBeLessThan(100_000)
    expect(blenderProjection.bytes).toBeLessThan(520_000)
    expect(blenderProjection.gzipBytes).toBeLessThan(145_000)
  })
})

async function buildFixture(name: string): Promise<{source: string; bytes: number; gzipBytes: number}> {
  const directory = await mkdtemp(join(tmpdir(), "nodes-package-bundle-"))
  const output = join(directory, "bundle.js")
  try {
    const childProcess = Bun.spawn([
      process.execPath,
      "build",
      join(packageRoot, "fixtures", name),
      "--target=browser",
      "--format=esm",
      "--minify",
      `--outfile=${output}`,
    ], {cwd: repositoryRoot, stdout: "pipe", stderr: "pipe"})
    const [exitCode, stdout, stderr] = await Promise.all([
      childProcess.exited,
      new Response(childProcess.stdout).text(),
      new Response(childProcess.stderr).text(),
    ])
    if (exitCode !== 0) throw new Error(`${stdout}\n${stderr}`.trim())
    const bytes = new Uint8Array(await Bun.file(output).arrayBuffer())
    return {
      source: new TextDecoder().decode(bytes),
      bytes: bytes.byteLength,
      gzipBytes: Bun.gzipSync(bytes).byteLength,
    }
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, {withFileTypes: true})
  const files: string[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (entry.isFile() && path.endsWith(".ts")) files.push(path)
  }
  return files
}

async function readAll(paths: readonly string[]): Promise<string> {
  const sources = await Promise.all(paths.map(async (path) =>
    `// ${relative(repositoryRoot, path)}\n${await Bun.file(path).text()}`))
  return sources.join("\n")
}
