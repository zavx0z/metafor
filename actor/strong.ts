import { Week } from "./week"
import type { Core } from "./gravity"
import type { StatesConfig } from "../meta/metafor"
import type { Processes } from "./src/processes"
import type { Reactions } from "./src/reactions"
import type { Context } from "@zavx0z/context"
import { contextFromSchema } from "@zavx0z/context"
import { processesFromSchema } from "./src/processes"
import { reactionsFromSchema } from "./src/reactions"
import type { Hidden, Values } from "./field"
import type { Meta } from "../meta/metafor"
import { Fields } from "./src/fields"
import { Actor } from "./actor"

export abstract class Strong extends Week {
  constructor(
    public override id: string,
    public override meta: string,
    public desc: string | undefined,
    hidden: Context<Values>,
    protected override state: { current: string; states: StatesConfig },
    protected override processes: Processes,
    protected override reactions: Reactions,
    core?: Core
  ) {
    super(hidden, id, meta, core)
    this.update = this.update.bind(this)
    this.destroy = this.destroy.bind(this)
    this.connect()
    this.transit()
  }

  public override destroy(recursive = true) {
    this.stateListeners.clear()
    super.destroy(recursive)
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

  // ------------------------------ состояние ----------------------------------------

  /** Создаёт актора */
  static fromSchema<M extends Meta>(config: {
    meta: M
    id?: string
    core?: Core
    context?: Partial<Hidden<Values>>
    path?: string
  }): Actor {
    const { meta, id = crypto.randomUUID(), core, context = {}, path } = config
    const fields = Fields.get()

    // если указан индекс-путь — заранее резервируем слот под id
    if (typeof path === "string" && path.length > 0) {
      fields.reserveByIndexPath(id, path)
    }

    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    const actor = new Actor(
      id,
      meta.name,
      meta.desc,
      ctx,
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      core
    )
    return actor
  }

  static createSibling<M extends Meta>(
    targetId: string,
    meta: M,
    cfg: { id?: string; at?: "before" | "after"; core?: Core; context?: Partial<Hidden<Values>> } = {}
  ): string {
    const { id = crypto.randomUUID(), core, context = {}, at = "after" } = cfg
    const fields = Fields.get()
    if (!fields.getActor(targetId)) throw new Error(`Актор-ориентир "${targetId}" не найден`)

    // 1) Резервируем слот под будущий актор
    fields.reserveSibling(id, targetId, at)

    // 2) Создаём актора в следующей макротаске — родитель «не ждёт»
    setTimeout(() => {
      try {
        const ctx = contextFromSchema(meta.context)
        ctx.update(context)

        // Конструктор сам прикрепит по резервации и разошлёт init
        // (как у тебя уже реализовано в базовом классе/Actor)
        // ВАЖНО: path в processes self можно оставить пустым — он читается геттером
        // после прикрепления.
        // eslint-disable-next-line no-new
        new Actor(
          id,
          meta.name,
          meta.desc,
          ctx,
          { current: Object.keys(meta.states)[0] as string, states: meta.states },
          processesFromSchema(meta.processes ?? {}),
          reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
          core
        )
      } catch (e) {
        // Если что-то пойдёт не так — снимаем резервацию, чтобы не залипало
        try {
          Fields.get().cancelReservation(id)
        } catch {}
        console.error("createSibling async init failed:", e)
      }
    }, 0)

    // 3) Сразу отдаём id
    return id
  }

  static appendChild<M extends Meta>(
    parentId: string | null,
    meta: M,
    cfg: { id?: string; core?: Core; context?: Partial<Hidden<Values>> } = {}
  ): string {
    const { id = crypto.randomUUID(), core, context = {} } = cfg
    const fields = Fields.get()

    // валидация родителя (кроме корня)
    if (parentId !== null && !fields.getActor(parentId)) {
      throw new Error(`Родитель "${parentId}" не найден`)
    }

    // строим индекс-путь в конец детей родителя
    const kids = fields.getChildren(parentId)
    const index = kids.length
    const parentPath = parentId === null ? null : fields.getPath(parentId)
    const path = parentPath ? `${parentPath}/${index}` : String(index)

    // резервируем позицию ПО ИНДЕКС-ПУТИ (конвертируется в orderKey и фиксирует parentId)
    fields.reserveByIndexPath(id, path)

    // готовим контекст
    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    // создаём актора на следующем тике:
    setTimeout(() => {
      // базовый конструктор прикрепит к зарезервированному слоту и отправит init
      new Actor(
        id,
        meta.name,
        meta.desc,
        ctx,
        { current: Object.keys(meta.states)[0] as string, states: meta.states },
        processesFromSchema(meta.processes ?? {}),
        reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
        core
      )
    }, 0)

    return id
  }
}
