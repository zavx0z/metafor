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
 * **ВАЖНО: Акторы MetaFor имеют полную изоляцию и используют shadow-dom closed**
 * Прямой доступ к акторам через экспорты не нужен и не рекомендуется
 * Все взаимодействия между акторами происходят через патчи в сообщениях
 * Акторы регистрируются автоматически при импорте файла, экспорт не требуется
 * Используйте систему сообщений и реакций для связи между компонентами
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

import { Context, type ContextSchema, type ExtractValues } from "./context"
import { checkTransitionConditions, type StatesConfig, validateNoUnconditionalCycles } from "./state"
import type { Process, ProcessesDeclaration } from "./proc/index.t.ts"
import type { Core, FabricParams, FingerPrint, MetaForConfig, Snapshot } from "./index.t.ts"
import type { ViewConfig } from "./view/index.t.ts"
import type { ReactionsDeclaration } from "./react/index.t.ts"
import type { ContextTypes } from "./context/types.t.ts"
import { createRef } from "./html/directives"
import type { ActorStore } from "./store/index.t.ts"
import { Processes } from "./proc/index.ts"
import { Reactions } from "./react/index.ts"
import { View } from "./view/index.ts"
import {
  initMessage,
  stateAfterActionMessage,
  stateBeforeActionMessage,
  updateContextMessage,
  type Message,
} from "./message/index.ts"

export type { Core, FabricParams, Snapshot }

export function MetaForFabric(params: FabricParams) {
  const { store } = params
  /**
   * MetaFor — фабрика для создания web-компонента-актора конечного автомата
   * @param name - имя актора (участвует в формировании хеша, но не является итоговым тегом)
   * @returns chain API: context() -> states() -> core() -> processes() -> reactions() -> view()
   *
   * **Важно:** Итоговый тег компонента формируется автоматически как `meta-<hash>`,
   * где hash — это MD5 хеш от всей конфигурации компонента.
   */
  return function MetaFor(name: string, config?: MetaForConfig) {
    const description = config?.description
    const dev = config?.dev ?? globalThis.DEV ?? false
    const persist = config?.persist ?? false
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
            return {
              /**
               * Регистрирует core объект для автомата.
               *
               * Core - это простой объект с данными, используемыми во всех состояниях.
               * Сложные объекты и структуры данных храните в core.
               * Core доступен во всех процессах и реакциях.
               *
               * @param coreBuilder - функция, принимающая ref и возвращающая core объект, или сам core объект
               * @returns chain API для вызова .processes(...)
               *
               * @example
               * ```typescript
               * // Вариант 1: Функция с ref
               * .core((ref) => ({
               *   users: [],
               *   api: ref('api'),
               *   logger: ref('logger')
               * }))
               *
               * // Вариант 2: Простой объект
               * .core({
               *   users: [],
               *   settings: { theme: 'dark' },
               *   cache: new Map()
               * })
               * ```
               */
              core<I extends Core>(coreBuilder: ((ref: typeof createRef) => I) | I = () => ({} as I)) {
                const core = typeof coreBuilder === "function" ? coreBuilder(createRef) : coreBuilder
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
                    return {
                      /**
                       * Регистрирует карту реакций для автомата.
                       *
                       * **ВАЖНО: Реакции предназначены для реагирования на события других акторов, а не на собственные изменения состояния.**
                       * Для управления собственными переходами состояний используйте процессы и их success/error обработчики.
                       * Реакции связывают разные акторы в событийной архитектуре.
                       *
                       * @param reaction Функция (filter => декларация), где декларация — массив кортежей [string[], { update, filter, title }]
                       * @returns chain API для вызова .view(...)
                       *
                       * @example
                       * ```typescript
                       * // Правильно: реакция на события другого актора
                       * .reactions(reaction => [
                       *   ["idle", "loading"], // Состояния, в которых активна реакция
                       *   {
                       *     filter: (args) => args.meta.tag === "roadmap" && args.patch.op === "replace",
                       *     update: ({ update, context, patch }) => {
                       *       update({
                       *         lastMessage: patch.value,
                       *         messageCount: context.messageCount + 1
                       *       })
                       *     },
                       *     title: "Обработка сообщений от roadmap актора"
                       *   }
                       * ])
                       *
                       * // Неправильно: реакция на собственные изменения
                       * // Вместо этого используйте процессы и их success/error обработчики
                       * ```
                       */
                      reactions(reaction: ReactionsDeclaration<C, S, I> = () => []) {
                        return {
                          /**
                           * Регистрирует представление компонента и завершает конфигурацию.
                           *
                           * @param view Конфигурация представления с render и style функциями
                           * @returns Хеш компонента для создания элемента с тегом `meta-<hash>`
                           *
                           * @example
                           * ```typescript
                           * const hash = MetaFor("my-component")
                           *   .context(...)
                           *   .states(...)
                           *   .core(...)
                           *   .processes(...)
                           *   .reactions(...)
                           *   .view({
                           *     render: ({ context, html }) => html`<div>${context.title}</div>`,
                           *     style: ({ css }) => css`.container { color: blue; }`
                           *   })
                           *
                           * // Создание элемента с полученным хешем
                           * document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
                           * ```
                           */
                          view(view?: ViewConfig<C, S, I>): string {
                            const fingerPrint: FingerPrint<C, S> = {
                              name,
                              ...(description ? { description } : {}),
                              states,
                              processes: new Processes(process).toSnapshot(),
                              reactions: new Reactions(reaction).toSnapshot(),
                              context: new Context(schema).snapshot,
                              ...new View(view).snapshot,
                            }
                            const hash = store.saveMetaIsNotExists(JSON.stringify(fingerPrint))
                            const tagName = `meta-${hash}`

                            if (!customElements.get(tagName))
                              customElements.define(
                                tagName,
                                class extends HTMLElement {
                                  #tag: string = hash
                                  #store!: ActorStore

                                  #context: Context<C>
                                  #states: StatesConfig<S, C>
                                  #core: I
                                  #processes: Processes<C, S, I>
                                  #reactions: Reactions<C, S, I>
                                  #view: View<C, S, I>

                                  #env = "browser"
                                  #name = name
                                  #description = description

                                  #shadow: ShadowRoot
                                  #channel: BroadcastChannel | null = null
                                  /** ------------state-------------------------------- */
                                  #state: S = Object.keys(states)[0] as S
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
                                      this.#transition()
                                    }
                                  }
                                  /** ------------process-------------------------------- */
                                  constructor() {
                                    super()
                                    this.#shadow = this.attachShadow({ mode: "closed" })

                                    this.#context = new Context(schema)
                                    this.#states = states
                                    this.#core = core
                                    this.#processes = new Processes(process)
                                    this.#reactions = new Reactions(reaction)
                                    this.#view = new View(view)
                                    this.#view.attachStyles(this.#shadow)
                                  }
                                  /** @internal обновление ядра */
                                  __updCore = (value: Partial<I>) =>
                                    Object.entries(value).forEach(([key, val]) => (this.#core[key as keyof I] = val))

                                  connectedCallback() {
                                    this.#store = store.saveActorIsNotExist({
                                      meta_tag: this.#tag,
                                      parent_id: null,
                                      idx: 0,
                                      snapshot: JSON.stringify(this.snapshot),
                                    })
                                    this.#view.render({
                                      state: this.#state,
                                      context: this.#context.getSnapshot(),
                                      core: this.#core,
                                      shadow: this.#shadow,
                                      update: this.update,
                                    })
                                    this.setAttribute("state", this.#state)
                                    this.#channel = new BroadcastChannel("channel")
                                    requestAnimationFrame(this.#init)
                                  }

                                  #init = () => {
                                    if (this.#reactions.hasReactions() && this.#channel)
                                      this.#channel.onmessage = (ev) => this.#handleReactionMessage(ev.data)
                                    this.#sendEvent(initMessage(this.#tag, this.snapshot))
                                    const transition = this.#states[this.#state]
                                    if (transition) {
                                      const process = this.#processes.getProcess(this.#state)
                                      if (process) {
                                        this.#setProcess(true)
                                        this.#executeAction(process)
                                        this.#transition()
                                      } else {
                                        this.#transition()
                                      }
                                    }
                                    this.#view.onMount({ core: this.#core })
                                  }

                                  disconnectedCallback() {
                                    this.#view.onDestroy({ core: this.#core })
                                  }

                                  /** обновление контекста */
                                  update = (context: Partial<ExtractValues<C>>) => {
                                    const updated = this.#context.update(context)
                                    if (Object.keys(updated).length > 0) {
                                      this.#sendEvent(updateContextMessage(this.#tag, updated))
                                      this.#view.render({
                                        state: this.#state,
                                        context: this.#context.getSnapshot(),
                                        core: this.#core,
                                        shadow: this.#shadow,
                                        update: this.update,
                                      })
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
                                      this.#broadcastMessage(stateBeforeActionMessage(this.#tag, this.#state))
                                      const result = process.action({
                                        context: this.#context.getSnapshot(),
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
                                                throw Error(
                                                  `Передан неизвестный тип ошибки в состоянии: ${this.#state}`,
                                                  error
                                                )
                                              }
                                            } else
                                              throw Error(
                                                `Обработчик ошибки не найден для состояния: ${this.#state} \n ${error}`
                                              )
                                          })
                                          .finally(() => {
                                            this.#broadcastMessage(stateAfterActionMessage(this.#tag, this.#state))
                                            this.#setProcess(false)
                                          })
                                      } else {
                                        if (process.success) process.success({ update: this.update, data: result })
                                        this.#broadcastMessage(stateAfterActionMessage(this.#tag, this.#state))
                                        this.#setProcess(false)
                                      }
                                    } catch (error) {
                                      if (error instanceof Error) process.error?.({ update: this.update, error })
                                      this.#broadcastMessage(stateAfterActionMessage(this.#tag, this.#state))
                                      this.#setProcess(false)
                                    }
                                  }

                                  /**
                                   * - выполняет переходы с установкой состояния
                                   * - запускает процесс если есть
                                   * - отправляет сообщение состояния если нет процесса (MSG)
                                   */
                                  #transition = () => {
                                    const transition = this.#states[this.#state]
                                    if (!transition) return
                                    for (const [state, conditions] of Object.entries(transition)) {
                                      if (checkTransitionConditions(conditions, this.#context.getSnapshot())) {
                                        const process = this.#processes.getProcess(state as S)
                                        if (this.#process) return
                                        if (process) {
                                          this.#setProcess(true)
                                          this.#setState(state as S)
                                          this.#executeAction(process)
                                        } else {
                                          this.#setState(state as S)
                                          this.#channel &&
                                            this.#broadcastMessage(stateAfterActionMessage(this.#tag, state as S))
                                          if (!this.#process) this.#transition()
                                        }
                                        break
                                      }
                                    }
                                  }
                                  #broadcastMessage = (message: Message) => {
                                    if (!this.#channel) return
                                    this.#channel.postMessage(message)
                                    this.#view.render({
                                      state: this.#state,
                                      context: this.#context.getSnapshot(),
                                      core: this.#core,
                                      shadow: this.#shadow,
                                      update: this.update,
                                    })
                                  }
                                  #sendEvent = (message: Message) => {
                                    if (!this.#channel) return
                                    this.#channel.postMessage(message)
                                  }
                                  get snapshot(): Snapshot<C, S> {
                                    return {
                                      name: this.#name,
                                      state: this.#state,
                                      states: this.#states,
                                      context: this.#context.snapshot,
                                      ...this.#view.snapshot,
                                      ...(this.#description ? { description: this.#description } : {}),
                                      ...(this.#processes.size > 0 ? { processes: this.#processes.toSnapshot() } : {}),
                                      ...(this.#reactions.hasReactions()
                                        ? { reactions: this.#reactions.toSnapshot() }
                                        : {}),
                                    }
                                  }

                                  /** Обработка входящих сообщений для реакций */
                                  #handleReactionMessage = (message: Message) => {
                                    if (!this.#reactions.hasReactions()) return
                                    const { meta, patch } = message
                                    const state = this.#state as S
                                    this.#reactions.run({
                                      context: this.#context.getSnapshot(),
                                      core: this.#core,
                                      meta,
                                      patch,
                                      state,
                                      update: this.update,
                                    })
                                  }
                                }
                              )
                            return hash
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
}
