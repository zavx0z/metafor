import type { Boson, JsonPatch, Photon } from "@metafor/atom"
export type { Photon }

export interface Impulse extends Boson {
  patch: JsonPatch
}
