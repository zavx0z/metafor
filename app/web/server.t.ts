import type {BulkLayoutSettings} from "@bulk/gravity/layout"
import type {BoundaryBulkRuntimeSnapshot, BoundaryMatrixRuntimeSnapshot, BoundaryUpdateMessage, ProcessTask} from "boundary"
import type {EnergyEnv, EnergyMass, EnergyProcessResult, EnergyProcessTask} from "energy"

export type {BoundaryUpdateMessage}

export type AppLogTone = "cyan" | "gray" | "green" | "magenta" | "red" | "yellow"

export type AppWebClientSocketData = {
	kind: "app-web"
}

export type MatrixBridgeSocketData = {
	kind: "matrix-bridge"
	connectedAt: number
}

export type EnergyBridgeSocketData = {
	kind: "energy-bridge"
	connectedAt: number
}

export type AppWebSocketData =
	| AppWebClientSocketData
	| EnergyBridgeSocketData
	| MatrixBridgeSocketData

export type MatrixBridgeIncomingMessage =
	| {type: "force"; parts: BoundaryUpdateMessage["parts"]}
	| {type: "hello"; runtime: "matrix"; pid: number; startedAt: string}
	| {type: "process-task"; version: 1; task: ProcessTask}
	| {type: "snapshot-request"; reason?: string}

export type MatrixBridgeOutgoingMessage =
	| {type: "matrix-snapshot"; version: 1; reason: string; snapshot: BoundaryMatrixRuntimeSnapshot}
	| {type: "force"; parts: BoundaryUpdateMessage["parts"]}

export type EnergyBridgeIncomingMessage =
	| {type: "force"; parts: BoundaryUpdateMessage["parts"]}
	| {type: "hello"; runtime: "energy"; env: EnergyEnv; pid: number; startedAt: string}
	| {type: "claim"; actorId: number; processId: number; token: string; env: EnergyEnv; mass?: EnergyMass}
	| {type: "process-result"; result: EnergyProcessResult}

export type EnergyBridgeOutgoingMessage =
	| {type: "force"; parts: BoundaryUpdateMessage["parts"]}
	| {type: "process-task"; version: 1; task: EnergyProcessTask}
	| {type: "claim-accepted"; actorId: number; processId: number; token?: string}
	| {type: "claim-rejected"; actorId: number; processId: number; reason: string}
	| {type: "error"; error: string}

export type AppClientAsset = {
	body: ArrayBuffer
	type: string
}

export type AppClientBundle = {
	assets: Map<string, AppClientAsset>
	html: AppClientAsset
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

export type ClientMessage = ClientMaterializePayload | ClientRelayoutPayload

export type ServerSnapshotPayload = {
	type: "snapshot"
	src: string
	snapshot: BoundaryBulkRuntimeSnapshot
}
