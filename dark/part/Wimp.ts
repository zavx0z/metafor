import type { FieldsAST } from "@metafor/ast"
import type { Mass } from "@metafor/dsl/types/metafor"
import type { WimpInit } from "@dark/types/part"

import { BaseParticle } from "./part.ts"

export class Wimp extends BaseParticle {
  src: string
  fields?: FieldsAST
  mass: Mass | undefined

  constructor({ id, children = [], src, fields, mass }: WimpInit) {
    super({ id, children })
    this.src = src
    if (fields !== undefined) {
      this.fields = fields
    }
    if (mass !== undefined) {
      this.mass = mass
    }
  }
}

export type { FieldID, WimpID } from "@dark/types"
