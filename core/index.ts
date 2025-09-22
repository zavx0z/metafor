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
;(globalThis as any).MetaFor = MetaFor

import { Context, type Schema, type Types, type Values, type Update } from "@zavx0z/context"
import { checkTransition, type StatesConfig, validateNoUnconditionalCycles } from "./state"
import { Processes, type Process, type ProcessesDeclaration } from "./proc"
import { Reactions, type ReactionsDeclaration } from "./react"
import { extractCSSTemplateLiteral, View, type ViewDeclaration } from "./view"

import {
  initMessage,
  stateAfterActionMessage,
  stateBeforeActionMessage,
  updateContextMessage,
  type Message,
} from "./message"

import type { Core, FabricParams, FingerPrint, MetaForType, MetaForConfig, Snapshot } from "./index.t"
import type { Conditions, Transitions } from "./state/index.t"

function MetaFor(name: string, config?: MetaForConfig) {
  const description = config?.description
  const dev = config?.dev ?? globalThis.DEV ?? false
  const persist = config?.persist ?? false
  return {
    context<C extends Schema>(schema: (types: Types) => C) {
      return {
        states<S extends string>(states: StatesConfig<S, C>) {
          validateNoUnconditionalCycles(states)
          return {
            core<I extends Core>(coreBuilder: (() => I) | I = () => ({}) as I) {
              const core = typeof coreBuilder === "function" ? coreBuilder() : coreBuilder
              return {
                processes(process: ProcessesDeclaration<C, S, I> = () => ({})) {
                  return {
                    reactions(reaction: ReactionsDeclaration<C, S, I> = () => []) {
                      return {
                        view(view?: ViewDeclaration<C, I, S>): FingerPrint<C, S> {
                          const fingerprint: FingerPrint<C, S> = {
                            name,
                            states,
                            context: new Context(schema).snapshot,
                            ...new Processes(process).snapshot,
                            ...(description ? { description } : {}),
                          }
                          if (view && "style" in view) fingerprint.style = extractCSSTemplateLiteral(view.style)
                          console.log(fingerprint)
                          return fingerprint
                          // return {
                          //   name,
                          //   states,
                          //   context: new Context(schema).snapshot,
                          //   ...new Processes(process).snapshot,
                          //   ...(description ? { description } : {}),
                          //   ...new View(view).snapshot,
                          //   ...new Reactions(reaction).snapshot,
                          // }
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

export function MetaForFabric(params: FabricParams) {
  const { store } = params

  if (!customElements.get("meta-for")) {
    customElements.define(
      "meta-for",
      class extends HTMLElement {
        #shadow: ShadowRoot
        constructor() {
          super()
          this.#shadow = this.attachShadow({ mode: "closed" })
        }
        async connectedCallback() {
          const moduleId = this.getAttribute("class")
          if (!moduleId) console.warn(`Class: ${moduleId} is not defined`)
          else {
            const module = await store.import(moduleId, false)
            if (!module) console.error(`Module: ${moduleId} is not defined`)
            else {
              // console.log(module.default)
              const { context, style, reactions, states, render } = module.default as FingerPrint<any, any>
              console.log({ context, style, reactions, states, render })
            }
          }
        }
      }
    )
  }
}

// class Actor<C extends Schema, S extends string, I extends Core> {
//   __path: string[] = []
//   #meta: string = hash
//   // #store!: ActorStore

//   #context: Context<C>
//   #states: StatesConfig<S, C>
//   #core: I
//   #processes: Processes<C, S, I>
//   #reactions: Reactions<C, S, I>
//   #view: View<C, I, S>

//   #name = name
//   #description = description
//   #shadow: ShadowRoot
//   #channel: BroadcastChannel | null = null
//   /** ------------state-------------------------------- */
//   #state: S = Object.keys(states)[0] as S
//   #setState(state: S) {
//     this.setAttribute("state", state)
//     this.#state = state
//   }
//   /** ------------process-------------------------------- */
//   /** индикатор выполнения процесса */
//   #process: boolean = false
//   /**
//    * 1. устанавливает состояние процесса
//    * 2. при отключении процесса (после завершения действия)
//    *  - обновляет контекст
//    *  - выполняет переходы
//    */
//   #setProcess(process: boolean) {
//     if (this.#process === process) return
//     this.#process = process
//     if (!process) {
//       this.#transition()
//     }
//   }
//   /** ------------process-------------------------------- */
//   constructor() {
//     super()
//     this.#shadow = this.attachShadow({ mode: "closed" })
//     this.#context = new Context(schema)
//     this.#states = states
//     this.#core = core
//     this.#processes = new Processes(process)
//     this.#reactions = new Reactions(reaction)
//     this.#view = new View(view, [])
//     this.#view.attachStyles(this.#shadow)
//   }
//   /** обновление ядра */
//   __updCore = (value: Partial<I>) => {
//     if (!value) return
//     Object.entries(value).forEach(([key, val]) => (this.#core[key as keyof I] = val))
//   }
//   connectedCallback() {
//     // this.#store = store.saveActorIsNotExist({
//     //   meta: this.#meta,
//     //   parent_id: null,
//     //   idx: 0,
//     //   snapshot: JSON.stringify(this.snapshot),
//     // })
//     this.#view.render({
//       state: this.#state,
//       context: this.#context.context,
//       core: this.#core,
//       container: this.#shadow,
//       update: this.update,
//     })
//     this.setAttribute("state", this.#state)
//     this.#channel = new BroadcastChannel("channel")
//     requestAnimationFrame(this.#init)
//   }

//   #init = () => {
//     if (this.#reactions.hasReactions() && this.#channel)
//       this.#channel.onmessage = (ev) => this.#handleReactionMessage(ev.data)
//     this.#sendEvent(initMessage(this.#meta, { index: 0 }, this.snapshot, this.__path))
//     const transition = this.#states[this.#state]
//     if (transition) {
//       const process = this.#processes.getProcess(this.#state)
//       if (process) {
//         this.#setProcess(true)
//         this.#executeAction(process)
//         this.#transition()
//       } else {
//         this.#transition()
//       }
//     }
//     this.#view.onMount({ core: this.#core })
//   }

//   disconnectedCallback() {
//     this.#view.onDestroy({ core: this.#core })
//   }

//   /** обновление контекста */
//   update = (context: Partial<Values<C>>): Partial<Values<C>> => {
//     const updated = this.#context.update(context as any)
//     if (Object.keys(updated).length > 0) {
//       this.#sendEvent(updateContextMessage(this.#meta, { index: 0 }, updated))
//       // this.#view.render({
//       //   state: this.#state,
//       //   context: this.#context.getSnapshot(),
//       //   core: this.#core,
//       //   container: this.#shadow,
//       //   update: this.update,
//       // })
//     }
//     return updated
//   }
//   /**
//    * - выполняет действие, устанавливая состояние процесса в true
//    * - после успешной обработки действия, если есть success, то обновляет контекст
//    * - после ошибки в обработке действия, если есть error, то обновляет контекст
//    * - после завершения действия, устанавливает состояние процесса в false
//    * - отправляет сообщение о состоянии процесса в канал (MSG)
//    *
//    * @param process - конфигурация процесса состояния
//    * @throws {Error} - если обработчик ошибки не найден
//    */
//   #executeAction = (process: Process<C, I>) => {
//     try {
//       this.#broadcastMessage(stateBeforeActionMessage(this.#meta, { index: 0 }, this.#state))
//       const result = process.action({
//         context: this.#context.context,
//         core: this.#core,
//         element: this,
//       })
//       if (result instanceof Promise) {
//         result
//           .then((data) => {
//             if (process.success) process.success({ update: this.update, data })
//           })
//           .catch((error) => {
//             if (process.error) {
//               if (error instanceof Error) {
//                 process.error({ update: this.update, error })
//               } else if (typeof error === "string") {
//                 process.error({ update: this.update, error: new Error(error) })
//               } else {
//                 throw new Error(`Передан неизвестный тип ошибки в состоянии: ${this.#state}`)
//               }
//             } else throw new Error(`Обработчик ошибки не найден для состояния: ${this.#state} \n ${error}`)
//           })
//           .finally(() => {
//             this.#broadcastMessage(stateAfterActionMessage(this.#meta, { index: 0 }, this.#state))
//             this.#setProcess(false)
//           })
//       } else {
//         if (process.success) process.success({ update: this.update, data: result })
//         this.#broadcastMessage(stateAfterActionMessage(this.#meta, { index: 0 }, this.#state))
//         this.#setProcess(false)
//       }
//     } catch (error) {
//       if (error instanceof Error) process.error?.({ update: this.update, error })
//       this.#broadcastMessage(stateAfterActionMessage(this.#meta, { index: 0 }, this.#state))
//       this.#setProcess(false)
//     }
//   }

//   /**
//    * - выполняет переходы с установкой состояния
//    * - запускает процесс если есть
//    * - отправляет сообщение состояния если нет процесса (MSG)
//    */
//   #transition = () => {
//     const transition: Transitions<S, C> = this.#states[this.#state]
//     if (!transition) return
//     for (const [state, conditions] of Object.entries(transition)) {
//       if (checkTransition(conditions as Conditions<C>, this.#context.context)) {
//         const process = this.#processes.getProcess(state as S)
//         if (this.#process) return
//         if (process) {
//           this.#setProcess(true)
//           this.#setState(state as S)
//           this.#executeAction(process)
//         } else {
//           this.#setState(state as S)
//           this.#channel && this.#broadcastMessage(stateAfterActionMessage(this.#meta, { index: 0 }, state as S))
//           if (!this.#process) this.#transition()
//         }
//         break
//       }
//     }
//   }
//   #broadcastMessage = (message: Message) => {
//     if (!this.#channel) return
//     this.#channel.postMessage(message)
//     this.#view.render({
//       state: this.#state,
//       context: this.#context.context,
//       core: this.#core,
//       container: this.#shadow,
//       update: this.update,
//     })
//   }
//   #sendEvent = (message: Message) => {
//     if (!this.#channel) return
//     this.#channel.postMessage(message)
//   }

//   get snapshot(): Snapshot<C, S> {
//     return {
//       name: this.#name,
//       state: this.#state,
//       process: this.#process,
//       states: this.#states,
//       context: this.#context.snapshot,
//       ...this.#processes.snapshot,
//       ...this.#reactions.snapshot,
//       ...this.#view.snapshot,
//       ...(this.#description ? { description: this.#description } : {}),
//     }
//   }

//   /** Обработка входящих сообщений для реакций */
//   #handleReactionMessage = (message: Message) => {
//     if (!this.#reactions.hasReactions()) return
//     for (const patch of message.patches) {
//       this.#reactions.run({
//         context: this.#context.context,
//         core: this.#core,
//         meta: message.meta,
//         actor: message.actor,
//         timestamp: message.timestamp,
//         patch,
//         state: this.#state,
//         update: this.update,
//       })
//     }
//   }
// }
