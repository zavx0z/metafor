import {describe, expect, test} from "bun:test"
import {readdir} from "node:fs/promises"
import {join, relative} from "node:path"
import {fileURLToPath} from "node:url"
import {getFixtureFamily, PLAYGROUND_FIXTURES} from "./fixtures.ts"
import {PLAYGROUND_POLICIES} from "./policy-registry.ts"
import {runPlaygroundLayout} from "./runner.ts"
import {layoutPortLabels} from "./svg.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))
const layoutRoot = fileURLToPath(new URL("..", import.meta.url))

const BASELINES = {
  "fixed-baseline-right": {
    direction: "RIGHT",
    bounds: {x: 0, y: 0, width: 632, height: 446},
    resultHash: "78d036df9a386533218936d0f2366e32f233f28a4f28d892d17bf1bb0fb4c844",
    svgHash: "dfa2925688d8aeb17fcf58a9ce8ba73e0603c4d9a16c11eede5d4f5632c4deb0",
  },
  "fixed-baseline-down": {
    direction: "DOWN",
    bounds: {x: 0, y: 0, width: 396, height: 830},
    resultHash: "bb8fd47580182a40198e6aff388dcf7d26b28651ed9d592fa825efc02b4929c1",
    svgHash: "293bba82e7953e25e5969c722e4dd435182b16e90cd06d411f414c19fb098cd8",
  },
} as const

const ADAPTIVE_BASELINES = {
  "adaptive-shared-right": {
    direction: "RIGHT",
    side: "EAST",
    bounds: {x: 0, y: 0, width: 540, height: 330},
    resultHash: "908e21c560fc58850a831e4b865123d650e4d1b6c72917476d23ed033aee115a",
    svgHash: "c04b91b7fc1f10ed2e22df6b80dac78261d9ce2ba85e539195ed3028d3acc2cd",
  },
  "adaptive-shared-down": {
    direction: "DOWN",
    side: "WEST",
    bounds: {x: 0, y: 0, width: 280, height: 400},
    resultHash: "5c50a710cb8f79b6c42cc79b9eb7ea219798e1700f2606952bc97f8a4899af3d",
    svgHash: "fe9f73910bfdf9f00357392b7c4fe4f35fddc3d96e25764710b237b57e45c169",
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

  test("places deterministic port labels outside route bounds with exact non-overlapping leaders", () => {
    for (const fixture of PLAYGROUND_FIXTURES) {
      const policy = fixture.family === "fixed-baseline" ? "fixed" : "adaptive"
      const run = runPlaygroundLayout(policy, fixture.graph)
      const labels = layoutPortLabels(run.result)
      const repeated = layoutPortLabels(run.result)
      const portById = new Map(run.result.ports.map((port) => [port.id, port]))

      expect(repeated).toEqual(labels)
      expect(labels).toHaveLength(run.result.ports.length)
      expect(run.svg).toContain("data-kind=\"port-label\"")
      expect(run.svg).toContain("class=\"port-label-leader\"")

      const layerOrder = [
        "edges",
        "port-label-leaders",
        "nodes",
        "gateways",
        "ports",
        "port-labels",
      ].map((layer) => run.svg.indexOf(`data-layer="${layer}"`))
      expect(layerOrder.every((index) => index >= 0)).toBeTrue()
      expect([...layerOrder].sort((left, right) => left - right)).toEqual(layerOrder)
      expect(layerContents(run.svg, "port-label-leaders")).toContain("port-label-leader")
      expect(layerContents(run.svg, "port-label-leaders")).not.toContain("port-label-box")
      expect(layerContents(run.svg, "port-labels")).not.toContain("port-label-leader")
      expect(layerContents(run.svg, "port-labels")).toContain("port-label-box")

      for (const label of labels) {
        const port = portById.get(label.portId)
        expect(port).toBeDefined()
        expect(label.leader.startPoint).toEqual({x: port!.x, y: port!.y})
        expect(label.leader.endPoint.y).toBe(label.box.y + label.box.height / 2)
        if (label.side === "WEST") {
          expect(label.box.x + label.box.width).toBeLessThan(run.result.bounds.x)
          expect(label.leader.endPoint.x).toBe(label.box.x + label.box.width)
        } else {
          expect(label.box.x).toBeGreaterThan(run.result.bounds.x + run.result.bounds.width)
          expect(label.leader.endPoint.x).toBe(label.box.x)
        }
      }

      for (let left = 0; left < labels.length; left += 1) {
        for (let right = left + 1; right < labels.length; right += 1) {
          expect(overlaps(labels[left]!.box, labels[right]!.box)).toBeFalse()
        }
      }
    }
  })

  test("keeps the complete visible playground interface in Russian", async () => {
    const html = await Bun.file(join(playgroundRoot, "index.html")).text()
    const client = await Bun.file(join(playgroundRoot, "client.ts")).text()
    const fixtures = await Bun.file(join(playgroundRoot, "fixtures.ts")).text()
    const policies = await Bun.file(join(playgroundRoot, "policy-registry.ts")).text()
    const visibleSource = [html, client, fixtures, policies].join("\n")

    expect(html).toContain('<html lang="ru">')
    for (const required of [
      "Стенд раскладки",
      "Сценарий",
      "Политика / вариант",
      "Нормализованный числовой вход",
      "Запустить",
      "Сбросить",
      "Сравнить RIGHT / DOWN",
      "Слои SVG",
      "Сохранить результат",
      "Результат JSON",
      "Диагностика",
      "Фиксированная",
      "Адаптивная",
      "Горизонтальная (RIGHT)",
      "Вертикальная (DOWN)",
      "мс",
    ]) expect(visibleSource).toContain(required)

    for (const removed of [
      "Layout playground",
      "Public policy in",
      ">Fixture<",
      "Policy / variant",
      "Normalized numeric input",
      ">Run<",
      ">Reset<",
      "Compare RIGHT / DOWN",
      "SVG layers",
      "Export input",
      "Export result",
      "Export SVG",
      "Result JSON",
      "No diagnostics yet",
      "Fixed baseline",
      "Adaptive shared port",
      "Public fixed-port policy",
      "Public bounded policy",
      "продуктового renderer",
      "составная topology",
      "числовые anchors",
      "форме viewport",
      "hard-валидатор",
    ]) expect(visibleSource).not.toContain(removed)
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

function overlaps(
  left: Readonly<{x: number; y: number; width: number; height: number}>,
  right: Readonly<{x: number; y: number; width: number; height: number}>,
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

function layerContents(svg: string, layer: string): string {
  const match = svg.match(new RegExp(`<g data-layer="${layer}"[^>]*>(.*?)</g>`))
  expect(match, `missing SVG layer ${layer}`).not.toBeNull()
  return match![1]!
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
