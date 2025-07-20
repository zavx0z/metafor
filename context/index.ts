/**
 * Модуль для создания типизированных контекстов и схем параметров
 * @packageDocumentation
 */
import { types } from "./types"

import type { ContextSchema, ContextTypes } from "./types.t"
import type { ExtractValues, UpdateValues, ContextInstance, SerializedSchema } from "./index.t"
import type { JsonPatch } from "../metafor.t"

export { types }
export type { ContextSchema, SerializedSchema, ExtractValues, UpdateValues, ContextInstance, ContextTypes, JsonPatch }

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
export class Context<T extends ContextSchema> implements ContextInstance<T> {
  /** @internal */
  private contextData: ExtractValues<T>
  /** @internal */
  private immutableContext: ExtractValues<T> & { _title: Record<keyof T, string> }
  /** @internal */
  private schemaDefinition: T
  /**
   * Список подписчиков на обновления контекста.
   * Каждый подписчик получает массив JSON Patch при изменении.
   * @internal
   */
  private updateSubscribers: Array<(patches: JsonPatch[]) => void> = []

  /**
   * Создает новый экземпляр контекста на основе схемы.
   * @param schema - Схема контекста
   */
  constructor(schema: T) {
    this.schemaDefinition = schema
    this.contextData = {} as ExtractValues<T>
    this.initializeContext(schema)
    this.immutableContext = this.createImmutableContext()
  }

  /**
   * Инициализирует значения контекста по умолчанию согласно схеме.
   * @param schema - Схема контекста
   */
  private initializeContext(schema: T): void {
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
  private createImmutableContext(): ExtractValues<T> & { _title: Record<keyof T, string> } {
    const titleData: Record<keyof T, string> = {} as Record<keyof T, string>

    // Инициализируем метаданные: если title не указан — всегда пустая строка
    for (const key in this.schema) {
      const definition = this.schema[key]
      titleData[key] = definition && "title" in definition && definition.title ? definition.title : ""
    }

    const immutableContext = new Proxy({} as ExtractValues<T> & { _title: Record<keyof T, string> }, {
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
  get context(): ExtractValues<T> & { _title: Record<keyof T, string> } {
    return this.immutableContext
  }

  /**
   * Схема контекста (только для чтения).
   * @readonly
   */
  get schema(): Record<keyof T, any> {
    const result: Record<keyof T, any> = {} as Record<keyof T, any>

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
   * Подписка на обновления контекста.
   * Позволяет получать уведомления о каждом update в виде массива JSON Patch (RFC 6902).
   * Возвращает функцию для отписки.
   *
   * @param callback - функция, вызываемая при обновлении контекста
   * @returns функция для отписки
   *
   * @example
   * const unsubscribe = ctx.onUpdate(patches => {console.log('Изменения:', patches)})
   * // ...
   * unsubscribe() // для отписки
   */
  onUpdate(callback: (patches: JsonPatch[]) => void): () => void {
    this.updateSubscribers.push(callback)
    return () => {
      const idx = this.updateSubscribers.indexOf(callback)
      if (idx !== -1) this.updateSubscribers.splice(idx, 1)
    }
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
  update(values: UpdateValues<ExtractValues<T>>): Partial<ExtractValues<T>> {
    const filteredValues = Object.fromEntries(
      Object.entries(values).filter(([_, value]) => value !== undefined)
    ) as Partial<ExtractValues<T>>

    // Формируем JSON Patch только для реально измененных значений
    const patches: JsonPatch[] = []
    const updatedValues: Partial<ExtractValues<T>> = {}

    for (const [key, value] of Object.entries(filteredValues)) {
      const currentValue = (this.contextData as any)[key]

      // Проверяем, действительно ли значение изменилось
      if (value === null) {
        // Для null — если текущее значение не null, делаем replace с value: null
        if (currentValue !== null) {
          patches.push({ op: "replace", path: `/${key}`, value: null })
          updatedValues[key as keyof ExtractValues<T>] = value
        }
      } else {
        // Для обычных значений — сравниваем с текущим
        if (currentValue !== value) {
          patches.push({ op: "replace", path: `/${key}`, value })
          updatedValues[key as keyof ExtractValues<T>] = value
        }
      }
    }

    // Обновляем данные только если есть реальные изменения
    if (patches.length > 0) {
      Object.assign(this.contextData, filteredValues)
      // Оповещаем подписчиков
      for (const cb of this.updateSubscribers) {
        try {
          cb(patches)
        } catch {}
      }
    }

    return updatedValues
  }

  getSnapshot(): ExtractValues<T> {
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
