import {createHash} from "node:crypto"
import {execFileSync} from "node:child_process"
import {readFileSync, writeFileSync} from "node:fs"
import {arch, cpus, platform, release} from "node:os"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"

import {layout} from "../../../pkg/nodes/layout/src/layout.ts"
import type {LayoutGraph, LayoutResult} from "../../../pkg/nodes/layout/types/protocol.ts"

const directory = dirname(fileURLToPath(import.meta.url))
const repository = resolve(directory, "../../..")
const fixtureName = "two-tab-layout-portrait.json"
const fixtureSource = readFileSync(join(directory, fixtureName), "utf8")
const graph = JSON.parse(fixtureSource) as LayoutGraph
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex")
const layoutSources = [
  "pkg/nodes/layout/src/layout.ts",
  "pkg/nodes/layout/src/place-graph.ts",
  "pkg/nodes/layout/src/route-graph.ts",
]
const sourceSha256 = sha256(layoutSources.map((path) =>
  `${path}\0${readFileSync(join(repository, path), "utf8")}`).join("\0"))
const sampleCount = 10
const warmupCount = 2

const benchmark = (direction: "RIGHT" | "DOWN", viewport: LayoutGraph["viewport"]) => {
  const input = {...graph, viewport}
  for (let index = 0; index < warmupCount; index += 1) layout(input)
  const samplesMs: number[] = []
  let result: LayoutResult | undefined
  for (let index = 0; index < sampleCount; index += 1) {
    const started = performance.now()
    result = layout(input)
    samplesMs.push(performance.now() - started)
  }
  const sorted = [...samplesMs].sort((left, right) => left - right)
  if (result === undefined || result.direction !== direction) throw new Error(`${direction} benchmark failed`)
  return {
    direction,
    viewport,
    inputSha256: sha256(JSON.stringify(input)),
    geometrySha256: sha256(JSON.stringify(result)),
    warmups: warmupCount,
    samples: sampleCount,
    samplesMs,
    minMs: sorted[0],
    medianMs: (sorted[4]! + sorted[5]!) / 2,
    maxMs: sorted.at(-1),
  }
}

const report = {
  task: "NODES-003",
  fixture: fixtureName,
  fixtureSha256: sha256(fixtureSource),
  gitRevision: execFileSync("git", ["rev-parse", "HEAD"], {cwd: repository, encoding: "utf8"}).trim(),
  layoutSourceSha256: sourceSha256,
  environment: {
    bun: process.versions.bun,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
  },
  results: [
    benchmark("RIGHT", {width: 1088, height: 722}),
    benchmark("DOWN", {width: 722, height: 1088}),
  ],
}
const output = `${JSON.stringify(report, null, 2)}\n`
writeFileSync(join(directory, "benchmark-current.json"), output)
process.stdout.write(output)
