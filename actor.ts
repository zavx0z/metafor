// actor.ts
import { contextFromSchema, type Context, type Schema, type Values } from "@zavx0z/context"
import { checkTransition, type Conditions, type Transitions } from "./core/states"
import { processesFromSchema, type Process, type Processes } from "./core/processes"
import { reactionsFromSchema, type Reactions } from "./core/reactions"
import { Electromagnetic } from "./core/electromagnetic"
export { Fields } from "./core/fields"
import type { Node as ParseNode } from "@zavx0z/template"
import type { Snapshot, Message } from "./actor.t"
import type { Core } from "./gravity.t"
export type { Message }
import type { StatesConfig } from "./schema/states"
import type { Meta } from "./metafor"
import { Fields } from "./core/fields"

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
export class Actor extends Electromagnetic {
  // -------------------------- Жизненный цикл -----------------------------------------

  constructor(
    public override id: string,
    public override meta: string,
    public desc: string | undefined,
    public override ctx: Context<Schema>,
    public override state: { current: string; states: StatesConfig },
    public processes: Processes,
    public reactions: Reactions,
    public render: ParseNode[],
    core?: Core
  ) {
    super(id, meta, core)

    this.update = this.update.bind(this)
    this.destroy = this.destroy.bind(this)

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
    this.connected()
  }

  // -------------------------- Жизненный цикл -----------------------------------------

  // ---------- подписки на смену состояния ----------

  stateListeners = new Set<(state: string) => void>()

  setState(state: string) {
    this.state.current = state
    if (this.stateListeners.size > 0) {
      for (const listener of this.stateListeners) listener(state)
    }
  }

  onStateChange(listener: (state: string) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.unsubscribeState(listener)
  }
  unsubscribeState(listener: (state: string) => void) {
    this.stateListeners.delete(listener)
  }

  // ---------- process runtime ----------

  /** индикатор выполнения процесса */
  process = false

  setProcess(process: boolean) {
    if (this.process === process) return
    this.process = process
    if (!process) this.transition()
  }

  /** обновление контекста */
  update(context: Partial<Values<Schema>>): Partial<Values<Schema>> {
    const updated = this.ctx.update(context)
    if (Object.keys(updated).length > 0) {
      this.sendMessage(this.msgUpdateContext(updated))
    }
    return updated
  }

  executeAction(process: Process<any, any>) {
    try {
      this.sendMessage(this.msgStateBeforeAction)
      const result = process.action({
        schema: this.ctx.schema,
        context: this.ctx.context,
        core: this.core,
        self: { meta: this.meta, actor: this.id, path: this.path, destroy: this.destroy },
      })

      if (result instanceof Promise) {
        result
          .then((data) => {
            if (process.success) process.success({ update: this.update, data })
          })
          .catch((error) => {
            if (process.error) {
              if (error instanceof Error) process.error({ update: this.update, error })
              else if (typeof error === "string") process.error({ update: this.update, error: new Error(error) })
              else throw new Error(`Передан неизвестный тип ошибки в состоянии: ${this.state.current}`)
            } else {
              throw new Error(`Обработчик ошибки не найден для состояния: ${this.state.current}\n${String(error)}`)
            }
          })
          .finally(() => {
            this.sendMessage(this.msgStateAfterAction)
            this.setProcess(false)
          })
      } else {
        if (process.success) process.success({ update: this.update, data: result })
        this.sendMessage(this.msgStateAfterAction)
        this.setProcess(false)
      }
    } catch (error) {
      if (error instanceof Error) process.error?.({ update: this.update, error })
      else console.error(error)
      this.sendMessage(this.msgStateAfterAction)
      this.setProcess(false)
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

  // ---------- интеграция с базой (реакции) ----------

  protected hasReactions(): boolean {
    return this.reactions?.hasReactions() ?? false
  }

  protected handleReactionMessage(ev: MessageEvent) {
    const { data } = ev as MessageEvent<Message>
    if (!this.reactions?.hasReactions()) return
    if (data.actor === this.id) return

    for (const patch of data.patches) {
      this.reactions.run({
        context: this.ctx.context,
        core: this.core,
        meta: data.meta,
        actor: data.actor,
        timestamp: data.timestamp,
        patch,
        state: this.state.current,
        update: this.update,
        self: { meta: this.meta, actor: this.id, path: this.path, destroy: this.destroy },
      })
    }
    this.transition()
  }

  // ---------- уничтожение ----------

  public override destroy(recursive = true) {
    // Очищаем локальные ресурсы
    this.stateListeners.clear()
    this.ctx.clearSubscribers()
    super.destroy(recursive)
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
