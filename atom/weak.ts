import { EM } from "./em"
import type { Process, Processes } from "./src/processes"

export abstract class Weak extends EM {
  protected abstract processes: Processes
  protected abstract action(state: string): Promise<any>

  @EM.it
  override destroy() {
    Weak.results.delete(this)
    super.destroy()
  }

  // ------------------------------ процесс ----------------------------------------
  protected static results = new WeakMap<Weak, any>()
  #process: Process | undefined = undefined
  public error: Error | null = null

  get result() {
    return Weak.results.get(this)
  }

  protected set result(result: any) {
    Weak.results.set(this, result)
  }

  set process(process: Process | undefined) {
    this.#process = process
  }

  get process(): Process | undefined {
    return this.#process
  }
}
