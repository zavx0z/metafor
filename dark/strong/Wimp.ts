import type { Mass, NodeMeta, SRC } from "@metafor/dsl"
import type { WimpInit, WimpValues } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

export class Wimp extends BaseParticle {
  src: string
  values?: WimpValues
  mass: Mass | NodeMeta["mass"] | undefined

  constructor(src: SRC)
  constructor(init: WimpInit)
  constructor(src: SRC | WimpInit) {
    const init = typeof src === "string" ? { src } : src
    super(init)
    this.src = init.src
    if (init.values !== undefined) this.values = init.values
    this.mass = init.mass
  }
}
