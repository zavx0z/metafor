/**
 * Основная реализация MetaFor
 * @module Core
 */

/**
 * MetaFor - фреймворк для создания актора конечного автомата
 *
 * MetaFor предоставляет декларативный способ создания web-компонентов с конечным автоматом.
 * Каждый компонент имеет типизированный контекст, состояния, процессы, реакции и представление.
 *
 * @example
 * ```typescript
 * MetaFor("user-profile")
 *   .context((types) => ({
 *     userId: types.number.required(0),
 *     userName: types.string.required(""),
 *     isLoading: types.boolean.required(false),
 *   }))
 *   .states({
 *     idle: { loading: {} },
 *     loading: { success: {}, error: {} },
 *     success: { idle: {} },
 *     error: { idle: {} },
 *   })
 *   .core({ users: [] })
 *   .processes((process) => ({
 *     loadUser: process()
 *       .action(async ({ context }) => {
 *         const response = await fetch(`/api/users/${context.userId}`)
 *         return await response.json()
 *       })
 *       .success(({ update, data }) => {
 *         update({ userName: data.name, isLoading: false })
 *       })
 *   }))
 *   .view({
 *     render: ({ context, html, update }) => html`
 *       <div>
 *         <h1>${context.userName}</h1>
 *         <button @click=${() => update({ isLoading: true })}>
 *           Загрузить
 *         </button>
 *       </div>
 *     `
 *   })
 * ```
 *
 * @packageDocumentation
 */

import { types, createContext } from "./context"
import type { ContextSchema, ContextInstance, ExtractValues, Update } from "./context"
import { checkTransitionConditions, type StatesConfig } from "./state"
import { createActionsConfig } from "./proc/index.ts"
import type { ProcessesDeclaration, Process } from "./proc/index.t.ts"
import type { Core, Snapshot } from "./metafor.t"
import type { ViewConfig } from "./view/index.t.ts"
import {
  initMessage,
  stateAfterActionMessage,
  stateBeforeActionMessage,
  updateContextMessage,
} from "./message/index.ts"
import type { Message } from "./message/index.ts"
import { html, nothing, render } from "./html/html.ts"
import { validateNoUnconditionalCycles } from "./state"
import { ref } from "./html/directives/ref.ts"
import { repeat } from "./html/directives/repeat.ts"
import { when } from "./html/directives/when.ts"
import { map } from "./html/directives/map.ts"
import { styleMap } from "./html/directives/style-map.ts"
import { ReactionRegistry } from "./react/index"
import type { ReactionsChain } from "./react/index.t.ts"
import type { ContextTypes } from "./context/types.t.ts"
import { isMetaForDebugEnabled } from "./debug/config"
import { choose } from "./html/directives/choose.ts"
import { createRef } from "./html/directives/ref.ts"

// Фабрика логгера с ленивой загрузкой
type Logger = (message: Message, core: Record<string, any>) => void

function createLogger(): Logger {
  if (!isMetaForDebugEnabled()) {
    return () => {} // Пустая функция для продакшена
  }

  let loggerModule: { log: Logger } | null = null
  let loading = false
  const messageQueue: Array<{ message: Message; core: Record<string, any> }> = []

  const loadLogger = async () => {
    if (loggerModule || loading) return

    loading = true
    try {
      loggerModule = await import("./debug/console.js")

      // Обрабатываем накопленные сообщения
      for (const item of messageQueue) {
        loggerModule.log(item.message, item.core)
      }
      messageQueue.length = 0
    } catch (error) {
      console.warn("Failed to load debug logger:", error)
    } finally {
      loading = false
    }
  }

  return (message: Message, core: Record<string, any>) => {
    if (loggerModule) {
      loggerModule.log(message, core)
    } else {
      messageQueue.push({ message, core })
      loadLogger()
    }
  }
}

const log = createLogger()
/**
 * MetaFor — фабрика для создания web-компонента-актора конечного автомата
 * @param tag - уникальный тег web-компонента
 * @returns chain API: context() -> states() -> core() -> processes() -> reactions() -> view()
 */
export function MetaFor(tag: string, config?: { description?: string }) {
  const tagName = `metafor-${tag}` as const
  return {
    /**
     * Регистрирует схему контекста для автомата.
     *
     * Контекст содержит только простые типы данных. Сложные объекты храните в core.
     *
     * @param schema Функция, принимающая types и возвращающая объект-схему контекста
     * @returns chain API для вызова .states(...)
     *
     * @example
     * ```typescript
     * .context((types) => ({
     *   userId: types.number.required(0),
     *   userName: types.string.required("Anonymous"),
     *   selectedIds: types.array.required([]),
     *   isLoading: types.boolean.required(false),
     *   theme: types.enum.required(["light", "dark"]),
     * }))
     * ```
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
            core<I extends Core>(coreBuilder: (ref: typeof createRef) => I = () => ({} as I)) {
              const core = coreBuilder(createRef)
              return {
                /**
                 * Регистрирует процессы автомата для нужных состояний.
                 *
                 * @param process Функция, принимающая process — фабрику chain API для описания процессов.
                 * Возвращает объект, где ключ — имя состояния (только для тех, где нужны процессы), а значение — chain-объект с обработчиками.
                 *
                 * Пример:
                 * ```ts
                 * .actions(process => ({
                 *   guest: process({ title: "guest_process", description: "Процесс для гостя" })
                 *     .action(({ context }) => { ... })
                 *     .success(({ update, data }) => update({ ... }))
                 *     .error(({ update, error }) => update({ ... })),
                 *   // для других состояний можно не указывать процесс, если он не требуется
                 * }))
                 * ```
                 *
                 * @returns Объект с процессами только для нужных состояний
                 */
                processes(process: ProcessesDeclaration<C, S, I> = () => ({})) {
                  const processesRegistry = createActionsConfig<C, S, I>(process)
                  return {
                    /**
                     * Регистрирует карту реакций для автомата.
                     * @param reaction Функция (filter => декларация), где декларация — массив кортежей [string[], { update, filter, title }]
                     * @returns chain API для вызова .view(...)
                     */
                    reactions(reaction: ReactionsChain<C, S> = () => []) {
                      const reactionsRegistry = new ReactionRegistry(reaction)
                      return {
                        view(view?: ViewConfig<C, S, I>) {
                          /**
                           * WebComponent - конечный автомат
                           */
                          class Actor extends HTMLElement {
                            #ctx: ContextInstance<C>
                            #shadow: ShadowRoot
                            #channel: BroadcastChannel | null = null
                            #transitions = states
                            #actions = processesRegistry
                            #reactions = reactionsRegistry
                            #core: I = {} as I
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
                              this.#ctx = createContext(contextSchema)
                              this.#core = core
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
                              this.#updateView()
                              this.setAttribute("state", this.#state)
                              this.#channel = new BroadcastChannel("channel")
                              requestAnimationFrame(this.#init.bind(this))
                            }

                            #init() {
                              if (this.#reactions.hasReactions()) {
                                if (this.#channel)
                                  this.#channel.onmessage = (ev) => this.#handleReactionMessage(ev.data)
                                this.addEventListener("channel", this.#reactionHandler)
                              }
                              this.#sendEvent(initMessage(tag, this.getSnapshot()))
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
                              if (view?.onMount) view.onMount()
                            }

                            disconnectedCallback() {
                              this.removeEventListener("channel", this.#reactionHandler)
                            }

                            #reactionHandler = (ev: Event) => {
                              const detail = (ev as CustomEvent).detail
                              if (detail?.meta?.tag === tag) return
                              this.#handleReactionMessage(detail)
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
                                const result = process.action({
                                  context: this.#ctx.getSnapshot(),
                                  core: this.#core,
                                  element: this,
                                })
                                if (result instanceof Promise) {
                                  this.#broadcastMessage(stateBeforeActionMessage(tag, this.#state))
                                  result
                                    .then((data) => {
                                      if (process.success) process.success({ update: this.update, data })
                                    })
                                    .catch((error) => {
                                      if (process.error) process.error({ update: this.update, error })
                                      else
                                        throw new Error(
                                          `Обработчик ошибки не найден для состояния: ${this.#state} \n ${error}`
                                        )
                                    })
                                    .finally(() => {
                                      this.#broadcastMessage(stateAfterActionMessage(tag, this.#state))
                                      this.#setProcess(false)
                                    })
                                } else {
                                  if (process.success) process.success({ update: this.update, data: result })
                                  this.#broadcastMessage(stateAfterActionMessage(tag, this.#state))
                                  this.#setProcess(false)
                                }
                              } catch (error) {
                                if (error instanceof Error) process.error?.({ update: this.update, error })
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
                                this.#sendEvent(updateContextMessage(tag, updated))
                                this.#updateView()
                              }
                              return updated
                            }

                            /**
                             * - выполняет переходы с установкой состояния
                             * - запускает процесс если есть
                             * - отправляет сообщение состояния если нет процесса (MSG)
                             */
                            #transition = () => {
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
                                    this.#channel && this.#channel.postMessage(stateAfterActionMessage(tag, state as S))
                                  }
                                  break
                                }
                              }
                            }
                            #broadcastMessage = (message: Message) => {
                              if (!this.#channel) return
                              this.#channel.postMessage(message)
                              this.#updateView()
                              if (isMetaForDebugEnabled()) log(message, {})
                            }
                            #sendEvent = (message: Message) => {
                              if (!this.#channel) return
                              this.#channel.postMessage(message)
                              // this.#shadow.dispatchEvent(
                              //   new CustomEvent("channel", {
                              //     detail: message,
                              //     bubbles: true,
                              //     cancelable: false,
                              //     composed: true,
                              //   })
                              // )
                              if (isMetaForDebugEnabled()) log(message, {})
                            }
                            #updateView = () => {
                              if (!view?.render) return
                              const template = view.render({
                                state: this.#state,
                                context: this.#ctx.getSnapshot(),
                                core: this.#core,
                                update: this.update,
                                style: styleMap,
                                html,
                                ref,
                                repeat,
                                when,
                                map,
                                nothing,
                                choose,
                              })
                              if (template) render(template, this.#shadow)
                            }
                            getSnapshot(): Snapshot<C, S> {
                              return {
                                state: this.#state,
                                states: this.#transitions,
                                context: this.#ctx.getSnapshot(),
                                schema: this.#ctx.schema,
                              }
                            }

                            /**
                             * Обработка входящих сообщений для реакций
                             */
                            #handleReactionMessage = (message: Message) => {
                              if (!this.#reactions.hasReactions()) return
                              const { meta, patch } = message
                              const state = this.#state as S
                              this.#reactions.run({
                                context: this.#ctx.getSnapshot(),
                                core: this.#core,
                                meta,
                                patch,
                                state,
                                update: this.update,
                              })
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
        },
      }
    },
  }
}
