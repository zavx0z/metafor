/**
 * MetaFor - библиотека для создания актора конечного автомата
 * @packageDocumentation
 */

import { types, createContext } from "@zavx0z/context"
import type { ContextSchema, ContextTypes, ContextInstance, JsonPatch } from "@zavx0z/context"

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
    context<const T extends ContextSchema>(schema: (types: ContextTypes) => T): MetaForComponent<T> {
      class WebComponent extends HTMLElement {
        public context: ContextInstance<T>["context"]
        private ctx: ContextInstance<T>

        constructor() {
          super()
          this.ctx = createContext(schema(types))

          this.context = this.ctx.context
        }

        update = (data: Partial<ContextInstance<T>["context"]>) => {
          this.ctx.update(data)
        }

        onUpdate = (callback: (patches: JsonPatch[]) => void) => {
          this.ctx.onUpdate(callback)
        }

        public get schema() {
          return this.ctx.schema
        }
      }
      const elementName = `metafor-${tag}` as const

      // Регистрируем компонент один раз
      if (!customElements.get(elementName)) {
        customElements.define(elementName, WebComponent)
      }

      // Возвращаем конструктор компонента — типы не теряются,
      // при необходимости пользователь может создать экземпляр
      // или использовать `InstanceType<typeof Component>` для получения типа
      return WebComponent as unknown as MetaForComponent<T>
    },
  }
}

// Публичный тип возвращаемого веб-компонента
export type MetaForElement<T extends ContextSchema> = ContextInstance<T> & HTMLElement

// Конструктор компонента, который возвращает MetaForElement<T>
export type MetaForComponent<T extends ContextSchema> = {
  new (): MetaForElement<T>
  readonly prototype: MetaForElement<T>
}
