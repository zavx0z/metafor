/**
 * MetaFor - фреймворк для создания актора конечного автомата
 * @packageDocumentation
 */

import { types, createContext } from "./context"
import type { ContextSchema, ContextTypes, ContextInstance, JsonPatch } from "./context"

/**
 * Основная функция MetaFor
 * Создает экземпляр MetaFor с указанным именем
 * @param tag - имя контекста
 * @returns Объект с методом context для создания типизированного контекста
 *
 * @example
 * ```typescript
 * MetaFor('user').context(types => ({
 *   name: types.string.required('Гость'),
 *   age: types.number.optional()
 * }))
 * ```
 */
export function MetaFor(tag: string) {
  return {
    /**
     * Создает типизированный контекст на основе схемы
     * @template T - схема контекста
     * @param schema - функция, принимающая types и возвращающая схему
     * @returns Объект с контекстом и методом update
     *
     * @example
     * ```typescript
     * const context = MetaFor('user').context(types => ({
     *   name: types.string.required('Гость'),
     *   role: types.enum('user', 'admin').required('user'),
     *   nickname: types.string(),
     *   tags: types.array<string>()
     * }))
     *
     * // context.context.name - string (required)
     * // context.context.role - 'user' | 'admin' (required)
     * // context.context.nickname - string | null (optional)
     * // context.context.tags - string[] | null (optional)
     * ```
     */
    context<const T extends ContextSchema>(schema: (types: ContextTypes) => T): void {
      const elementName = `metafor-${tag}` as const

      class WebComponent extends HTMLElement {
        #ctx: ContextInstance<T>
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
}
