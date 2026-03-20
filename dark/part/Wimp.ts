import type { NodeMeta, SRC, Mass } from "@metafor/dsl"
import type { WimpFields, WimpInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Wimp extends BaseParticle {
  src: string
  fields?: WimpFields
  mass: Mass | NodeMeta["mass"] | undefined

  constructor(src: SRC)
  constructor(init: WimpInit)
  constructor(src: SRC | WimpInit) {
    const init = typeof src === "string" ? { src } : src
    super(init)
    this.src = init.src
    this.fields = init.fields
    this.mass = init.mass
  }
}
