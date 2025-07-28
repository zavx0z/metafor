/**
 * Модуль для создания типизированных контекстов и схем параметров
 * @packageDocumentation
 */
import { types } from "./types"

import type { ContextSchema } from "./types.t"
import type { ExtractValues, UpdateValues, ContextInstance, SerializedSchema, Update, OnUpdate } from "./index.t"

export { types }
export type { ContextSchema, SerializedSchema, ExtractValues, UpdateValues, ContextInstance, Update, OnUpdate }

/**
 * Класс для работы с типизированными контекстами.
 * Позволяет создавать, читать, обновлять и клонировать контекст на основе схемы.
 *
 * @typeParam T - Схема контекста (ContextSchema)
 *
 * @example
 * const schema = {name: types.string.required()}
 * const ctx = new Context(schema)
 * ctx.context // доступ к значениям
 * ctx.update({name: 'Новое имя'})
 */
export class Context<C extends ContextSchema> implements ContextInstance<C> {
  /** @internal */
  private contextData: ExtractValues<C>
  /** @internal */
  private immutableContext: ExtractValues<C> & { _title: Record<keyof C, string> }
  /** @internal */
  private schemaDefinition: C
  private updateSubscribers: Array<(updated: Partial<ExtractValues<C>>) => void> = []

  /**
   * Создает новый экземпляр контекста на основе схемы.
   * @param schema - Схема контекста
   */
  constructor(schema: C) {
    this.schemaDefinition = schema
    this.contextData = {} as ExtractValues<C>
    this.initializeContext(schema)
    this.immutableContext = this.createImmutableContext()
  }

  /**
   * Инициализирует значения контекста по умолчанию согласно схеме.
   * @param schema - Схема контекста
   */
  private initializeContext(schema: C): void {
    for (const key in schema) {
      const definition = schema[key]
      if (!definition) continue

      if ("default" in definition && definition.default !== undefined) {
        ;(this.contextData as any)[key] = definition.default
      } else {
        switch (definition.type) {
          case "string":
            ;(this.contextData as any)[key] = definition.required ? "" : null
            break
          case "number":
            ;(this.contextData as any)[key] = definition.required ? 0 : null
            break
          case "boolean":
            ;(this.contextData as any)[key] = definition.required ? false : null
            break
          case "array":
            ;(this.contextData as any)[key] = definition.required ? [] : null
            break
          case "enum":
            const enumDef = definition as any
            ;(this.contextData as any)[key] = definition.required ? enumDef.values[0] : null
            break
        }
      }
    }
  }

  /**
   * Создает иммутабельный (только для чтения) прокси-объект для доступа к значениям контекста.
   * @returns Иммутабельный объект контекста
   */
  private createImmutableContext(): ExtractValues<C> & { _title: Record<keyof C, string> } {
    const titleData: Record<keyof C, string> = {} as Record<keyof C, string>

    // Инициализируем метаданные: если title не указан — всегда пустая строка
    for (const key in this.schema) {
      const definition = this.schema[key]
      titleData[key] = definition && "title" in definition && definition.title ? definition.title : ""
    }

    const immutableContext = new Proxy({} as ExtractValues<C> & { _title: Record<keyof C, string> }, {
      get: (_, prop) => {
        if (prop === "_title") {
          return titleData
        }
        return (this.contextData as any)[prop]
      },
      set: (_, prop) => {
        throw new Error(
          `Прямое изменение контекста запрещено. Используйте метод update() для изменения значений. Попытка изменить: ${String(
            prop
          )}`
        )
      },
      deleteProperty: (_, prop) => {
        throw new Error(`Удаление свойств контекста запрещено. Попытка удалить: ${String(prop)}`)
      },
    })

    Object.freeze(immutableContext)
    return immutableContext
  }

  /**
   * Текущее состояние контекста (только для чтения).
   * @readonly
   */
  get context(): ExtractValues<C> & { _title: Record<keyof C, string> } {
    return this.immutableContext
  }

  /**
   * Схема контекста (только для чтения).
   * @readonly
   */
  get schema(): Record<keyof C, any> {
    const result: Record<keyof C, any> = {} as Record<keyof C, any>

    for (const key in this.schemaDefinition) {
      const definition = this.schemaDefinition[key]
      if (!definition) continue

      // Извлекаем базовые свойства из определения типа
      const baseProps = {
        type: definition.type,
        required: definition.required,
        default: definition.default,
      }

      // Добавляем дополнительные свойства если они есть
      if ("title" in definition && definition.title) {
        ;(baseProps as any).title = definition.title
      }

      if ("values" in definition && definition.values) {
        ;(baseProps as any).values = definition.values
      }

      result[key] = baseProps
    }

    return result
  }

  /**
   * Обновляет значения в контексте.
   * Только переданные значения будут обновлены, остальные останутся без изменений.
   *
   * @param values - Объект с новыми значениями
   * @returns Объект только с обновленными параметрами
   *
   * @example
   * context.update({name: 'Новое имя', age: 30})
   */
  update(values: UpdateValues<ExtractValues<C>>): Partial<ExtractValues<C>> {
    const filteredValues = Object.fromEntries(
      Object.entries(values).filter(([_, value]) => value !== undefined)
    ) as Partial<ExtractValues<C>>

    const updatedValues: Partial<ExtractValues<C>> = {}

    for (const [key, value] of Object.entries(filteredValues)) {
      const currentValue = (this.contextData as any)[key]
      if (value === null) {
        if (currentValue !== null) {
          updatedValues[key as keyof ExtractValues<C>] = value
        }
      } else {
        if (currentValue !== value) {
          updatedValues[key as keyof ExtractValues<C>] = value
        }
      }
    }

    if (Object.keys(updatedValues).length > 0) {
      Object.assign(this.contextData, updatedValues)
      for (const cb of this.updateSubscribers) {
        try {
          cb(updatedValues)
        } catch {}
      }
    }

    return updatedValues
  }

  onUpdate(callback: (updated: Partial<ExtractValues<C>>) => void): () => void {
    this.updateSubscribers.push(callback)
    return () => {
      const idx = this.updateSubscribers.indexOf(callback)
      if (idx !== -1) this.updateSubscribers.splice(idx, 1)
    }
  }

  getSnapshot(): ExtractValues<C> {
    return Object.freeze({ ...this.contextData })
  }
}

/**
 * Фабричная функция для создания типизированного контекста.
 * Позволяет создавать контекст на основе схемы или функции, принимающей types.
 *
 * @typeParam T - Схема контекста (ContextSchema)
 * @param schema - Схема контекста или функция, принимающая types и возвращающая схему
 * @returns Объект с иммутабельным контекстом и методом update
 *
 * @example
 * const ctx = createContext(types => ({name: types.string.required()}))
 * ctx.context // доступ к значениям
 * ctx.update({name: 'Новое имя'})
 */
export function createContext<const T extends ContextSchema>(schema: T): ContextInstance<T> {
  const contextInstance = new Context(schema)
  return {
    context: contextInstance.context,
    update: contextInstance.update.bind(contextInstance),
    onUpdate: contextInstance.onUpdate.bind(contextInstance),
    schema: contextInstance.schema,
    getSnapshot: contextInstance.getSnapshot.bind(contextInstance),
  }
}
