import type { Schema, Values } from "@zavx0z/context"
import { Week } from "./week"
import { MsgSrc } from "./electromagnetic.t"

export abstract class Strong extends Week {
  // -------------------------- Жизненный цикл -----------------------------------------

  public override destroy(recursive = true, src = MsgSrc.Nothing) {
    this.stateListeners.clear()
    super.destroy(recursive, src)
  }

  // ------------------------------ процесс ----------------------------------------

  /** индикатор выполнения процесса */
  #process = false

  get process() {
    return this.#process
  }

  protected override setProcess(process: boolean) {
    if (this.#process === process) return
    this.#process = process
    if (!process) this.transition()
  }

  // ------------------------------ контекст ----------------------------------------

  /** обновление контекста */
  update(context: Partial<Values<Schema>>, src: MsgSrc): Partial<Values<Schema>> {
    const updated = this.ctx.update(context)
    if (Object.keys(updated).length > 0) {
      this.sendMessage(this.msgUpdateContext(updated, src))
    }
    return updated
  }

  // ------------------------------ состояние ----------------------------------------

  private stateListeners = new Set<(state: string) => void>()

  protected setState(state: string) {
    this.state.current = state
    if (this.stateListeners.size > 0) {
      for (const listener of this.stateListeners) listener(state)
    }
  }

  public onStateChange(listener: (state: string) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.unsubscribeState(listener)
  }

  private unsubscribeState(listener: (state: string) => void) {
    this.stateListeners.delete(listener)
  }
}
