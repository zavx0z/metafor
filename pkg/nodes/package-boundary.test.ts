import {describe, expect, test} from "bun:test"
import {readdir} from "node:fs/promises"
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
      .filter((path) => !path.includes("/fixtures/"))
      .filter((path) => !path.includes("/layout/"))
      .filter((path) => !path.includes("/ui/"))
      .filter((path) => !path.includes("/hud/"))
      .filter((path) => !path.endsWith(".test.ts"))
    const source = await readAll(files)
    expect(source).not.toMatch(/from ["']@nodes\/(?:ui|hud)/)
    expect(source).not.toMatch(/from ["']@ui\//)
    expect(source).not.toMatch(/from ["']@metafor\/engine/)
    expect(source).not.toContain("Hamiltonian")
  })

  test("keeps the renderer HUD-free and free of Hamiltonian vocabulary", async () => {
    const uiRoot = join(packageRoot, "ui")
    const packageJson = await Bun.file(join(uiRoot, "package.json")).json() as {
      dependencies?: Record<string, string>
    }
    expect(packageJson.dependencies?.["@ui/hud"]).toBeUndefined()
    const source = await readAll((await sourceFiles(uiRoot)).filter((path) => !path.endsWith(".test.ts")))
    expect(source).not.toMatch(/from ["']@ui\/hud/)
    for (const productTerm of [
      "service-worker-api",
      "oracle-rtc-data-channel",
      "force-rtc-data-channel",
      "HAMILTONIAN",
    ]) expect(source).not.toContain(productTerm)
  })

  test("publishes only existing independent entrypoints", async () => {
    for (const packagePath of ["pkg/nodes", "pkg/nodes/ui", "pkg/nodes/hud", "pkg/nodes/layout"]) {
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
  })

  test("builds independent core, fixed-card and custom-positioned consumers", async () => {
    const core = await buildFixture("core-consumer.ts")
    const fixed = await buildFixture("fixed-card-consumer.ts")
    const custom = await buildFixture("custom-positioned-consumer.ts")

    expect(core.source).not.toContain("struct GlobalUniforms")
    expect(core.source).not.toContain("NO_LEGAL_LAYOUT")
    expect(core.source).not.toContain("NodeSystemSurface")
    expect(fixed.source).toContain("NO_LEGAL_LAYOUT")
    expect(fixed.source).not.toContain("NodeInspectorSurface")
    expect(fixed.source).not.toContain("struct GlobalUniforms")
    expect(custom.source).toContain("NodeSystemSurface")
    expect(custom.source).not.toContain("NO_LEGAL_LAYOUT")
    expect(custom.source).not.toContain("NodeInspectorSurface")

    expect(core.bytes).toBeLessThan(8_000)
    expect(fixed.bytes).toBeLessThan(115_000)
    expect(custom.bytes).toBeLessThan(300_000)
  })
})

async function buildFixture(name: string): Promise<{source: string; bytes: number}> {
  const result = await Bun.build({
    entrypoints: [join(packageRoot, "fixtures", name)],
    target: "browser",
    format: "esm",
    minify: true,
    sourcemap: "none",
  })
  if (!result.success) {
    throw new Error(result.logs.map((entry) => entry.message).join("\n"))
  }
  const output = result.outputs[0]
  if (output === undefined) throw new Error(`Missing bundle output: ${name}`)
  const bytes = await output.arrayBuffer()
  return {source: new TextDecoder().decode(bytes), bytes: bytes.byteLength}
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
