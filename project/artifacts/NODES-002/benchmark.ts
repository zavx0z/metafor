import {createHash} from "node:crypto"
import {readFileSync, writeFileSync} from "node:fs"
import {arch, cpus, platform, release} from "node:os"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

import {layout, type LayoutGraph, type LayoutResult} from "../../../pkg/nodes/layout/src/index.ts"

const directory = dirname(fileURLToPath(import.meta.url))
const repository = join(directory, "../../..")
const measuredSamples = 5

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex")

const readGraph = (name: string): Readonly<{graph: LayoutGraph; sha256: string}> => {
  const source = readFileSync(join(directory, name), "utf8")
  return {graph: JSON.parse(source) as LayoutGraph, sha256: sha256(source)}
}

const geometryHash = (result: LayoutResult): string => sha256(JSON.stringify(result))

const percentile = (sorted: readonly number[], fraction: number): number =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!

const benchmark = (fixture: string) => {
  const input = readGraph(fixture)
  const warm = layout(input.graph)
  const expectedGeometryHash = geometryHash(warm)
  const samplesMs = Array.from({length: measuredSamples}, () => {
    const startedAt = performance.now()
    const result = layout(input.graph)
    const elapsedMs = performance.now() - startedAt
    const actualHash = geometryHash(result)
    if (actualHash !== expectedGeometryHash) {
      throw new Error(`Nondeterministic geometry for ${fixture}: ${expectedGeometryHash} != ${actualHash}`)
    }
    return elapsedMs
  })
  const sorted = [...samplesMs].sort((left, right) => left - right)
  return {
    fixture,
    inputSha256: input.sha256,
    direction: warm.direction,
    nodes: input.graph.nodes.length,
    ports: input.graph.ports.length,
    edges: input.graph.edges.length,
    warmupRuns: 1,
    measuredRuns: measuredSamples,
    samplesMs,
    minMs: sorted[0]!,
    medianMs: sorted[Math.floor(sorted.length / 2)]!,
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1)!,
    geometrySha256: expectedGeometryHash,
  }
}

const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], {cwd: repository})
if (git.exitCode !== 0) throw new Error(git.stderr.toString())

const report = {
  kind: "NODES-002-layout-benchmark",
  measuredAt: new Date().toISOString(),
  gitHead: git.stdout.toString().trim(),
  runtime: {
    bun: Bun.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
  },
  protocol: {
    process: "one Bun process",
    warmupRunsPerFixture: 1,
    measuredRunsPerFixture: measuredSamples,
    scope: "@nodes/layout layout(graph), without nodes adapter, Worker, renderer or assertions",
  },
  results: [
    benchmark("layout-request-landscape.json"),
    benchmark("layout-request-portrait.json"),
  ],
}

const output = `${JSON.stringify(report, null, 2)}\n`
writeFileSync(join(directory, "benchmark-current.json"), output)
process.stdout.write(output)
