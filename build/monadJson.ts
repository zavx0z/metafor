/**
 * @packageDocumentation
 * Модуль для преобразования MetaFor DSL в формат JSON для monad.
 *
 * Преобразует декларативное описание атома (context, states, processes, reactions, view, core)
 * в промежуточный JSON-формат, который используется для инициализации monad и boundary.
 */

import type { ParsedProcess, ParsedDestroy } from "../meta/process.t"
import type { ReactionsSchema } from "../meta/reactions.t"
import type { Node as ParseNode } from "@zavx0z/template"

/**
 * Исходный объект MetaFor, полученный из chain API.
 * Содержит все компоненты декларации атома.
 */
type MetaLike = Record<string, any> & {
  /** Схема контекста с типами полей и значениями по умолчанию */
  context?: Record<string, any>
  /** Граф переходов состояний (суперпозиция) */
  states?: Record<string, any>
  /** Процессы с обработчиками action/success/error */
  processes?: Record<string, any>
  /** Реакции на события других атомов */
  reactions?: ReactionsSchema | null
  /** Представление (render/style) */
  render?: ParseNode[]
  style?: string
  /** Ядро для сложных данных */
  core?: Record<string, any>
}

/**
 * Тип элемента массива для полей массивов.
 * Используется для определения типа элементов при выводе типов.
 */
type ArrayElementType = "string" | "number"

/**
 * Распарсенный процесс в формате JSON.
 * Содержит строковые представления функций для десериализации.
 */
export interface ParsedProcessJson {
  /** Тип процесса: action или finally */
  type: "action" | "finally"
  /** Название процесса */
  label?: string
  /** Описание процесса */
  desc?: string
  /** Обработчик действия с исходным кодом и списком читаемых полей */
  action?: {
    /** Исходный код функции */
    src: string
    /** Поля контекста, которые читаются */
    read?: string[]
  }
  /** Обработчик успеха с исходным кодом и списками полей */
  success?: {
    /** Исходный код функции */
    src: string
    /** Поля контекста, которые читаются */
    read?: string[]
    /** Поля контекста, которые записываются */
    write?: string[]
  }
  /** Обработчик ошибки с исходным кодом и списками полей */
  error?: {
    /** Исходный код функции */
    src: string
    /** Поля контекста, которые читаются */
    read?: string[]
    /** Поля контекста, которые записываются */
    write?: string[]
  }
  /** Обработчик before для destroy-процесса */
  before?: {
    /** Исходный код функции */
    src: string
    /** Поля контекста, которые читаются */
    read?: string[]
  }
}

/**
 * Представление атома в JSON формате.
 * Содержит сериализованные render и style компоненты.
 */
export interface ViewJson {
  /** Сериализованное представление render как AST из @zavx0z/template */
  render?: ParseNode[]
  /** Сериализованные стили как CSS строка */
  style?: string
}

/**
 * Формат JSON для monad.
 *
 * Содержит все необходимые данные для инициализации monad и boundary:
 * - **fields** — схема полей с семантикой для ИИ (type, required, label, default)
 * - **superposition** — граф переходов состояний
 * - **processes** — процессы с обработчиками (action/success/error)
 * - **reactions** — реакции на события других атомов
 * - **view** — представление (render/style) для BULK уровня
 * - **core** — ядро для сложных данных
 *
 * @example
 * ```json
 * {
 *   "name": "git",
 *   "fields": {
 *     "src": {
 *       "type": "string",
 *       "required": true,
 *       "default": "./tmp/edit.json",
 *       "label": "JSON-patch путь"
 *     }
 *   },
 *   "superposition": {
 *     "коммит": { "завершено": {} },
 *     "завершено": null
 *   },
 *   "processes": {
 *     "коммит": {
 *       "type": "action",
 *       "action": {
 *         "src": "({ context }) => { ... }",
 *         "read": ["src"]
 *       },
 *       "success": {
 *         "src": "({ update }) => update({ src: '', patches: [] })",
 *         "write": ["src", "patches"]
 *       }
 *     }
 *   },
 *   "reactions": {
 *     "reactions": { ... },
 *     "states": { ... }
 *   },
 *   "view": {
 *     "render": [...],
 *     "style": ".container { color: blue; }"
 *   },
 *   "core": {
 *     "users": []
 *   }
 * }
 * ```
 */
export interface MonadJson {
  /** Название атома (из MetaFor("name")) */
  name: string
  /**
   * Схема полей с семантикой для ИИ.
   * Содержит типы, обязательность, метки и значения по умолчанию.
   * Используется для валидации и генерации UI.
   */
  fields: Record<string, FieldDefinitionJson>
  /**
   * Граф переходов состояний (суперпозиция).
   * Ключ — имя состояния, значение — карта переходов или null для терминальных состояний.
   */
  superposition: Record<string, Record<string, any> | null>
  /**
   * Процессы с обработчиками.
   * Содержит строковые представления функций для десериализации в runtime.
   */
  processes?: Record<string, ParsedProcessJson>
  /**
   * Реакции на события других атомов.
   * Содержит карту реакций и маппинг состояний.
   */
  reactions?: {
    /** Карта реакций по ID */
    reactions: Record<string, ReactionDefinitionJson>
    /** Маппинг состояний в ID реакций */
    states: Record<string, string[]>
  }
  /**
   * Представление для BULK уровня.
   * Содержит render (AST) и style (CSS строка).
   */
  view?: ViewJson
  /**
   * Ядро для сложных данных.
   * Используется для хранения объектов, массивов и других структур,
   * которые не помещаются в простой контекст.
   */
  core?: Record<string, any>
}

/**
 * Определение поля в формате JSON.
 * Содержит полную семантику для ИИ и валидации.
 */
export interface FieldDefinitionJson {
  /** Тип поля: string, number, boolean, array<T>, enum<T> */
  type: string
  /** Обязательно ли поле (true для required) */
  required?: boolean
  /** Метка поля для UI (из опций { label: "..." }) */
  label?: string
  /** Значение по умолчанию для инициализации */
  default?: any
  /**
   * Значения для enum полей.
   * Массив строк или чисел в зависимости от типа enum.
   */
  values?: string[] | number[]
}

/**
 * Определение реакции в формате JSON.
 * Содержит строковое представление фильтра и обработчика.
 */
export interface ReactionDefinitionJson {
  /** Название реакции */
  label: string
  /** Описание реакции */
  desc?: string
  /** Исходный код функции фильтра */
  cond: string
  /** Поля контекста, которые читаются */
  read?: string[]
  /** Поля контекста, которые записываются */
  write?: string[]
  /** Исходный код функции обработчика (equal) */
  src: string
}

function inferArrayElementTypeFromDefault(value: unknown): ArrayElementType | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const sample = value.find((v) => v !== undefined && v !== null)
  if (typeof sample === "string") return "string"
  if (typeof sample === "number") return "number"
  return undefined
}

/**
 * Извлекает из исходного кода типы элементов для массивов, объявленных через t.array.required<Type>(...).
 */
export function extractArrayElementTypesFromSource(sourceText: string): Record<string, ArrayElementType> {
  const result: Record<string, ArrayElementType> = {}
  const re = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*t\s*\.\s*array\s*\.\s*(?:required|optional)\s*<\s*(string|number)\s*>\s*\(/g

  for (const match of [...sourceText.matchAll(re)]) {
    const fieldName = match[1]
    const elementType = match[2] as ArrayElementType
    if (fieldName) result[fieldName] = elementType
  }
  return result
}

function inferEnumValueType(values: unknown): "string" | "number" | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined
  const sample = values.find((v) => v !== undefined && v !== null)
  if (typeof sample === "string") return "string"
  if (typeof sample === "number") return "number"
  return undefined
}

/**
 * Преобразует MetaFor DSL в формат JSON для monad.
 *
 * Извлекает все компоненты декларации:
 * - **fields** — схема полей из context с семантикой для ИИ
 * - **superposition** — граф переходов из states
 * - **processes** — процессы с обработчиками (action/success/error/before)
 * - **reactions** — реакции на события других атомов
 * - **view** — представление (render/style) для BULK уровня
 * - **core** — ядро для сложных данных
 *
 * @param meta - Исходный объект MetaFor со всеми компонентами
 * @param sourceText - Исходный код TS файла для извлечения generic-типов массивов
 * @returns Объект в формате MonadJson для инициализации monad и boundary
 *
 * @example
 * ```typescript
 * const meta = MetaFor("git")
 *   .context((t) => ({ src: t.string.required("./tmp/edit.json") }))
 *   .states({ коммит: { завершено: {} }, завершено: null })
 *   .core({ history: [] })
 *   .processes((process, destroy) => ({
 *     коммит: process().action(({ context }) => {}).success(({ update }) => update({ src: "" }))
 *   }))
 *   .reactions()
 *   .view({ render: ({ context, html }) => html`<div>${context.src}</div>` })
 *
 * const json = convertMetaToMonadJson(meta, sourceCode)
 * // => { name: "git", fields: {...}, superposition: {...}, processes: {...}, view: {...}, core: {...} }
 * ```
 */
export function convertMetaToMonadJson(meta: MetaLike, sourceText?: string): MonadJson {
  const inputContext = meta?.context
  if (!inputContext || typeof inputContext !== "object") {
    throw new Error("context не найден или не является объектом")
  }

  const arrayElementTypesFromSource = sourceText ? extractArrayElementTypesFromSource(sourceText) : {}
  const fields: Record<string, FieldDefinitionJson> = {}

  // Преобразуем context → fields, обогащая типы массивов и enum
  for (const [fieldName, rawDef] of Object.entries(inputContext)) {
    if (!rawDef || typeof rawDef !== "object") {
      fields[fieldName] = rawDef as FieldDefinitionJson
      continue
    }

    const def = rawDef as Record<string, any>
    const type = def.type

    if (type === "array") {
      const fromDefault = inferArrayElementTypeFromDefault(def.default)
      const fromSource = arrayElementTypesFromSource[fieldName]
      const elementType = fromDefault ?? fromSource

      if (!elementType) {
        throw new Error(
          `Не удалось вывести тип элементов массива для компоненты '${fieldName}'. ` +
            `Добавь generic: t.array.required<number>([]) / t.array.required<string>([]) или задай непустой default.`,
        )
      }

      fields[fieldName] = { ...def, type: `array<${elementType}>` }
      continue
    }

    if (type === "enum") {
      const values = def.values
      const valueType = inferEnumValueType(values)

      if (!valueType) {
        throw new Error(`Не удалось вывести тип значений enum для компоненты '${fieldName}'. values должен быть string[] или number[].`)
      }

      fields[fieldName] = { ...def, type: `enum<${valueType}>` }
      continue
    }

    // Простые типы
    fields[fieldName] = def as FieldDefinitionJson
  }

  // Строим superposition из states
  const superposition = meta.states || {}

  // Преобразуем processes в JSON формат
  const processesJson: Record<string, ParsedProcessJson> | undefined = meta.processes
    ? Object.entries(meta.processes).reduce((acc, [key, process]) => {
        const parsed = process as ParsedProcess | ParsedDestroy
        if (parsed.type === "finally") {
          // Destroy-процесс
          acc[key] = {
            type: "finally",
            ...(parsed.label ? { label: parsed.label } : {}),
            ...(parsed.desc ? { desc: parsed.desc } : {}),
            before: {
              src: parsed.before.src,
              ...(parsed.before.read ? { read: parsed.before.read } : {}),
            },
          }
        } else {
          // Action-процесс
          acc[key] = {
            type: "action",
            ...(parsed.label ? { label: parsed.label } : {}),
            ...(parsed.desc ? { desc: parsed.desc } : {}),
            action: {
              src: parsed.action.src,
              ...(parsed.action.read ? { read: parsed.action.read } : {}),
            },
            ...(parsed.success
              ? {
                  success: {
                    src: parsed.success.src,
                    ...(parsed.success.read ? { read: parsed.success.read } : {}),
                    ...(parsed.success.write ? { write: parsed.success.write } : {}),
                  },
                }
              : {}),
            ...(parsed.error
              ? {
                  error: {
                    src: parsed.error.src,
                    ...(parsed.error.read ? { read: parsed.error.read } : {}),
                    ...(parsed.error.write ? { write: parsed.error.write } : {}),
                  },
                }
              : {}),
          }
        }
        return acc
      }, {} as Record<string, ParsedProcessJson>)
    : undefined

  // Преобразуем reactions в JSON формат
  const reactionsJson: { reactions: Record<string, ReactionDefinitionJson>; states: Record<string, string[]> } | undefined =
    meta.reactions && meta.reactions.reactions
      ? {
          reactions: Object.entries(meta.reactions.reactions).reduce((acc, [key, reaction]) => {
            const reactionTyped = reaction as ReactionsSchema["reactions"][string]
            acc[key] = {
              label: reactionTyped.label,
              ...(reactionTyped.desc ? { desc: reactionTyped.desc } : {}),
              cond: reactionTyped.cond,
              ...(reactionTyped.read ? { read: reactionTyped.read } : {}),
              ...(reactionTyped.write ? { write: reactionTyped.write } : {}),
              src: reactionTyped.src,
            }
            return acc
          }, {} as Record<string, ReactionDefinitionJson>),
          states: meta.reactions.states,
        }
      : undefined

  // Собираем view
  const viewJson: ViewJson | undefined =
    meta.render || meta.style
      ? {
          ...(meta.render ? { render: meta.render } : {}),
          ...(meta.style ? { style: meta.style } : {}),
        }
      : undefined

  // Собираем core
  const coreJson: Record<string, any> | undefined = meta.core

  // Возвращаем формат для monad
  return {
    name: meta.name,
    fields,
    superposition,
    ...(processesJson ? { processes: processesJson } : {}),
    ...(reactionsJson ? { reactions: reactionsJson } : {}),
    ...(viewJson ? { view: viewJson } : {}),
    ...(coreJson ? { core: coreJson } : {}),
  }
}
