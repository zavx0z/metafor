import type { Mass, NodeMeta } from "@metafor/dsl"
import type { WimpInit, WimpValues } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

export class Wimp extends BaseParticle {
  src: string
  values?: WimpValues
  mass: Mass | NodeMeta["mass"] | undefined

  constructor(init: WimpInit) {
    super(init)
    this.src = init.src
    if (init.values !== undefined) this.values = init.values
    this.mass = init.mass
  }
}
