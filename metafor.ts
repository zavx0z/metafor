/**
 * MetaFor - библиотека для создания актора конечного автомата
 * @packageDocumentation
 */

import { types, createContext } from "@zavx0z/context"
import type { ContextSchema, ContextTypes, ContextInstance } from "@zavx0z/context"

/**
 * Основная функция MetaFor
 * Создает экземпляр MetaFor с указанным именем
 * @param tag - имя контекста
 * @returns Объект с методом context для создания типизированного контекста
 *
 * @example
 * ```typescript
 * const userContext = MetaFor('user').context(types => ({
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
    context<const T extends ContextSchema>(schema: (types: ContextTypes) => T): ContextInstance<T> {
      class WebComponent extends HTMLElement {
        constructor() {
          super()
        }
      }
      customElements.define(`metafor-${tag}`, WebComponent)
      return createContext(schema(types))
    },
  }
}
