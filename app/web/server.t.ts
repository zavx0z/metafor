import type { Particle } from "store"

export type { Particle }

export type ClientForceBridgePayload = {
	type: "force"
	parts: Particle[]
}
