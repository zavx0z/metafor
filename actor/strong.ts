import { Week } from "./week"
import { Source } from "./electromagnetic.t"
import type { Core } from "./gravity"
import type { StatesConfig } from "../meta/metafor"
import type { Processes } from "./src/processes"
import type { Reactions } from "./src/reactions"
import type { Node as ParseNode } from "@zavx0z/template"
import type { Context } from "@zavx0z/context"
import type { Values } from "./field.t"

export abstract class Strong extends Week {
  // -------------------------- Жизненный цикл -----------------------------------------
  constructor(
    public override id: string,
    public override meta: string,
    public desc: string | undefined,
    public override ctx: Context<Values>,
    public override state: { current: string; states: StatesConfig },
    public override processes: Processes,
    public override reactions: Reactions,
    public render: ParseNode[],
    core?: Core
  ) {
    super(ctx, id, meta, core)
    this.update = this.update.bind(this)
    this.destroy = this.destroy.bind(this)
    this.connect()
    this.transit()
  }

  public override destroy(recursive = true, src = Source.Nothing) {
    this.stateListeners.clear()
    this.ctx.clearSubscribers()
    super.destroy(recursive, src)
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
