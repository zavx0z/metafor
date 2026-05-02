import type { Superposition } from "./superposition.ts"
import { Transitions } from "./transition.ts"

export class State {
  readonly transitions: Transitions

  constructor(
    readonly superposition: Superposition,
    readonly name: string,
  ) {
    this.transitions = new Transitions(this)
  }

  async uuid(): Promise<string> {
    const row = (
      await this.superposition.wimp.sql<Array<{ uuid: string }>>`
        SELECT uuid FROM superposition
        WHERE wimp = ${this.superposition.wimp.src} AND name = ${this.name}
        LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`state ${this.name} not found in wimp ${this.superposition.wimp.src}`)
    return row.uuid
  }

  async position(): Promise<number> {
    const row = (
      await this.superposition.wimp.sql<Array<{ position: number }>>`
        SELECT position FROM superposition
        WHERE wimp = ${this.superposition.wimp.src} AND name = ${this.name}
        LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`state ${this.name} not found in wimp ${this.superposition.wimp.src}`)
    return row.position
  }
}
