import { EM, Source, type Photon } from "./em"
import type { Process, Processes } from "./src/processes"
import { decoherence, type Wave } from "./src/states"
import type { Reactions } from "./src/reactions"
import type { Core } from "./gravity"

export abstract class Week extends EM {
  protected abstract processes: Processes
  protected abstract reactions: Reactions

  protected abstract setState(state: string): void
  protected abstract action(): Promise<any>

  constructor(_: unknown, id: string, meta: string, core?: Core) {
    super(_, id, meta, core)
    this.resolve = this.resolve.bind(this)
    this.reject = this.reject.bind(this)
  }
  override destroy(recursive = true, src = Source.Nothing) {
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
      this.process.success({ update: this.evaluate, data: this.result })
    }
    if (!this.requestStateSuccess()) return
    this.process = null
    this.measurement()
  }

  protected reject() {
    if (this.error && this.process?.error) this.process.error({ update: this.evaluate, error: this.error })
    if (!this.requestStateError()) return
    this.error = null
    this.process = null
    this.measurement()
  }

  // ---------------------------- переходы ------------------------------------

  /** Выполняет процесс стартового состояния */
  decoheredCollapse() {
    if (!this.requestInit()) return
    const eigenstates = this.state.states[this.state.current]
    if (!eigenstates) return
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

  protected handleReaction(ev: MessageEvent) {
    const { data } = ev as MessageEvent<Photon>
    if (!this.hasReactions()) return
    if (data.atom === this.id) return

    for (const patch of data.patches) {
      this.reactions.run({
        context: this.λ,
        core: this.core,
        meta: data.meta,
        atom: data.atom,
        timestamp: data.timestamp,
        patch,
        state: this.state.current,
        update: this.evaluate,
        destroy: this.destroy,
        self: this.self,
      })
    }
    this.measurement()
  }
}
