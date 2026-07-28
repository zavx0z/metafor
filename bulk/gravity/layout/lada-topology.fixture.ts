import type {BulkRuntimeProjection, BulkRuntimeWimp} from "@metafor/types/bulk/runtime"
import type {AtomRecord} from "@metafor/types/boundary/atom"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {buildBulkManifestation} from "../../manifestation"

export const LADA_ROOT_SRC = "zavx0z/lada" as const

export const LADA_TOPOLOGY_WIMPS = [
	{src: LADA_ROOT_SRC, name: "Lada"},
	{src: "zavx0z/lada-auth", name: "Auth"},
	{src: "zavx0z/lada-chat", name: "Chat"},
	{src: "zavx0z/lada-model", name: "Model"},
	{src: "zavx0z/lada-chat-send", name: "Chat send"},
] as const satisfies readonly BulkRuntimeWimp[]

/**
 * Exact five-Atom Lada subtree accepted by MF-117.
 *
 * Only Lada's parent changes across the Inference dissolve. Auth, Chat and
 * Model remain its direct Matter children, while ChatSend remains inside Chat.
 */
export const ladaTopologyAtoms = (ladaParentAtom: number | null): AtomRecord[] => [
	{id: 2, parentAtom: ladaParentAtom, parentTopology: null, wimp: LADA_ROOT_SRC, position: 0},
	{id: 3, parentAtom: 2, parentTopology: null, wimp: "zavx0z/lada-auth", position: 0},
	{id: 4, parentAtom: 2, parentTopology: null, wimp: "zavx0z/lada-chat", position: 1},
	{id: 5, parentAtom: 2, parentTopology: null, wimp: "zavx0z/lada-model", position: 2},
	{id: 6, parentAtom: 4, parentTopology: null, wimp: "zavx0z/lada-chat-send", position: 0},
]

/**
 * Topology-only Boundary projection fixture. It intentionally carries no
 * invented Fields, States or topology nodes: the contract under test is the
 * real accepted Lada Matter ownership graph.
 */
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

/** Deterministic production projection → manifest form for the same topology. */
export const ladaTopologyManifestFixture = (): BulkManifest =>
	buildBulkManifestation(ladaTopologyProjectionFixture(), LADA_ROOT_SRC)
