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
import type { Core, FabricParams, FingerPrint, MetaFor, MetaForConfig, Snapshot } from "./index.t.ts"
import type { ViewDeclaration } from "./view/index.t.ts"
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
  return function MetaFor(name: string, config?: MetaForConfig) {
    const description = config?.description
    const dev = config?.dev ?? globalThis.DEV ?? false
    const persist = config?.persist ?? false
    return {
      context<C extends ContextSchema>(schema: (types: ContextTypes) => C) {
        return {
          states<S extends string>(states: StatesConfig<S, C>) {
            validateNoUnconditionalCycles(states)
            return {
              core<I extends Core>(coreBuilder: ((ref: typeof createRef) => I) | I = () => ({} as I)) {
                const core = typeof coreBuilder === "function" ? coreBuilder(createRef) : coreBuilder
                return {
                  processes(process: ProcessesDeclaration<C, S, I> = () => ({})) {
                    return {
                      reactions(reaction: ReactionsDeclaration<C, S, I> = () => []) {
                        return {
                          view(view?: ViewDeclaration<C, S, I>): string {
                            const fingerPrint: FingerPrint<C, S> = {
                              name,
                              states,
                              context: new Context(schema).snapshot,
                              ...new Processes(process).snapshot,
                              ...(description ? { description } : {}),
                              ...new View(view).snapshot,
                              ...new Reactions(reaction).snapshot,
                            }
                            const hash = store.saveMetaIsNotExists(JSON.stringify(fingerPrint))
                            const tagName = `meta-${hash}`

                            if (!customElements.get(tagName))
                              customElements.define(
                                tagName,
                                class extends HTMLElement {
                                  #meta: string = hash
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
                                    // Индекс текущего актора среди одноименных meta-тегов на уровне
                                    const siblingIndex = this.getIndexAmongSiblings()

                                    // Вычисляем parent_id, проходя по сегментам пути родителя (meta, idx)
                                    let parentId: number | null = null
                                    const parentSegments = this.getPathSegments(false)
                                    if (parentSegments.length > 0) {
                                      try {
                                        for (const seg of parentSegments) {
                                          const parent = store.getActorByComposite(seg.meta, parentId, seg.idx)
                                          if (!parent) {
                                            parentId = null
                                            break
                                          }
                                          parentId = Number(parent.id)
                                        }
                                      } catch (_) {
                                        parentId = null
                                      }
                                    }

                                    this.#store = store.saveActorIsNotExist({
                                      meta: this.#meta,
                                      parent_id: parentId,
                                      idx: siblingIndex,
                                      snapshot: JSON.stringify(this.snapshot),
                                    })
                                    // data-actor-id больше не используется для адресации (см. getter path)
                                    // Попытка восстановления состояния из snapshot стора
                                    try {
                                      if (this.#store?.snapshot) {
                                        const saved = JSON.parse(this.#store.snapshot) as Snapshot<C, S>
                                        // Восстанавливаем состояние
                                        if (saved?.state) {
                                          this.#setState(saved.state as S)
                                        }
                                        // Восстанавливаем значения контекста без генерации сообщений
                                        if (saved?.context) {
                                          const values: Partial<ExtractValues<C>> = {}
                                          for (const [key, def] of Object.entries(saved.context as any)) {
                                            // @ts-ignore
                                            values[key as keyof ExtractValues<C>] = (def as any)?.value
                                          }
                                          // Напрямую обновляем внутренний контекст, чтобы не отправлять события до инициализации
                                          this.#context.update(values as Partial<ExtractValues<C>>)
                                        }
                                      }
                                    } catch (_) {
                                      // игнорируем ошибки десериализации
                                    }
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
                                    this.#sendEvent(initMessage(this.#meta, { index: 0 }, this.snapshot))
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
                                    if (this.#channel) {
                                      this.#channel.close()
                                      this.#channel = null
                                    }
                                  }

                                  /** обновление контекста */
                                  update = (context: Partial<ExtractValues<C>>) => {
                                    const updated = this.#context.update(context)
                                    if (Object.keys(updated).length > 0) {
                                      this.#sendEvent(updateContextMessage(this.#meta, { index: 0 }, updated))
                                      this.#view.render({
                                        state: this.#state,
                                        context: this.#context.getSnapshot(),
                                        core: this.#core,
                                        shadow: this.#shadow,
                                        update: this.update,
                                      })
                                      // Сохраняем актуальный snapshot в store
                                      try {
                                        store.updateActorSnapshot(this.#store.id, JSON.stringify(this.snapshot))
                                      } catch (_) {}
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
                                      this.#broadcastMessage(
                                        stateBeforeActionMessage(this.#meta, { index: 0 }, this.#state)
                                      )
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
                                            this.#broadcastMessage(
                                              stateAfterActionMessage(this.#meta, { index: 0 }, this.#state)
                                            )
                                            this.#setProcess(false)
                                          })
                                      } else {
                                        if (process.success) process.success({ update: this.update, data: result })
                                        this.#broadcastMessage(
                                          stateAfterActionMessage(this.#meta, { index: 0 }, this.#state)
                                        )
                                        this.#setProcess(false)
                                      }
                                    } catch (error) {
                                      if (error instanceof Error) process.error?.({ update: this.update, error })
                                      this.#broadcastMessage(
                                        stateAfterActionMessage(this.#meta, { index: 0 }, this.#state)
                                      )
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
                                            this.#broadcastMessage(
                                              stateAfterActionMessage(this.#meta, { index: 0 }, state as S)
                                            )
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
                                    // Фиксируем состояние после изменений
                                    try {
                                      store.updateActorSnapshot(this.#store.id, JSON.stringify(this.snapshot))
                                    } catch (_) {}
                                  }
                                  #sendEvent = (message: Message) => {
                                    if (!this.#channel) return
                                    this.#channel.postMessage(message)
                                  }

                                  /**
                                   * Получает родительский meta из тега родителя
                                   * @returns meta родительского актора или null, если родителя нет
                                   */
                                  getParentMeta(): string | null {
                                    // 1) Прямой родитель
                                    const parent = this.parentElement
                                    if (parent) {
                                      const tagName = parent.tagName.toLowerCase()
                                      if (tagName.startsWith("meta-")) {
                                        return tagName.substring(5)
                                      }
                                      const parentMetaTag = parent.closest("meta-")
                                      if (parentMetaTag) {
                                        const metaTagName = parentMetaTag.tagName.toLowerCase()
                                        if (metaTagName.startsWith("meta-")) return metaTagName.substring(5)
                                      }
                                    }
                                    // 2) По цепочке ShadowRoot.host (для случаев внутри shadow DOM родителя)
                                    let root: Node | null = this.getRootNode() as Node
                                    while (root && (root as any).host) {
                                      const host = (root as any).host as Element
                                      const hostTag = host.tagName?.toLowerCase?.()
                                      if (hostTag && hostTag.startsWith("meta-")) {
                                        return hostTag.substring(5)
                                      }
                                      root = (host as any).getRootNode?.() as Node
                                    }
                                    return null
                                  }

                                  /**
                                   * Получает идентификатор актора родителя из DOM (через host в shadow DOM)
                                   */
                                  getParentActorId(): number | null {
                                    // Пробуем найти ближайший meta-хост по цепочке ShadowRoot.host
                                    let root: Node | null = this.getRootNode() as Node
                                    while (root && (root as any).host) {
                                      const host = (root as any).host as Element
                                      const hostTag = host.tagName?.toLowerCase?.()
                                      if (hostTag && hostTag.startsWith("meta-")) {
                                        const id = host.getAttribute("data-actor-id")
                                        return id ? Number(id) : null
                                      }
                                      root = (host as any).getRootNode?.() as Node
                                    }
                                    // Вдобавок, проверим прямого родителя на случай корневых акторов в <body>
                                    const parent = this.parentElement
                                    if (parent) {
                                      const tagName = parent.tagName.toLowerCase()
                                      if (tagName.startsWith("meta-")) {
                                        const id = parent.getAttribute("data-actor-id")
                                        return id ? Number(id) : null
                                      }
                                    }
                                    return null
                                  }

                                  /** Индекс среди одноименных meta-тегов на уровне */
                                  getIndexAmongSiblings(): number {
                                    const parent = this.parentElement
                                    if (!parent) return 0
                                    const siblings = Array.from(parent.children).filter(
                                      (child) => child.tagName === this.tagName
                                    )
                                    return siblings.indexOf(this)
                                  }

                                  /** Индекс родителя среди одноименных meta-тегов на его уровне */
                                  getParentIndexAmongSiblings(): number {
                                    const parent = this.parentElement
                                    if (!parent) return 0
                                    const grand = parent.parentElement
                                    if (!grand) return 0
                                    const siblings = Array.from(grand.children).filter(
                                      (child) => child.tagName === parent.tagName
                                    )
                                    return siblings.indexOf(parent)
                                  }

                                  get snapshot(): Snapshot<C, S> {
                                    return {
                                      name: this.#name,
                                      state: this.#state,
                                      states: this.#states,
                                      context: this.#context.snapshot,
                                      ...this.#processes.snapshot,
                                      ...this.#reactions.snapshot,
                                      ...this.#view.snapshot,
                                      ...(this.#description ? { description: this.#description } : {}),
                                    }
                                  }

                                  /** Полный путь от корневого актора в формате: meta:idx/meta:idx/... */
                                  get path(): string {
                                    return this.getPathSegments(true)
                                      .map((s) => `${s.meta}:${s.idx}`)
                                      .join("/")
                                  }

                                  /** Возвращает сегменты пути {meta, idx} от корня до текущего (или до родителя) */
                                  getPathSegments(includeSelf: boolean): Array<{ meta: string; idx: number }> {
                                    const segments: Array<{ meta: string; idx: number }> = []
                                    let host: Element | null = this as unknown as Element
                                    if (!includeSelf) {
                                      // смещаемся на родителя текущего
                                      const root: any = (host as any).getRootNode?.()
                                      host = root && root.host ? (root.host as Element) : host.parentElement
                                    }
                                    while (host) {
                                      const tag = host.tagName?.toLowerCase?.() || ""
                                      if (!tag.startsWith("meta-")) break
                                      const meta = tag.substring(5)
                                      const parent = host.parentElement
                                      let idx = 0
                                      if (parent) {
                                        const siblings = Array.from(parent.children).filter(
                                          (child) => child.tagName === host!.tagName
                                        )
                                        idx = siblings.indexOf(host)
                                      }
                                      segments.unshift({ meta, idx })
                                      const root: any = (host as any).getRootNode?.()
                                      host = root && root.host ? (root.host as Element) : null
                                    }
                                    return segments
                                  }

                                  /** Обработка входящих сообщений для реакций */
                                  #handleReactionMessage = (message: Message) => {
                                    if (!this.#reactions.hasReactions()) return
                                    this.#reactions.run({
                                      context: this.#context.getSnapshot(),
                                      core: this.#core,
                                      meta: message.meta,
                                      actor: message.actor,
                                      timestamp: message.timestamp,
                                      patch: message.patch,
                                      state: this.#state,
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
  } as MetaFor
}
