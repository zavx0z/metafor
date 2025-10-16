import { Electromagnetic, MsgSrc } from "./electromagnetic"
import type { Action, Process, Processes } from "../processes"
import { checkTransition } from "../states"
import type { Conditions, Transitions } from "../states.t"
import type { Core } from "./gravity.t"
import type { Reactions } from "../reactions"
import type { Message } from "./electromagnetic"
import type { Schema, Values } from "@zavx0z/context"

export abstract class Week extends Electromagnetic {
  protected abstract processes: Processes
  protected abstract reactions: Reactions

  protected abstract update(context: Partial<Values<Schema>>, src: string): Partial<Values<Schema>>
  protected abstract setState(state: string): void
  protected abstract action(): Promise<any>

  constructor(id: string, meta: string, core?: Core) {
    super(id, meta, core)
  }
  override destroy(recursive = true, src = MsgSrc.Nothing) {
    Week.results.delete(this)
    super.destroy(recursive, src)
  }
  // ------------------------------ процесс ----------------------------------------
  protected static results = new WeakMap<Week, any>()
  protected process: Process | null = null
  public error: Error | null = null

  protected setProcess(process: Process | null) {
    const current = this.process
    if (current === process) return
    if (process && !current) this.process = process
    else if (!process && current) {
      Week.results.delete(this)
      this.error = null
      this.process = null
      this.transition()
    }
  }
  protected get result() {
    return Week.results.get(this)
  }
  protected set result(result: any) {
    Week.results.set(this, result)
  }
  // ---------------------------- переходы ------------------------------------

  /** Выполняет инициализирующие переходы */
  transit() {
    if (!this.requestInit()) return
    const transitions = this.state.states[this.state.current]
    if (!transitions) return

    const process = this.processes.getProcess(this.state.current)
    if (process) {
      if (!this.requestStartProcess()) return
      this.setProcess(process)
      this.action()
        .then((result) => {
          this.result = result
          this.process?.success?.({ update: this.update, data: result })
          this.sendMessage(this.msgStateSuccess())
        })
        .catch((error) => {
          this.error = error
          this.process?.error?.({ update: this.update, error })
          this.sendMessage(this.msgStateError())
        })
        .finally(() => {
          this.setProcess(null)
          this.transition()
        })
    } else {
      this.sendMessage(this.msgTransition())
      this.transition()
    }
  }

  protected resolve(): Promise<any> {
    return Promise.resolve()
  }

  protected reject(): Promise<any> {
    return Promise.reject()
  }

  /** Выполняет переход */
  transition() {
    const transitions: Transitions | undefined = this.state.states[this.state.current]
    if (!transitions) return
    for (const [state, transition] of Object.entries(transitions)) {
      if (checkTransition(transition as Conditions, this.ctx.context)) {
        if (this.process) return
        const process = this.processes.getProcess(state)
        if (process) {
          if (!this.requestStartProcess()) return
          this.setProcess(process)
          this.setState(state)

          this.action()
            .then((result) => {
              this.result = result
              this.process?.success?.({ update: this.update, data: result })
              this.sendMessage(this.msgStateSuccess())
            })
            .catch((error) => {
              this.error = error
              this.process?.error?.({ update: this.update, error })
              this.sendMessage(this.msgStateError())
            })
            .finally(() => {
              this.setProcess(null)
              this.transition()
            })
        } else {
          this.setState(state)
          this.sendMessage(this.msgTransition())
          this.transition()
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
