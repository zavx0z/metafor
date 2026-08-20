import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {FIELD_KINDS} from "@ui/components"
import {BLENDER_SOCKET_KINDS, BLENDER_SOCKET_SHAPES} from "../blender-node.ts"
import {validatePositionedNodeTree} from "../node-editor.ts"
import {
  SOCKET_CATALOG,
  createCatalogNodeTree,
  createNoiseComparisonTree,
} from "./fixtures.ts"
import {
  NODE_PLAYGROUND_CATALOG,
  NODE_PLAYGROUND_ROUTE_DECLARATION,
  NODE_PLAYGROUND_ROUTES,
  nodePlaygroundGroup,
  nodePlaygroundSections,
} from "./routes.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("Blender-like Node component playground", () => {
  test("imports universal fields only inside Node composition", async () => {
    const tree = createCatalogNodeTree()
    const insideKinds = new Set(tree.nodes.flatMap(({node}) => [
      ...(node.properties?.map(({kind}) => kind) ?? []),
      ...(node.parameters?.flatMap(({field}) => field === undefined ? [] : [field.kind]) ?? []),
    ]))
    for (const kind of FIELD_KINDS) expect(insideKinds.has(kind)).toBeTrue()
    const surfaces = await Bun.file(join(playgroundRoot, "surfaces.ts")).text()
    expect(surfaces).not.toContain("FieldCatalogSurface")
    expect(surfaces).not.toContain("createStandaloneFields")
  })

  test("exposes distinct editor, Socket and comparison sections without a Field catalog", () => {
    expect(NODE_PLAYGROUND_CATALOG.map(({route}) => route)).toEqual([
      "editor/scene",
      "socket/types",
      "comparison/blender",
    ])
    expect(NODE_PLAYGROUND_ROUTES).toEqual([
      "editor/scene",
      "editor/frames",
      "editor/links",
      "socket/types",
      "socket/shapes",
      "socket/states",
      "comparison/blender",
    ])
    expect(NODE_PLAYGROUND_ROUTE_DECLARATION).toEqual({
      location: "pathname",
      routes: NODE_PLAYGROUND_ROUTES,
      fallback: "editor/scene",
    })
    expect(nodePlaygroundGroup("editor/scene")).toBe("editor")
    expect(nodePlaygroundGroup("socket/types")).toBe("socket")
    expect(nodePlaygroundGroup("comparison/blender")).toBe("comparison")
    expect(nodePlaygroundSections("socket/types").map(({label}) => label)).toEqual(["Типы", "Формы", "Состояния"])
  })

  test("catalogs nineteen socket types, eight shapes and a valid positioned NodeTree", () => {
    expect(SOCKET_CATALOG.map(({socketType}) => socketType)).toEqual([...BLENDER_SOCKET_KINDS])
    expect(new Set(BLENDER_SOCKET_SHAPES).size).toBe(8)
    const tree = createCatalogNodeTree()
    expect(() => validatePositionedNodeTree(tree)).not.toThrow()
    expect(tree.frames).toHaveLength(2)
    expect(tree.frames.find(({frame}) => frame.id === "data-frame")?.frame.parentFrameId).toBe("catalog-frame")
    expect(tree.nodes).toHaveLength(6)
    expect(tree.nodes.find(({node}) => node.id === "collapsed")?.node.collapsed).toBeTrue()
    expect(tree.links).toHaveLength(4)
  })

  test("compares one live Noise-style Node at its own scene scale", () => {
    const tree = createNoiseComparisonTree()
    expect(() => validatePositionedNodeTree(tree)).not.toThrow()
    expect(tree.frames).toHaveLength(0)
    expect(tree.nodes.map(({node}) => node.id)).toEqual(["comparison-noise"])
    expect(tree.links).toHaveLength(0)
    const noise = tree.nodes.find(({node}) => node.id === "comparison-noise")!
    expect(noise.node.parameters?.map(({label}) => label)).toEqual([
      "Vector",
      "Scale",
      "Detail",
      "Roughness",
      "Lacunarity",
      "Distortion",
    ])
    expect(noise.sockets.find(({socket}) => socket.id === "vector")?.center).toBeDefined()
  })

  test("uses one Card-free WebGPU component graph and disables HMR", async () => {
    const server = await Bun.file(join(playgroundRoot, "server.ts")).text()
    const html = await Bun.file(join(playgroundRoot, "index.html")).text()
    const surfaces = await Bun.file(join(playgroundRoot, "surfaces.ts")).text()
    expect(server).toContain("startPlaygroundServer")
    expect(server).toContain('packageName: "@nodes/ui"')
    expect(server).not.toContain("title:")
    expect(html).toContain("<title>@nodes/ui</title>")
    expect(server).toContain("/ui-dev/blender-4.5.5-reference.png")
    expect(server).toContain("../../../ui/.agents/skills/ui-dev/assets/blender-4.5.5-reference.png")
    expect(surfaces).toContain("/ui-dev/blender-4.5.5-reference.png")
    expect(`${server}\n${surfaces}`).not.toContain(["", "node-system-dev"].join("/"))
    expect(await Bun.file(join(
      playgroundRoot,
      "../../../ui/.agents/skills/ui-dev/assets/blender-4.5.5-reference.png",
    )).exists()).toBeTrue()
    const build = await Bun.build({
      entrypoints: [join(playgroundRoot, "client.ts")],
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "none",
    })
    expect(build.success, build.logs.map(({message}) => message).join("\n")).toBeTrue()
    const source = await build.outputs[0]!.text()
    for (const forbidden of [
      "NodeSystemSurface",
      "NodeSystemCard",
      "planNodeSystemCard",
      "Card title must be non-empty",
      "NodeSystemCardFact",
      "Hamiltonian",
      "Bulk",
    ]) expect(source).not.toContain(forbidden)
    expect(source).toContain("NodeEditor")
    expect(source).toContain("PlaygroundNavigationSurface")
    expect(source).toContain("BlenderReferenceSurface")
    expect(source).toContain("SocketCatalogSurface")
    expect(source).not.toContain("FieldCatalogSurface")
  })

  test("publishes global and comparison readiness only after the reference texture frame", async () => {
    const client = await Bun.file(join(playgroundRoot, "client.ts")).text()
    const textureWait = client.indexOf("void waitForReferenceFrame")
    const referenceReady = client.indexOf('dataset.nodeReferenceReady = "ready"')
    const globalReady = client.indexOf('dataset.nodeComponentPlayground = "ready"')

    expect(textureWait).toBeGreaterThan(-1)
    expect(referenceReady).toBeGreaterThan(textureWait)
    expect(globalReady).toBeGreaterThan(referenceReady)
    expect(client).toContain("TextureLoader.status(BLENDER_REFERENCE_SRC)")
    expect(client).toContain("runtime.renderer.renderFrame(runtime.space, runtime.hud, runtime.viewPoint)")
    expect(client).toContain('dataset.nodeReferenceReady = "error"')
    expect(client).toContain("planned.reference.visible !== false")
    expect(client).toContain("reference: {x: 0, y: 0, w: 1, h: 1}")
  })

  test("keeps retained observation dev-only and routes exact browser evidence through UI dev", async () => {
    const client = await Bun.file(join(playgroundRoot, "client.ts")).text()
    const observer = await Bun.file(join(playgroundRoot, "retained-observer.ts")).text()
    const production = await Bun.file(join(playgroundRoot, "../node-editor.ts")).text()
    const browser = await Bun.file(join(
      playgroundRoot,
      "../../../ui/.agents/skills/ui-dev/scripts/ui-browser.ts",
    )).text()
    const registry = await Bun.file(join(
      playgroundRoot,
      "../../../ui/.agents/skills/ui-dev/scripts/playgrounds.json",
    )).json() as {selectors: Record<string, unknown>}

    expect(client).toContain("createPlaygroundRetainedObserver(editor)")
    expect(observer).toContain("NodeCanvas.contentRoot")
    expect(observer).toContain("readRibbonEndpointCenters")
    expect(observer).toContain("worldScaleRatioToContentRoot")
    expect(production).not.toContain("__nodeComponentRetainedObserver")
    expect(registry.selectors["node-ui"]).toMatchObject({
      package: "@nodes/ui",
      httpMarker: "<title>@nodes/ui</title>",
      ready: {kind: "dataset", name: "nodeComponentPlayground", value: "ready"},
      canvas: {selector: "#node-component-canvas", capability: "webgpu", touch: true},
      routes: {default: "/editor/scene"},
    })
    expect(client).toContain("new PlaygroundRouter(NODE_PLAYGROUND_ROUTE_DECLARATION)")
    expect(client).not.toContain("nodePlaygroundHash")
    expect(client).not.toContain("window.location.hash")
    const applyRoute = client.slice(client.indexOf("const applyRoute"), client.indexOf("router.subscribe(applyRoute)"))
    expect(applyRoute).toContain("runtime.relayout()")
    expect(applyRoute).not.toContain("runtime.handleResize()")
    expect(client).toContain("router.subscribe(applyRoute)\n  runtime.handleResize()\n  applyRoute(router.current)")
    expect(browser).toContain('cdp.send("Target.createTarget", {url, background: true})')
    expect(browser).toContain('canvas.toDataURL("image/png")')
    expect(browser).toContain('action === "profile"')
    expect(browser).toContain("nativeMetricsRestored")
    for (const forbidden of ["Page.bringToFront", '"/focus"', '"/activate"', '"/windows"']) {
      expect(browser).not.toContain(forbidden)
    }
  })
})
