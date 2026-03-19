import type { FieldsAST } from "@metafor/ast"
import type { SRC, Mass } from "@metafor/dsl"

import { BaseParticle } from "./part.ts"

export class Wimp extends BaseParticle {
  src: string
  fields?: FieldsAST
  mass: Mass | undefined

  constructor(src: SRC) {
    super()
    this.src = src
  }
}
