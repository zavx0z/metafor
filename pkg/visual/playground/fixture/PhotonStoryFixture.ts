import type {BulkProjectionSnapshot} from "@metafor/types/bulk/initial"
import type {Particle} from "shared/protocol/force/particle"

/**
 * Provenance for the exact recorded State change used by Force Stories.
 *
 * The prepared cut was replayed through the ordinary BulkProjectionStore from
 * the Cloud history prefix through sequence 411. Sequence 412 is deliberately
 * kept separate: it is the one incoming Photon the Story applies.
 */
export const PHOTON_STORY_PROVENANCE = Object.freeze({
  acceptedAt: "2026-07-31T11:13:49.993Z",
  historySegment:
    ".metafor/dark-force-history/v1/segments/00000000000000000001.ndjson",
  historySegmentSha256:
    "b22c61d7a63613c9ca31277f141337b970684885e81d69c6a1f52beb52916d0e",
  preparedThroughSequence: 411,
  sourceRootSrc: "zavx0z/lada",
  targetAtomId: 4,
  targetSrc: "zavx0z/lada-model",
  patchSequence: 412,
} as const)

export const PHOTON_STORY_PATCH = Object.freeze({
  part: "photon",
  op: "replace",
  path: 4,
  ts: 1785496429978,
  value: "ошибка",
  by: "matrix",
} as const satisfies Particle)

/**
 * Complete causal-and-visual closure for the recorded lada-model State sleeve.
 *
 * Kept from the replayed sequence-411 projection:
 * - the parent Lada Torus and the three source Fields shared with lada-model;
 * - the target lada-model Torus and every Field read or written by Process 12;
 * - all States, Transitions and Conditions of that target State graph;
 * - the exact prepared current State and shared Value identities.
 *
 * Sibling Atoms, parent State branches and unrelated parent Fields are omitted.
 * Manifestation reconstructs the real Field entanglements, sleeve proxies and
 * Process read/write relations from this projection; none are authored here.
 */
export const PHOTON_STORY_PREPARED_PROJECTION = Object.freeze({
  declarations: [],
  runtime: {
    atoms: [
      {
        id: 1,
        parentAtom: null,
        parentTopology: null,
        wimp: "zavx0z/lada",
        position: 0,
      },
      {
        id: 4,
        parentAtom: 1,
        parentTopology: null,
        wimp: "zavx0z/lada-model",
        position: 2,
      },
    ],
    topologies: [],
    wimps: [
      {src: "zavx0z/lada", name: "lada"},
      {src: "zavx0z/lada-model", name: "lada-model"},
    ],
    fields: [
      {
        id: 15,
        wimp: "zavx0z/lada",
        key: "modelPrompt",
        type: "string",
        label: "Намерение обратиться к модели",
      },
      {
        id: 16,
        wimp: "zavx0z/lada",
        key: "replyDraft",
        type: "string",
        label: "Черновик ответа",
      },
      {
        id: 17,
        wimp: "zavx0z/lada",
        key: "modelError",
        type: "string",
        label: "Ошибка модели",
      },
      {
        id: 45,
        wimp: "zavx0z/lada-model",
        key: "prompt",
        type: "string",
        label: "Намерение Лады",
      },
      {
        id: 46,
        wimp: "zavx0z/lada-model",
        key: "model",
        type: "string",
        label: "Ollama model",
      },
      {
        id: 47,
        wimp: "zavx0z/lada-model",
        key: "response",
        type: "string",
        label: "Черновик модели",
      },
      {
        id: 48,
        wimp: "zavx0z/lada-model",
        key: "lastMessageId",
        type: "string",
        label: "Последнее сообщение модели",
      },
      {
        id: 49,
        wimp: "zavx0z/lada-model",
        key: "error",
        type: "string",
        label: "Ошибка модели",
      },
    ],
    states: [
      {
        id: 18,
        wimp: "zavx0z/lada-model",
        name: "ожидание",
        position: 0,
      },
      {
        id: 19,
        wimp: "zavx0z/lada-model",
        name: "обращение к модели",
        position: 1,
      },
      {
        id: 20,
        wimp: "zavx0z/lada-model",
        name: "ошибка",
        position: 2,
      },
    ],
    transitions: [
      {
        id: 25,
        wimp: "zavx0z/lada-model",
        fromState: 18,
        toState: 19,
        position: 0,
      },
      {
        id: 26,
        wimp: "zavx0z/lada-model",
        fromState: 19,
        toState: 20,
        position: 0,
      },
      {
        id: 27,
        wimp: "zavx0z/lada-model",
        fromState: 19,
        toState: 18,
        position: 1,
      },
      {
        id: 28,
        wimp: "zavx0z/lada-model",
        fromState: 20,
        toState: 18,
        position: 0,
      },
    ],
    conditions: [
      {
        id: 33,
        wimp: "zavx0z/lada-model",
        transition: 25,
        field: 45,
        position: 0,
        predicate: {null: false},
      },
      {
        id: 34,
        wimp: "zavx0z/lada-model",
        transition: 26,
        field: 49,
        position: 0,
        predicate: {null: false},
      },
      {
        id: 35,
        wimp: "zavx0z/lada-model",
        transition: 27,
        field: 45,
        position: 0,
        predicate: {null: true},
      },
      {
        id: 36,
        wimp: "zavx0z/lada-model",
        transition: 28,
        field: 49,
        position: 0,
        predicate: {null: true},
      },
    ],
    processes: [{
      id: 12,
      wimp: "zavx0z/lada-model",
      state: "обращение к модели",
      descriptor: {
        type: "action",
        key: "обращение к модели",
        label: "Подготовить черновик локальной Ollama-моделью",
        action: {
          readFields: [
            [45, "prompt"],
            [46, "model"],
            [47, "response"],
            [48, "lastMessageId"],
            [49, "error"],
          ],
        },
        success: {
          writeFields: [
            [45, "prompt"],
            [47, "response"],
            [48, "lastMessageId"],
            [49, "error"],
          ],
        },
        error: {
          writeFields: [
            [45, "prompt"],
            [49, "error"],
          ],
        },
      },
    }],
    reactions: [],
    atomStates: [{atom: 4, state: 19}],
    fieldEnumVariants: [],
    atomValues: [
      {atom: 1, field: 15, value: 15},
      {atom: 1, field: 16, value: 16},
      {atom: 1, field: 17, value: 17},
      {atom: 4, field: 45, value: 15},
      {atom: 4, field: 46, value: 27},
      {atom: 4, field: 47, value: 16},
      {atom: 4, field: 48, value: 28},
      {atom: 4, field: 49, value: 17},
    ],
    values: [
      {
        id: 15,
        kind: "null",
        booleanValue: null,
        numberValue: null,
        textValue: null,
        enumValue: null,
      },
      {
        id: 16,
        kind: "null",
        booleanValue: null,
        numberValue: null,
        textValue: null,
        enumValue: null,
      },
      {
        id: 17,
        kind: "string",
        booleanValue: null,
        numberValue: null,
        textValue: "Inference prompt is empty.",
        enumValue: null,
      },
      {
        id: 27,
        kind: "string",
        booleanValue: null,
        numberValue: null,
        textValue: "qwen3.5:9b",
        enumValue: null,
      },
      {
        id: 28,
        kind: "null",
        booleanValue: null,
        numberValue: null,
        textValue: null,
        enumValue: null,
      },
    ],
    valueItems: [],
    matterParticles: [],
    matterTopologyBindingPaths: [],
    matterChildWimpBindingPaths: [],
  },
} satisfies BulkProjectionSnapshot)

export const PHOTON_STORY_CLOSURE = Object.freeze({
  atomIds: [1, 4],
  conditionIds: [33, 34, 35, 36],
  fieldIds: [15, 16, 17, 45, 46, 47, 48, 49],
  parentSourceFieldIds: [15, 16, 17],
  processIds: [12],
  stateIds: [18, 19, 20],
  targetFieldIds: [45, 46, 47, 48, 49],
  transitionIds: [25, 26, 27, 28],
} as const)
