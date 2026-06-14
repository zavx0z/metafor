import type { Particle } from "boundary"

export type { Particle }

export type ClientForceBridgePayload = {
	type: "force"
	parts: Particle[]
}
