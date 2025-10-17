import type { Context, Schema, Values } from "@zavx0z/context"
import { Week } from "./week"
import { MsgSrc } from "./electromagnetic.t"
import type { Core } from "./gravity"
import type { StatesConfig } from "../meta/metafor"
import type { Processes } from "./src/processes"
import type { Reactions } from "./src/reactions"
import type { Node as ParseNode } from "@zavx0z/template"
import { Electromagnetic } from "./electromagnetic"

export abstract class Strong extends Week {
  // -------------------------- Жизненный цикл -----------------------------------------
  constructor(
    public override id: string,
    public override meta: string,
    public desc: string | undefined,
    public override ctx: Context<Schema>,
    public override state: { current: string; states: StatesConfig },
    public override processes: Processes,
    public override reactions: Reactions,
    public render: ParseNode[],
    core?: Core
  ) {
    super(id, meta, core)
    this.update = this.update.bind(this)
    this.destroy = this.destroy.bind(this)
    this.connect()
    this.transit()
  }

  public override destroy(recursive = true, src = MsgSrc.Nothing) {
    this.stateListeners.clear()
    this.ctx.clearSubscribers()
    super.destroy(recursive, src)
  }

  // ------------------------------ контекст ----------------------------------------

  /** обновление контекста */
  update(context: Partial<Values<Schema>>, src: MsgSrc): Partial<Values<Schema>> {
    const prevContext = Electromagnetic.lock ? { ...this.ctx.context } : {}

    const updated = this.ctx.update(context)
    if (Object.keys(updated).length > 0) {
      if (!this.requestUpdateContext(updated, src)) {
        this.ctx.update(prevContext)
        return {}
      }
    }
    return updated
  }

  // ------------------------------ состояние ----------------------------------------

  private stateListeners = new Set<(state: string) => void>()

  /** Устанавливает состояние
   *
   * Даже если состояние не изменилось, отправляет сообщение о переходе (само-переходы)
   */
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
