import {createHash} from "node:crypto"
import {readFileSync, writeFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

import {layout} from "../../../pkg/nodes/layout/src/layout.ts"
import type {LayoutGraph, LayoutResult} from "../../../pkg/nodes/layout/types/protocol.ts"

const directory = dirname(fileURLToPath(import.meta.url))
const fixtureName = "two-tab-layout-portrait.json"
const fixtureSource = readFileSync(join(directory, fixtureName), "utf8")
const graph = JSON.parse(fixtureSource) as LayoutGraph
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex")
const geometryHash = (result: LayoutResult): string => sha256(JSON.stringify(result))
const permutations = (input: LayoutGraph): readonly LayoutGraph[] => [
  input,
  {...input, nodes: [...input.nodes].reverse(), ports: [...input.ports].reverse(), edges: [...input.edges].reverse()},
  {
    ...input,
    nodes: [...input.nodes].sort((left, right) => right.id.localeCompare(left.id)),
    ports: [...input.ports].sort((left, right) => right.id.localeCompare(left.id)),
    edges: [...input.edges].sort((left, right) => right.id.localeCompare(left.id)),
  },
]

const modes = [
  {name: "RIGHT", viewport: {width: 1088, height: 722}},
  {name: "DOWN", viewport: {width: 722, height: 1088}},
] as const

const results = modes.map(({name, viewport}) => {
  const input = {...graph, viewport}
  const repeated = [layout(input), layout(input), layout(input)]
  const permuted = permutations(input).map(layout)
  const hashes = [...repeated, ...permuted].map(geometryHash)
  if (new Set(hashes).size !== 1) throw new Error(`${name} geometry is not deterministic`)
  const result = repeated[0]!
  if (result.direction !== name) throw new Error(`${name} returned ${result.direction}`)
  if (result.nodes.length !== graph.nodes.length || result.edges.length !== graph.edges.length) {
    throw new Error(`${name} changed graph cardinality`)
  }
  return {
    direction: name,
    viewport,
    geometrySha256: hashes[0],
    repeats: 3,
    permutations: permutations(input).length,
    nodes: result.nodes.length,
    ports: result.ports.length,
    edges: result.edges.length,
    bounds: result.bounds,
  }
})

const report = {
  fixture: fixtureName,
  fixtureSha256: sha256(fixtureSource),
  results,
}
const output = `${JSON.stringify(report, null, 2)}\n`
writeFileSync(join(directory, "verification.json"), output)
process.stdout.write(output)
