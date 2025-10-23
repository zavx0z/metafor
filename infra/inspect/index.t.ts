import type { Boson, JsonPatch, Photon } from "@metafor/atom"
export type { Photon }

export interface BosonLogger extends Boson {
  impulse: JsonPatch
}
