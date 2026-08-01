import type {
  Part,
  Particle,
} from "shared/protocol/force/particle"
import {
  BulkProjectionStore,
  type BulkProjectionChange,
} from "../../../bulk/projection.ts"

export const FORCE_STORIES_SLUG = "force-stories"

export type ForceStoryStatus = "complete" | "template"

export type ForceStoryPreparedScene = Readonly<{
  atomId: number
  atomLabel: string
  id: string
  initialState: "idle"
  ownerSrc: string
}>

export type ForceStoryDefinition = Readonly<{
  expectedVisualOutcome: string
  label: string
  part: Part
  patch: Readonly<Particle>
  preparedScene: ForceStoryPreparedScene
  scenario: string
  status: ForceStoryStatus
}>

export type ForceStorySessionSnapshot = Readonly<{
  change: BulkProjectionChange | null
  currentState: string
  phase: "applied" | "prepared"
  projection: ReturnType<BulkProjectionStore["snapshot"]>
}>

const preparedScene = (
  part: Part,
  atomId: number,
  atomLabel: string,
): ForceStoryPreparedScene => ({
  atomId,
  atomLabel,
  id: `force-story/${part}/prepared`,
  initialState: "idle",
  ownerSrc: `playground/force-${part}`,
})

const scenes = {
  inflaton: preparedScene("inflaton", 1001, "Meta draft"),
  graviton: preparedScene("graviton", 1002, "Materialized Atom"),
  photon: preparedScene("photon", 1003, "Stateful Atom"),
  gluon: preparedScene("gluon", 1004, "Field-bearing Atom"),
  higgs: preparedScene("higgs", 1005, "Topology owner"),
  "w+": preparedScene("w+", 1006, "Successful Process owner"),
  "w-": preparedScene("w-", 1007, "Failed Process owner"),
  z: preparedScene("z", 1008, "Claimed Process owner"),
} satisfies Record<Part, ForceStoryPreparedScene>

const storiesByPart = {
  inflaton: {
    part: "inflaton",
    label: "Inflaton",
    status: "template",
    preparedScene: scenes.inflaton,
    patch: {
      part: "inflaton",
      op: "add",
      path: "wimp",
      by: "dark",
      ts: 1,
      value: {src: "playground/incoming-meta", name: "Incoming Meta"},
    },
    scenario:
      "Подготовлен отдельный Atom 1001 в State idle. В него входит Inflaton add с декларацией incoming Meta по path wimp.",
    expectedVisualOutcome:
      "Конкретная visual-реакция Inflaton для этого входа текущими projection-тестами не подтверждена. Карточка остаётся отдельным шаблоном и не изображает придуманное изменение сцены.",
  },
  graviton: {
    part: "graviton",
    label: "Graviton",
    status: "template",
    preparedScene: scenes.graviton,
    patch: {
      part: "graviton",
      op: "replace",
      path: `atom/${scenes.graviton.atomId}`,
      by: "boundary",
      ts: 1,
      value: {atom: {position: 2}},
    },
    scenario:
      "Подготовлен отдельный Atom 1002 в State idle. В него входит Graviton replace с patch atom.position = 2.",
    expectedVisualOutcome:
      "Структурная projection-реакция Graviton известна, но конкретный visual outcome этой карточки ещё не проверен. Шаблон не обещает перемещение или перестройку формы.",
  },
  photon: {
    part: "photon",
    label: "Photon",
    status: "complete",
    preparedScene: scenes.photon,
    patch: {
      part: "photon",
      op: "replace",
      path: scenes.photon.atomId,
      by: "matrix",
      ts: 1,
      value: "ready",
    },
    scenario:
      "Подготовлен Atom 1003, у которого текущий State равен idle. В него входит Photon replace по path 1003 со значением ready.",
    expectedVisualOutcome:
      "После применения Photon текущий State этого Atom видимо меняется с idle на ready. Повторная подготовка возвращает точно исходный State idle.",
  },
  gluon: {
    part: "gluon",
    label: "Gluon",
    status: "template",
    preparedScene: scenes.gluon,
    patch: {
      part: "gluon",
      op: "replace",
      path: scenes.gluon.atomId,
      by: "matrix",
      ts: 1,
      value: {fields: {"1": "prepared"}},
    },
    scenario:
      "Подготовлен отдельный Atom 1004 в State idle. В него входит Gluon replace с Field patch {1: prepared}.",
    expectedVisualOutcome:
      "Изменение Field projection принимается, но конкретная visual-реакция этого Field patch ещё не подтверждена. State и форма не меняются выдуманным образом.",
  },
  higgs: {
    part: "higgs",
    label: "Higgs",
    status: "template",
    preparedScene: scenes.higgs,
    patch: {
      part: "higgs",
      op: "replace",
      path: scenes.higgs.atomId,
      by: "matrix",
      ts: 1,
      value: {fields: {"1": ["one"]}},
    },
    scenario:
      "Подготовлен отдельный topology-owner Atom 1005 в State idle. В него входит Higgs replace с collection Field patch {1: [one]}.",
    expectedVisualOutcome:
      "Конкретная topology и visual-реакция Higgs требует отдельной подтверждённой fixture. До неё карточка показывает только подготовленную сцену и точный входящий patch.",
  },
  "w+": {
    part: "w+",
    label: "W+",
    status: "template",
    preparedScene: scenes["w+"],
    patch: {
      part: "w+",
      op: "replace",
      path: scenes["w+"].atomId,
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
      "Подготовлен отдельный Atom 1006 в State idle. В него входит W+ replace с успешным Process result proposal и Field {1: done}.",
    expectedVisualOutcome:
      "Visual-реакция успешного Process result для этой fixture ещё не подтверждена. Карточка не изображает успех как смену State, glow или новую форму.",
  },
  "w-": {
    part: "w-",
    label: "W−",
    status: "template",
    preparedScene: scenes["w-"],
    patch: {
      part: "w-",
      op: "replace",
      path: scenes["w-"].atomId,
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
      "Подготовлен отдельный Atom 1007 в State idle. В него входит W− replace с неуспешным Process result proposal и error prepared failure.",
    expectedVisualOutcome:
      "Visual-реакция неуспешного Process result для этой fixture ещё не подтверждена. Карточка не придумывает error-свечение, смену State или удаление формы.",
  },
  z: {
    part: "z",
    label: "Z",
    status: "template",
    preparedScene: scenes.z,
    patch: {
      part: "z",
      op: "test",
      path: scenes.z.atomId,
      by: "energy",
      ts: 1,
      value: {
        energy: "energy/force-stories",
        processExecutionId: "force-stories-claim",
      },
    },
    scenario:
      "Подготовлен отдельный Atom 1008 в State idle. В него входит Z test с Process execution claim от energy/force-stories.",
    expectedVisualOutcome:
      "Конкретная visual-реакция Z claim текущими projection-тестами не подтверждена. Карточка остаётся отдельным шаблоном без придуманного эффекта.",
  },
} satisfies Record<Part, ForceStoryDefinition>

export const ForceStories: readonly ForceStoryDefinition[] = Object.freeze([
  storiesByPart.inflaton,
  storiesByPart.graviton,
  storiesByPart.photon,
  storiesByPart.gluon,
  storiesByPart.higgs,
  storiesByPart["w+"],
  storiesByPart["w-"],
  storiesByPart.z,
])

const prepareProjection = (
  scene: ForceStoryPreparedScene,
): BulkProjectionStore => {
  const store = new BulkProjectionStore()
  const idleStateId = scene.atomId * 10 + 1
  const readyStateId = scene.atomId * 10 + 2
  const prepare = (patch: Particle): void => {
    const change = store.apply(patch)
    if (!change.changed) {
      throw new Error(`Force Story ${scene.id} preparation rejected ${String(patch.path)}`)
    }
  }

  prepare({
    part: "graviton",
    op: "add",
    path: "wimp",
    ts: 0,
    value: {src: scene.ownerSrc, name: scene.atomLabel},
  })
  prepare({
    part: "graviton",
    op: "add",
    path: "state",
    ts: 0,
    value: {
      id: idleStateId,
      localId: 1,
      wimp: scene.ownerSrc,
      name: "idle",
      position: 0,
    },
  })
  prepare({
    part: "graviton",
    op: "add",
    path: "state",
    ts: 0,
    value: {
      id: readyStateId,
      localId: 2,
      wimp: scene.ownerSrc,
      name: "ready",
      position: 1,
    },
  })
  prepare({
    part: "graviton",
    op: "add",
    path: `atom/${scene.atomId}`,
    ts: 0,
    value: {
      atom: {
        id: scene.atomId,
        parentAtom: null,
        parentTopology: null,
        wimp: scene.ownerSrc,
        position: 0,
      },
      values: [],
      valueRecords: [],
      valueItems: [],
      state: {atom: scene.atomId, metaState: idleStateId},
    },
  })
  return store
}

const currentStateName = (
  store: BulkProjectionStore,
  scene: ForceStoryPreparedScene,
): string => {
  const stateId = store.atomStates.get(scene.atomId)?.state
  if (stateId === null || stateId === undefined) return "none"
  return store.states.get(stateId)?.name ?? `State ${stateId}`
}

export class ForceStorySession {
  readonly definition: ForceStoryDefinition
  #change: BulkProjectionChange | null = null
  #phase: "applied" | "prepared" = "prepared"
  #store: BulkProjectionStore

  constructor(definition: ForceStoryDefinition) {
    this.definition = definition
    this.#store = prepareProjection(definition.preparedScene)
  }

  apply(): ForceStorySessionSnapshot {
    if (this.#phase === "prepared") {
      this.#change = this.#store.apply(structuredClone(this.definition.patch))
      this.#phase = "applied"
    }
    return this.snapshot()
  }

  restart(): ForceStorySessionSnapshot {
    this.#store = prepareProjection(this.definition.preparedScene)
    this.#change = null
    this.#phase = "prepared"
    return this.snapshot()
  }

  snapshot(): ForceStorySessionSnapshot {
    return {
      change: this.#change === null ? null : structuredClone(this.#change),
      currentState: currentStateName(
        this.#store,
        this.definition.preparedScene,
      ),
      phase: this.#phase,
      projection: this.#store.snapshot(),
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
): string => [
  `Входящий Force patch (${definition.part}): ${formatForceStoryPatch(definition)}`,
  `Подготовленная сцена: ${definition.scenario}`,
  `Ожидаемый visual outcome: ${definition.expectedVisualOutcome}`,
].join("\n\n")
