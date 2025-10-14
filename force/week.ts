import { Electromagnetic } from "./electromagnetic"
import { type Process, type Processes } from "../core/processes"
import { checkTransition } from "../core/states"
import type { Conditions, Transitions } from "../core/states.t"
import type { Core } from "./gravity.t"

export abstract class Week extends Electromagnetic {
  public abstract processes: Processes
  protected abstract executeAction(process: Process<any, any>): void
  protected abstract setState(state: string): void
  protected abstract setProcess(process: boolean): void
  protected abstract process: boolean

  constructor(id: string, meta: string, core?: Core) {
    super(id, meta, core)
  }

  transit() {
    const transition = this.state.states[this.state.current]
    if (transition) {
      const process = this.processes.getProcess(this.state.current)
      if (process) {
        this.setProcess(true)
        this.executeAction(process)
        this.transition()
      } else {
        this.transition()
      }
    }
  }

  transition() {
    const transition: Transitions | undefined = this.state.states[this.state.current]
    if (!transition) return
    for (const [state, conditions] of Object.entries(transition)) {
      if (checkTransition(conditions as Conditions, this.ctx.context)) {
        const process = this.processes.getProcess(state)
        if (this.process) return
        if (process) {
          this.setProcess(true)
          this.setState(state)
          this.executeAction(process)
        } else {
          this.setState(state)
          this.sendMessage(this.msgStateAfterAction)
          if (!this.process) this.transition()
        }
        break
      }
    }
  }
}
