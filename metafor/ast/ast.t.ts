/**
 * Типы для преобразования MetaFor DSL в JSON формат.
 *
 * @packageDocumentation
 *
 * Типы данных для сериализации и десериализации MetaFor DSL:
 * - **MetaDSLLike** — исходный объект MetaFor из chain API
 * - **MetaJson** — распарсенный процесс в формате JSON
 * - **MetaAST** — полная AST-конфигурация для создания атома
 * - **FieldDefinitionJson** — определение поля с семантикой для ИИ
 * - **ReactionDefinitionJson** — определение реакции с фильтром и обработчиком
 * - **ViewJson** — bulk-view конфигурация (CSS)
 *
 * Эти типы используются для хранения и передачи мета-конфигураций
 * в сериализованном формате, сохраняя всю семантику для ИИ.
 */

import type { NodeType, ReactionsSchema } from "@metafor/dsl"
import type { Mass } from "@metafor/dsl/types"

/**
 * Исходный объект MetaFor, полученный из chain API.
 * Содержит все компоненты мета-конфигурации.
 *
 * @remarks
 * Используется как промежуточный формат между DSL и AST.
 *
 * @property fields — Схема полей с типами и значениями по умолчанию.
 * @property superposition — Граф переходов состояний (суперпозиция).
 * @property processes — Процессы с обработчиками action/success/error.
 * @property reactions — Реакции на события других атомов.
 * @property matter — Matter-конфигурация компонента.
 * @property view — Bulk-view конфигурация.
 * @property mass — Масса для сложных данных и зависимостей от среды.
 */
export type MetaDSLLike = Record<string, any> & {
  fields?: Record<string, any>
  superposition?: Record<string, any>
  processes?: Record<string, any>
  reactions?: ReactionsSchema | null
  matter?: NodeType[]
  view?: string
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
 *
 * @remarks
 * Используется для хранения процессов в сериализованном виде.
 *
 * @property type — Тип процесса: action или finally.
 * @property label — Название процесса.
 * @property desc — Описание процесса.
 * @property action — Обработчик действия с исходным кодом и списком читаемых полей.
 * @property success — Обработчик успеха с исходным кодом и списками полей.
 * @property error — Обработчик ошибки с исходным кодом и списками полей.
 * @property before — Обработчик before для destroy-процесса.
 */
export interface MetaJson {
  type: "action" | "finally"
  label?: string
  desc?: string
  action?: {
    src?: string
    importSpecifier?: string
    read?: string[]
  }
  success?: {
    src: string
    read?: string[]
    write?: string[]
  }
  error?: {
    src: string
    read?: string[]
    write?: string[]
  }
  before?: {
    src: string
    read?: string[]
  }
}

/**
 * Представление bulk-view конфигурации в JSON формате.
 *
 * @property view — Сериализованные view-стили как CSS строка.
 */
export interface ViewJson {
  view?: string
}

/**
 * MetaAST-конфигурация в формате JSON.
 *
 * Это не сам атом, а его декларация — MetaDSL, сериализованная в AST для создания атома.
 * Содержит все необходимые данные для инициализации:
 * - **fields** — схема полей с семантикой для ИИ (type, required, label, default)
 * - **superposition** — граф переходов состояний
 * - **processes** — процессы с обработчиками (action/success/error)
 * - **reactions** — реакции на события других атомов
 * - **matter** — иерархия акторов как AST
 * - **bulk** — bulk-view конфигурация для BULK уровня
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
 *   "matter": [...],
 *   "bulk": {
 *     "view": ".container { color: blue; }"
 *   },
 *   "mass": {
 *     "users": []
 *   }
 * }
 * ```
 *
 * @property name — Название мета-конфигурации (из MetaFor("name")).
 * @property fields — Схема полей с семантикой для ИИ.
 * @property superposition — Граф переходов состояний (суперпозиция).
 * @property processes — Процессы с обработчиками.
 * @property reactions — Реакции на события других атомов.
 * @property matter — Matter-конфигурация для иерархии акторов.
 * @property bulk — Bulk-view конфигурация для BULK уровня.
 * @property mass — Масса для сложных данных и зависимостей от среды.
 */
export interface MetaAST {
  name: string
  fields: FieldsAST
  superposition: Record<string, Record<string, any> | null>
  processes?: Record<string, MetaJson>
  reactions?: {
    reactions: Record<string, ReactionDefinitionJson>
    superposition: Record<string, string[]>
  }
  matter?: NodeType[]
  bulk?: ViewJson
  mass?: Mass
}
export type FieldKey = string
export type FieldsAST = Record<FieldKey, FieldDefinitionJson>
/**
 * Определение поля в формате JSON.
 * Содержит полную семантику для ИИ и валидации.
 *
 * @property type — Тип поля: string, number, boolean, array<T>, enum<T>.
 * @property required — Обязательно ли поле (true для required).
 * @property label — Метка поля для UI (из опций { label: "..." }).
 * @property default — Значение по умолчанию для инициализации.
 * @property values — Значения для enum полей.
 */
export interface FieldDefinitionJson {
  type: string
  required?: boolean
  label?: string
  default?: any
  values?: string[] | number[]
}

/**
 * Определение реакции в формате JSON.
 * Содержит строковое представление фильтра и обработчика.
 *
 * @property label — Название реакции.
 * @property desc — Описание реакции.
 * @property cond — Исходный код функции фильтра.
 * @property read — Поля контекста, которые читаются.
 * @property write — Поля контекста, которые записываются.
 * @property src — Исходный код функции обработчика (equal).
 */
export interface ReactionDefinitionJson {
  label: string
  desc?: string
  cond: string
  read?: string[]
  write?: string[]
  src: string
}
