import type { BulkLayoutSettings } from "@bulk/gravity/layout"
import type { BoundaryBulkRuntimeSnapshot } from "boundary"

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

export type ClientVoiceLeasePayload = {
	type: "hud-voice-lease"
	action: "request" | "release"
	clientId: string
	reason?: string
}

export type ClientMessage = ClientMaterializePayload | ClientRelayoutPayload | ClientVoiceLeasePayload

export type ServerSnapshotPayload = {
	type: "snapshot"
	src: string
	snapshot: BoundaryBulkRuntimeSnapshot
}
