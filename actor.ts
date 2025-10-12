// actor.ts
import { contextFromSchema, type Context, type Schema, type Values } from "@zavx0z/context"
import { checkTransition, type Conditions, type Transitions } from "./core/states"
import { processesFromSchema, type Process, type Processes } from "./core/processes"
import { reactionsFromSchema, type Reactions } from "./core/reactions"
import { ElectromagneticField } from "./core/electromagnetic"
export { Fields } from "./core/fields"
import type { Node as ParseNode } from "@zavx0z/template"
import type { Core, Snapshot, Message } from "./actor.t"
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
export class Actor extends ElectromagneticField {
  /** Core хранится вне экземпляра. */
  private static coreWeakMap = new WeakMap<Actor, Core>()

  constructor(
    public override id: string,
    public name: string,
    public desc: string | undefined,
    public ctx: Context<Schema>,
    public state: { current: string; states: StatesConfig },
    public processes: Processes,
    public reactions: Reactions,
    public render: ParseNode[],
    core?: Core
  ) {
    // База без сайд-эффектов: только id/name/snapshot-fn
    super(id, name, () => this.snapshot)

    // биндинги
    this.update = this.update.bind(this)
    this.destroy = this.destroy.bind(this)

    // core в WeakMap
    Actor.coreWeakMap.set(this, core || {})

    // **** КРИТИЧЕСКО: теперь reactions уже присвоены — можно подключать транспорт и слать init ****
    this.attachAndAnnounceCreate()

    // стартовое состояние/процессы
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

  // ---------- Core ----------

  get core() {
    return Actor.coreWeakMap.get(this)!
  }
  set core(value: Core) {
    Actor.coreWeakMap.set(this, value)
  }

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
      this.sendMessage(Actor.updateContextMessage(this.name, this.id, this.path, updated))
    }
    return updated
  }

  executeAction(process: Process<any, any>) {
    try {
      this.sendMessage(Actor.stateBeforeActionMessage(this.name, this.id, this.path, this.state.current))
      const result = process.action({
        schema: this.ctx.schema,
        context: this.ctx.context,
        core: this.core,
        self: { meta: this.name, actor: this.id, path: this.path, destroy: this.destroy },
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
            this.sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.path, this.state.current))
            this.setProcess(false)
          })
      } else {
        if (process.success) process.success({ update: this.update, data: result })
        this.sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.path, this.state.current))
        this.setProcess(false)
      }
    } catch (error) {
      if (error instanceof Error) process.error?.({ update: this.update, error })
      else console.error(error)
      this.sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.path, this.state.current))
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
          this.sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.path, state))
          if (!this.process) this.transition()
        }
        break
      }
    }
  }

  // ---------- snapshot ----------

  get snapshot(): Snapshot<Schema, string> {
    return {
      name: this.name,
      state: this.state.current,
      process: this.process,
      states: this.state.states,
      context: this.ctx.snapshot,
      ...(this.desc ? { desc: this.desc } : {}),
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
        self: { meta: this.name, actor: this.id, path: this.path, destroy: this.destroy },
      })
    }
    this.transition()
  }

  // ---------- билдеры прикладных сообщений ----------

  static updateContextMessage(meta: string, actor: string, path: string, updated: Partial<Values<Schema>>): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "replace", path: "/context", value: updated }] }
  }
  static stateBeforeActionMessage(meta: string, actor: string, path: string, state: string): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "test", path: "/state", value: state }] }
  }
  static stateAfterActionMessage(meta: string, actor: string, path: string, state: string): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "replace", path: "/state", value: state }] }
  }

  // ---------- уничтожение ----------

  private destroyRecursive(fields: Fields) {
    const children = fields.getChildren(this.id)
    for (const childId of children) {
      const childActor = fields.getActor(childId)
      if (childActor) (childActor as Actor).destroyRecursive(fields)
    }
    Actor.coreWeakMap.delete(this)
    this.stateListeners.clear()
    this.ctx.clearSubscribers()
  }

  public override destroy() {
    // 1) база: remove + выключить транспорт
    super.destroy()
    // 2) локальная очистка
    const fields = Fields.get()
    this.destroyRecursive(fields)
    // 3) удалить из дерева (рекурсивно)
    fields.remove(this.id, true)
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
      processesFromSchema(meta.processes ?? {}, { meta: meta.name, actor: id, path: "", destroy: () => {} }),
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

    // резерв заранее
    fields.reserveSibling(id, targetId, at)

    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    const actor = new Actor(
      id,
      meta.name,
      meta.desc,
      ctx,
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}, { meta: meta.name, actor: id, path: "", destroy: () => {} }),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      meta.render ?? [],
      core
    )
    return actor.id
  }
}
