import type { Mass, NodeMeta } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"
import type { WimpInit, WimpValues } from "@dark/types/strong"
import { BaseParticle } from "./part.ts"

export class Wimp extends BaseParticle {
  src: string
  name: MetaAST["name"] | undefined
  fields: MetaAST["fields"] | undefined
  superposition: MetaAST["superposition"] | undefined
  processes: MetaAST["processes"] | undefined
  reactions: MetaAST["reactions"] | undefined
  bulk: MetaAST["bulk"] | undefined
  values?: WimpValues
  mass: Mass | NodeMeta["mass"] | undefined

  constructor(init: WimpInit) {
    super(init)
    this.src = init.src
    this.name = init.name
    this.fields = init.fields
    this.superposition = init.superposition
    this.processes = init.processes
    this.reactions = init.reactions
    this.bulk = init.bulk
    if (init.values !== undefined) this.values = init.values
    this.mass = init.mass
  }
}
