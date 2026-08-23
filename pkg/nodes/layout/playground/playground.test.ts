import {describe, expect, test} from "bun:test"
import {readdir} from "node:fs/promises"
import {join, relative} from "node:path"
import {fileURLToPath} from "node:url"
import {getFixtureFamily, PLAYGROUND_FIXTURES} from "./fixtures.ts"
import {PLAYGROUND_POLICIES} from "./policy-registry.ts"
import {runPlaygroundLayout} from "./runner.ts"
import {findGatewayPoints, layoutPortLabels, orderNodeGeometryForPainting} from "./svg.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))
const layoutRoot = fileURLToPath(new URL("..", import.meta.url))

const BASELINES = {
  "fixed-baseline-right": {
    direction: "RIGHT",
    bounds: {x: 0, y: 0, width: 632, height: 446},
    resultHash: "78d036df9a386533218936d0f2366e32f233f28a4f28d892d17bf1bb0fb4c844",
    svgHash: "06b613ed5423c5bab9d6a6463defa79c80e19946a171b34e8775e0baec4151da",
  },
  "fixed-baseline-down": {
    direction: "DOWN",
    bounds: {x: 0, y: 0, width: 396, height: 830},
    resultHash: "bb8fd47580182a40198e6aff388dcf7d26b28651ed9d592fa825efc02b4929c1",
    svgHash: "3a1dff856c72c057e2e3ac04bd201a79f2fae1d4ffeefe6532fc74c2a5b702e9",
  },
} as const

const ADAPTIVE_BASELINES = {
  "adaptive-shared-right": {
    direction: "RIGHT",
    side: "EAST",
    bounds: {x: 0, y: 0, width: 540, height: 330},
    resultHash: "908e21c560fc58850a831e4b865123d650e4d1b6c72917476d23ed033aee115a",
    svgHash: "c4af6391484d48b68ba95bee35c9559717d8f7a70cd53303b85a956cc7011c04",
  },
  "adaptive-shared-down": {
    direction: "DOWN",
    side: "WEST",
    bounds: {x: 0, y: 0, width: 280, height: 400},
    resultHash: "5c50a710cb8f79b6c42cc79b9eb7ea219798e1700f2606952bc97f8a4899af3d",
    svgHash: "6c0bd1792ce1e9c27d8eb0ae784e6df45760e9dbba6b2cde232f137fc068027e",
  },
} as const

const ADAPTIVE_COMPOUND_BASELINES = {
  "adaptive-compound-right": {
    direction: "RIGHT",
    side: "EAST",
    bounds: {x: 0, y: 0, width: 604, height: 424},
    resultHash: "9732f683af8925702f04db46a49a674acc87b6a5cf0a828011c2c5720d4448a0",
    svgHash: "96bcb1808d5a2ef805fb77a7e733940c8e3ea25fece16bca205bb2266ccb46e8",
  },
  "adaptive-compound-down": {
    direction: "DOWN",
    side: "WEST",
    bounds: {x: 0, y: 0, width: 316, height: 588},
    resultHash: "8cd59ef4c9c367c7ad5c1cca22f8a8dc629d59b6de8a4d31b9c564a045331264",
    svgHash: "519dc81fe9187c49d0f369637a51839666c746dd81d696261f065b08453f1075",
  },
} as const

describe("dev-only nodes layout playground", () => {
  test("owns a package-local server distinct from the parent nodes playground", async () => {
    const server = await Bun.file(join(playgroundRoot, "server.ts")).text()
    const parentServer = await Bun.file(join(layoutRoot, "../playground/server.ts")).text()
    const manifest = await Bun.file(join(layoutRoot, "package.json")).json() as {
      scripts?: Record<string, string>
    }
    const rootManifest = await Bun.file(join(layoutRoot, "../../..", "package.json")).json() as {
      scripts?: Record<string, string>
    }

    expect(server).toContain("NODES_LAYOUT_PLAYGROUND_PORT ?? 4015")
    expect(server).not.toContain("NODES_LAYOUT_PLAYGROUND_PORT ?? 4018")
    expect(parentServer).toContain("NODES_PLAYGROUND_PORT ?? 4018")
    expect(parentServer).not.toContain("NODES_PLAYGROUND_PORT ?? 4015")
    expect(manifest.scripts).toMatchObject({
      playground: "bun playground/server.ts",
      typecheck: "tsc --noEmit --pretty false",
      "typecheck:playground": "tsc --noEmit --pretty false --project playground/tsconfig.json",
    })
    expect(rootManifest.scripts).toMatchObject({
      "nodes:playground": "bun run --cwd pkg/nodes/playground playground",
      "nodes:layout:playground": "bun run --cwd pkg/nodes/layout playground",
    })
  })

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
    for (const family of [
      "fixed-baseline",
      "adaptive-side-selection",
      "adaptive-compound-side-selection",
    ]) {
      const [right, down] = getFixtureFamily(family)
      expect(right).toBeDefined()
      expect(down).toBeDefined()
      expect(withoutViewport(right!.graph)).toEqual(withoutViewport(down!.graph))
      expect(right!.graph.viewport.width).toBeGreaterThan(right!.graph.viewport.height)
      expect(down!.graph.viewport.width).toBeLessThan(down!.graph.viewport.height)
    }
  })

  test("binds every scenario family to exactly one policy", async () => {
    expect(PLAYGROUND_FIXTURES.map(({id, policyId}) => [id, policyId])).toEqual([
      ["fixed-baseline-right", "fixed"],
      ["fixed-baseline-down", "fixed"],
      ["adaptive-shared-right", "adaptive"],
      ["adaptive-shared-down", "adaptive"],
      ["adaptive-compound-right", "adaptive"],
      ["adaptive-compound-down", "adaptive"],
    ])
    for (const family of new Set(PLAYGROUND_FIXTURES.map(({family}) => family))) {
      expect(new Set(getFixtureFamily(family).map(({policyId}) => policyId)).size).toBe(1)
    }

    const html = await Bun.file(join(playgroundRoot, "index.html")).text()
    const client = await Bun.file(join(playgroundRoot, "client.ts")).text()
    const styles = await Bun.file(join(playgroundRoot, "styles.css")).text()
    expect(html).toContain('<output id="policy-value" class="readonly-value"></output>')
    expect(html).not.toContain('<select id="policy"')
    expect(client).not.toContain("policySelect")
    expect(client).toContain("runPlaygroundLayout(fixture.policyId, graph)")
    expect(client).toContain("runPlaygroundLayout(selected.policyId, fixture.graph)")
    expect(client).toContain('fixtureSelect.addEventListener("change", resetAndRunFixture)')
    expect(client).toContain("comparison.replaceChildren()")
    expect(styles).toContain(".comparison[hidden] { display: none; }")
  })

  test("runs the public adaptive policy through nested compounds in RIGHT and DOWN", () => {
    const fixtures = getFixtureFamily("adaptive-compound-side-selection")
    expect(fixtures).toHaveLength(2)

    for (const fixture of fixtures) {
      const baseline = ADAPTIVE_COMPOUND_BASELINES[
        fixture.id as keyof typeof ADAPTIVE_COMPOUND_BASELINES
      ]
      const first = runPlaygroundLayout("adaptive", fixture.graph)
      const repeated = runPlaygroundLayout("adaptive", fixture.graph)
      const permuted = runPlaygroundLayout("adaptive", permuteGraph(fixture.graph))
      const shared = first.result.ports.find(({id}) => id === "source/shared")
      const compoundIds = new Set(fixture.graph.nodes.flatMap(({parentId}) =>
        parentId === undefined ? [] : [parentId]))

      expect(baseline, `missing baseline for ${fixture.id}`).toBeDefined()
      expect(compoundIds).toEqual(new Set(["source-zone", "target-zone"]))
      expect(first.result.direction).toBe(fixture.expectedDirection)
      expect(first.result.direction).toBe(baseline.direction)
      expect(first.result.bounds).toEqual(baseline.bounds)
      expect(shared?.side).toBe(baseline.side)
      expect(first.metrics.compoundCount).toBe(2)
      expect(first.metrics.gatewayCount).toBe(4)
      expect(first.policyDiagnostics).toMatchObject({
        candidateBudget: 16,
        theoreticalCandidateCount: "2",
        dynamicPortCount: 1,
        attemptedCandidates: 2,
      })
      expect(hash(first.result)).toBe(baseline.resultHash)
      expect(hash(first.svg)).toBe(baseline.svgHash)
      expect(repeated.result).toEqual(first.result)
      expect(repeated.policyDiagnostics).toEqual(first.policyDiagnostics)
      expect(repeated.svg).toBe(first.svg)
      expect(permuted.result).toEqual(first.result)
      expect(permuted.policyDiagnostics).toEqual(first.policyDiagnostics)
      expect(permuted.svg).toBe(first.svg)
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
      const paintedNodeIds = orderNodeGeometryForPainting(fixture.graph, run.result.nodes).map(({id}) => id)
      expect(run.svg).toContain(`data-direction="${fixture.expectedDirection}"`)
      expect(run.svg).toContain("data-kind=\"layout-bounds\"")
      expect(run.svg).toContain("data-layer=\"compound-backgrounds\"")
      expect(run.svg).toContain("data-layer=\"compound-chrome\"")
      expect(run.svg).toContain("data-layer=\"leaf-nodes\"")
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
      expect(paintedNodeIds).toEqual([
        "source-zone",
        "observer",
        "producer",
        "target-zone",
        "consumer-a",
        "consumer-b",
      ])
      for (const {id, parentId} of fixture.graph.nodes) {
        if (parentId === undefined) continue
        expect(run.svg.indexOf(`data-node-id="${parentId}"`)).toBeLessThan(
          run.svg.indexOf(`data-node-id="${id}"`),
        )
      }
    }
  })

  test("paints exact semantic endpoints above containing owners and below leaf nodes", () => {
    for (const fixture of PLAYGROUND_FIXTURES) {
      const policy = fixture.family === "fixed-baseline" ? "fixed" : "adaptive"
      const run = runPlaygroundLayout(policy, fixture.graph)
      const inputEdgeById = new Map(fixture.graph.edges.map((edge) => [edge.id, edge]))
      const portById = new Map(run.result.ports.map((port) => [port.id, port]))

      for (const edge of run.result.edges) {
        const inputEdge = inputEdgeById.get(edge.id)
        const section = edge.sections[0]
        expect(inputEdge).toBeDefined()
        expect(section).toBeDefined()
        const source = portById.get(inputEdge!.sourcePortId)
        const target = portById.get(inputEdge!.targetPortId)
        expect(source).toBeDefined()
        expect(target).toBeDefined()
        expect(section!.startPoint).toEqual({x: source!.x, y: source!.y})
        expect(section!.endPoint).toEqual({x: target!.x, y: target!.y})
      }

      const layerOrder = [
        "compound-backgrounds",
        "edges",
        "port-label-leaders",
        "compound-chrome",
        "leaf-nodes",
        "gateways",
        "ports",
        "port-labels",
      ].map((layer) => run.svg.indexOf(`data-layer="${layer}"`))
      expect(layerOrder.every((index) => index >= 0)).toBeTrue()
      expect([...layerOrder].sort((left, right) => left - right)).toEqual(layerOrder)
      expect(layerContents(run.svg, "compound-backgrounds")).not.toContain("class=\"node-id\"")
      if (run.metrics.compoundCount > 0) {
        expect(layerContents(run.svg, "compound-chrome")).toContain("class=\"node-id\"")
      } else {
        expect(layerContents(run.svg, "compound-chrome")).toBe("")
      }
      expect(run.svg).toContain("class=\"edge-arrow\"")
      expect(run.svg).toContain(".edge-arrow{fill:#7dd3fc}")
    }

    const fixture = getFixtureFamily("fixed-baseline")[0]!
    const run = runPlaygroundLayout("fixed", fixture.graph)
    const reply = run.result.edges.find(({id}) => id === "reply")!
    const observerPort = run.result.ports.find(({id}) => id === "observer/in-reply")!
    const gateway = findGatewayPoints(fixture.graph, run.result).find(({edgeId, nodeId}) =>
      edgeId === "reply" && nodeId === "source-zone")
    expect(reply.sections[0]!.endPoint).toEqual({x: observerPort.x, y: observerPort.y})
    expect(gateway?.point).toEqual({x: 56, y: 178})
    expect(observerPort).toMatchObject({x: 84, y: 178})
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
        "compound-backgrounds",
        "edges",
        "port-label-leaders",
        "compound-chrome",
        "leaf-nodes",
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
    expect(html).toContain("<title>@nodes/layout</title>")
    for (const required of [
      "Стенд раскладки",
      "Сценарий",
      "Политика сценария",
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
      "Вложенная адаптивная раскладка",
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
      "Политика / вариант",
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

function permuteGraph(
  graph: (typeof PLAYGROUND_FIXTURES)[number]["graph"],
): (typeof PLAYGROUND_FIXTURES)[number]["graph"] {
  return {
    ...graph,
    nodes: [...graph.nodes].reverse(),
    ports: [...graph.ports].reverse().map((port) => ({
      ...port,
      allowedSides: [...port.allowedSides].reverse(),
    })),
    edges: [...graph.edges].reverse(),
  }
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
