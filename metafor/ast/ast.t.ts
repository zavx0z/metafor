/**
 * Типы для преобразования MetaFor DSL в JSON формат.
 *
 * @packageDocumentation
 */

import type { NodeType, ReactionsSchema } from "@metafor/dsl"

/**
 * Исходный объект MetaFor, полученный из chain API.
 * Содержит все компоненты декларации атома.
 */
export type MetaLike = Record<string, any> & {
  /** Схема полей с типами и значениями по умолчанию */
  fields?: Record<string, any>
  /** Граф переходов состояний (суперпозиция) */
  superposition?: Record<string, any>
  /** Процессы с обработчиками action/success/error */
  processes?: Record<string, any>
  /** Реакции на события других атомов */
  reactions?: ReactionsSchema | null
  /** Bulk-конфигурация (gravity/view) */
  gravity?: NodeType[]
  view?: string
  /** Масса для сложных данных и зависимостей от среды */
  mass?: Record<string, any>
}

/**
 * Тип элемента массива для полей массивов.
 * Используется для определения типа элементов при выводе типов.
 */
export type ArrayElementType = "string" | "number"

/**
 * Распарсенный процесс в формате JSON.
 * Содержит строковые представления функций для десериализации.
 */
export interface MetaJson {
  /** Тип процесса: action или finally */
  type: "action" | "finally"
  /** Название процесса */
  label?: string
  /** Описание процесса */
  desc?: string
  /** Обработчик действия с исходным кодом и списком читаемых полей */
  action?: {
    /** Исходный код функции (опционально для пустых функций-заглушек) */
    src?: string
    /** Имя экспорта для импорта (например, "default", "commit", "process") */
    importSpecifier?: string
    /** Значения полей, которые читаются */
    read?: string[]
  }
  /** Обработчик успеха с исходным кодом и списками полей */
  success?: {
    /** Исходный код функции */
    src: string
    /** Значения полей, которые читаются */
    read?: string[]
    /** Значения полей, которые записываются */
    write?: string[]
  }
  /** Обработчик ошибки с исходным кодом и списками полей */
  error?: {
    /** Исходный код функции */
    src: string
    /** Значения полей, которые читаются */
    read?: string[]
    /** Значения полей, которые записываются */
    write?: string[]
  }
  /** Обработчик before для destroy-процесса */
  before?: {
    /** Исходный код функции */
    src: string
    /** Значения полей, которые читаются */
    read?: string[]
  }
}

/**
 * Представление атома в JSON формате.
 * Содержит сериализованные gravity и view компоненты.
 */
export interface ViewJson {
  /** Сериализованное представление gravity как AST из @metafor/template */
  gravity?: NodeType[]
  /** Сериализованные view-стили как CSS строка */
  view?: string
}

/**
 * Формат JSON для monad.
 *
 * Содержит все необходимые данные для инициализации monad и boundary:
 * - **fields** — схема полей с семантикой для ИИ (type, required, label, default)
 * - **superposition** — граф переходов состояний
 * - **processes** — процессы с обработчиками (action/success/error)
 * - **reactions** — реакции на события других атомов
 * - **bulk** — bulk-конфигурация (gravity/view) для BULK уровня
 * - **mass** — масса для сложных данных и зависимостей от среды
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
 *         "src": "({ value }) => { ... }",
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
 *     "superposition": { ... }
 *   },
 *   "bulk": {
 *     "gravity": [...],
 *     "view": ".container { color: blue; }"
 *   },
 *   "mass": {
 *     "users": []
 *   }
 * }
 * ```
 */
export interface ActorAST {
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
  processes?: Record<string, MetaJson>
  /**
   * Реакции на события других атомов.
   * Содержит карту реакций и маппинг суперпозиций.
   */
  reactions?: {
    /** Карта реакций по ID */
    reactions: Record<string, ReactionDefinitionJson>
    /** Маппинг суперпозиций в ID реакций */
    superposition: Record<string, string[]>
  }
  /**
   * Bulk-конфигурация для BULK уровня.
   * Содержит gravity (AST) и view (CSS).
   */
  bulk?: ViewJson
  /**
   * Масса для сложных данных и зависимостей от среды.
   * Используется для хранения объектов, массивов и других структур,
   * которые не помещаются в простой контекст. Масса не сериализуется в Boundary.
   */
  mass?: Record<string, any>
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
