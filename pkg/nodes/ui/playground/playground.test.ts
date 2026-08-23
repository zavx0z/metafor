import {describe, expect, test} from "bun:test"
import {basename, join} from "node:path"
import {fileURLToPath} from "node:url"
import {FIELD_KINDS} from "@ui/components"
import {resolvePlaygroundRoute} from "@ui/playground"
import {BLENDER_SOCKET_KINDS, BLENDER_SOCKET_PRESETS, BLENDER_SOCKET_SHAPES} from "../blender-node.ts"
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
  nodePlaygroundCatalog,
  nodePlaygroundDockItems,
  nodePlaygroundGroup,
  nodePlaygroundSections,
} from "./routes.ts"
import {
  NODE_COMPONENT_STORIES,
  NODE_COMPONENT_STORY_ROUTES,
  NODE_EDITOR_STORY_NODE_IDS,
  NODE_SOCKET_DIRECTIONS,
  NODE_SOCKET_KINDS,
  NODE_SOCKET_STORIES,
  nodeEditorStoryRoute,
  nodeEditorStoryState,
  nodeSocketStoryIndex,
} from "./stories.ts"
import {applyNodeEditorStoryState} from "./story-state.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("Blender-like Node component playground", () => {
  test("imports universal fields only inside Node composition", async () => {
    const tree = createCatalogNodeTree()
    const insideKinds = new Set(tree.nodes.flatMap(({node}) => [
      ...(node.properties?.map(({kind}) => kind) ?? []),
      ...(node.parameters?.flatMap(({field}) => field === undefined ? [] : [field.kind]) ?? []),
    ]))
    for (const kind of FIELD_KINDS) {
      expect(insideKinds.has(kind), kind).toBeTrue()
    }
    const surfaces = await Bun.file(join(playgroundRoot, "surfaces.ts")).text()
    expect(surfaces).not.toContain("FieldCatalogSurface")
    expect(surfaces).not.toContain("createStandaloneFields")
  })

  test("routes Socket to 19 concrete detail sections and three direction variants", () => {
    expect(NODE_PLAYGROUND_CATALOG.map(({route}) => route)).toEqual([
      "node-editor/scene/default",
      "frame/nested/default",
      "link/orthogonal/selected",
      "socket/boolean/input",
      "comparison/blender/default",
    ])
    expect(NODE_PLAYGROUND_CATALOG.map(({group}) => group?.id)).toEqual([
      "editor",
      "editor",
      "editor",
      "socket",
      "comparison",
    ])
    expect(nodePlaygroundCatalog("comparison/blender/default", new Set(["editor"])).map(({group}) => group?.collapsed === true)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ])
    expect(NODE_PLAYGROUND_ROUTES.slice(0, NODE_COMPONENT_STORY_ROUTES.length)).toEqual([...NODE_COMPONENT_STORY_ROUTES])
    expect(NODE_PLAYGROUND_ROUTES).toHaveLength(NODE_COMPONENT_STORY_ROUTES.length + BLENDER_SOCKET_KINDS.length * NODE_SOCKET_DIRECTIONS.length)
    expect(NODE_PLAYGROUND_ROUTE_DECLARATION.location).toBe("pathname")
    expect(NODE_PLAYGROUND_ROUTE_DECLARATION.routes).toEqual(NODE_PLAYGROUND_ROUTES)
    expect(NODE_PLAYGROUND_ROUTE_DECLARATION.fallback).toBe("socket/boolean/input")
    expect(NODE_PLAYGROUND_ROUTES).not.toContain("socket/types" as never)
    expect(resolvePlaygroundRoute(NODE_PLAYGROUND_ROUTE_DECLARATION, {pathname: "/socket/types"})).toBe(
      "socket/boolean/input",
    )
    expect(nodePlaygroundGroup("node-editor/scene/default")).toBe("editor")
    expect(nodePlaygroundGroup("socket/boolean/input")).toBe("socket")
    expect(nodePlaygroundGroup("comparison/blender/default")).toBe("comparison")
    expect(nodePlaygroundSections("socket/boolean/input").map(({id}) => id)).toEqual([...BLENDER_SOCKET_KINDS])
    expect(nodePlaygroundSections("socket/boolean/input").map(({label}) => label)).toEqual(
      BLENDER_SOCKET_KINDS.map((kind) => BLENDER_SOCKET_PRESETS[kind].label),
    )
    expect(nodePlaygroundDockItems("socket/boolean/input").map(({id}) => id)).toEqual([...NODE_SOCKET_DIRECTIONS])
  })

  test("loads lazy source modules for the remaining production Node components", async () => {
    const frame = await NODE_COMPONENT_STORIES.load("frame/nested/default")
    expect(frame.source(frame.defaultArgs)).toContain('from "@nodes/ui/node-editor"')
    const link = await NODE_COMPONENT_STORIES.load("link/orthogonal/selected")
    expect(link.source(link.defaultArgs)).toContain('from "@nodes/ui/link-curve"')
    const comparison = await NODE_COMPONENT_STORIES.load("comparison/blender/default")
    expect(comparison.source(comparison.defaultArgs)).toContain("comparisonTree")
  })

  test("publishes one controlled route, args and source state for expanded and collapsed Nodes", async () => {
    expect(NODE_COMPONENT_STORY_ROUTES.slice(0, 18)).toEqual([
      "node-editor/scene/default",
      "node-editor/scene/selected",
      "node-editor/scene/rotation-linked",
      "node-editor/scene/translation-unlinked",
      "node-editor/scene/output-only",
      "node-editor/scene/mixed-sides",
      "node-editor/scene/color-unlinked",
      "node-editor/scene/inventory",
      "node-editor/preview/closed",
      "node-editor/preview/open",
      "node-editor/preview/global-hidden",
      "node-editor/preview/alternate",
      "node-editor/preview/missing",
      "node-editor/preview/zero",
      "node-editor/preview/multiple",
      "node-editor/preview/non-previewable",
      "node-editor/collapsed/default",
      "node-editor/collapsed/selected",
    ])
    expect(nodePlaygroundSections("node-editor/scene/default").map(({id}) => id)).toEqual(["scene", "preview", "collapsed", "popup"])
    expect(nodePlaygroundDockItems("node-editor/scene/default").map(({id}) => id)).toEqual([
      "default", "selected", "rotation-linked", "translation-unlinked", "output-only", "mixed-sides", "color-unlinked", "inventory",
    ])
    expect(nodePlaygroundDockItems("node-editor/collapsed/selected").map(({id}) => id)).toEqual(["default", "selected"])
    expect(nodePlaygroundDockItems("node-editor/popup/select-open").map(({id}) => id)).toEqual(["select-open"])

    const cases = [
      {route: "node-editor/scene/default", target: "expanded", selected: false, nodeId: "scalar"},
      {route: "node-editor/scene/selected", target: "expanded", selected: true, nodeId: "scalar"},
      {route: "node-editor/collapsed/default", target: "collapsed", selected: false, nodeId: "collapsed"},
      {route: "node-editor/collapsed/selected", target: "collapsed", selected: true, nodeId: "collapsed"},
    ] as const

    for (const expected of cases) {
      const story = await NODE_COMPONENT_STORIES.load(expected.route)
      expect(story.defaultArgs).toMatchObject({
        component: "node-editor",
        target: expected.target,
        selected: expected.selected,
      })
      expect(story.controls.map(({key}) => key)).toEqual(["target", "selected", "select-open"])
      const state = nodeEditorStoryState(story.defaultArgs)
      expect(state).toEqual({
        target: expected.target,
        selected: expected.selected,
        nodeId: expected.nodeId,
        selection: expected.selected ? {kind: "node", id: expected.nodeId} : null,
      })
      expect(nodeEditorStoryRoute(state.target, state.selected)).toBe(expected.route)
      const source = story.source(story.defaultArgs)
      expect(source).toContain('from "@nodes/ui/node-editor"')
      expect(source).toContain(`const targetNodeId = ${JSON.stringify(expected.nodeId)}`)
      expect(source).toContain(expected.selected
        ? 'editor.select({kind: "node", id: targetNodeId})'
        : "editor.select(null)")
    }
    const openSelect = await NODE_COMPONENT_STORIES.load("node-editor/popup/select-open")
    expect(openSelect.defaultArgs).toMatchObject({
      component: "node-editor",
      target: "expanded",
      selected: false,
      "select-open": true,
    })
    expect(createCatalogNodeTree({openSelect: true}).nodes
      .find(({node}) => node.id === "scalar")?.node.properties
      ?.find(({id}) => id === "operation")).toMatchObject({kind: "enum", open: true})
    expect(NODE_EDITOR_STORY_NODE_IDS).toEqual({expanded: "scalar", collapsed: "collapsed"})
  })

  test("publishes controlled Node Preview routes without changing the ordinary Node model", async () => {
    expect(nodePlaygroundDockItems("node-editor/preview/open").map(({id}) => id)).toEqual([
      "closed", "open", "global-hidden", "alternate", "missing", "zero", "multiple", "non-previewable",
    ])
    const closed = await NODE_COMPONENT_STORIES.load("node-editor/preview/closed")
    const open = await NODE_COMPONENT_STORIES.load("node-editor/preview/open")
    const hidden = await NODE_COMPONENT_STORIES.load("node-editor/preview/global-hidden")
    const absent = await NODE_COMPONENT_STORIES.load("node-editor/preview/non-previewable")
    const multiple = await NODE_COMPONENT_STORIES.load("node-editor/preview/multiple")
    expect(closed.defaultArgs).toMatchObject({
      "previewable": true,
      "preview-enabled": false,
      "previews-visible": true,
      "target-node-id": "scalar",
    })
    expect(open.defaultArgs).toMatchObject({"previewable": true, "preview-enabled": true})
    expect(hidden.defaultArgs).toMatchObject({"preview-enabled": true, "previews-visible": false})
    expect(absent.defaultArgs).toMatchObject({"previewable": false, "target-node-id": "transform"})
    expect(multiple.defaultArgs).toMatchObject({"preview-nodes": ["scalar", "shader"]})
    expect(open.controls.map(({key}) => key)).toEqual(expect.arrayContaining([
      "preview-enabled", "overlays-visible", "previews-visible", "preview-buffer",
    ]))

    const ordinary = createCatalogNodeTree().nodes.find(({node}) => node.id === "scalar")!.node
    const previewable = createCatalogNodeTree({previewEnabled: true}).nodes.find(({node}) => node.id === "scalar")!.node
    const multiTree = createCatalogNodeTree({
      previewNodeIds: ["scalar", "shader"],
      previewEnabledByNode: {scalar: true, shader: true},
    })
    expect(ordinary.preview).toBeUndefined()
    expect(previewable.preview).toMatchObject({enabled: true, image: {width: 320, height: 90}})
    expect(previewable.parameters).toEqual(ordinary.parameters)
    expect(previewable.sockets).toEqual(ordinary.sockets)
    expect(multiTree.nodes.filter(({node}) => node.preview?.enabled === true).map(({node}) => node.id)).toEqual([
      "scalar", "shader",
    ])
  })

  test("publishes deterministic linked, shifted-link and unlinked Transform evidence variants", async () => {
    expect(NODE_COMPONENT_STORY_ROUTES).toEqual(expect.arrayContaining([
      "node-editor/scene/default",
      "node-editor/scene/rotation-linked",
      "node-editor/scene/translation-unlinked",
    ]))
    const linked = createCatalogNodeTree()
    const unlinked = createCatalogNodeTree({translationLinked: false})
    const shiftedLink = createCatalogNodeTree({rotationLinked: true})
    expect(unlinked.links).toEqual(linked.links.filter(({link}) => link.id !== "scalar-transform"))
    expect(unlinked.nodes).toEqual(linked.nodes)
    expect(shiftedLink.links.map(({link}) => link.id)).toEqual(expect.arrayContaining([
      "scalar-transform",
      "scalar-transform-rotation",
    ]))

    for (const route of ["node-editor/scene/rotation-linked", "node-editor/scene/translation-unlinked"] as const) {
      const story = await NODE_COMPONENT_STORIES.load(route)
      expect(nodeEditorStoryState(story.defaultArgs).nodeId).toBe("scalar")
    }
  })

  test("publishes one unlinked Color evidence variant without changing the public Node composition", async () => {
    expect(NODE_COMPONENT_STORY_ROUTES).toContain("node-editor/scene/color-unlinked")
    const story = await NODE_COMPONENT_STORIES.load("node-editor/scene/color-unlinked")
    expect(story.defaultArgs).toMatchObject({
      component: "node-editor",
      target: "expanded",
      selected: false,
      "color-linked": false,
      "target-node-id": "shader",
    })
    expect(nodeEditorStoryState(story.defaultArgs).nodeId).toBe("shader")

    const linked = createCatalogNodeTree()
    const unlinked = createCatalogNodeTree({colorLinked: false})
    expect(unlinked.links).toEqual(linked.links.filter(({link}) => link.id !== "transform-shader"))
    expect(unlinked.nodes).toEqual(linked.nodes)
    expect(unlinked.nodes.find(({node}) => node.id === "shader")?.node.parameters
      ?.find(({id}) => id === "base-color")?.field).toMatchObject({kind: "color"})
  })

  test("publishes one complete Path Collection and Reference inventory route", async () => {
    expect(NODE_COMPONENT_STORY_ROUTES).toContain("node-editor/scene/inventory")
    const story = await NODE_COMPONENT_STORIES.load("node-editor/scene/inventory")
    expect(story.defaultArgs).toMatchObject({
      component: "node-editor",
      target: "expanded",
      selected: false,
      "target-node-id": "asset",
    })
    expect(nodeEditorStoryState(story.defaultArgs).nodeId).toBe("asset")

    const asset = createCatalogNodeTree().nodes.find(({node}) => node.id === "asset")?.node
    const fields = [
      ...(asset?.properties ?? []),
      ...(asset?.parameters?.flatMap(({field}) => field === undefined ? [] : [field]) ?? []),
    ]
    expect(fields.map(({kind}) => kind)).toEqual(expect.arrayContaining(["path", "reference", "collection"]))
  })

  test("publishes output-only and mixed-side one-Field label evidence variants", async () => {
    const outputStory = await NODE_COMPONENT_STORIES.load("node-editor/scene/output-only")
    const mixedStory = await NODE_COMPONENT_STORIES.load("node-editor/scene/mixed-sides")
    expect(nodeEditorStoryState(outputStory.defaultArgs).nodeId).toBe("transform")
    expect(nodeEditorStoryState(mixedStory.defaultArgs).nodeId).toBe("matrix")

    const outputTree = createCatalogNodeTree({rotationOutput: true})
    const outputNode = outputTree.nodes.find(({node}) => node.id === "transform")!.node
    expect(outputNode.sockets?.find(({id}) => id === "rotation")).toMatchObject({
      direction: "output",
      side: "right",
      parameterId: "rotation",
    })
    expect(outputNode.parameters?.filter(({id}) => id === "rotation")).toHaveLength(1)

    const mixedTree = createCatalogNodeTree()
    const mixedNode = mixedTree.nodes.find(({node}) => node.id === "matrix")!.node
    expect(mixedNode.parameters?.filter(({id}) => id === "matrix-value")).toHaveLength(1)
    expect(mixedNode.sockets?.filter(({parameterId}) => parameterId === "matrix-value").map(({side}) => side)).toEqual([
      "left", "right",
    ])
  })

  test("uses the generic compact default width for Transform linked and unlinked evidence", () => {
    const linked = createCatalogNodeTree().nodes.find(({node}) => node.id === "transform")!
    const unlinked = createCatalogNodeTree({translationLinked: false}).nodes.find(({node}) => node.id === "transform")!
    expect(linked.rect.w).toBe(166)
    expect(unlinked.rect.w).toBe(linked.rect.w)
  })

  test("applies NodeEditor story args through one production selection and DOM adapter", () => {
    const selections: unknown[] = []
    const published: unknown[] = []
    const selected = applyNodeEditorStoryState({target: "collapsed", selected: true}, {
      select(selection) {
        selections.push(selection)
        return true
      },
      publish(state) {
        published.push({target: state.target, nodeId: state.nodeId})
      },
    })
    expect(selected.selection).toEqual({kind: "node", id: "collapsed"})
    expect(selections).toEqual([{kind: "node", id: "collapsed"}])
    expect(published).toEqual([{target: "collapsed", nodeId: "collapsed"}])

    const ordinary = applyNodeEditorStoryState({target: "expanded", selected: false}, {
      select(selection) {
        selections.push(selection)
        return true
      },
      publish(state) {
        published.push({target: state.target, nodeId: state.nodeId})
      },
    })
    expect(ordinary.selection).toBeNull()
    expect(selections.at(-1)).toBeNull()
  })

  test("loads one exact production Socket story whose source follows the selected route", async () => {
    expect(NODE_SOCKET_KINDS).toEqual([...BLENDER_SOCKET_KINDS])
    const route = "socket/rotation/bidirectional"
    expect(nodeSocketStoryIndex(route)).toMatchObject({
      componentId: "socket",
      sectionId: "rotation",
      variantId: "bidirectional",
    })
    const story = await NODE_SOCKET_STORIES.load(route)
    expect(story.defaultArgs).toMatchObject({
      kind: "rotation",
      direction: "bidirectional",
      shape: BLENDER_SOCKET_PRESETS.rotation.shape,
      selected: false,
    })
    expect(story.controls.map(({key}) => key)).toEqual(["shape", "selected"])
    const source = story.source({...story.defaultArgs, shape: "square-dot", selected: true})
    expect(source).toContain('from "@nodes/ui/blender-node"')
    expect(source).toContain('direction: "bidirectional"')
    expect(source).toContain('socketType: "rotation"')
    expect(source).toContain('shape: "square-dot"')
    expect(source).toContain("selected: true")
  })

  test("catalogs nineteen socket types, eight shapes and a valid positioned NodeTree", () => {
    expect(SOCKET_CATALOG.map(({socketType}) => socketType)).toEqual([...BLENDER_SOCKET_KINDS])
    expect(new Set(BLENDER_SOCKET_SHAPES).size).toBe(8)
    const tree = createCatalogNodeTree()
    expect(() => validatePositionedNodeTree(tree)).not.toThrow()
    expect(tree.frames).toHaveLength(2)
    expect(tree.frames.find(({frame}) => frame.id === "data-frame")?.frame.parentFrameId).toBe("catalog-frame")
    expect(tree.nodes).toHaveLength(6)
    expect(tree.nodes.find(({node}) => node.id === "scalar")?.node.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({id: "iterations", field: expect.objectContaining({kind: "integer", value: 3})}),
    ]))
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
      splitting: true,
      minify: true,
      sourcemap: "none",
    })
    expect(build.success, build.logs.map(({message}) => message).join("\n")).toBeTrue()
    const outputs = await Promise.all(build.outputs.map(async (output) => ({
      name: basename(output.path),
      source: await output.text(),
    })))
    const entry = outputs.find(({name}) => name === "client.js")
    expect(entry).toBeDefined()
    const source = outputs.map(({source}) => source).join("\n")
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
    expect(source).toContain("PlaygroundStoryPanelSurface")
    expect(source).toContain("NodeStoryPreviewSurface")
    expect(source).toContain("BlenderReferenceSurface")
    expect(source).toContain("import(")
    expect(entry!.source).not.toContain("NodeEditor story requires an exact target")
    expect(outputs.some(({source}) => source.includes("NodeEditor story requires an exact target"))).toBeTrue()
    expect(await Bun.file(join(playgroundRoot, "client.ts")).text()).not.toContain("new SocketCatalogSurface")
    expect(await Bun.file(join(playgroundRoot, "client.ts")).text()).not.toContain("PlaygroundInfoSurface")
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

  test("keeps retained observation dev-only and routes exact browser evidence through the shared dispatcher", async () => {
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
    expect(client).toContain('history.replaceState(null, "", resolvedPath)')
    expect(client).not.toContain("nodePlaygroundHash")
    expect(client).not.toContain("window.location.hash")
    const applyRoute = client.slice(client.indexOf("const applyRoute"), client.indexOf("router.subscribe((route)"))
    expect(applyRoute).toContain("runtime.relayout()")
    expect(applyRoute).not.toContain("runtime.handleResize()")
    expect(client).toContain("runtime.handleResize()\n  await applyRoute(router.current)")
    expect(client).toContain("new PlaygroundStoryPanelSurface(storyPanelOptions())")
    expect(client).toContain("applyNodeEditorStoryState(storyArgs")
    expect(client).toContain("dataset.nodeStoryTargetId = state.nodeId")
    expect(client).toContain('dataset.selectedId = state.selection?.id ?? ""')
    expect(client).toContain("nodeEditorStoryRoute(state.target, state.selected)")
    expect(client).not.toContain("new SocketCatalogSurface")
    expect(browser).toContain('cdp.send("Target.createTarget", {url, background: true})')
    expect(browser).toContain('canvas.toDataURL("image/png")')
    expect(browser).toContain('action === "profile"')
    expect(browser).toContain("nativeMetricsRestored")
    for (const forbidden of ["Page.bringToFront", '"/focus"', '"/activate"', '"/windows"']) {
      expect(browser).not.toContain(forbidden)
    }
  })
})
