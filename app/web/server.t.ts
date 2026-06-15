import type { Particle } from "boundary"
import type { DbWorldRows, BulkLayoutSettings } from "@bulk/gravity/layout"

export type { Particle }

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
