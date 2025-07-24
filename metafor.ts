/**
 * MetaFor - фреймворк для создания актора конечного автомата
 * @packageDocumentation
 */
window.MetaFor = MetaFor
const debug = window.debugMetaFor
let log: (message: Message, core: Record<string, any>) => void = (message, core) => void {}
if (debug) log = (await import("./debug/console.js")).log

import { types, createContext } from "./context"
import type { ContextSchema, ContextTypes, ContextInstance, ExtractValues } from "./context"
import { checkTransitionConditions, type StatesConfig } from "./transition"
import { createActionsConfig, type Builder, type Process } from "./actions"
import type { Snapshot, ViewConfig } from "./metafor.t"
import { initMessage, stateAfterActionMessage, stateBeforeActionMessage, updateContextMessage } from "./message"
import type { Message } from "./message"
import { html, render } from "./html/html.ts"
import { validateNoUnconditionalCycles } from "./validator"
import { ref } from "./html/directives/ref.ts"

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
        states<S extends string>(states: StatesConfig<S, C>) {
          validateNoUnconditionalCycles(states)
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
              return {
                view(view?: ViewConfig<C, S>) {
                  /**
                   * WebComponent - конечный автомат
                   */
                  class Actor extends HTMLElement {
                    #ctx: ContextInstance<C>
                    #shadow: ShadowRoot
                    #channel: BroadcastChannel
                    #transitions = states
                    #actions = actionsConfig
                    /** ------------state-------------------------------- */
                    #state: S = initialState
                    #setState(state: S) {
                      this.setAttribute("state", state)
                      this.#state = state
                    }
                    /** ------------process-------------------------------- */
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
                        stateAfterActionMessage(tag, this.#state)
                        this.#transition()
                      }
                    }
                    /** ------------process-------------------------------- */
                    constructor() {
                      super()
                      this.#shadow = this.attachShadow({ mode: "closed" })
                      this.#channel = new BroadcastChannel("channel")
                      this.#ctx = createContext(contextSchema)
                      view?.style?.({
                        css: (strings, ...values) => {
                          const sheet = new CSSStyleSheet()
                          const result = strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "")
                          sheet.replaceSync(result)
                          this.#shadow.adoptedStyleSheets.push(sheet)
                          return sheet
                        },
                      })
                    }

                    connectedCallback() {
                      this.#sendEvent(initMessage(tag, this.getSnapshot()))
                      this.setAttribute("state", this.#state)
                      /** нужен для запуска процесса при подключении компонента
                       * - выполняет процесс текущего состояния, если есть
                       * - выполняет переходы
                       */
                      const transition = this.#transitions[this.#state]
                      if (transition) {
                        const process = this.#actions[this.#state]
                        if (process) {
                          this.#setProcess(true)
                          this.#executeAction(process)
                          this.#transition()
                        } else {
                          this.#transition()
                        }
                      }

                      this.#ctx.onUpdate((updated) => {
                        this.#sendEvent(updateContextMessage(tag, updated))
                        this.#updateView()
                      })
                      this.#updateView()
                      if (view?.onMount) view.onMount()
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
                    #executeAction(process: Process<C>) {
                      try {
                        const result = process.action({ context: this.#ctx.getSnapshot() })
                        if (result instanceof Promise) {
                          this.#broadcastMessage(stateBeforeActionMessage(tag, this.#state))
                          result
                            .then((data) => {
                              process.success?.({ update: this.#ctx.update, data })
                            })
                            .catch((error) => {
                              if (process.error) process.error({ update: this.#ctx.update, error })
                              else
                                throw new Error(`Обработчик ошибки не найден для состояния: ${this.#state} \n ${error}`)
                            })
                            .finally(() => {
                              this.#broadcastMessage(stateAfterActionMessage(tag, this.#state))
                              this.#setProcess(false)
                            })
                        } else {
                          if (process.success) process.success({ update: this.#ctx.update, data: result })
                          else throw new Error(`Обработчик успеха не найден для состояния: ${this.#state} \n ${result}`)
                          this.#broadcastMessage(stateAfterActionMessage(tag, this.#state))
                          this.#setProcess(false)
                        }
                      } catch (error) {
                        if (error instanceof Error) process.error?.({ update: this.#ctx.update, error })
                        this.#broadcastMessage(stateAfterActionMessage(tag, this.#state))
                        this.#setProcess(false)
                      }
                    }

                    /**
                     * - обновляет контекст
                     */
                    update = (context: Partial<ExtractValues<C>>) => {
                      const updated = this.#ctx.update(context)
                      if (Object.keys(updated).length > 0) {
                        // this.#sendEvent(updateContextMessage(tag, updated))
                      }
                      return updated
                    }

                    /**
                     * - выполняет переходы с установкой состояния
                     * - запускает процесс если есть
                     * - отправляет сообщение состояния если нет процесса (MSG)
                     */
                    #transition() {
                      const transition = this.#transitions[this.#state]
                      if (!transition) return
                      for (const [state, conditions] of Object.entries(transition)) {
                        if (checkTransitionConditions(conditions, this.#ctx.getSnapshot())) {
                          const process = this.#actions[state as S]
                          if (process) {
                            this.#setProcess(true)
                            this.#setState(state as S)
                            this.#executeAction(process)
                          } else {
                            this.#setState(state as S)
                            this.#channel.postMessage(stateAfterActionMessage(tag, state as S))
                          }
                          break
                        }
                      }
                    }
                    #broadcastMessage(message: Message) {
                      this.#channel.postMessage(message)
                      if (debug) log(message, {})
                    }
                    #sendEvent(message: Message) {
                      this.#shadow.dispatchEvent(
                        new CustomEvent("channel", { detail: message, bubbles: true, composed: true })
                      )
                      if (debug) log(message, {})
                    }
                    #updateView = () => {
                      if (!view?.render) return
                      const template = view.render({
                        context: this.#ctx.getSnapshot(),
                        html,
                        update: this.#ctx.update,
                        state: this.#state,
                        ref: ref,
                      })
                      if (template) render(template, this.#shadow)
                    }
                    getSnapshot(): Snapshot<C, S> {
                      return {
                        state: this.#state,
                        states: this.#transitions,
                        context: this.#ctx.getSnapshot(),
                        schema: this.#ctx.schema,
                        // actions: actionsConfig,
                      }
                    }
                  }
                  if (!customElements.get(tagName)) customElements.define(tagName, Actor)
                },
              }
            },
          }
        },
      }
    },
  }
}

// Экспортируем MetaFor в глобальную область
;(globalThis as any).MetaFor = MetaFor
