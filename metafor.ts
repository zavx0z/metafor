/**
 * MetaFor - фреймворк для создания актора конечного автомата
 * @packageDocumentation
 */

import { types, createContext } from "./context"
import type { ContextSchema, ContextTypes, ContextInstance, JsonPatch } from "./context"
import type { StateConfig } from "./states"

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

            constructor() {
              super()
              this.#ctx = createContext(schema(types))
              this.#shadow = this.attachShadow({ mode: "closed" })
            }

            connectedCallback() {
              this.#ctx.onUpdate(this.#onUpdateContext)
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
          }

          // Регистрируем компонент один раз
          if (!customElements.get(elementName)) customElements.define(elementName, WebComponent)
        },
      }
    },
  }
}
