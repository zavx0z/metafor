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
    expect(tree.nodes.map(({node}) => node.id)).toEqual(["comparison-mapping", "comparison-noise"])
    expect(tree.links).toHaveLength(1)
    const noise = tree.nodes.find(({node}) => node.id === "comparison-noise")!
    expect(noise.node.parameters?.map(({label}) => label)).toEqual([
      "Vector",
      "Scale",
      "Detail",
      "Roughness",
      "Lacunarity",
      "Distortion",
    ])
    expect(noise.sockets.find(({socket}) => socket.id === "vector")?.center).toEqual(tree.links[0]!.points.at(-1))
  })

  test("uses one Card-free WebGPU component graph and disables HMR", async () => {
    const server = await Bun.file(join(playgroundRoot, "server.ts")).text()
    expect(server).toContain("startPlaygroundServer")
    expect(server).toContain("/node-system-dev/blender-reference.png")
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
})
