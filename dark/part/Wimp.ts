import type { Binding } from "@dark/types"
import type { Mass } from "@metafor/dsl/types/metafor"

import { AbstractParticle, type AbstractParticleInit, type ParticleID } from "./Abstract.ts"

export type WimpID = ParticleID
export type WimpInit = AbstractParticleInit & {
  src: string
  fields?: Binding<Record<string, unknown>>
  mass?: Mass
}

export class Wimp extends AbstractParticle {
  readonly kind = "wimp" as const

  src: string

  fields: Binding<Record<string, unknown>> | undefined

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

  override toJSON(): {
    id: WimpID
    kind: "wimp"
    children: string[]
    src: string
    fields?: Binding<Record<string, unknown>>
    mass?: Mass
  } {
    const base = super.toJSON()

    return {
      id: base.id,
      kind: "wimp",
      children: base.children,
      src: this.src,
      ...(this.fields !== undefined ? { fields: this.fields } : {}),
      ...(this.mass !== undefined ? { mass: this.mass } : {}),
    }
  }
}
