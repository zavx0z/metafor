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
}
