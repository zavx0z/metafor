import type {BulkRuntimeProjection, BulkRuntimeWimp} from "@bulk/types/projection"
import type {AtomRecord} from "@metafor/types/boundary/atom"

export const LADA_ROOT_SRC = "zavx0z/lada" as const

export const LADA_TOPOLOGY_WIMPS = [
  {src: LADA_ROOT_SRC, name: "Lada"},
  {src: "zavx0z/lada-auth", name: "Auth"},
  {src: "zavx0z/lada-chat", name: "Chat"},
  {src: "zavx0z/lada-model", name: "Model"},
  {src: "zavx0z/lada-chat-send", name: "Chat send"},
] as const satisfies readonly BulkRuntimeWimp[]

export const ladaTopologyAtoms = (
  ladaParentAtom: number | null,
): AtomRecord[] => [
  {id: 2, parentAtom: ladaParentAtom, parentTopology: null, wimp: LADA_ROOT_SRC, position: 0},
  {id: 3, parentAtom: 2, parentTopology: null, wimp: "zavx0z/lada-auth", position: 0},
  {id: 4, parentAtom: 2, parentTopology: null, wimp: "zavx0z/lada-chat", position: 1},
  {id: 5, parentAtom: 2, parentTopology: null, wimp: "zavx0z/lada-model", position: 2},
  {id: 6, parentAtom: 4, parentTopology: null, wimp: "zavx0z/lada-chat-send", position: 0},
]

export const ladaTopologyProjectionFixture = (): BulkRuntimeProjection => ({
  atoms: ladaTopologyAtoms(null),
  topologies: [],
  wimps: LADA_TOPOLOGY_WIMPS.map((wimp) => ({...wimp})),
  fields: [],
  states: [],
  transitions: [],
  conditions: [],
  processes: [],
  reactions: [],
  atomStates: [],
  fieldEnumVariants: [],
  atomValues: [],
  values: [],
  valueItems: [],
  matterParticles: [],
  matterTopologyBindingPaths: [],
  matterChildWimpBindingPaths: [],
})
