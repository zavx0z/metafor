import { contextFromSchema, type Context, type Schema, type Values } from "@zavx0z/context"
import { checkTransition, type Conditions, type Transitions } from "./core/states"
import { processesFromSchema, type Process, type Processes } from "./core/processes"
import { reactionsFromSchema, type Reactions } from "./core/reactions"
import { ActorCommunication } from "./core/communication"
export { Fields } from "./core/field"
import type { Node as ParseNode } from "@zavx0z/template"
import type { Core, Snapshot, Message } from "./actor.t"
export type { Message }
import type { StatesConfig } from "./schema/states"
import type { Meta } from "./metafor"

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
export class Actor extends ActorCommunication {
  private static coreWeakMap = new WeakMap<Actor, Core>()

  /** Позиционный путь актора в VDOM (строка индексов через слеш, например "0/1/2") */
  public readonly path: string

  constructor(
    public name: string,
    public id: string,
    public desc: string | undefined,
    public ctx: Context<Schema>,
    public state: { current: string; states: StatesConfig },
    public processes: Processes,
    public reactions: Reactions,
    public render: ParseNode[],
    core: Core = {},
    path?: string
  ) {
    super()
    // Инициализируем path: если передан явно, используем его, иначе генерируем корневой путь
    this.path = path ?? ActorCommunication.getHierarchy().generateRootPath()
    this.update = this.update.bind(this)
    Actor.coreWeakMap.set(this, core)
    this.#init()
  }

  /** Сбрасывает счетчик путей (для тестирования) */
  static resetPathCounter(): void {
    ActorCommunication.getHierarchy().resetPathCounter()
  }

  #init() {
    // Инициализируем коммуникации через базовый класс
    this.initializeCommunication()

    // Отправляем сообщение о создании актора
    this.sendMessage({
      meta: this.name,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      patches: [
        {
          op: "add",
          path: "/",
          value: {
            context: this.ctx.context,
            state: this.state.current,
            process: this.process,
          },
        },
      ],
    })
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
  stateListeners = new Set<(state: string) => void>()
  setState(state: string) {
    this.state.current = state
    if (this.stateListeners.size > 0) {
      for (const listener of this.stateListeners) listener(state)
    }
  }
  /** Подписка на обновление состояния. Возвращает функцию отписки */
  onStateChange(listener: (state: string) => void): (listener: (state: string) => void) => void {
    this.stateListeners.add(listener)
    return this.unsubscribeState
  }
  unsubscribeState(listener: (state: string) => void) {
    this.stateListeners.delete(listener)
  }
  /** ------------process-------------------------------- */
  /** индикатор выполнения процесса */
  process = false
  /**
   * 1. устанавливает состояние процесса
   * 2. при отключении процесса (после завершения действия)
   *  - обновляет контекст
   *  - выполняет переходы
   */
  setProcess(process: boolean) {
    if (this.process === process) return
    this.process = process
    if (!process) {
      this.transition()
    }
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
   * - выполняет действие, устанавливая состояние процесса в true
   * - после успешной обработки действия, если есть success, то обновляет контекст
   * - после ошибки в обработке действия, если есть error, то обновляет контекст
   * - после завершения действия, устанавливает состояние процесса в false
   * - отправляет сообщение о состоянии процесса в канал (MSG)
   *
   * @param process - конфигурация процесса состояния
   * @throws {Error} - если обработчик ошибки не найден
   */
  executeAction(process: Process<any, any>) {
    try {
      this.sendMessage(Actor.stateBeforeActionMessage(this.name, this.id, this.path, this.state.current))
      const result = process.action({
        schema: this.ctx.schema,
        context: this.ctx.context,
        core: this.core,
        self: { meta: this.name, actor: this.id, path: this.path },
      })
      if (result instanceof Promise) {
        result
          .then((data) => {
            if (process.success) process.success({ update: this.update, data })
          })
          .catch((error) => {
            if (process.error) {
              if (error instanceof Error) {
                process.error({ update: this.update, error })
              } else if (typeof error === "string") {
                process.error({ update: this.update, error: new Error(error) })
              } else {
                throw new Error(`Передан неизвестный тип ошибки в состоянии: ${this.state.current}`)
              }
            } else throw new Error(`Обработчик ошибки не найден для состояния: ${this.state.current} \n ${error}`)
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
      // ...this.#view.snapshot,
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
        self: { meta: this.name, actor: this.id, path: this.path },
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

  /** Очищает ресурсы актора и удаляет его из реестра */
  destroy() {
    // Рекурсивно уничтожаем всех детей
    const hierarchy = ActorCommunication.getHierarchy()
    const children = hierarchy.getChildren(this.path)

    for (const childPath of children) {
      const childActor = hierarchy.getActor(childPath)
      if (childActor instanceof Actor) {
        childActor.destroy()
      }
    }

    // Отправляем сообщение об удалении
    const removeMessage = Actor.removeMessage(this.name, this.id, this.path)
    this.sendMessage(removeMessage)

    this.destroyCommunication()
    Actor.coreWeakMap.delete(this)
    this.stateListeners.clear()
    this.ctx.clearSubscribers()
  }

  /**
   * Создает актор из схемы MetaFor
   *
   * @param config - Конфигурация актора
   * @param config.meta - Схема MetaFor с контекстом, состояниями, процессами и реакциями
   * @param config.id - Уникальный идентификатор актора
   * @param config.core - Объект ядра для хранения сложных данных (опционально)
   * @param config.context - Начальные значения контекста (опционально)
   * @param config.path - Позиционный путь в VDOM (опционально, генерируется автоматически)
   *
   * @returns Новый экземпляр актора
   *
   * @example
   * ```typescript
   * const actor = Actor.fromSchema({
   *   meta: userSchema,
   *   id: "user-123",
   *   core: { users: [], settings: {} },
   *   context: { name: "John", age: 25 },
   *   path: "0/1"
   * })
   * ```
   */
  static fromSchema<M extends Meta>(config: {
    meta: M
    id: string
    core?: Core
    context?: Partial<Values<M["context"]>>
    path?: string
  }): Actor {
    const { meta, id, core = {}, context = {}, path } = config

    const ctx = contextFromSchema(meta.context)
    ctx.update(context as any)
    return new Actor(
      meta.name,
      id,
      meta.desc,
      ctx,
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}, { meta: meta.name, actor: id, path: path ?? "0" }),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      meta.render ?? [],
      core,
      path
    )
  }
}
