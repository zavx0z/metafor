import type {States} from "./index.ts"
import {Transitions} from "./transition.ts"

export class State {
  readonly transitions: Transitions

  constructor(
    readonly states: States,
    readonly name: string,
  ) {
    this.transitions = new Transitions(this)
  }

  async uuid(): Promise<string> {
    const row = (
      await this.states.wimp.sql<Array<{ uuid: string }>>`
          SELECT uuid
          FROM superposition
          WHERE wimp = ${this.states.wimp.src}
            AND name = ${this.name}
          LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`state ${this.name} not found in wimp ${this.states.wimp.src}`)
    return row.uuid
  }

  async position(): Promise<number> {
    const row = (
      await this.states.wimp.sql<Array<{ position: number }>>`
          SELECT position
          FROM superposition
          WHERE wimp = ${this.states.wimp.src}
            AND name = ${this.name}
          LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`state ${this.name} not found in wimp ${this.states.wimp.src}`)
    return row.position
  }
}
