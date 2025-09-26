/**
 * Основная реализация MetaFor
 * @module Core
 */
import { contextFromSchema, type Context, type Schema, type Values } from "@zavx0z/context"
import { checkTransition, type Conditions, type Transitions } from "./states"
import { processesFromSchema, type Process } from "./processes"
import { reactionsFromSchema } from "./reactions"

import type { Core, Snapshot, ActorInfo, Message } from "./index.t"
import type { MetaStore } from "./store.t"

import type { MetaSchema } from "../schema"
import type { StatesConfig } from "../schema/states"

export function MetaForFabric(params: {
  store: MetaStore
  render: any
  env?: "srv:m" | "srv:w" | "web:m" | "web:w" | "web:sw"
}) {
  const { store, render, env } = params
  if (!customElements.get("meta-for")) {
    customElements.define(
      "meta-for",
      class Actor<C extends Schema = Schema, S extends string = string, I extends Core = Core> extends HTMLElement {
        #shadow: ShadowRoot
        #channel: BroadcastChannel | null = null
        __path: string[] = []
        #name!: string
        #description!: string
        #context!: Context<C>
        #env!: string
        #core: I = {} as I
        /** ------------state-------------------------------- */
        #state!: {
          state: S
          states: StatesConfig<S, C>
        }
        #stateListeners: Set<(state: S) => void> = new Set()
        #setState(state: S) {
          this.setAttribute("state", state)
          this.#state.state = state
          if (this.#stateListeners.size > 0) {
            for (const listener of this.#stateListeners) listener(state)
          }
        }
        /** Подписка на обновление состояния. Возвращает функцию отписки */
        onStateChange = (listener: (state: S) => void): (() => void) => {
          this.#stateListeners.add(listener)
          return () => this.#stateListeners.delete(listener)
        }
        get state(): S {
          return this.#state.state
        }
        /** ------------process-------------------------------- */
        #processes!: ReturnType<typeof processesFromSchema<C, S, I>>
        /** индикатор выполнения процесса */
        #process: boolean = false
        /**
         * 1. устанавливает состояние процесса
         * 2. при отключении процесса (после завершения действия)
         *  - обновляет контекст
         *  - выполняет переходы
         */
        #setProcess(process: boolean) {
          if (this.#process === process) return
          this.#process = process
          if (!process) {
            this.#transition()
          }
        }
        #reactions!: ReturnType<typeof reactionsFromSchema<C, S, I>>
        constructor() {
          super()
          this.#shadow = this.attachShadow({ mode: "closed" })
          this.#env = env as string
        }
        async connectedCallback() {
          const src = this.getAttribute("src")
          if (!src) {
            console.warn(`src: ${src} is not defined`)
            return
          }
          // const m = (await import(url)).default
          const m = (await store.import(src, "network-first")) as MetaSchema<C, S>
          if (!m) {
            console.error(`Module: ${src} is not defined`)
            return
          }
          this.#name = m.name
          this.#context = contextFromSchema<C>(m.context as C)
          this.#reactions = reactionsFromSchema(m.reactions || { reactions: {}, states: {} })
          this.#processes = processesFromSchema(m.processes || {})
          this.#state = { state: Object.keys(m.states)[0] as S, states: m.states }
          if (m.style) {
            const sheet = new CSSStyleSheet()
            sheet.replaceSync(m.style)
            this.#shadow.adoptedStyleSheets.push(sheet)
          }
          this.setAttribute("state", this.#state.state)
          this.#channel = new BroadcastChannel("channel")

          if (this.#reactions.hasReactions() && this.#channel)
            this.#channel.onmessage = (ev) => this.#handleReactionMessage(ev.data)
          this.#sendEvent(initMessage(this.#name, { index: this.#env }, m as unknown as Snapshot<C, S>, this.__path))
          const transition = this.#state.states[this.#state.state]
          if (transition) {
            const process = this.#processes.getProcess(this.#state.state)
            if (process) {
              this.#setProcess(true)
              this.#executeAction(process)
              this.#transition()
            } else {
              this.#transition()
            }
          }
          m.render &&
            render({
              core: this.#core,
              ctx: this.#context,
              el: this.#shadow,
              st: { state: this.state, states: Object.keys(this.#state.states), onUpdate: this.onStateChange },
              nodes: m.render,
            })
          // this.#view.onMount({ core: this.#core })
        }
        disconnectedCallback() {
          // this.#view.onDestroy({ core: this.#core })
        }

        /** обновление контекста */
        update = (context: Partial<Values<C>>): Partial<Values<C>> => {
          const updated = this.#context.update(context)
          if (Object.keys(updated).length > 0) {
            this.#sendEvent(updateContextMessage(this.#name, { index: this.#env }, updated))
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
        #executeAction = (process: Process<C, I>) => {
          try {
            this.#broadcastMessage(stateBeforeActionMessage(this.#name, { index: this.#env }, this.#state.state))
            const result = process.action({
              context: this.#context.context,
              core: this.#core,
              element: this,
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
                      throw new Error(`Передан неизвестный тип ошибки в состоянии: ${this.#state.state}`)
                    }
                  } else throw new Error(`Обработчик ошибки не найден для состояния: ${this.#state.state} \n ${error}`)
                })
                .finally(() => {
                  this.#broadcastMessage(stateAfterActionMessage(this.#name, { index: this.#env }, this.#state.state))
                  this.#setProcess(false)
                })
            } else {
              if (process.success) process.success({ update: this.update, data: result })
              this.#broadcastMessage(stateAfterActionMessage(this.#name, { index: this.#env }, this.#state.state))
              this.#setProcess(false)
            }
          } catch (error) {
            if (error instanceof Error) process.error?.({ update: this.update, error })
            this.#broadcastMessage(stateAfterActionMessage(this.#name, { index: this.#env }, this.#state.state))
            this.#setProcess(false)
          }
        }

        /**
         * - выполняет переходы с установкой состояния
         * - запускает процесс если есть
         * - отправляет сообщение состояния если нет процесса (MSG)
         */
        #transition = () => {
          const transition: Transitions<S, C> = this.#state.states[this.#state.state]
          if (!transition) return
          for (const [state, conditions] of Object.entries(transition)) {
            if (checkTransition(conditions as Conditions<C>, this.#context.context)) {
              const process = this.#processes.getProcess(state as S)
              if (this.#process) return
              if (process) {
                this.#setProcess(true)
                this.#setState(state as S)
                this.#executeAction(process)
              } else {
                this.#setState(state as S)
                this.#channel &&
                  this.#broadcastMessage(stateAfterActionMessage(this.#name, { index: this.#env }, state as S))
                if (!this.#process) this.#transition()
              }
              break
            }
          }
        }
        #broadcastMessage = (message: Message) => {
          if (!this.#channel) return
          this.#channel.postMessage(message)
        }
        #sendEvent = (message: Message) => {
          if (!this.#channel) return
          this.#channel.postMessage(message)
        }

        get snapshot(): Snapshot<C, S> {
          return {
            name: this.#name,
            state: this.#state.state,
            process: this.#process,
            states: this.#state.states,
            context: this.#context.snapshot,
            // ...this.#view.snapshot,
            ...(this.#description ? { description: this.#description } : {}),
          }
        }

        /** Обработка входящих сообщений для реакций */
        #handleReactionMessage = (message: Message) => {
          if (!this.#reactions.hasReactions()) return
          for (const patch of message.patches) {
            this.#reactions.run({
              context: this.#context.context,
              core: this.#core,
              meta: message.meta,
              actor: message.actor,
              timestamp: message.timestamp,
              patch,
              state: this.#state.state,
              update: this.update,
            })
          }
        }
      }
    )
  }
  const initMessage = <C extends Schema, S extends string>(
    meta: string,
    actor: ActorInfo,
    snapshot: Snapshot<C, S>,
    path: string[]
  ): Message => {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "add", path: "/" + path.join("/"), value: snapshot }] }
  }

  const updateContextMessage = <C extends Schema>(
    meta: string,
    actor: ActorInfo,
    updated: Partial<Values<C>>
  ): Message => {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "replace", path: "/context", value: updated }] }
  }

  const stateBeforeActionMessage = <S extends string>(meta: string, actor: ActorInfo, state: S): Message => {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "test", path: "/state", value: state }] }
  }

  const stateAfterActionMessage = <S extends string>(meta: string, actor: ActorInfo, state: S): Message => {
    return { meta, actor, timestamp: Date.now(), patches: [{ op: "replace", path: "/state", value: state }] }
  }
}
