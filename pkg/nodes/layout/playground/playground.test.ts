import {describe, expect, test} from "bun:test"
import {readdir} from "node:fs/promises"
import {join, relative} from "node:path"
import {fileURLToPath} from "node:url"
import {getFixtureFamily, PLAYGROUND_FIXTURES} from "./fixtures.ts"
import {PLAYGROUND_POLICIES} from "./policy-registry.ts"
import {runPlaygroundLayout} from "./runner.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))
const layoutRoot = fileURLToPath(new URL("..", import.meta.url))

const BASELINES = {
  "fixed-baseline-right": {
    direction: "RIGHT",
    bounds: {x: 0, y: 0, width: 632, height: 446},
    resultHash: "78d036df9a386533218936d0f2366e32f233f28a4f28d892d17bf1bb0fb4c844",
    svgHash: "af3cdf224dd87c2591fae5c9ff93c56b87321b741f863f3bb98431406ba9da4b",
  },
  "fixed-baseline-down": {
    direction: "DOWN",
    bounds: {x: 0, y: 0, width: 396, height: 830},
    resultHash: "bb8fd47580182a40198e6aff388dcf7d26b28651ed9d592fa825efc02b4929c1",
    svgHash: "9d952e881efe4ca7d666f5ec18dec919a431bde018a4b34fee3a889d2bc9a365",
  },
} as const

const ADAPTIVE_BASELINES = {
  "adaptive-shared-right": {
    direction: "RIGHT",
    side: "EAST",
    bounds: {x: 0, y: 0, width: 540, height: 330},
    resultHash: "908e21c560fc58850a831e4b865123d650e4d1b6c72917476d23ed033aee115a",
    svgHash: "db1a372da49a6913619ba33a6e009eb65a689358188ffabe61565385c0795e2a",
  },
  "adaptive-shared-down": {
    direction: "DOWN",
    side: "WEST",
    bounds: {x: 0, y: 0, width: 280, height: 400},
    resultHash: "5c50a710cb8f79b6c42cc79b9eb7ea219798e1700f2606952bc97f8a4899af3d",
    svgHash: "0a7f3453fe80baf7a70d1510ac9917dbfdce32b56aad637765cee6eaf0d936bc",
  },
} as const

describe("dev-only nodes layout playground", () => {
  test("runs the public fixed policy against frozen RIGHT and DOWN inputs", () => {
    expect(PLAYGROUND_POLICIES.map(({id}) => id)).toEqual(["fixed", "adaptive"])

    for (const fixture of getFixtureFamily("fixed-baseline")) {
      const baseline = BASELINES[fixture.id as keyof typeof BASELINES]
      expect(baseline, `missing baseline for ${fixture.id}`).toBeDefined()
      const first = runPlaygroundLayout("fixed", fixture.graph)
      const second = runPlaygroundLayout("fixed", fixture.graph)

      expect(first.result.direction).toBe(fixture.expectedDirection)
      expect(first.result.direction).toBe(baseline.direction)
      expect(first.result.bounds).toEqual(baseline.bounds)
      expect(hash(first.result)).toBe(baseline.resultHash)
      expect(hash(first.svg)).toBe(baseline.svgHash)
      expect(second.result).toEqual(first.result)
      expect(second.svg).toBe(first.svg)
    }
  })

  test("keeps the comparison fixtures topology-identical apart from viewport", () => {
    for (const family of ["fixed-baseline", "adaptive-side-selection"]) {
      const [right, down] = getFixtureFamily(family)
      expect(right).toBeDefined()
      expect(down).toBeDefined()
      expect(withoutViewport(right!.graph)).toEqual(withoutViewport(down!.graph))
      expect(right!.graph.viewport.width).toBeGreaterThan(right!.graph.viewport.height)
      expect(down!.graph.viewport.width).toBeLessThan(down!.graph.viewport.height)
    }
  })

  test("runs the public adaptive policy as a deterministic RIGHT and DOWN matrix", () => {
    for (const fixture of getFixtureFamily("adaptive-side-selection")) {
      const baseline = ADAPTIVE_BASELINES[fixture.id as keyof typeof ADAPTIVE_BASELINES]
      const first = runPlaygroundLayout("adaptive", fixture.graph)
      const second = runPlaygroundLayout("adaptive", fixture.graph)
      const shared = first.result.ports.find(({id}) => id === "source/shared")

      expect(baseline, `missing baseline for ${fixture.id}`).toBeDefined()
      expect(first.result.direction).toBe(fixture.expectedDirection)
      expect(first.result.direction).toBe(baseline.direction)
      expect(first.result.bounds).toEqual(baseline.bounds)
      expect(shared?.side).toBe(baseline.side)
      expect(first.svg).toContain("data-port-id=\"source/shared\"")
      expect(first.svg).toContain(`data-side="${baseline.side}"`)
      expect(hash(first.result)).toBe(baseline.resultHash)
      expect(hash(first.svg)).toBe(baseline.svgHash)
      expect(first.policyDiagnostics).toMatchObject({
        candidateBudget: 16,
        theoreticalCandidateCount: "2",
        dynamicPortCount: 1,
        attemptedCandidates: 2,
      })
      expect(second.result).toEqual(first.result)
      expect(second.svg).toBe(first.svg)
      expect(second.policyDiagnostics).toEqual(first.policyDiagnostics)
    }
  })

  test("renders inspectable nodes, compounds, exact ports, routes, bends, gateways and bounds", () => {
    for (const fixture of getFixtureFamily("fixed-baseline")) {
      const run = runPlaygroundLayout("fixed", fixture.graph)
      expect(run.svg).toContain(`data-direction="${fixture.expectedDirection}"`)
      expect(run.svg).toContain("data-kind=\"layout-bounds\"")
      expect(run.svg).toContain("data-layer=\"nodes\"")
      expect(run.svg).toContain("class=\"node compound\"")
      expect(run.svg).toContain("data-layer=\"ports\"")
      expect(run.svg).toContain("data-port-id=\"producer/out-primary\"")
      expect(run.svg).toContain("data-layer=\"edges\"")
      expect(run.svg).toContain("data-edge-id=\"primary\"")
      expect(run.svg).toContain("class=\"bend\"")
      expect(run.svg).toContain("data-layer=\"gateways\"")
      expect(run.svg).toContain("class=\"gateway\"")
      expect(run.metrics.compoundCount).toBe(2)
      expect(run.metrics.bendCount).toBeGreaterThan(0)
      expect(run.metrics.gatewayCount).toBeGreaterThan(0)
      expect(run.metrics.totalManhattan).toBeGreaterThan(0)
    }
  })

  test("keeps all playground sources outside production exports and free of forbidden imports", async () => {
    const packageJson = await Bun.file(join(layoutRoot, "package.json")).json() as {
      exports?: Record<string, unknown>
    }
    expect(Object.keys(packageJson.exports ?? {})).not.toContain("./playground")

    const files = await sourceFiles(playgroundRoot)
    const productionFiles = files.filter((path) => !path.endsWith(".test.ts"))
    const source = await readAll(productionFiles)
    for (const forbidden of [
      /from ["']@nodes\/ui/,
      /from ["']@nodes\/hud/,
      /from ["']@metafor\/engine/,
      /from ["'][^"']*hamiltonian/i,
      /from ["'][^"']*bulk/i,
      /from ["']@nodes\/layout\/(?:src|types|internal)/,
    ]) expect(source).not.toMatch(forbidden)

    const runtimeLayoutImports = productionFiles.flatMap((path) => {
      const contents = Bun.file(path).text()
      return [{path, contents}]
    })
    const loaded = await Promise.all(runtimeLayoutImports.map(async ({path, contents}) => ({
      path,
      contents: await contents,
    })))
    const callers = loaded.filter(({contents}) =>
      /import\s*{[^}]*\blayoutFixed\b[^}]*}\s*from\s*["']@nodes\/layout\/fixed["']/.test(contents))
    expect(callers.map(({path}) => relative(playgroundRoot, path))).toEqual(["policy-registry.ts"])
    const adaptiveCallers = loaded.filter(({contents}) =>
      /import\s*{[^}]*\blayoutAdaptiveWithDiagnostics\b[^}]*}\s*from\s*["']@nodes\/layout\/adaptive["']/.test(contents))
    expect(adaptiveCallers.map(({path}) => relative(playgroundRoot, path))).toEqual(["policy-registry.ts"])
  })

  test("builds as a browser-only SVG tool without renderer or GPU code", async () => {
    const build = await Bun.build({
      entrypoints: [join(playgroundRoot, "client.ts")],
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "none",
    })
    expect(build.success, build.logs.map(({message}) => message).join("\n")).toBeTrue()
    const output = build.outputs[0]
    expect(output).toBeDefined()
    const source = await output!.text()
    expect(source).not.toContain("NodeSystemSurface")
    expect(source).not.toContain("GPUDevice")
    expect(source).not.toContain("struct GlobalUniforms")
    expect(source).not.toContain("NodeInspectorSurface")
    expect(source).not.toContain("WebGPU")
  })
})

function withoutViewport(graph: (typeof PLAYGROUND_FIXTURES)[number]["graph"]): unknown {
  const {viewport: _, ...topology} = graph
  return topology
}

function hash(value: unknown): string {
  const bytes = typeof value === "string" ? value : JSON.stringify(value)
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, {withFileTypes: true})
  const files: string[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (entry.isFile() && (path.endsWith(".ts") || path.endsWith(".html") || path.endsWith(".css"))) files.push(path)
  }
  return files.sort()
}

async function readAll(paths: readonly string[]): Promise<string> {
  return (await Promise.all(paths.map(async (path) =>
    `// ${relative(playgroundRoot, path)}\n${await Bun.file(path).text()}`))).join("\n")
}
