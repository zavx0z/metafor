import {expect, test} from "bun:test"
import {parseMetaAddress, type Graph, type RuntimeAtom, type RuntimeNode} from "@metafor/types/metafor/graph"
import {projectRuntimeAtoms} from "./atom-projection"

const environment = parseMetaAddress("@metafor/environment")!, agent = parseMetaAddress("@metafor/agent")!, unused = parseMetaAddress("@fixture/template-only")!
const atom = (id: string, meta = agent, children?: RuntimeNode[]): RuntimeAtom => ({kind: "atom", ref: `atom:${id}`, meta, declaration: "#/template", state: null, values: {}, mass: [], ...(children ? {children} : {})})
function fixture(): Graph {
  return {schema: "metafor/graph", root: environment, template: {
    [agent]: {name: "Agent", fields: [], superposition: [], mass: [], processes: []},
    [unused]: {name: "Не воплощён", fields: [], superposition: [], mass: [], processes: []},
  }, runtime: {roots: [{kind: "topology", ref: "topology:outer", declaration: "#/template", topology: "macho", children: [
    atom("root", environment, [atom("first"), {kind: "topology", ref: "topology:nested", topology: "fuzzy", declaration: "#/template", children: [
      atom("second", agent, [atom("second-child")]), {kind: "topology", ref: "topology:axion", topology: "axion", declaration: "#/template", children: [atom("third")]},
    ]}, atom("last")]), atom("another-root"),
  ]}], reactions: []}}
}

test("SpatialTree projection contains actual Atom identities in Matter preorder with nearest Atom parent", () => {
  const graph = fixture(), before = structuredClone(graph)
  const projection = projectRuntimeAtoms(graph)
  expect(projection.nodes.map(node => [node.id, node.parentId ?? null])).toEqual([
    ["atom:root", null], ["atom:first", "atom:root"], ["atom:second", "atom:root"], ["atom:second-child", "atom:second"], ["atom:third", "atom:root"], ["atom:last", "atom:root"], ["atom:another-root", null],
  ])
  expect(projection.roots).toEqual(["atom:root", "atom:another-root"])
  expect(projection.nodes[0]?.label).toBe(environment)
  expect(projection.nodes[1]?.label).toBe("Agent")
  expect(projection.nodes.every(node => !Object.hasOwn(node, "rect") && !Object.hasOwn(node, "position"))).toBeTrue()
  const runtime = graph.runtime.roots[0]!.children![0]!.children![0]!
  if (runtime.kind !== "atom") throw new Error("Expected Atom fixture")
  expect(projection.lookupRuntimeAtom("atom:first")).toBe(runtime)
  expect(projection.lookupRuntimeAtom("topology:nested")).toBeNull()
  expect(projection.lookupRuntimeAtom(unused)).toBeNull()
  expect(graph).toEqual(before)
})

test("reparenting keeps Atom identity and template-only changes create no runtime nodes", () => {
  const graph = fixture(), first = projectRuntimeAtoms(graph)
  const root = graph.runtime.roots[0]!.children![0]!
  const moved = root.children!.shift()!
  graph.runtime.roots[0]!.children!.push(moved)
  graph.template[agent]!.name = "Новая подпись"
  const next = projectRuntimeAtoms(graph)
  expect(next.lookupRuntimeAtom("atom:first")).toBe(first.lookupRuntimeAtom("atom:first"))
  expect(next.nodes.find(node => node.id === "atom:first")).toEqual({id: "atom:first", label: "Новая подпись"})
  expect(next.nodes).toHaveLength(first.nodes.length)
  expect(next.roots).toEqual(["atom:root", "atom:another-root", "atom:first"])
})

test("empty runtime produces no template substitutes and duplicate Atom refs fail closed", () => {
  const graph = fixture()
  graph.runtime.roots = []
  expect(projectRuntimeAtoms(graph).nodes).toEqual([])
  graph.runtime.roots = [atom("duplicate"), atom("duplicate")]
  expect(() => projectRuntimeAtoms(graph)).toThrow("Duplicate runtime Atom identity")
})
