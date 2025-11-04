import { EM, Initiator } from "./em"
import type { Process, Processes } from "./src/processes"

export abstract class Week extends EM {
  protected abstract processes: Processes
  protected abstract action(): Promise<any>

  @EM.it
  override destroy(initiator = Initiator.Nothing) {
    Week.results.delete(this)
    super.destroy(initiator)
  }

  // ------------------------------ процесс ----------------------------------------
  protected static results = new WeakMap<Week, any>()
  #process: Process | undefined = undefined
  public error: Error | null = null

  get result() {
    return Week.results.get(this)
  }

  protected set result(result: any) {
    Week.results.set(this, result)
  }

  set process(process: Process | undefined) {
    this.#process = process
  }

  get process(): Process | undefined {
    return this.#process
  }
}
