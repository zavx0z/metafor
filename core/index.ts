import { type Context, type Schema, type Values } from "@zavx0z/context"
import { checkTransition, type Conditions, type Transitions } from "./states"
import { type Process, type Processes } from "./processes"
import { type Reactions } from "./reactions"
import type { RenderParams } from "@zavx0z/renderer"
import type { Node as ParseNode } from "@zavx0z/template"
import type { Core, Snapshot, ActorInfo, Message } from "./index.t"
import type { Store } from "./store.t"
export type { Message }
import type { StatesConfig } from "../schema/states"
import type { Env } from "../index.t"
const channel = new BroadcastChannel("channel")

export class Actor {
  constructor(
    public name: string,
    public description: string | undefined,
    public context: Context<Schema>,
    public env: Env,
    public store: Store,
    public state: { state: string; states: StatesConfig },
    public processes: Processes,
    public reactions: Reactions,
    public render: ParseNode[],
    public renderer: (params: RenderParams<Schema, Core, string>) => void
  ) {
    if (reactions.hasReactions()) channel.onmessage = (ev) => this.handleReactionMessage(ev.data)
    channel.postMessage(Actor.initMessage(name, { index: env }, {} as any, this.__path))
    const transition = state.states[state.state]
    if (transition) {
      const process = processes.getProcess(state.state)
      if (process) {
        this.setProcess(true)
        this.executeAction(process)
        this.transition()
      } else {
        this.transition()
      }
    }
    renderer({
      core: this.core,
      ctx: context,
      el: null as any,
      st: {
        state: this.state.state,
        states: Object.keys(state.states),
        onUpdate: this.onStateChange,
      },
      nodes: [],
    })
  }

  __path = []
  static coreWeakMap = new WeakMap<Actor, Core>()
  get core() {
    return Actor.coreWeakMap.get(this) ?? {}
  }
  set core(value: Core) {
    Actor.coreWeakMap.set(this, value)
  }
  stateListeners = new Set<(state: string) => void>()
  setState(state: string) {
    this.state.state = state
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
    const updated = this.context.update(context)
    if (Object.keys(updated).length > 0) {
      channel.postMessage(Actor.updateContextMessage(this.name, { index: this.env }, updated))
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
      channel.postMessage(Actor.stateBeforeActionMessage(this.name, { index: this.env }, this.state.state))
      const result = process.action({
        context: this.context.context,
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
                throw new Error(`Передан неизвестный тип ошибки в состоянии: ${this.state.state}`)
              }
            } else throw new Error(`Обработчик ошибки не найден для состояния: ${this.state.state} \n ${error}`)
          })
          .finally(() => {
            channel.postMessage(Actor.stateAfterActionMessage(this.name, { index: this.env }, this.state.state))
            this.setProcess(false)
          })
      } else {
        if (process.success) process.success({ update: this.update, data: result })
        channel.postMessage(Actor.stateAfterActionMessage(this.name, { index: this.env }, this.state.state))
        this.setProcess(false)
      }
    } catch (error) {
      if (error instanceof Error) process.error?.({ update: this.update, error })
      channel.postMessage(Actor.stateAfterActionMessage(this.name, { index: this.env }, this.state.state))
      this.setProcess(false)
    }
  }

  /**
   * - выполняет переходы с установкой состояния
   * - запускает процесс если есть
   * - отправляет сообщение состояния если нет процесса (MSG)
   */
  transition() {
    const transition: Transitions | undefined = this.state.states[this.state.state]
    if (!transition) return
    for (const [state, conditions] of Object.entries(transition)) {
      if (checkTransition(conditions as Conditions, this.context.context)) {
        const process = this.processes.getProcess(state)
        if (this.process) return
        if (process) {
          this.setProcess(true)
          this.setState(state)
          this.executeAction(process)
        } else {
          this.setState(state)
          channel.postMessage(Actor.stateAfterActionMessage(this.name, { index: this.env }, state))
          if (!this.process) this.transition()
        }
        break
      }
    }
  }

  get snapshot(): Snapshot<Schema, string> {
    return {
      name: this.name,
      state: this.state.state,
      process: this.process,
      states: this.state.states,
      context: this.context.snapshot,
      // ...this.#view.snapshot,
      ...(this.description ? { description: this.description } : {}),
    }
  }

  /** Обработка входящих сообщений для реакций */
  handleReactionMessage(message: Message) {
    if (!this.reactions.hasReactions()) return
    for (const patch of message.patches) {
      this.reactions.run({
        context: this.context.context,
        core: this.core,
        meta: message.meta,
        actor: message.actor,
        timestamp: message.timestamp,
        patch,
        state: this.state.state,
        update: this.update,
      })
    }
  }
  static initMessage(meta: string, actor: ActorInfo, snapshot: Snapshot<Schema, string>, path: string[]): Message {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "add", path: "/" + path.join("/"), value: snapshot }] }
  }

  static updateContextMessage(meta: string, actor: ActorInfo, updated: Partial<Values<Schema>>): Message {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "replace", path: "/context", value: updated }] }
  }

  static stateBeforeActionMessage(meta: string, actor: ActorInfo, state: string): Message {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "test", path: "/state", value: state }] }
  }

  static stateAfterActionMessage(meta: string, actor: ActorInfo, state: string): Message {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "replace", path: "/state", value: state }] }
  }
}
