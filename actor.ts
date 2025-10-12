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
 * Основной класс актора MetaFor
 *
 * Представляет изолированный актор с собственным состоянием, контекстом и логикой.
 * Каждый актор имеет уникальный позиционный путь в VDOM и может взаимодействовать
 * с другими акторами через систему сообщений.
 *
 * @example
 * ```typescript
 * const actor = Actor.fromSchema({
 *   meta: schema,
 *   id: "user-1",
 *   path: "0/1",
 *   core: { users: [] }
 * })
 * ```
 */
export class Actor extends ElectromagneticField {
  private static coreWeakMap = new WeakMap<Actor, Core>()

  constructor(
    public id: string,
    public readonly path: string,
    public name: string,
    public desc: string | undefined,
    public ctx: Context<Schema>,
    public state: { current: string; states: StatesConfig },
    public processes: Processes,
    public reactions: Reactions,
    public render: ParseNode[],
    core?: Core
  ) {
    super()
    this.update = this.update.bind(this)
    this.destroy = this.destroy.bind(this)
    Actor.coreWeakMap.set(this, core || {})
    this.#init()
  }

  #init() {
    // Инициализируем коммуникации через базовый класс
    this.initializeCommunication()

    // Отправляем сообщение о создании актора (снимок)
    this.sendMessage(Actor.initMessage(this.name, this.id, this.path, this.snapshot))

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

  get core() {
    return Actor.coreWeakMap.get(this)!
  }
  set core(value: Core) {
    Actor.coreWeakMap.set(this, value)
  }

  // ---------- state listeners ----------
  stateListeners = new Set<(state: string) => void>()

  setState(state: string) {
    this.state.current = state
    if (this.stateListeners.size > 0) {
      for (const listener of this.stateListeners) listener(state)
    }
  }

  /** Подписка на обновление состояния. Возвращает функцию отписки */
  onStateChange(listener: (state: string) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.unsubscribeState(listener)
  }
  unsubscribeState(listener: (state: string) => void) {
    this.stateListeners.delete(listener)
  }

  // ---------- process ----------
  /** индикатор выполнения процесса */
  process = false

  /**
   * 1) Устанавливает состояние процесса
   * 2) При отключении процесса запускает переходы
   */
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

  /**
   * Выполняет действие процесса.
   * Управляет сообщениями before/after и состоянием `process`.
   */
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

  /**
   * - выполняет переходы с установкой состояния
   * - запускает процесс если есть
   * - отправляет сообщение состояния если нет процесса (MSG)
   */
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

  /** Проверяет, есть ли у актора реакции */
  protected hasReactions(): boolean {
    return this.reactions.hasReactions()
  }

  /** Обработка входящих сообщений для реакций */
  protected handleReactionMessage(ev: MessageEvent) {
    const { data } = ev
    if (!this.reactions.hasReactions()) return
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
    this.transition() // TODO: оптимизировать по результату обновления
  }

  static initMessage(meta: string, actor: string, path: string, snapshot: Snapshot<Schema, string>): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "add", path: "/", value: snapshot }] }
  }

  static updateContextMessage(meta: string, actor: string, path: string, updated: Partial<Values<Schema>>): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "replace", path: "/context", value: updated }] }
  }

  static stateBeforeActionMessage(meta: string, actor: string, path: string, state: string): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "test", path: "/state", value: state }] }
  }

  static stateAfterActionMessage(meta: string, actor: string, path: string, state: string): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "replace", path: "/state", value: state }] }
  }

  static removeMessage(meta: string, actor: string, path: string): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "remove", path: "/" }] }
  }

  /** Рекурсивно очищает core и ресурсы для актора и всех его детей */
  private destroyRecursive(fields: Fields) {
    const children = fields.getChildren(this.id)

    // Рекурсивно очищаем детей
    for (const childId of children) {
      const childActor = fields.getActor(childId)
      if (childActor) {
        childActor.destroyRecursive(fields)
      }
    }

    // Очищаем ресурсы текущего актора
    this.destroyCommunication()
    Actor.coreWeakMap.delete(this)
    this.stateListeners.clear()
    this.ctx.clearSubscribers()
  }

  /** Очищает ресурсы актора и удаляет его из реестра */
  destroy() {
    // Сообщаем об удалении
    const removeMessage = Actor.removeMessage(this.name, this.id, this.path)
    this.sendMessage(removeMessage)

    const fields = Fields.get()

    // Рекурсивно удаляем core и ресурсы для всех детей
    this.destroyRecursive(fields)

    // Удаляем себя из реестра с рекурсией (удаляет всех детей из Fields)
    fields.remove(this.id, true)
  }

  static fromSchema<M extends Meta>(config: {
    meta: M
    id?: string
    core?: Core
    context?: Partial<Values<M["context"]>>
    path?: string
  }): Actor {
    const { meta, id = crypto.randomUUID(), core, context = {}, path } = config
    const ctx = contextFromSchema(meta.context)
    ctx.update(context)
    // --- Разрешаем путь ---
    const fields = Fields.get()
    let pathResolved: string
    if (typeof path === "string" && path.length > 0) {
      pathResolved = path
    } else {
      // корневая позиция: ищем первый свободный индекс "0","1","2",...
      let i = 0
      while (fields.hasPath(String(i))) i++
      pathResolved = String(i)
    }
    // --- Создаём экземпляр ---
    const actor = new Actor(
      id,
      pathResolved,
      meta.name,
      meta.desc,
      ctx,
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}, { meta: meta.name, actor: id, path: pathResolved, destroy: () => {} }),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      meta.render ?? [],
      core
    )
    // --- Регистрируем в Fields строго на pathResolved ---
    fields.createNode(pathResolved, actor)
    return actor
  }

  /**
   * Создать нового «брата» (соседа) рядом с целевым актором.
   * @param targetId Идентификатор актора-ориентира.
   * @param meta Meta-схема нового актора.
   * @param cfg.id Уникальный id нового актора.
   * @param cfg.at "before" | "after" (по умолчанию "after").
   * @param cfg.core (опц.) Core окружение.
   * @param cfg.context (опц.) Начальные значения контекста.
   * @returns Созданный актор (уже с корректным path).
   */
  static createSibling<M extends Meta>(
    targetId: string,
    meta: M,
    cfg: {
      id?: string
      at?: "before" | "after"
      core?: Core
      context?: Partial<Values<M["context"]>>
    }
  ): Actor {
    const { id = crypto.randomUUID(), core, context = {}, at = "after" } = cfg
    const fields = Fields.get()
    if (!fields.getActor(targetId)) throw new Error(`Актор-ориентир "${targetId}" не найден`)
    // 1) Считаем конечный путь заранее в Fields
    const pathResolved = fields.computeSiblingPath(targetId, at)
    // 2) Готовим контекст и создаём актор СРАЗУ с правильным path
    const ctx = contextFromSchema(meta.context)
    ctx.update(context)
    const actor = new Actor(
      id,
      pathResolved,
      meta.name,
      meta.desc,
      ctx,
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}, { meta: meta.name, actor: id, path: pathResolved, destroy: () => {} }),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      meta.render ?? [],
      core
    )
    // 3) Регистрируем строго по рассчитанному пути
    fields.createNode(pathResolved, actor)
    return actor
  }
}
