import type { AppWebLayoutSettings } from "./settings.ts"
import type { Particle } from "store"

export type { Particle }

export type WorkerName = "dark" | "boundary" | "bulk"
export type WorkerStatus = "idle" | "ready" | "started" | "done" | "error"

export type WorkerStatusMessage = {
	type: "worker-status"
	worker: WorkerName
	status: WorkerStatus
	src?: string
	error?: string
}

export type WorkerLogMessage = {
	type: "log"
	message: unknown
}

export type ClientMaterializeMessage = {
	type: "materialize"
	src: string
	layoutSettings?: Partial<AppWebLayoutSettings>
}

export type ClientRelayoutMessage = {
	type: "relayout"
	src: string
	layoutSettings?: Partial<AppWebLayoutSettings>
}

export type ClientForceBridgePayload = {
	type: "force"
	parts: Particle[]
}

export type AppRuntime = {
	bulk: Worker
	boundary: Worker
	dark: Worker
}
