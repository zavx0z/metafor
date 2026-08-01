import type {
  Part,
  Particle,
} from "shared/protocol/force/particle"
import type {BulkProjectionSnapshot} from "@metafor/types/bulk/initial"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import type {StateGraph} from "@metafor/visual/payload"
import {
  BulkProjectionStore,
  type BulkProjectionChange,
} from "../../../bulk/projection.ts"
import {
  buildBulkManifestation,
} from "../../../bulk/manifestation.ts"
import {
  buildBulkVisualRenderManifest,
  renderableManifest,
} from "../../../bulk/visual-layout.ts"
import {
  CenteredNested,
  OutsideIn,
  buildStateGraph,
  visualOwnerDarkParticleIdFromAtomId,
  type VisualLayout,
  type VisualLayoutSlug,
  type VisualScene,
} from "@metafor/visual/layout"
import {
  PHOTON_STORY_CLOSURE,
  PHOTON_STORY_PATCH,
  PHOTON_STORY_PREPARED_PROJECTION,
  PHOTON_STORY_PROVENANCE,
} from "./fixture/PhotonStoryFixture.ts"

export const FORCE_STORIES_SLUG = "force-stories"

export const FORCE_STORY_PARTS = Object.freeze([
  "inflaton",
  "graviton",
  "photon",
  "gluon",
  "higgs",
  "w+",
  "w-",
  "z",
] as const satisfies readonly Part[])

const routeSegmentByPart = {
  inflaton: "inflaton",
  graviton: "graviton",
  photon: "photon",
  gluon: "gluon",
  higgs: "higgs",
  "w+": "w-plus",
  "w-": "w-minus",
  z: "z",
} as const satisfies Record<Part, string>

export type ForceStoryStatus = "complete" | "template"

export type ForceStoryPreparedScene = Readonly<{
  atomId: number
  atomLabel: string
  closure: typeof PHOTON_STORY_CLOSURE
  id: string
  initialStateId: number
  initialStateName: string
  ownerSrc: string
  parentAtomId: number
  processId: number
  provenance: typeof PHOTON_STORY_PROVENANCE
  rootSrc: string
  sourceSnapshot: BulkProjectionSnapshot
  targetStateId: number
  targetStateName: string
  transitionId: number
}>

export type ForceStoryVerifiedRepresentation = Readonly<{
  id: string
  kind: "focused-visual-graph"
  label: string
  layouts: readonly ForceStoryLayout[]
  preparedScene: ForceStoryPreparedScene
  status: "verified"
  views: readonly ForceStoryView[]
}>

export type ForceStoryUnavailableRepresentation = Readonly<{
  id: string
  kind: "focused-visual-graph"
  label: string
  reason: string
  status: "unavailable"
  views: readonly ForceStoryView[]
}>

export type ForceStoryView = Readonly<{
  camera: "side-profile" | "top"
  id: "side" | "top"
  label: "Вид сбоку" | "Вид сверху"
}>

export type ForceStoryLayout = Readonly<{
  id: VisualLayoutSlug
  label: "Снаружи-внутрь" | "Центрированно-вложенная"
}>

/**
 * A Story owns an ordered representation collection. Each representation owns
 * its own ordered camera-view collection, so later focused slices and camera
 * angles can be added without changing the Force catalog or route.
 */
export type ForceStoryRepresentation =
  | ForceStoryVerifiedRepresentation
  | ForceStoryUnavailableRepresentation

export type ForceStoryDefinition = Readonly<{
  expectedVisualOutcome: string
  label: string
  part: Part
  patch: Readonly<Particle>
  representations: readonly ForceStoryRepresentation[]
  scenario: string
  status: ForceStoryStatus
}>

export type ForceStorySleeveSnapshot = Readonly<{
  active: boolean
  current: boolean
  name: string
  rootStateId: number
}>

export type ForceStoryVisualSnapshot = Readonly<{
  graph: StateGraph
  layouts: readonly ForceStoryVisualLayoutSnapshot[]
  manifest: BulkManifest
  representationId: string
  rootDarkParticleId: number
  sleeves: readonly ForceStorySleeveSnapshot[]
  visual: BulkVisualRenderManifest
}>

export type ForceStoryVisualLayoutSnapshot = Readonly<{
  id: VisualLayoutSlug
  label: ForceStoryLayout["label"]
  scene: VisualScene
}>

export type ForceStorySessionSnapshot = Readonly<{
  change: BulkProjectionChange | null
  currentState: string
  phase: "applied" | "prepared"
  projection: ReturnType<BulkProjectionStore["snapshot"]>
  representation: ForceStoryVisualSnapshot
}>

const photonScene: ForceStoryPreparedScene = Object.freeze({
  atomId: 4,
  atomLabel: "lada-model",
  closure: PHOTON_STORY_CLOSURE,
  id: "force-story/photon/prepared",
  initialStateId: 19,
  initialStateName: "обращение к модели",
  ownerSrc: "zavx0z/lada-model",
  parentAtomId: 1,
  processId: 12,
  provenance: PHOTON_STORY_PROVENANCE,
  rootSrc: "zavx0z/lada",
  sourceSnapshot: PHOTON_STORY_PREPARED_PROJECTION,
  targetStateId: 20,
  targetStateName: "ошибка",
  transitionId: 26,
})

export const FORCE_STORY_VIEWS = Object.freeze([
  Object.freeze({
    camera: "top",
    id: "top",
    label: "Вид сверху",
  }),
  Object.freeze({
    camera: "side-profile",
    id: "side",
    label: "Вид сбоку",
  }),
] as const satisfies readonly ForceStoryView[])

export const FORCE_STORY_LAYOUTS = Object.freeze([
  Object.freeze({
    id: "centered-nested",
    label: "Центрированно-вложенная",
  }),
  Object.freeze({
    id: "outside-in",
    label: "Снаружи-внутрь",
  }),
] as const satisfies readonly ForceStoryLayout[])

const unavailableRepresentation = (
  part: Part,
  reason: string,
): ForceStoryUnavailableRepresentation => Object.freeze({
  id: `force-story/${part}/focused-graph`,
  kind: "focused-visual-graph",
  label: "Затронутые части visual-графа",
  reason,
  status: "unavailable",
  views: FORCE_STORY_VIEWS,
})

const photonRepresentation: ForceStoryVerifiedRepresentation = Object.freeze({
  id: "force-story/photon/focused-state-graph",
  kind: "focused-visual-graph",
  label: "Полный State-sleeve lada-model",
  layouts: FORCE_STORY_LAYOUTS,
  preparedScene: photonScene,
  status: "verified",
  views: FORCE_STORY_VIEWS,
})

const storiesByPart = {
  inflaton: {
    part: "inflaton",
    label: "Inflaton",
    status: "template",
    representations: [unavailableRepresentation(
      "inflaton",
      "Проверенное focused visual-представление для Inflaton ещё не определено.",
    )],
    patch: {
      part: "inflaton",
      op: "add",
      path: "wimp",
      by: "dark",
      ts: 1,
      value: {src: "playground/incoming-meta", name: "Incoming Meta"},
    },
    scenario:
      "Входит Inflaton add с декларацией incoming Meta по path wimp. Подготовленный visual-срез для этого случая ещё не подтверждён.",
    expectedVisualOutcome:
      "Конкретная visual-реакция Inflaton текущими projection-тестами не подтверждена, поэтому представление не рендерится.",
  },
  graviton: {
    part: "graviton",
    label: "Graviton",
    status: "template",
    representations: [unavailableRepresentation(
      "graviton",
      "Проверенное focused visual-представление для Graviton ещё не определено.",
    )],
    patch: {
      part: "graviton",
      op: "replace",
      path: "atom/1002",
      by: "boundary",
      ts: 1,
      value: {atom: {position: 2}},
    },
    scenario:
      "Входит Graviton replace для Atom 1002 с patch atom.position = 2. Подготовленный visual-срез ещё не утверждён.",
    expectedVisualOutcome:
      "Структурная projection-реакция Graviton известна, но конкретный visual outcome этой Story ещё не проверен; перемещение или перестройка не изображаются.",
  },
  photon: {
    part: "photon",
    label: "Photon",
    status: "complete",
    representations: [photonRepresentation],
    patch: PHOTON_STORY_PATCH,
    scenario:
      "Из Cloud Force history восстановлен полный причинный срез lada-model непосредственно перед sequence 412. Входит записанный Photon replace по Atom 4 со State «ошибка».",
    expectedVisualOutcome:
      "Активность переключается с полного рукава «обращение к модели» на рукав «ошибка»: прежний рукав, Process 12 и его связи затухают, новый State, его Transition и Condition-связи подсвечиваются. Геометрия остаётся неизменной; Restart возвращает записанное состояние перед Photon.",
  },
  gluon: {
    part: "gluon",
    label: "Gluon",
    status: "template",
    representations: [unavailableRepresentation(
      "gluon",
      "Проверенное focused visual-представление для Gluon ещё не определено.",
    )],
    patch: {
      part: "gluon",
      op: "replace",
      path: 1004,
      by: "matrix",
      ts: 1,
      value: {fields: {"1": "prepared"}},
    },
    scenario:
      "Входит Gluon replace для Atom 1004 с Field patch {1: prepared}. Подготовленный visual-срез ещё не подтверждён.",
    expectedVisualOutcome:
      "Изменение Field projection принимается, но конкретная visual-реакция этого Field patch ещё не подтверждена; форма и State не меняются выдуманным образом.",
  },
  higgs: {
    part: "higgs",
    label: "Higgs",
    status: "template",
    representations: [unavailableRepresentation(
      "higgs",
      "Проверенное focused visual-представление для Higgs ещё не определено.",
    )],
    patch: {
      part: "higgs",
      op: "replace",
      path: 1005,
      by: "matrix",
      ts: 1,
      value: {fields: {"1": ["one"]}},
    },
    scenario:
      "Входит Higgs replace для topology-owner Atom 1005 с collection Field patch {1: [one]}. Подготовленный visual-срез ещё не подтверждён.",
    expectedVisualOutcome:
      "Конкретная topology и visual-реакция Higgs требует отдельной подтверждённой fixture, поэтому представление не рендерится.",
  },
  "w+": {
    part: "w+",
    label: "W+",
    status: "template",
    representations: [unavailableRepresentation(
      "w+",
      "Проверенное focused visual-представление для W+ ещё не определено.",
    )],
    patch: {
      part: "w+",
      op: "replace",
      path: 1006,
      by: "energy",
      ts: 1,
      from: "energy/force-stories",
      value: {
        processExecutionId: "force-stories-success",
        processId: 1,
        fields: {"1": "done"},
      },
    },
    scenario:
      "Входит W+ replace для Atom 1006 с успешным Process result proposal и Field {1: done}. Подготовленный visual-срез ещё не подтверждён.",
    expectedVisualOutcome:
      "Visual-реакция успешного Process result для этой fixture ещё не подтверждена; успех не изображается как смена State, glow или новая форма.",
  },
  "w-": {
    part: "w-",
    label: "W-",
    status: "template",
    representations: [unavailableRepresentation(
      "w-",
      "Проверенное focused visual-представление для W− ещё не определено.",
    )],
    patch: {
      part: "w-",
      op: "replace",
      path: 1007,
      by: "energy",
      ts: 1,
      from: "energy/force-stories",
      value: {
        processExecutionId: "force-stories-failure",
        processId: 1,
        fields: {},
        error: "prepared failure",
      },
    },
    scenario:
      "Входит W− replace для Atom 1007 с неуспешным Process result proposal и error prepared failure. Подготовленный visual-срез ещё не подтверждён.",
    expectedVisualOutcome:
      "Visual-реакция неуспешного Process result для этой fixture ещё не подтверждена; error-свечение, смена State или удаление формы не изображаются.",
  },
  z: {
    part: "z",
    label: "Z",
    status: "template",
    representations: [unavailableRepresentation(
      "z",
      "Проверенное focused visual-представление для Z ещё не определено.",
    )],
    patch: {
      part: "z",
      op: "test",
      path: 1008,
      by: "energy",
      ts: 1,
      value: {
        energy: "energy/force-stories",
        processExecutionId: "force-stories-claim",
      },
    },
    scenario:
      "Входит Z test для Atom 1008 с Process execution claim от energy/force-stories. Подготовленный visual-срез ещё не подтверждён.",
    expectedVisualOutcome:
      "Конкретная visual-реакция Z claim текущими projection-тестами не подтверждена, поэтому представление не рендерится.",
  },
} satisfies Record<Part, ForceStoryDefinition>

export const ForceStories: readonly ForceStoryDefinition[] = Object.freeze(
  FORCE_STORY_PARTS.map((part) => storiesByPart[part]),
)

export const forceStoryForPart = (part: Part): ForceStoryDefinition =>
  storiesByPart[part]

export const forceStoryRouteSlug = (part: Part): string =>
  `${FORCE_STORIES_SLUG}/${routeSegmentByPart[part]}`

export const forceStoryPartForSlug = (slug: string): Part | null => {
  if (slug === FORCE_STORIES_SLUG) return "photon"
  const match = FORCE_STORY_PARTS.find((part) =>
    forceStoryRouteSlug(part) === slug
  )
  return match ?? null
}

const prepareProjection = (
  scene: ForceStoryPreparedScene,
): BulkProjectionStore => {
  const store = new BulkProjectionStore()
  store.hydrate(structuredClone(scene.sourceSnapshot))
  return store
}

const verifiedRepresentation = (
  definition: ForceStoryDefinition,
): ForceStoryVerifiedRepresentation => {
  const verified = definition.representations.filter((representation) =>
    representation.status === "verified"
  )
  if (verified.length !== 1) {
    throw new Error(
      `Force Story ${definition.part} expected one verified representation`,
    )
  }
  return verified[0]!
}

const currentStateName = (
  store: BulkProjectionStore,
  scene: ForceStoryPreparedScene,
): string => {
  const stateId = store.atomStates.get(scene.atomId)?.state
  if (stateId === null || stateId === undefined) return "none"
  return store.states.get(stateId)?.name ?? `State ${stateId}`
}

const forceStoryLayoutById = Object.freeze({
  "centered-nested": CenteredNested,
  "outside-in": OutsideIn,
} satisfies Record<VisualLayoutSlug, VisualLayout>)

const visualSnapshot = (
  store: BulkProjectionStore,
  representation: ForceStoryVerifiedRepresentation,
): ForceStoryVisualSnapshot => {
  const projection = store.view()
  const preparedScene = representation.preparedScene
  const manifest = buildBulkManifestation(
    projection,
    preparedScene.rootSrc,
  )
  const graph = buildStateGraph(projection, preparedScene.atomId)
  const rootDarkParticleId = visualOwnerDarkParticleIdFromAtomId(
    preparedScene.atomId,
  )
  const stateById = new Map(
    graph.states.map((state) => [state.id, state] as const),
  )
  const rootStateIds = [...new Set(
    graph.sleeves.map((sleeve) => sleeve.rootStateId),
  )]
  const atomByOwnerId = new Map(
    projection.atoms.map((atom) => [
      visualOwnerDarkParticleIdFromAtomId(atom.id),
      atom,
    ] as const),
  )
  const renderable = renderableManifest(manifest)
  const owners = renderable.darkParticles
    .filter((particle) => particle.darkParticleKind === "atom")
    .map((particle) => {
      const atom = atomByOwnerId.get(particle.darkParticleId)
      if (!atom) {
        throw new Error(
          `Force Story ${representation.id} owner ${particle.darkParticleId} is absent`,
        )
      }
      return {
        graph: buildStateGraph(projection, atom.id),
        ownerDarkParticleId: particle.darkParticleId,
      }
    })
  return {
    graph,
    layouts: representation.layouts.map((layout) => ({
      id: layout.id,
      label: layout.label,
      scene: forceStoryLayoutById[layout.id].buildScene({
        manifest: renderable,
        owners,
      }),
    })),
    manifest,
    representationId: representation.id,
    rootDarkParticleId,
    visual: buildBulkVisualRenderManifest(manifest, projection),
    sleeves: rootStateIds.map((rootStateId) => ({
      active: rootStateId === graph.currentStateId,
      current: rootStateId === graph.currentStateId,
      name: stateById.get(rootStateId)?.name ?? `State ${rootStateId}`,
      rootStateId,
    })),
  }
}

export class ForceStorySession {
  readonly definition: ForceStoryDefinition
  readonly representation: ForceStoryVerifiedRepresentation
  #change: BulkProjectionChange | null = null
  #phase: "applied" | "prepared" = "prepared"
  #store: BulkProjectionStore

  constructor(definition: ForceStoryDefinition) {
    this.definition = definition
    this.representation = verifiedRepresentation(definition)
    this.#store = prepareProjection(this.representation.preparedScene)
  }

  apply(): ForceStorySessionSnapshot {
    if (this.#phase === "prepared") {
      this.#change = this.#store.apply(structuredClone(this.definition.patch))
      if (!this.#change.changed) {
        throw new Error(
          `Force Story ${this.definition.part} patch did not change projection`,
        )
      }
      this.#phase = "applied"
    }
    return this.snapshot()
  }

  restart(): ForceStorySessionSnapshot {
    this.#store = prepareProjection(this.representation.preparedScene)
    this.#change = null
    this.#phase = "prepared"
    return this.snapshot()
  }

  snapshot(): ForceStorySessionSnapshot {
    return {
      change: this.#change === null ? null : structuredClone(this.#change),
      currentState: currentStateName(
        this.#store,
        this.representation.preparedScene,
      ),
      phase: this.#phase,
      projection: this.#store.snapshot(),
      representation: visualSnapshot(this.#store, this.representation),
    }
  }
}

export const createForceStorySession = (
  definition: ForceStoryDefinition,
): ForceStorySession => new ForceStorySession(definition)

export const formatForceStoryPatch = (
  definition: ForceStoryDefinition,
): string => JSON.stringify(definition.patch, null, 2)

export const forceStoryModalText = (
  definition: ForceStoryDefinition,
): string => {
  if (definition.part === "photon") {
    return [
      "В записанном состоянии lada-model находится в State «обращение к модели». Process попытался подготовить ответ, завершился ошибкой, и Field «Ошибка модели» уже содержит значение «Inference prompt is empty.». Это выполняет реальное Condition перехода в State «ошибка».",
      "Затем приходит записанная частица Photon от Matrix. Она меняет текущий State целевого Atom на «ошибка». Во всех четырёх отображениях обеих раскладок активный рукав «обращение к модели» и Process затухают, а полный рукав «ошибка» с его Transition и Condition-связями подсвечивается. Формы и их расположение внутри каждой раскладки не меняются.",
      "Restart возвращает точный подготовленный срез перед Photon: снова активен State «обращение к модели», Process и его причинные связи.",
    ].join("\n\n")
  }
  return [
    `Входящий Force patch (${definition.part}): ${formatForceStoryPatch(definition)}`,
    `Конкретный сценарий: ${definition.scenario}`,
    `Ожидаемый visual outcome: ${definition.expectedVisualOutcome}`,
  ].join("\n\n")
}
