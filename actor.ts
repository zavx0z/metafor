import { contextFromSchema, type Context, type Schema, type Values } from "@zavx0z/context"
import { checkTransition, type Conditions, type Transitions } from "./core/states"
import { processesFromSchema, type Process, type Processes } from "./core/processes"
import { reactionsFromSchema, type Reactions } from "./core/reactions"
import type { Node as ParseNode } from "@zavx0z/template"
import type { Core, Snapshot, Message } from "./actor.t"
export type { Message }
import type { StatesConfig } from "./schema/states"
import type { MetaSchema } from "./metafor"

export class Actor {
  private static coreWeakMap = new WeakMap<Actor, Core>()
  private static channel = new BroadcastChannel("actor-force")
  private static actorsRegistry = new Map<string, Actor>()
  private static useBroadcastChannel = true

  constructor(
    public name: string,
    public id: string,
    public description: string | undefined,
    public ctx: Context<Schema>,
    public state: { current: string; states: StatesConfig },
    public processes: Processes,
    public reactions: Reactions,
    public render: ParseNode[],
    core: Core = {}
  ) {
    this.update = this.update.bind(this)
    Actor.coreWeakMap.set(this, core)
    this.#init()
  }
  #init() {
    // Регистрируем актор в реестре
    Actor.actorsRegistry.set(this.id, this)

    if (this.reactions.hasReactions()) {
      // Подписываемся на BroadcastChannel только если он включен
      if (Actor.useBroadcastChannel) {
        Actor.channel.addEventListener("message", this.handleReactionMessage)
      }

      // Внутренний механизм работает автоматически через реестр (всегда)
    }

    // Отправляем сообщение о создании актора
    Actor.#sendMessage({
      meta: this.name,
      actor: this.id,
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
      Actor.#sendMessage(Actor.updateContextMessage(this.name, this.id, updated))
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
      Actor.#sendMessage(Actor.stateBeforeActionMessage(this.name, this.id, this.state.current))
      const result = process.action({
        schema: this.ctx.schema,
        context: this.ctx.context,
        core: this.core,
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
            Actor.#sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.state.current))
            this.setProcess(false)
          })
      } else {
        if (process.success) process.success({ update: this.update, data: result })
        Actor.#sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.state.current))
        this.setProcess(false)
      }
    } catch (error) {
      console.error(error)
      if (error instanceof Error) process.error?.({ update: this.update, error })
      Actor.#sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.state.current))
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
          Actor.#sendMessage(Actor.stateAfterActionMessage(this.name, this.id, state))
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
      ...(this.description ? { description: this.description } : {}),
    }
  }

  /** Обработка входящих сообщений для реакций */
  handleReactionMessage(ev: MessageEvent) {
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
      })
    }
  }
  static initMessage(meta: string, actor: string, snapshot: Snapshot<Schema, string>): Message {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "add", path: "/", value: snapshot }] }
  }

  static updateContextMessage(meta: string, actor: string, updated: Partial<Values<Schema>>): Message {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "replace", path: "/context", value: updated }] }
  }

  static stateBeforeActionMessage(meta: string, actor: string, state: string): Message {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "test", path: "/state", value: state }] }
  }

  static stateAfterActionMessage(meta: string, actor: string, state: string): Message {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "replace", path: "/state", value: state }] }
  }

  /**
   * Включает/выключает BroadcastChannel для межпотоковой коммуникации
   *
   * Внутренний механизм работает всегда.
   *
   * Когда BroadcastChannel включен (по умолчанию):
   * - Акторы подписываются на оба канала одновременно
   * - Внутренний реестр - для быстрой коммуникации в том же потоке
   * - BroadcastChannel - для получения сообщений из других потоков/воркеров
   * - Сообщения отправляются в оба канала
   *
   * Когда BroadcastChannel отключен:
   * - Акторы подписываются только на внутренний реестр
   * - Все коммуникация идет через внутренний реестр
   * - Нет межпотоковой коммуникации
   */
  static setBroadcastChannel(enabled: boolean) {
    Actor.useBroadcastChannel = enabled
  }

  /** Возвращает текущее состояние BroadcastChannel */
  static isBroadcastChannelEnabled(): boolean {
    return Actor.useBroadcastChannel
  }

  /** Отправляет сообщение через внутренний механизм всем зарегистрированным акторам */
  static #sendInternalMessage(message: Message) {
    for (const [actorId, actor] of Actor.actorsRegistry) {
      if (actorId !== message.actor && actor.reactions.hasReactions()) {
        // Имитируем событие MessageEvent для совместимости с существующим кодом
        const mockEvent = {
          data: message,
        } as MessageEvent
        actor.handleReactionMessage(mockEvent)
      }
    }
  }

  /**
   * Отправляет сообщение через доступные каналы коммуникации
   *
   * Отправляет через BroadcastChannel для межпотоковой коммуникации (если включен).
   * Всегда отправляет через внутренний реестр акторов.
   *
   * Это обеспечивает:
   * 1. BroadcastChannel - для межпотоковой коммуникации (если включен)
   * 2. Внутренний реестр - для быстрой коммуникации между акторами в том же потоке (всегда)
   */
  static #sendMessage(message: Message) {
    // Отправляем через BroadcastChannel если он включен
    if (Actor.useBroadcastChannel) {
      Actor.channel.postMessage(message)
    }

    // Всегда отправляем через внутренний механизм
    Actor.#sendInternalMessage(message)
  }

  /** Удаляет актор из реестра */
  static unregisterActor(actorId: string) {
    Actor.actorsRegistry.delete(actorId)
  }

  /** Возвращает количество зарегистрированных акторов */
  static getRegisteredActorsCount(): number {
    return Actor.actorsRegistry.size
  }

  /** Очищает реестр акторов (для тестирования) */
  static clearRegistry() {
    Actor.actorsRegistry.clear()
  }

  /** Очищает ресурсы актора и удаляет его из реестра */
  destroy() {
    Actor.unregisterActor(this.id)
    if (this.reactions.hasReactions() && Actor.useBroadcastChannel) {
      // Отписываемся от BroadcastChannel только если он был включен
      Actor.channel.removeEventListener("message", this.handleReactionMessage)
    }
  }

  static fromSchema(meta: MetaSchema, id: string, core: Core = {}) {
    return new Actor(
      meta.name,
      id,
      meta.description,
      contextFromSchema(meta.context),
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      meta.render ?? [],
      core
    )
  }
}
