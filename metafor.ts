/**
 * MetaFor - фреймворк для создания актора конечного автомата
 * @packageDocumentation
 */

import { types, createContext } from "./context"
import type { ContextSchema, ContextTypes, ContextInstance, ExtractValues } from "./context"
import { Machine, type StateConfig } from "./machine"
import { createActionsConfig, type Builder } from "./actions"
import type { Snapshot } from "./metafor.t"
import type { Message } from "./message/index.t"
import { initMessage } from "./message"

/**
 * MetaFor — фабрика для создания web-компонента-актора конечного автомата
 * @param tag - уникальный тег web-компонента
 * @returns chain API: context() -> states() -> actions()
 */
export function MetaFor(tag: string) {
  const tagName = `metafor-${tag}` as const
  return {
    /**
     * Регистрирует схему контекста для автомата.
     *
     * @param schema Функция, принимающая types и возвращающая объект-схему контекста.
     * Пример:
     * ```ts
     * .context(types => ({
     *   name: types.string.required("Anonymous"),
     *   isActive: types.boolean.required(false),
     * }))
     * ```
     * @returns chain API для вызова .states(...)
     */
    context<C extends ContextSchema>(schema: (types: ContextTypes) => C) {
      const contextSchema = schema(types)
      return {
        /**
         * Регистрирует переходы автомата между состояниями.
         *
         * @param states Объект, где ключ — имя состояния, а значение — карта возможных переходов (ключ — следующее состояние, значение — условия или данные перехода).
         * Пример:
         * ```ts
         * .states({
         *   guest: { user: { name: "Пользователь" } },
         *   user: { guest: {} },
         * })
         * ```
         * @returns chain API для вызова .actions(...)
         */
        states<S extends string>(states: StateConfig<S, C>) {
          const initialState = Object.keys(states)[0] as S
          return {
            /**
             * Регистрирует действия автомата для нужных состояний.
             *
             * @param builder Функция, принимающая action — фабрику chain API для описания действий.
             * Возвращает объект, где ключ — имя состояния (только для тех, где нужны действия), а значение — chain-объект с обработчиками.
             *
             * Пример:
             * ```ts
             * .actions(action => ({
             *   guest: action(({ context }) => { ... })
             *     .success(({ update, data }) => update({ ... }))
             *     .error(({ update, error }) => update({ ... })),
             *   // для других состояний можно не указывать действие, если оно не требуется
             * }))
             * ```
             *
             * @returns Объект с действиями только для нужных состояний
             */
            actions(builder: Builder<C, S>) {
              const actionsConfig = createActionsConfig<C, S>(builder)

              class WebComponent extends HTMLElement {
                #ctx: ContextInstance<any>
                #shadow: ShadowRoot
                #machine: Machine<S, C>
                #channel: BroadcastChannel

                constructor() {
                  super()
                  this.#shadow = this.attachShadow({ mode: "closed" })
                  this.#channel = new BroadcastChannel("channel")

                  this.#ctx = createContext(contextSchema)

                  this.#machine = new Machine(states, actionsConfig, initialState, this.#ctx.update)
                }

                connectedCallback() {
                  this.#sendEvent(initMessage(tag, this.getSnapshot()))

                  this.#ctx.onUpdate(this.#onUpdateContext)
                  this.#machine.onUpdate((patches: any) => {
                    this.#channel.postMessage({ patches, meta: { tag } })
                  })
                  // this.#machine.update(this.#ctx.getSnapshot())
                }

                #sendEvent(message: Message) {
                  this.#shadow.dispatchEvent(
                    new CustomEvent("channel", { detail: message, bubbles: true, composed: true })
                  )
                }

                #onUpdateContext = (updated: Partial<ExtractValues<C>>) => {
                  this.#sendEvent({
                    meta: { tag, timestamp: Date.now() },
                    patch: { op: "replace", path: "/context", value: updated },
                  })
                }

                update(values: Partial<ExtractValues<C>>) {
                  const updated = this.#ctx.update(values)
                  if (Object.keys(updated).length === 0) {
                    return
                  }
                  this.#machine.update(updated)
                }

                get currentState() {
                  return this.#machine.currentState
                }

                getSnapshot(): Snapshot<C, S> {
                  return {
                    state: this.#machine.currentState,
                    states: states,
                    context: this.#ctx.getSnapshot(),
                    schema: this.#ctx.schema,
                    // actions: actionsConfig,
                  }
                }
              }
              if (!customElements.get(tagName)) customElements.define(tagName, WebComponent)
            },
          }
        },
      }
    },
  }
}
