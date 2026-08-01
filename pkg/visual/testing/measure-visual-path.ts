import {CenteredNested} from "../src/CenteredNested.ts"
import {OutsideIn} from "../src/OutsideIn.ts"
import {buildVisualScenePayload} from "../src/ScenePayload.ts"
import {
  reconcileVisualScenePayload,
  summarizeVisualScenePatch,
} from "../src/SceneReconciler.ts"
import {compileVisualComponents} from "../src/VisualComponents.ts"
import type {VisualLayout} from "../src/internal/layout.ts"
import {ladaLayoutInput} from "./lada-fixture.ts"

/**
 * Runtime measurement of the complete visual path on the real Lada scene.
 *
 * Reports median and best of N for each stage so a claim about performance can
 * cite a workload and a metric instead of an inspection.
 */

const measure = (
  label: string,
  iterations: number,
  run: () => void,
): Readonly<{best: number; label: string; median: number}> => {
  for (let index = 0; index < 3; index++) run()
  const samples: number[] = []
  for (let index = 0; index < iterations; index++) {
    const started = performance.now()
    run()
    samples.push(performance.now() - started)
  }
  samples.sort((left, right) => left - right)
  return {
    best: samples[0]!,
    label,
    median: samples[Math.floor(samples.length / 2)]!,
  }
}

const report = (
  rows: readonly Readonly<{best: number; label: string; median: number}>[],
): void => {
  const width = Math.max(...rows.map((row) => row.label.length))
  for (const row of rows) {
    console.log(
      `${row.label.padEnd(width)}  median ${row.median.toFixed(2).padStart(8)} ms` +
      `  best ${row.best.toFixed(2).padStart(8)} ms`,
    )
  }
}

const input = ladaLayoutInput()
console.log(
  `Workload: real zavx0z/lada snapshot — ` +
  `${input.manifest.darkParticles.length} Dark, ` +
  `${input.manifest.fieldParticles.length} Field, ` +
  `${input.manifest.orbitalParticles?.length ?? 0} orbital, ` +
  `${input.manifest.transitionChannels?.length ?? 0} Transition, ` +
  `${input.manifest.fieldProxies?.length ?? 0} Field proxy occurrences\n`,
)

const rows: Array<Readonly<{best: number; label: string; median: number}>> = []

for (const layout of [CenteredNested, OutsideIn] as readonly VisualLayout[]) {
  const scene = layout.buildScene(input)
  const payload = buildVisualScenePayload(layout, input)
  const serialized = JSON.stringify(payload)

  rows.push(measure(
    `${layout.slug}: buildScene`,
    10,
    () => void layout.buildScene(input),
  ))
  rows.push(measure(
    `${layout.slug}: compileVisualComponents (cached)`,
    50,
    () => void compileVisualComponents(scene.components),
  ))
  rows.push(measure(
    `${layout.slug}: project scene -> payload`,
    20,
    () => void buildVisualScenePayload(layout, input),
  ))
  rows.push(measure(
    `${layout.slug}: JSON.stringify payload`,
    20,
    () => void JSON.stringify(payload),
  ))
  rows.push(measure(
    `${layout.slug}: JSON.parse payload`,
    20,
    () => void JSON.parse(serialized),
  ))
  rows.push(measure(
    `${layout.slug}: reconcile unchanged`,
    50,
    () => void reconcileVisualScenePayload(payload, payload),
  ))

  console.log(
    `${layout.slug}: serialized payload ` +
    `${(new TextEncoder().encode(serialized).byteLength / 1024).toFixed(1)} KiB`,
  )
}

const centered = buildVisualScenePayload(CenteredNested, input)
const firstField = input.manifest.fieldParticles[0]!
const changed = buildVisualScenePayload(
  CenteredNested,
  ladaLayoutInput((manifest) => ({
    ...manifest,
    fieldParticles: manifest.fieldParticles.map((field) =>
      field.fieldParticleId === firstField.fieldParticleId
        ? {...field, valueText: "measurement"}
        : field
    ),
  })),
)

rows.push(measure(
  "centered-nested: reconcile localized Value change",
  50,
  () => void reconcileVisualScenePayload(centered, changed),
))

console.log("")
report(rows)

const localized = summarizeVisualScenePatch(
  reconcileVisualScenePayload(centered, changed),
)
const full = summarizeVisualScenePatch(
  reconcileVisualScenePayload(null, changed),
)
console.log(
  `\nLocalized Value change touches ${localized.total} of ${full.total} ` +
  `renderable entries (${((localized.total / full.total) * 100).toFixed(2)}%)`,
)
