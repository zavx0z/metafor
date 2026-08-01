import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {
  createVisualStoryPlayer,
  formatVisualStoryTrace,
  runVisualStory,
  compareVisualStoryRuns,
  visualStoryMoveCurrentState,
  visualStoryRelabelTorus,
  visualStoryRemoveAtom,
  visualStorySetFieldValue,
  visualStorySetOrbitalActivity,
  visualStoryWait,
  type VisualStoryDefinition,
  type VisualStoryPlayer,
  type VisualStoryState,
} from "@metafor/visual/stories"
import type {VisualLayout, VisualOwnerGraph} from "@metafor/visual/layout"

/**
 * Story authoring stand.
 *
 * Declares scenarios over one real snapshot and drives them through the
 * production story player. Nothing here builds geometry or renders: the player
 * owns every payload and patch, and the page renders the frame's payload with
 * the same viewport used by the named-layout pages.
 */

export const STORY_SLUG = "stories"

export type VisualStoryScenario = Readonly<{
  id: string
  label: string
  description: string
  build: (
    manifest: BulkManifest,
    owners: readonly VisualOwnerGraph[],
  ) => VisualStoryDefinition
}>

const firstField = (manifest: BulkManifest): string => {
  const field = manifest.fieldParticles[0]
  if (!field) throw new Error("Story snapshot has no Field")
  return field.fieldParticleId
}

const rootTorusId = (manifest: BulkManifest): number => {
  const root = manifest.darkParticles.find((particle) =>
    particle.parentDarkParticleId === null
  )
  if (!root) throw new Error("Story snapshot has no root")
  return root.darkParticleId
}

const deepestLeafAtomId = (manifest: BulkManifest): number => {
  const parents = new Set(
    manifest.darkParticles
      .map((particle) => particle.parentDarkParticleId)
      .filter((id): id is number => id !== null),
  )
  const leaf = manifest.darkParticles
    .filter((particle) =>
      particle.darkParticleKind === "atom" &&
      particle.parentDarkParticleId !== null &&
      !parents.has(particle.darkParticleId)
    )
    .toSorted((left, right) => right.depth - left.depth)[0]
  if (!leaf) throw new Error("Story snapshot has no leaf Atom")
  return leaf.darkParticleId
}

const ownerWithSiblingStates = (
  manifest: BulkManifest,
): Readonly<{owner: number; target: string}> | null => {
  const states = (manifest.orbitalParticles ?? []).filter((particle) =>
    particle.orbitalParticleKind === "state"
  )
  const byOwner = Map.groupBy(states, (state) => state.parentDarkParticleId)
  for (const [owner, group] of byOwner) {
    const target = group.find((state) => !state.current)
    if (target && group.some((state) => state.current)) {
      return {owner, target: target.orbitalParticleId}
    }
  }
  return null
}

/** The declarative scenario catalog the page offers. */
export const visualStoryScenarios: readonly VisualStoryScenario[] = [
  {
    id: "labels",
    label: "Подписи",
    description:
      "Меняет только подписи и пропускает время. Ни одна стратегия не " +
      "читает подпись при размещении, поэтому геометрия не пересобирается.",
    build: (manifest, owners) => ({
      name: "labels",
      events: [
        visualStoryRelabelTorus(rootTorusId(manifest), "Story root"),
        visualStoryWait(16),
        visualStoryRelabelTorus(deepestLeafAtomId(manifest), "Story leaf"),
        visualStoryRelabelTorus(rootTorusId(manifest), "Story root снова"),
      ],
      initial: () => ({manifest, owners}),
    }),
  },
  {
    id: "field-values",
    label: "Значения Fields",
    description:
      "Перепривязывает Value одного Field. Стоимость решает стратегия: " +
      "centered-nested группирует Fields по Value и поднимает общую группу " +
      "к общему владельцу, поэтому это вход размещения (geometry); " +
      "outside-in сажает Field у ядра своего владельца и несёт Value как " +
      "данные, поэтому там тот же шаг — перекраска (appearance).",
    build: (manifest, owners) => ({
      name: "field-values",
      events: [
        visualStorySetFieldValue(firstField(manifest), "story: шаг 1"),
        visualStoryWait(16),
        visualStorySetFieldValue(firstField(manifest), "story: шаг 2"),
      ],
      initial: () => ({manifest, owners}),
    }),
  },
  {
    id: "current-state",
    label: "Переход State",
    description:
      "Переносит current State владельца и меняет активность Process. " +
      "Прозрачность ветки меняется без пересчёта раскладки.",
    build: (manifest, owners) => {
      const move = ownerWithSiblingStates(manifest)
      const process = (manifest.orbitalParticles ?? []).find((particle) =>
        particle.orbitalParticleKind === "process"
      )
      return {
        name: "current-state",
        events: [
          ...(move
            ? [visualStoryMoveCurrentState(move.owner, move.target)]
            : []),
          visualStoryWait(32),
          ...(process
            ? [visualStorySetOrbitalActivity(
              process.orbitalParticleId,
              !process.active,
            )]
            : []),
        ],
        initial: () => ({manifest, owners}),
      }
    },
  },
  {
    id: "topology",
    label: "Изменение топологии",
    description:
      "Удаляет листовой Atom вместе со всем, что ему принадлежало. " +
      "Структурное изменение обязано пересобрать сцену целиком.",
    build: (manifest, owners) => ({
      name: "topology",
      events: [
        visualStoryRelabelTorus(rootTorusId(manifest), "до удаления"),
        visualStoryRemoveAtom(deepestLeafAtomId(manifest)),
      ],
      initial: () => ({manifest, owners}),
    }),
  },
]

export type VisualStoryStand = Readonly<{
  compare(other: VisualLayout): string
  player: VisualStoryPlayer
  scenario: VisualStoryScenario
  state: VisualStoryState
  summary: string
  trace: string
}>

const describeState = (state: VisualStoryState): string => {
  const frame = state.frame
  const patch = frame.summary
  return [
    `статус        ${state.status}`,
    `кадр          ${state.index} (осталось ${state.remaining})`,
    `время         ${state.timeMs} мс (виртуальное)`,
    `событие       ${frame.label}`,
    `инвалидация   ${frame.invalidation}`,
    `патч          ${patch.kind}`,
    `затронуто     ${patch.total} (Torus ${patch.tori}, Fields ${patch.fields},` +
      ` orbitals ${patch.orbitals}, proxies ${patch.fieldProxies},` +
      ` Transition ${patch.transitionBatches}, Relations ${patch.relationBatches})`,
    `сцена         Torus ${frame.payload.tori.length},` +
      ` Fields ${frame.payload.fields.length},` +
      ` orbitals ${frame.payload.orbitals.length},` +
      ` proxies ${frame.payload.fieldProxies.length}`,
  ].join("\n")
}

/** Creates a stand for one scenario under one strategy. */
export const createVisualStoryStand = (
  scenario: VisualStoryScenario,
  layout: VisualLayout,
  manifest: BulkManifest,
  owners: readonly VisualOwnerGraph[],
): VisualStoryStand => {
  const definition = scenario.build(manifest, owners)
  const player = createVisualStoryPlayer({layout, story: definition})
  const stand = {
    player,
    scenario,
    get state() {
      return player.state()
    },
    get summary() {
      return describeState(player.state())
    },
    get trace() {
      return formatVisualStoryTrace(player.trace())
    },
    compare(other: VisualLayout): string {
      const comparison = compareVisualStoryRuns(
        runVisualStory({layout, story: scenario.build(manifest, owners)}),
        runVisualStory({layout: other, story: scenario.build(manifest, owners)}),
      )
      return comparison.identical
        ? `${layout.slug} и ${other.slug}: кадры совпадают (${comparison.frameCount})`
        : `${layout.slug} и ${other.slug}: расходятся с кадра ` +
          `${comparison.firstDivergedIndex} из ${comparison.frameCount}`
    },
  }
  return stand as VisualStoryStand
}
