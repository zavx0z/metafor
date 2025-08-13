/**
 * Реализация контекста
 * @module Context
 */
import { types } from "./types"

import type { ContextSchema, ContextTypes } from "./types.t"
import type {
  ExtractValues,
  UpdateValues,
  ContextInstance,
  SerializedSchema,
  Update,
  OnUpdate,
  ContextSnapshot,
} from "./index.t"

export { types }
export type {
  ContextSchema,
  SerializedSchema,
  ExtractValues,
  UpdateValues,
  ContextInstance,
  Update,
  OnUpdate,
  ContextSnapshot,
  ContextTypes,
}

/** Базовый класс контекста */
export abstract class ContextBase<C extends ContextSchema> implements ContextInstance<C> {
  /** @internal */
  protected contextData!: ExtractValues<C>
  /** @internal */
  protected immutableContext!: ExtractValues<C> & { _title: Record<keyof C, string> }
  /** @internal */
  protected schemaDefinition!: C
  protected updateSubscribers: Array<(updated: Partial<ExtractValues<C>>) => void> = []

  /**
   * Создает иммутабельный (только для чтения) прокси-объект для доступа к значениям контекста.
   * @returns Иммутабельный объект контекста
   */
  protected createImmutableContext(): ExtractValues<C> & { _title: Record<keyof C, string> } {
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
        throw new Error("Прямое изменение контекста запрещено")
      },
    })

    return immutableContext
  }

  /**
   * Инициализирует значения контекста по умолчанию согласно схеме.
   * @param schema - Схема контекста
   */
  protected initializeContext(schema: C): void {
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
   * Геттер для доступа к иммутабельному контексту.
   * @returns Иммутабельный объект контекста
   */
  get context(): ExtractValues<C> & { _title: Record<keyof C, string> } {
    return this.immutableContext
  }

  /**
   * Геттер для доступа к схеме контекста.
   * @returns Схема контекста
   */
  get schema(): SerializedSchema<C> {
    const serializedSchema: Record<keyof C, any> = {} as Record<keyof C, any>

    for (const [key, definition] of Object.entries(this.schemaDefinition)) {
      const serializedDefinition: any = {
        type: definition.type,
        required: definition.required,
      }

      if ("default" in definition && definition.default !== undefined) {
        serializedDefinition.default = definition.default
      }

      if ("title" in definition && definition.title) {
        serializedDefinition.title = definition.title
      }

      if ("values" in definition) {
        serializedDefinition.values = definition.values
      }

      ;(serializedSchema as any)[key] = serializedDefinition
    }

    return serializedSchema
  }

  /**
   * Обновляет значения контекста.
   * Игнорирует undefined значения и возвращает только обновленные поля.
   *
   * @param values - Объект с новыми значениями
   * @returns Объект с обновленными полями
   *
   * @example
   * context.update({name: 'Новое имя', age: 30})
   */
  update = (values: UpdateValues<ExtractValues<C>>): Partial<ExtractValues<C>> => {
    const filteredValues = Object.fromEntries(
      Object.entries(values).filter(([_, value]) => value !== undefined)
    ) as Partial<ExtractValues<C>>

    const updated: Partial<ExtractValues<C>> = {}

    for (const [key, value] of Object.entries(filteredValues)) {
      if (key in this.contextData) {
        // Проверяем, изменилось ли значение
        if (this.contextData[key as keyof ExtractValues<C>] !== value) {
          ;(this.contextData as any)[key] = value
          ;(updated as any)[key] = value
        }
      }
    }

    // Уведомляем подписчиков об изменениях
    this.updateSubscribers.forEach((callback) => callback(updated))

    return updated
  }

  /**
   * Подписывается на обновления контекста.
   * @param callback - Функция обратного вызова
   * @returns Функция для отписки
   */
  onUpdate(callback: (updated: Partial<ExtractValues<C>>) => void): () => void {
    this.updateSubscribers.push(callback)
    return () => {
      const index = this.updateSubscribers.indexOf(callback)
      if (index > -1) {
        this.updateSubscribers.splice(index, 1)
      }
    }
  }

  /**
   * Возвращает снимок текущего состояния контекста.
   * @returns Снимок контекста
   */
  getSnapshot(): ExtractValues<C> {
    return Object.freeze({ ...this.contextData })
  }

  /**
   * Возвращает сериализованный снимок текущего состояния контекста.
   * @returns Сериализованный снимок контекста
   */
  get snapshot() {
    const context: ContextSnapshot<C> = {} as ContextSnapshot<C>
    const contextCurrentValues = this.getSnapshot()
    for (const [key, value] of Object.entries(this.schema)) {
      context[key as keyof C] = {
        type: value.type,
        required: value.required,
        default: value.default,
        ...(value.title ? { title: value.title } : {}),
        ...(value.values ? { values: value.values } : {}),
        value: contextCurrentValues[key as keyof C],
      }
    }
    return context
  }
}

/**
 * Класс для работы с типизированными контекстами.
 * Позволяет создавать, читать, обновлять и клонировать контекст на основе схемы.
 *
 * @typeParam T - Схема контекста (ContextSchema)
 *
 * @example
 * const ctx = new Context(types => ({name: types.string.required()}))
 * ctx.context // доступ к значениям
 * ctx.update({name: 'Новое имя'})
 */
export class Context<C extends ContextSchema> extends ContextBase<C> {
  constructor(schemaDefinition: (types: ContextTypes) => C) {
    super()
    const schema = schemaDefinition(types)
    this.schemaDefinition = schema
    this.contextData = {} as ExtractValues<C>
    this.initializeContext(this.schemaDefinition)
    this.immutableContext = this.createImmutableContext()
  }

  /**
   * Создает снимок контекста для сериализации.
   * @returns Сериализованный снимок контекста
   */
  toSnapshot(): SerializedSchema<C> {
    const serializedSchema: SerializedSchema<C> = {} as SerializedSchema<C>

    for (const [key, definition] of Object.entries(this.schemaDefinition)) {
      const serializedDefinition: any = {
        type: definition.type,
        required: definition.required,
      }

      if ("default" in definition && definition.default !== undefined) {
        serializedDefinition.default = definition.default
      }

      if ("title" in definition && definition.title) {
        serializedDefinition.title = definition.title
      }

      if ("values" in definition && definition.values) {
        serializedDefinition.values = definition.values
      }

      ;(serializedSchema as any)[key] = serializedDefinition
    }

    return serializedSchema
  }
}

/**
 * Клонированный контекст, созданный из снимка.
 * Позволяет восстанавливать контекст из сериализованного состояния.
 *
 * @typeParam C - Схема контекста (ContextSchema)
 */
export class ContextClone<C extends ContextSchema> extends ContextBase<C> {
  constructor() {
    super()
  }

  /**
   * Создает контекст из снимка.
   * @param snapshot - Сериализованный снимок контекста
   * @returns Экземпляр ContextClone
   */
  static fromSnapshot<C extends ContextSchema>(snapshot: SerializedSchema<C>): ContextClone<C> {
    const contextClone = new ContextClone<C>()

    // Восстанавливаем схему из снимка
    contextClone.schemaDefinition = snapshot as C

    // Инициализируем пустые данные
    contextClone.contextData = {} as ExtractValues<C>
    contextClone.initializeContext(contextClone.schemaDefinition)
    contextClone.immutableContext = contextClone.createImmutableContext()

    return contextClone
  }

  /**
   * Восстанавливает данные контекста из снимка значений.
   * @param values - Снимок значений контекста
   */
  restoreValues(values: ExtractValues<C>): void {
    this.contextData = { ...values }
    this.immutableContext = this.createImmutableContext()
  }
}
