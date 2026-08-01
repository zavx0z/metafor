import type {
  Part,
  Particle,
} from "shared/protocol/force/particle"
import type {VisualLayoutSlug} from "@metafor/visual/layout"
import {
  PHOTON_STORY_EXPECTED_VISUAL_OUTCOME,
  PHOTON_STORY_HELP,
  PHOTON_STORY_PATCH,
  PHOTON_STORY_PREPARED_SCENE,
  PHOTON_STORY_SCENARIO,
} from "./PhotonForceStory.ts"

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

export type ForceStoryPreparedScene = typeof PHOTON_STORY_PREPARED_SCENE

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
  preparedScene: PHOTON_STORY_PREPARED_SCENE,
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
    scenario: PHOTON_STORY_SCENARIO,
    expectedVisualOutcome: PHOTON_STORY_EXPECTED_VISUAL_OUTCOME,
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

export const formatForceStoryPatch = (
  definition: ForceStoryDefinition,
): string => JSON.stringify(definition.patch, null, 2)

export const forceStoryModalText = (
  definition: ForceStoryDefinition,
): string => {
  if (definition.part === "photon") {
    return PHOTON_STORY_HELP
  }
  return [
    `Входящий Force patch (${definition.part}): ${formatForceStoryPatch(definition)}`,
    `Конкретный сценарий: ${definition.scenario}`,
    `Ожидаемый visual outcome: ${definition.expectedVisualOutcome}`,
  ].join("\n\n")
}
