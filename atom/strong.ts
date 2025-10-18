import { Week } from "./week"
import type { Core } from "./gravity"
import type { Meta, Superposition } from "../meta/metafor"
import type { Processes } from "./src/processes"
import type { Reactions } from "./src/reactions"
import type { Context } from "@zavx0z/context"
import { contextFromSchema } from "@zavx0z/context"
import { processesFromSchema } from "./src/processes"
import { reactionsFromSchema } from "./src/reactions"
import { Field, type Hidden, type Values } from "./field"
import { Atom } from "./atom"

export abstract class Strong extends Week {
  constructor(
    public override id: string,
    public override meta: string,
    public desc: string | undefined,
    hidden: Context<Values>,
    protected override state: { current: string; states: Superposition },
    protected override processes: Processes,
    protected override reactions: Reactions,
    core?: Core
  ) {
    super(hidden, id, meta, core)
    this.evaluate = this.evaluate.bind(this)
    this.destroy = this.destroy.bind(this)
    this.connect()
    this.decoheredCollapse()
  }

  public override destroy(recursive = true) {
    this.stateObservers.clear()
    super.destroy(recursive)
  }

  // ------------------------------ состояние ----------------------------------------

  private stateObservers = new Set<(state: string) => void>()

  /** Устанавливает состояние
   * Даже если состояние не изменилось, отправляет сообщение о переходе (само-переходы) */
  protected setState(state: string) {
    this.state.current = state
    if (this.stateObservers.size > 0) for (const observer of this.stateObservers) observer(state)
  }

  public onCollapsed(observer: (state: string) => void): () => void {
    this.stateObservers.add(observer)
    return () => this.unsubscribeState(observer)
  }

  private unsubscribeState(observer: (state: string) => void) {
    this.stateObservers.delete(observer)
  }

  // ------------------------------ состояние ----------------------------------------

  /** Создаёт атома */
  static fromSchema<M extends Meta>(config: {
    meta: M
    id?: string
    core?: Core
    context?: Partial<Hidden<Values>>
    path?: string
  }): Atom {
    const { meta, id = crypto.randomUUID(), core, context = {}, path } = config
    // если указан индекс-путь — заранее резервируем слот под id
    if (typeof path === "string" && path.length > 0) {
      Field.fields.reserveByIndexPath(id, path)
    }

    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    return new Atom(
      id,
      meta.name,
      meta.desc,
      ctx,
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      core
    )
  }

  static createSibling<M extends Meta>(
    targetId: string,
    meta: M,
    cfg: { id?: string; at?: "before" | "after"; core?: Core; context?: Partial<Hidden<Values>> } = {}
  ): string {
    const { id = crypto.randomUUID(), core, context = {}, at = "after" } = cfg
    if (!Field.getAtom(targetId)) throw new Error(`атом-ориентир "${targetId}" не найден`)

    // 1) Резервируем слот под будущий атом
    Field.fields.reserveSibling(id, targetId, at)
    // 2) Создаём атома в следующей макротаске — родитель «не ждёт»
    setTimeout(() => {
      try {
        const ctx = contextFromSchema(meta.context)
        ctx.update(context)

        // Конструктор сам прикрепит по резервации и разошлёт init
        // ВАЖНО: path в processes self можно оставить пустым — он читается геттером
        // после прикрепления.
        // eslint-disable-next-line no-new
        new Atom(
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
          Field.fields.cancelReservation(id)
        } catch {}
        console.error("createSibling async init failed:", e)
      }
    }, 0)

    // 3) Сразу отдаём id
    return id
  }

  static append<M extends Meta>(
    parentId: string | null,
    meta: M,
    cfg: { id?: string; core?: Core; context?: Partial<Hidden<Values>> } = {}
  ): string {
    const { id = crypto.randomUUID(), core, context = {} } = cfg

    // валидация родителя (кроме корня)
    if (parentId !== null && !Field.getAtom(parentId)) {
      throw new Error(`Родитель "${parentId}" не найден`)
    }
    // строим индекс-путь в конец детей родителя
    const kids = Field.getChildren(parentId)
    const index = kids.length
    const parentPath = parentId === null ? null : Field.getPath(parentId)
    const path = parentPath ? `${parentPath}/${index}` : String(index)

    // резервируем позицию ПО ИНДЕКС-ПУТИ (конвертируется в orderKey и фиксирует parentId)
    Field.fields.reserveByIndexPath(id, path)

    // готовим контекст
    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    // создаём атома на следующем тике:
    setTimeout(() => {
      // базовый конструктор прикрепит к зарезервированному слоту и отправит init
      new Atom(
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
