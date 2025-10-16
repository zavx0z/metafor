import { contextFromSchema, type Context, type Schema, type Values } from "@zavx0z/context"
import { processesFromSchema, type Process, type Processes } from "./processes"
import { reactionsFromSchema, type Reactions } from "./reactions"
export { Fields } from "./fields"
import type { Node as ParseNode } from "@zavx0z/template"
import type { Snapshot } from "./actor.t"
import { MsgSrc, type Message } from "./force/electromagnetic.t"
import type { Core } from "./force/gravity.t"
export type { Message }
import type { StatesConfig } from "../meta/states"
import type { Meta } from "../meta/metafor"
import { Fields } from "./fields"
import { Strong } from "./force/strong"

/**
 * Actor — основной класс актора MetaFor.
 *
 * Жизненный цикл:
 * - (внешний код) резервирует позицию под id в Fields (reserve*),
 * - (ctor) мы присваиваем поля (`reactions`, `processes`, …),
 * - вызываем `attachAndAnnounceCreate()` из базы: вклейка в дерево + init-сообщение,
 * - запускаем стартовые переходы/процессы,
 * - при destroy: `super.destroy()` (remove + выключение транспорта) → локальная очистка → удаление из Fields.
 */
export class Actor extends Strong {
  // -------------------------- Жизненный цикл -----------------------------------------
  constructor(
    public override id: string,
    public override meta: string,
    public desc: string | undefined,
    public ctx: Context<Schema>,
    public state: { current: string; states: StatesConfig },
    public processes: Processes,
    public reactions: Reactions,
    public render: ParseNode[],
    core?: Core
  ) {
    super(id, meta, core)

    this.update = this.update.bind(this)
    this.destroy = this.destroy.bind(this)

    this.connected()
  }

  protected override connected(): void {
    this.connect()
    this.transit()
  }

  public override destroy(recursive = true, src = MsgSrc.Nothing) {
    this.ctx.clearSubscribers()
    super.destroy(recursive, src)
  }

  // ------------------------------ действия ------------------------------------------

  protected async executeAction(process: Process): Promise<any> {
    try {
      const result = process.action({
        self: { meta: this.meta, actor: this.id, path: this.path, destroy: this.destroy },
        context: this.ctx.context,
        schema: this.ctx.schema,
        core: this.core,
      })
      if (result instanceof Promise) {
        return result
          .then((data) => process.success && process.success({ update: this.update, data }))
          .catch((error) => {
            const normError = this.prepareError(error)
            process.error?.({ update: this.update, error: normError })
            return normError
          })
      } else {
        process.success && process.success({ update: this.update, data: result })
        return Promise.resolve(result)
      }
    } catch (error) {
      const normError = this.prepareError(error)
      process.error?.({ update: this.update, error: normError })
      return Promise.reject(normError)
    }
  }

  private prepareError(error: any): Error {
    if (typeof error === "string") error = new Error(error)
    else if (!(error instanceof Error))
      console.error(`Передан неизвестный тип ошибки в состоянии: ${this.state.current}`)
    return error
  }

  // ---------- snapshot ----------

  override get snapshot(): Snapshot<Schema, string> {
    return {
      name: this.meta,
      state: this.state.current,
      process: this.process,
      states: this.state.states,
      context: this.ctx.snapshot,
      ...(this.desc ? { desc: this.desc } : {}),
      core: Object.keys(this.core),
    }
  }

  // ---------- фабрики ----------

  static fromSchema<M extends Meta>(config: {
    meta: M
    id?: string
    core?: Core
    context?: Partial<Values<M["context"]>>
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
      meta.render ?? [],
      core
    )
    return actor
  }

  static createSibling<M extends Meta>(
    targetId: string,
    meta: M,
    cfg: { id?: string; at?: "before" | "after"; core?: Core; context?: Partial<Values<M["context"]>> } = {}
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
          meta.render ?? [],
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
    cfg: { id?: string; core?: Core; context?: Partial<Values<M["context"]>> } = {}
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
        meta.render ?? [],
        core
      )
    }, 0)

    return id
  }
}
