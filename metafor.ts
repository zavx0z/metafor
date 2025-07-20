/**
 * MetaFor - фреймворк для создания актора конечного автомата
 * @packageDocumentation
 */

import { types, createContext } from "./context"
import type { ContextSchema, ContextTypes, ContextInstance, JsonPatch } from "./context"
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
    context<const С extends ContextSchema>(schema: (types: ContextTypes) => С) {
      return {
        /**
         * Создает конечный автомат с состояниями
         * @template S - тип состояний
         * @param states - конфигурация состояний
         */
        states<S extends string>(states: StateConfig<S, С>) {
          class WebComponent extends HTMLElement {
            #ctx: ContextInstance<С>
            #shadow: ShadowRoot
            #machine: Machine<S, С>

            constructor() {
              super()
              this.#ctx = createContext(schema(types))
              this.#shadow = this.attachShadow({ mode: "closed" })

              // Создаем машину состояний
              this.#machine = new Machine(states, Object.keys(states)[0] as S, (values) => {
                // Обновляем контекст через стандартный механизм MetaFor
                return this.#ctx.update(values)
              })
            }

            connectedCallback() {
              this.#ctx.onUpdate(this.#onUpdateContext)

              // Подписываемся на изменения состояния машины
              this.#machine.onUpdate((patches) => {
                this.#shadow.dispatchEvent(
                  new CustomEvent("state-change", {
                    detail: { patches },
                    bubbles: true,
                    composed: true,
                  })
                )
              })
            }

            #onUpdateContext = (patches: JsonPatch[]) => {
              this.#shadow.dispatchEvent(
                new CustomEvent("force", {
                  detail: {
                    patches,
                  },
                  bubbles: true,
                  composed: true,
                })
              )
            }

            /**
             * Обновляет контекст и запускает автоматические переходы машины
             */
            async updateContext(context: any) {
              // Обновляем контекст MetaFor
              this.#ctx.update(context)

              // Запускаем машину состояний
              return await this.#machine.update(context)
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

          // Регистрируем компонент один раз
          if (!customElements.get(elementName)) customElements.define(elementName, WebComponent)
        },
      }
    },
  }
}

// Экспортируем типы и классы для прямого использования
export { Machine } from "./machine"
export type { StateConfig, StateProcess, StateDefinition } from "./machine"
