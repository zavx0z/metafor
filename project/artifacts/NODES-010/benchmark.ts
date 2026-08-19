import {execFileSync} from "node:child_process"
import {readFileSync, readdirSync, statSync, writeFileSync} from "node:fs"
import {arch, cpus, platform, release} from "node:os"
import {dirname, join, relative, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {layoutAdaptiveWithDiagnostics} from "@nodes/layout/adaptive"
import {layoutFixed} from "@nodes/layout/fixed"
import {getPlaygroundFixture} from "../../../pkg/nodes/layout/playground/fixtures.ts"

const directory = dirname(fileURLToPath(import.meta.url))
const repository = resolve(directory, "../../..")
const warmupCount = 3
const sampleCount = 20
const coldSampleCount = 5

type PolicyId = "fixed" | "adaptive"

const cases = [
  {policyId: "fixed", fixtureId: "fixed-baseline-right"},
  {policyId: "fixed", fixtureId: "fixed-baseline-down"},
  {policyId: "adaptive", fixtureId: "adaptive-shared-right"},
  {policyId: "adaptive", fixtureId: "adaptive-shared-down"},
] as const

const sourceFiles = collectTypeScriptFiles([
  "pkg/nodes/layout/src",
  "pkg/nodes/layout/types",
])

const results = cases.map(({policyId, fixtureId}) => benchmarkCase(policyId, fixtureId))
const report = {
  schemaVersion: 1,
  task: "NODES-010",
  sourceRevision: git("rev-parse", "HEAD"),
  sourceSha256: hashSources(sourceFiles),
  sourceFiles,
  runtime: {
    bun: process.versions.bun,
    javascript: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
  },
  method: {
    warmups: warmupCount,
    samples: sampleCount,
    coldSamples: coldSampleCount,
    percentile: "nearest-rank p95",
    timer: "performance.now()",
  },
  results,
}

const output = `${JSON.stringify(report, null, 2)}\n`
writeFileSync(join(directory, "benchmark-current.json"), output)
process.stdout.write(output)

function benchmarkCase(policyId: PolicyId, fixtureId: string) {
  const graph = getPlaygroundFixture(fixtureId).graph
  for (let index = 0; index < warmupCount; index += 1) runPolicy(policyId, graph)

  const samplesMs: number[] = []
  let final = runPolicy(policyId, graph)
  for (let index = 0; index < sampleCount; index += 1) {
    const startedAt = performance.now()
    final = runPolicy(policyId, graph)
    samplesMs.push(performance.now() - startedAt)
  }

  const coldSamplesMs: number[] = []
  for (let index = 0; index < coldSampleCount; index += 1) {
    const child = Bun.spawnSync([
      process.execPath,
      join(directory, "benchmark-cold.ts"),
      policyId,
      fixtureId,
    ], {cwd: repository, stdout: "pipe", stderr: "pipe"})
    if (child.exitCode !== 0) throw new Error(child.stderr.toString())
    const cold = JSON.parse(child.stdout.toString()) as {importLayoutMs: number; resultSha256: string}
    if (cold.resultSha256 !== hashJson(final.result)) {
      throw new Error(`Cold ${policyId}/${fixtureId} returned different geometry`)
    }
    coldSamplesMs.push(cold.importLayoutMs)
  }

  return {
    policy: policyId,
    fixture: fixtureId,
    direction: final.result.direction,
    inputSha256: hashJson(graph),
    resultSha256: hashJson(final.result),
    candidateCounts: final.diagnostics,
    warm: summarize(samplesMs),
    coldImportAndLayout: summarize(coldSamplesMs),
  }
}

function runPolicy(policyId: PolicyId, graph: ReturnType<typeof getPlaygroundFixture>["graph"]) {
  if (policyId === "fixed") {
    return {result: layoutFixed(graph), diagnostics: {candidateCount: 1}}
  }
  return layoutAdaptiveWithDiagnostics(graph)
}

function summarize(samplesMs: readonly number[]) {
  const sorted = [...samplesMs].sort((left, right) => left - right)
  return {
    samplesMs,
    minMs: sorted[0]!,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1)!,
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!
}

function collectTypeScriptFiles(roots: readonly string[]): string[] {
  const paths: string[] = []
  for (const root of roots) walk(join(repository, root), paths)
  return paths.map((path) => relative(repository, path)).sort()
}

function walk(path: string, paths: string[]): void {
  if (statSync(path).isFile()) {
    if (path.endsWith(".ts") && !path.endsWith(".test.ts")) paths.push(path)
    return
  }
  for (const name of readdirSync(path)) walk(join(path, name), paths)
}

function hashSources(paths: readonly string[]): string {
  return hash(paths.map((path) => `${path}\0${readFileSync(join(repository, path), "utf8")}`).join("\0"))
}

function hashJson(value: unknown): string {
  return hash(JSON.stringify(value))
}

function hash(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function git(...args: string[]): string {
  return execFileSync("git", args, {cwd: repository, encoding: "utf8"}).trim()
}
