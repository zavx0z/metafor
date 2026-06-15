import type { DbWorldRows, BulkLayoutSettings } from "@bulk/gravity/layout"

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

export type ClientMessage = ClientMaterializePayload | ClientRelayoutPayload

export type ServerWorldPayload = {
	type: "world"
	src: string
	world: DbWorldRows
}
