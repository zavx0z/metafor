import type { Particle } from "@metafor/boundary"

export type { Particle }

export type ClientForceBridgePayload = {
	type: "force"
	parts: Particle[]
}
