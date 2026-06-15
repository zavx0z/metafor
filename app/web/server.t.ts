import type { DbWorldRows, BulkLayoutSettings } from "@bulk/gravity/layout"

export type Particle = {
	part: "graviton" | "photon" | "gluon" | "higgs" | "w" | "-z" | "+z"
	op: "add" | "remove" | "replace" | "move" | "copy" | "test"
	path: string
	value?: unknown
	from?: string
	[key: string]: unknown
}

export type ClientForceBridgePayload = {
	type: "force"
	parts: Particle[]
}

export type ClientMaterializePayload = {
	type: "materialize"
	src: string
	layoutSettings?: Partial<BulkLayoutSettings>
}

export type ClientRelayoutPayload = {
	type: "relayout"
	src: string
	layoutSettings?: Partial<BulkLayoutSettings>
}

export type ClientMessage = ClientForceBridgePayload | ClientMaterializePayload | ClientRelayoutPayload

export type ServerWorldPayload = {
	type: "world"
	src: string
	world: DbWorldRows
}
