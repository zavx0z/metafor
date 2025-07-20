/**
 * MetaFor - фреймворк для создания актора конечного автомата
 * @packageDocumentation
 */

import { types, createContext } from "./context"
import type { ContextSchema, ContextTypes, ContextInstance, JsonPatch, ExtractValues } from "./context"
import type { StateConfig } from "./machine"
import { Machine } from "./machine"

/**
 * Основная функция MetaFor
 * Создает экземпляр MetaFor с указанным именем
 * @param tag - имя контекста
 */
export function MetaFor(tag: string) {
  const elementName = `metafor-${tag}` as const
  return {
    /**
     * Создает типизированный контекст на основе схемы
     * @template С - схема контекста
     * @param schema - функция, принимающая types и возвращающая схему
     */
    context<const C extends ContextSchema>(schema: (types: ContextTypes) => C) {
      const contextSchema = schema(types)
      return {
        /**
         * Создает конечный автомат с состояниями
         * @template S - тип состояний
         * @param states - конфигурация состояний
         */
        states<S extends string>(states: StateConfig<S, C>) {
          const initialState = Object.keys(states)[0] as S
          class WebComponent extends HTMLElement {
            #ctx: ContextInstance<C>
            #shadow: ShadowRoot
            #machine: Machine<S, C>
            #channel: BroadcastChannel

            constructor() {
              super()
              this.#shadow = this.attachShadow({ mode: "closed" })
              this.#channel = new BroadcastChannel("channel")
              this.#ctx = createContext(contextSchema)
              this.#machine = new Machine(states, initialState, this.#ctx.update)
            }

            connectedCallback() {
              this.#ctx.onUpdate(this.#onUpdateContext)

              // Подписываемся на изменения состояния машины
              this.#machine.onUpdate((patches) => {
                this.#channel.postMessage({ patches, meta: { tag } })
              })
              this.#machine.update(this.#ctx.getSnapshot())
            }

            #onUpdateContext = (patches: JsonPatch[]) => {
              this.#shadow.dispatchEvent(
                new CustomEvent("channel", { detail: { patches, meta: { tag } }, bubbles: true, composed: true })
              )
            }

            /**
             * Обновляет контекст и запускает автоматические переходы машины
             */
            updateContext(context: Partial<ExtractValues<C>>) {
              const updatedContext = this.#ctx.update(context)
              if (Object.keys(updatedContext).length === 0) {
                return
              }
              this.#machine.update(updatedContext)
            }

            /**
             * Получает текущее состояние машины
             */
            get currentState() {
              return this.#machine.currentState
            }

            /**
             * Проверяет, выполняется ли процесс в машине
             */
            get isExecuting() {
              return this.#machine.isExecuting
            }
          }

          if (!customElements.get(elementName)) customElements.define(elementName, WebComponent)
        },
      }
    },
  }
}
