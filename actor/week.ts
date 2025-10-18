import { Electromagnetic, MsgSrc } from "./electromagnetic"
import type { Process, Processes } from "./src/processes"
import { checkTransition as decoherence } from "./src/states"
import type { Wave } from "./src/states.t"
import type { Core } from "./gravity.t"
import type { Reactions } from "./src/reactions"
import type { Message } from "./electromagnetic"
import type { Context, Schema, Values } from "@zavx0z/context"

export abstract class Week extends Electromagnetic {
  protected abstract processes: Processes
  protected abstract reactions: Reactions

  protected abstract setState(state: string): void
  protected abstract action(): Promise<any>

  constructor(ctx: Context<Schema>, id: string, meta: string, core?: Core) {
    super(ctx, id, meta, core)
    this.resolve = this.resolve.bind(this)
    this.reject = this.reject.bind(this)
  }
  override destroy(recursive = true, src = MsgSrc.Nothing) {
    Week.results.delete(this)
    super.destroy(recursive, src)
  }
  // ------------------------------ процесс ----------------------------------------
  protected static results = new WeakMap<Week, any>()
  #process: Process | null = null
  public error: Error | null = null

  get result() {
    return Week.results.get(this)
  }

  protected set result(result: any) {
    Week.results.set(this, result)
  }

  protected set process(process: Process | null) {
    this.#process = process
  }

  get process() {
    return this.#process
  }

  protected resolve() {
    if (this.result && this.process?.success) {
      this.process.success({ update: this.update, data: this.result })
    }
    if (!this.requestStateSuccess()) return
    this.process = null
    this.measurement()
  }

  protected reject() {
    if (this.error && this.process?.error) this.process.error({ update: this.update, error: this.error })
    if (!this.requestStateError()) return
    this.error = null
    this.process = null
    this.measurement()
  }

  // ---------------------------- переходы ------------------------------------

  /** Выполняет процесс первичного состояния */
  transit() {
    if (!this.requestInit()) return
    const transitions = this.state.states[this.state.current]
    if (!transitions) return
    this.collapse(this.processes.getProcess(this.state.current))
  }

  measurement() {
    if (this.process) return // уже запущен процесс во время реакции
    const eigenstates = this.state.states[this.state.current]
    if (!eigenstates) return

    for (const [eigenstate, Ψ] of Object.entries(eigenstates)) {
      if (decoherence(Ψ as Wave, this.λ)) {
        this.collapse(this.processes.getProcess(eigenstate), eigenstate)
        break
      }
    }
  }

  private collapse(process: Process | undefined, newState: string | undefined = undefined) {
    newState && this.setState(newState)
    if (process) {
      this.process = process
      if (!this.requestStartProcess()) return
      this.action().then(this.resolve).catch(this.reject)
    } else {
      if (!this.requestMeasure()) return
      this.measurement()
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
        context: this.λ,
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
    this.measurement()
  }
}
