import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {FIELD_KINDS} from "@ui/components"
import {BLENDER_SOCKET_KINDS, BLENDER_SOCKET_SHAPES} from "../blender-node.ts"
import {validatePositionedNodeTree} from "../node-editor.ts"
import {
  SOCKET_CATALOG,
  STANDALONE_FIELD_KINDS,
  createCatalogNodeTree,
} from "./fixtures.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("Blender-like Node component playground", () => {
  test("catalogs every universal field standalone and inside Nodes", () => {
    expect(STANDALONE_FIELD_KINDS).toEqual(FIELD_KINDS)
    const tree = createCatalogNodeTree()
    const insideKinds = new Set(tree.nodes.flatMap(({node}) => [
      ...(node.properties?.map(({kind}) => kind) ?? []),
      ...(node.sockets?.flatMap(({field}) => field === undefined ? [] : [field.kind]) ?? []),
    ]))
    for (const kind of FIELD_KINDS) expect(insideKinds.has(kind)).toBeTrue()
  })

  test("catalogs nineteen socket types, six shapes and a valid positioned NodeTree", () => {
    expect(SOCKET_CATALOG.map(({socketType}) => socketType)).toEqual([...BLENDER_SOCKET_KINDS])
    expect(new Set(BLENDER_SOCKET_SHAPES).size).toBe(6)
    const tree = createCatalogNodeTree()
    expect(() => validatePositionedNodeTree(tree)).not.toThrow()
    expect(tree.nodes).toHaveLength(6)
    expect(tree.links).toHaveLength(4)
  })

  test("uses one Card-free WebGPU component graph and disables HMR", async () => {
    const server = await Bun.file(join(playgroundRoot, "server.ts")).text()
    expect(server).toContain("development: {hmr: false}")
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
    expect(source).toContain("NodeEditorSurface")
    expect(source).toContain("FieldCatalogSurface")
    expect(source).toContain("SocketCatalogSurface")
  })
})
