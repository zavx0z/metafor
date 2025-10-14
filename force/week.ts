import { Electromagnetic } from "./electromagnetic"
import { type Process, type Processes } from "../core/processes"
import { checkTransition } from "../core/states"
import type { Conditions, Transitions } from "../core/states.t"
import type { Core } from "./gravity.t"
import { type Reactions } from "../core/reactions"
import type { Message } from "../actor.t"
import type { Schema, Values } from "@zavx0z/context"

export abstract class Week extends Electromagnetic {
  public abstract processes: Processes
  protected abstract executeAction(process: Process<any, any>): void
  protected abstract setState(state: string): void
  protected abstract setProcess(process: boolean): void
  protected abstract process: boolean
  protected abstract reactions: Reactions
  protected abstract update(context: Partial<Values<Schema>>): Partial<Values<Schema>>

  constructor(id: string, meta: string, core?: Core) {
    super(id, meta, core)
  }

  // ---------------------------- переходы ------------------------------------

  /** Выполняет инициализирующие переходы */
  transit() {
    const transition = this.state.states[this.state.current]
    if (transition) {
      const process = this.processes.getProcess(this.state.current)
      if (process) {
        this.setProcess(true)
        this.executeAction(process)
        this.transition()
      } else {
        this.transition()
      }
    }
  }

  /** Выполняет переход */
  transition() {
    const transition: Transitions | undefined = this.state.states[this.state.current]
    if (!transition) return
    for (const [state, conditions] of Object.entries(transition)) {
      if (checkTransition(conditions as Conditions, this.ctx.context)) {
        const process = this.processes.getProcess(state)
        if (this.process) return
        if (process) {
          this.setProcess(true)
          this.setState(state)
          this.executeAction(process)
        } else {
          this.setState(state)
          this.sendMessage(this.msgStateAfterAction)
          if (!this.process) this.transition()
        }
        break
      }
    }
  }

  // ---------------------------- реакции ------------------------------------

  protected hasReactions(): boolean {
    return this.reactions?.hasReactions() ?? false
  }

  protected handleReactionMessage(ev: MessageEvent) {
    const { data } = ev as MessageEvent<Message>
    if (!this.reactions?.hasReactions()) return
    if (data.actor === this.id) return

    for (const patch of data.patches) {
      this.reactions.run({
        context: this.ctx.context,
        core: this.core,
        meta: data.meta,
        actor: data.actor,
        timestamp: data.timestamp,
        patch,
        state: this.state.current,
        update: this.update,
        self: { meta: this.meta, actor: this.id, path: this.path, destroy: this.destroy },
      })
    }
    this.transition()
  }
}
