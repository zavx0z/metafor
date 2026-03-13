/**
 * @packageDocumentation
 * Модуль для преобразования MetaFor DSL в MetaAST.
 *
 * Преобразует декларативное описание атома (fields, superposition, processes, reactions, gravity, bulk, mass)
 * в MetaAST-конфигурацию, которая используется для инициализации Dark store.
 */

import type { ParsedProcess, ParsedDestroy, ReactionsSchema } from "@metafor/dsl"
import type {
  MetaDSLLike,
  ArrayElementType,
  MetaJson,
  ViewJson,
  MetaAST,
  FieldDefinitionJson,
  ReactionDefinitionJson,
} from "./ast.t"

/**
 * Валидирует путь к модулю действия.
 * Путь должен начинаться с './', '../' или '@'.
 *
 * @param src - Путь к модулю
 * @throws Error если путь невалиден
 */
function validateModulePath(src: string): void {
  if (!src.startsWith("./") && !src.startsWith("../") && !src.startsWith("@")) {
    throw new Error(`Невалидный путь модуля: "${src}". ` + `Путь должен начинаться с './', '../' или '@' для пакетов.`)
  }
}

function inferArrayElementTypeFromDefault(value: unknown): ArrayElementType | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const sample = value.find((v) => v !== undefined && v !== null)
  if (typeof sample === "string") return "string"
  if (typeof sample === "number") return "number"
  return undefined
}

/**
 * Извлекает из исходного кода типы элементов для массивов, объявленных через field.array.required<Type>(...).
 */
export function extractArrayElementTypesFromSource(sourceText: string): Record<string, ArrayElementType> {
  const result: Record<string, ArrayElementType> = {}
  const re =
    /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*field\s*\.\s*array\s*\.\s*(?:required|optional)\s*<\s*(string|number)\s*>\s*\(/g

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
 * - **fields** — схема полей с семантикой для ИИ
 * - **superposition** — граф переходов состояний
 * - **processes** — процессы с обработчиками (action/success/error/before)
 * - **reactions** — реакции на события других атомов
 * - **gravity** — иерархия акторов как AST
 * - **bulk** — bulk-view конфигурация для BULK уровня
 * - **mass** — масса для сложных данных и зависимостей от среды
 *
 * @param meta - Исходный объект MetaFor со всеми компонентами
 * @param sourceText - Исходный код TS файла для извлечения generic-типов массивов
 * @returns Объект в формате MetaAST для инициализации dark и downstream-проекций
 *
 * @example
 * ```typescript
 * const meta = MetaFor("git")
 *   .fields((field) => ({ src: field.string.required("./tmp/edit.json") }))
 *   .superposition({ коммит: { завершено: {} }, завершено: null })
 *   .mass({ history: [] })
 *   .processes((process, destroy) => ({
 *     коммит: process().action(({ value }) => {}).success(({ update }) => update({ src: "" }))
 *   }))
 *   .reactions()
 *   .gravity(({ value, html }) => html`<div>${value.src}</div>`)
 *   .bulk()
 *
 * const json = convertMetaDSLToMetaAST(meta, sourceCode)
 * // => { name: "git", fields: {...}, superposition: {...}, gravity: [...], bulk: {...}, mass: {...} }
 * ```
 */
export function convertMetaDSLToMetaAST(meta: MetaDSLLike, sourceText?: string): MetaAST {
  const inputFields = meta?.fields
  if (!inputFields || typeof inputFields !== "object") {
    throw new Error("fields не найден или не является объектом")
  }

  const arrayElementTypesFromSource = sourceText ? extractArrayElementTypesFromSource(sourceText) : {}
  const fields: Record<string, FieldDefinitionJson> = {}

  // Преобразуем fields, обогащая типы массивов и enum
  for (const [fieldName, rawDef] of Object.entries(inputFields)) {
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
            `Добавь generic: field.array.required<number>([]) / field.array.required<string>([]) или задай непустой default.`,
        )
      }

      fields[fieldName] = { ...def, type: `array<${elementType}>` }
      continue
    }

    if (type === "enum") {
      const values = def.values
      const valueType = inferEnumValueType(values)

      if (!valueType) {
        throw new Error(
          `Не удалось вывести тип значений enum для компоненты '${fieldName}'. values должен быть string[] или number[].`,
        )
      }

      fields[fieldName] = { ...def, type: `enum<${valueType}>` }
      continue
    }

    // Простые типы
    fields[fieldName] = def as FieldDefinitionJson
  }

  // Строим superposition из superposition
  const superposition = meta.superposition || {}

  // Преобразуем processes в JSON формат
  const processesJson: Record<string, MetaJson> | undefined = meta.processes
    ? Object.entries(meta.processes).reduce(
        (acc, [key, process]) => {
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
            // Валидируем путь к модулю действия (если он есть)
            if (parsed.action.src) {
              validateModulePath(parsed.action.src)
            }

            // Собираем процесс только если есть данные (src, read, success, error, label, desc)
            const hasAction = parsed.action.src || (parsed.action.read && parsed.action.read.length > 0)
            // Проверяем success/error на наличие полезного кода (не пустая заглушка)
            // Извлекаем тело функции после => и проверяем, не пустое ли оно
            const isEmptyStub = (src: string): boolean => {
              // Для стрелочных функций извлекаем часть после =>
              const arrowMatch = src.match(/=>\s*(.*)$/)
              if (arrowMatch) {
                const body = arrowMatch[1]?.trim()
                // Пустое тело: {} или ({})
                return body === "{}" || body === "({})"
              }
              return false
            }
            const isNotEmptyHandler = (handler?: { src: string; read?: string[]; write?: string[] }) => {
              if (!handler) return false
              return (
                !isEmptyStub(handler.src) ||
                (handler.read && handler.read.length > 0) ||
                (handler.write && handler.write.length > 0)
              )
            }
            const hasSuccess = isNotEmptyHandler(parsed.success)
            const hasError = isNotEmptyHandler(parsed.error)
            const hasMeta = parsed.label || parsed.desc

            // Пропускаем пустые процессы
            if (!hasAction && !hasSuccess && !hasError && !hasMeta) {
              return acc
            }

            acc[key] = {
              type: "action",
              ...(parsed.label ? { label: parsed.label } : {}),
              ...(parsed.desc ? { desc: parsed.desc } : {}),
              ...(parsed.action.src
                ? {
                    action: {
                      src: parsed.action.src,
                      ...(parsed.action.importSpecifier ? { importSpecifier: parsed.action.importSpecifier } : {}),
                    },
                  }
                : {}),
              ...(parsed.action.read && parsed.action.read.length > 0
                ? { action: { ...acc[key]?.action, read: parsed.action.read } }
                : {}),
              ...(hasSuccess
                ? {
                    success: {
                      src: parsed.success!.src,
                      ...(parsed.success!.read ? { read: parsed.success!.read } : {}),
                      ...(parsed.success!.write ? { write: parsed.success!.write } : {}),
                    },
                  }
                : {}),
              ...(hasError
                ? {
                    error: {
                      src: parsed.error!.src,
                      ...(parsed.error!.read ? { read: parsed.error!.read } : {}),
                      ...(parsed.error!.write ? { write: parsed.error!.write } : {}),
                    },
                  }
                : {}),
            }
          }
          return acc
        },
        {} as Record<string, MetaJson>,
      )
    : undefined

  // Преобразуем reactions в JSON формат
  const reactionsJson:
    | { reactions: Record<string, ReactionDefinitionJson>; superposition: Record<string, string[]> }
    | undefined =
    meta.reactions && meta.reactions.reactions
      ? {
          reactions: Object.entries(meta.reactions.reactions).reduce(
            (acc, [key, reaction]) => {
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
            },
            {} as Record<string, ReactionDefinitionJson>,
          ),
          superposition: meta.reactions.superposition,
        }
      : undefined

  const gravityJson = meta.gravity

  // Собираем bulk-view
  const bulkJson: ViewJson | undefined = meta.view ? { view: meta.view } : undefined

  // Собираем mass
  const massJson: Record<string, any> | undefined = meta.mass

  // Возвращаем формат для monad
  return {
    name: meta.name,
    fields,
    superposition,
    ...(processesJson ? { processes: processesJson } : {}),
    ...(reactionsJson ? { reactions: reactionsJson } : {}),
    ...(gravityJson ? { gravity: gravityJson } : {}),
    ...(bulkJson ? { bulk: bulkJson } : {}),
    ...(massJson ? { mass: massJson } : {}),
  }
}
