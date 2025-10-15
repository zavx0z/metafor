import type { Schema, Values } from "@zavx0z/context"
import { Electromagnetic } from "./electromagnetic"
import { Week } from "./week"

export abstract class Strong extends Week {
  // ------------------------------ процесс ----------------------------------------

  /** индикатор выполнения процесса */
  #process = false

  get process() {
    return this.#process
  }

  protected override setProcess(process: boolean) {
    if (Electromagnetic.isLocked && this.wired) return
    if (this.#process === process) return
    this.#process = process
    if (!process) this.transition()
  }

  // ------------------------------ контекст ----------------------------------------

  /** обновление контекста */
  update(context: Partial<Values<Schema>>): Partial<Values<Schema>> {
    if (Electromagnetic.isLocked && this.wired) return {}
    const updated = this.ctx.update(context)
    if (Object.keys(updated).length > 0) {
      this.sendMessage(this.msgUpdateContext(updated))
    }
    return updated
  }

  // ------------------------------ состояние ----------------------------------------

  protected stateListeners = new Set<(state: string) => void>()

  protected setState(state: string) {
    if (Electromagnetic.isLocked && this.wired) return
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
