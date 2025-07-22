/**
 * MetaFor - фреймворк для создания актора конечного автомата
 * @packageDocumentation
 */

import { types, createContext } from "./context"
import type { ContextSchema, ContextTypes, ContextInstance, JsonPatch } from "./context"
import { Machine, type StateConfig } from "./machine"
import { createActionsConfig, type Builder } from "./actions"

/**
 * MetaFor — фабрика для создания web-компонента-актора конечного автомата
 * @param tag - уникальный тег web-компонента
 * @returns chain API: context() -> states() -> actions()
 */
export function MetaFor(tag: string) {
  const elementName = `metafor-${tag}` as const
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
                #machine: any
                #channel: BroadcastChannel

                constructor() {
                  super()
                  this.#shadow = this.attachShadow({ mode: "closed" })
                  this.#channel = new BroadcastChannel("channel")
                  this.#ctx = createContext(contextSchema!)
                  this.#machine = new Machine(
                    states,
                    actionsConfig as Partial<Record<S, any>>,
                    initialState,
                    this.#ctx.update
                  )
                }

                connectedCallback() {
                  this.#ctx.onUpdate(this.#onUpdateContext)
                  this.#machine.onUpdate((patches: any) => {
                    this.#channel.postMessage({ patches, meta: { tag } })
                  })
                  this.#machine.update(this.#ctx.getSnapshot())
                }

                #onUpdateContext = (patches: JsonPatch[]) => {
                  this.#shadow.dispatchEvent(
                    new CustomEvent("channel", { detail: { patches, meta: { tag } }, bubbles: true, composed: true })
                  )
                }

                updateContext(context: Partial<any>) {
                  const updatedContext = this.#ctx.update(context)
                  if (Object.keys(updatedContext).length === 0) {
                    return
                  }
                  this.#machine.update(updatedContext)
                }

                get currentState() {
                  return this.#machine.currentState
                }
                get isExecuting() {
                  return this.#machine.isExecuting
                }
              }
              if (!customElements.get(elementName)) customElements.define(elementName, WebComponent)
            },
          }
        },
      }
    },
  }
}
