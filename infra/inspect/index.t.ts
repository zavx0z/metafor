import type { Boson, JsonPatch, Photon } from "../../atom/em.t"
export type { Photon }

export interface BosonLogger extends Boson {
  impulse: JsonPatch
}
