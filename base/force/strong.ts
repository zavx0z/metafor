import type { Schema, Values } from "@zavx0z/context"
import { Electromagnetic } from "./electromagnetic"
import { Week } from "./week"

export abstract class Strong extends Week {
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

  /** обновление контекста */
  update(context: Partial<Values<Schema>>): Partial<Values<Schema>> {
    if (Electromagnetic.isLocked && this.wired) return {}
    const updated = this.ctx.update(context)
    if (Object.keys(updated).length > 0) {
      this.sendMessage(this.msgUpdateContext(updated))
    }
    return updated
  }
}
