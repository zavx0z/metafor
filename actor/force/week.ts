import { Electromagnetic, MsgSrc } from "./electromagnetic"
import type { Process, Processes } from "../processes"
import { checkTransition } from "../states"
import type { Conditions } from "../states.t"
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
    this.resolve = this.resolve.bind(this)
    this.reject = this.reject.bind(this)
  }
  override destroy(recursive = true, src = MsgSrc.Nothing) {
    Week.results.delete(this)
    super.destroy(recursive, src)
  }
  // ------------------------------ процесс ----------------------------------------
  protected static results = new WeakMap<Week, any>()
  protected process: Process | null = null
  public error: Error | null = null

  protected get result() {
    return Week.results.get(this)
  }

  protected set result(result: any) {
    Week.results.set(this, result)
  }

  protected resolve() {
    if (this.result && this.process?.success) this.process.success({ update: this.update, data: this.result })
    this.sendMessage(this.msgStateSuccess())
    this.process = null
    this.transition()
  }

  protected reject() {
    if (this.error && this.process?.error) this.process.error({ update: this.update, error: this.error })
    this.sendMessage(this.msgStateError())
    this.error = null
    this.process = null
    this.transition()
  }

  // ---------------------------- переходы ------------------------------------

  /** Выполняет процесс первичного состояния */
  transit() {
    if (!this.requestInit()) return
    const transitions = this.state.states[this.state.current]
    if (!transitions) return
    this.recursive(this.processes.getProcess(this.state.current))
  }

  /** Выполняет переход */
  transition() {
    if (this.process) return // уже запущен процесс во время реакции
    const transitions = this.state.states[this.state.current]
    if (!transitions) return

    for (const [state, transition] of Object.entries(transitions)) {
      if (checkTransition(transition as Conditions, this.ctx.context)) {
        this.recursive(this.processes.getProcess(state), state)
        break
      }
    }
  }

  private recursive(process: Process | undefined, newState: string | undefined = undefined) {
    newState && this.setState(newState)
    if (process) {
      this.process = process
      if (!this.requestStartProcess()) return
      this.action().then(this.resolve).catch(this.reject)
    } else {
      this.sendMessage(this.msgTransition())
      this.transition()
    }
  }

  // ---------------------------- реакции ------------------------------------

  protected hasReactions(): boolean {
    return this.reactions?.hasReactions() ?? false
  }

  protected handleReactionMessage(ev: MessageEvent) {
    const { data } = ev as MessageEvent<Message>
    if (!this.hasReactions()) return
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
