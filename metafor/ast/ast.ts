import { validateMatterAST } from "../dsl/matter.ts"
import type {
  ArrayElementType,
  FieldDefinitionJson,
  MetaAST,
  MetaDSLLike,
  MetaJson,
  NormalizeMetaASTOptions,
  ReactionDefinitionJson,
} from "./ast.t"
import type { ParsedDestroy, ParsedProcess } from "@metafor/dsl"
import type { ReactionsSchema } from "@metafor/dsl"

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

function validateModulePath(src: string): void {
  if (!src.startsWith("./") && !src.startsWith("../") && !src.startsWith("@")) {
    throw new Error(`Невалидный путь модуля: "${src}". ` + `Путь должен начинаться с './', '../' или '@' для пакетов.`)
  }
}

function inferArrayElementTypeFromDefault(value: unknown): ArrayElementType | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined

  const sample = value.find((item) => item !== undefined && item !== null)
  if (typeof sample === "string") return "string"
  if (typeof sample === "number") return "number"
}

function inferEnumValueType(values: unknown): "string" | "number" | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined

  const sample = values.find((item) => item !== undefined && item !== null)
  if (typeof sample === "string") return "string"
  if (typeof sample === "number") return "number"
}

function normalizeFields(
  inputFields: MetaDSLLike["fields"],
  arrayElementTypes: Record<string, ArrayElementType>,
): Record<string, FieldDefinitionJson> {
  const fields: Record<string, FieldDefinitionJson> = {}

  for (const [fieldName, rawDef] of Object.entries(inputFields ?? {})) {
    if (!rawDef || typeof rawDef !== "object") {
      fields[fieldName] = rawDef as unknown as FieldDefinitionJson
      continue
    }

    const def = rawDef as Record<string, unknown>
    const type = typeof def.type === "string" ? def.type : undefined

    if (type === "array") {
      const elementType = inferArrayElementTypeFromDefault(def.default) ?? arrayElementTypes[fieldName]

      if (!elementType) {
        throw new Error(
          `Не удалось вывести тип элементов массива для компоненты '${fieldName}'. ` +
            `Добавь generic: field.array.required<number>([]) / field.array.required<string>([]) или задай непустой default.`,
        )
      }

      fields[fieldName] = { ...(def as unknown as FieldDefinitionJson), type: `array<${elementType}>` }
      continue
    }

    if (type === "enum") {
      const valueType = inferEnumValueType(def.values)

      if (!valueType) {
        throw new Error(
          `Не удалось вывести тип значений enum для компоненты '${fieldName}'. values должен быть string[] или number[].`,
        )
      }

      fields[fieldName] = { ...(def as unknown as FieldDefinitionJson), type: `enum<${valueType}>` }
      continue
    }

    fields[fieldName] = def as unknown as FieldDefinitionJson
  }

  return fields
}

function normalizeProcesses(processes: MetaDSLLike["processes"]): Record<string, MetaJson> | undefined {
  if (!processes) return

  return Object.entries(processes).reduce(
    (acc, [key, process]) => {
      const parsed = process as ParsedProcess | ParsedDestroy

      if (parsed.type === "finally") {
        acc[key] = {
          type: "finally",
          ...(parsed.label ? { label: parsed.label } : {}),
          ...(parsed.desc ? { desc: parsed.desc } : {}),
          before: {
            src: parsed.before.src,
            ...(parsed.before.read ? { read: parsed.before.read } : {}),
          },
        }
        return acc
      }

      if (parsed.action.src) validateModulePath(parsed.action.src)

      const hasAction = parsed.action.src || (parsed.action.read && parsed.action.read.length > 0)
      const isEmptyStub = (src: string): boolean => {
        const arrowMatch = src.match(/=>\s*(.*)$/)
        if (!arrowMatch) return false

        const body = arrowMatch[1]?.trim()
        return body === "{}" || body === "({})"
      }

      const isNotEmptyHandler = (handler?: { src: string; read?: string[]; write?: string[] }): boolean => {
        if (!handler) return false

        return !isEmptyStub(handler.src) || !!(handler.read && handler.read.length > 0) || !!(handler.write && handler.write.length > 0)
      }

      const hasSuccess = isNotEmptyHandler(parsed.success)
      const hasError = isNotEmptyHandler(parsed.error)
      const hasMeta = parsed.label || parsed.desc

      if (!hasAction && !hasSuccess && !hasError && !hasMeta) return acc

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

      return acc
    },
    {} as Record<string, MetaJson>,
  )
}

function normalizeReactions(
  reactions: MetaDSLLike["reactions"],
): { reactions: Record<string, ReactionDefinitionJson>; superposition: Record<string, string[]> } | undefined {
  if (!reactions || !reactions.reactions) return

  const schema = reactions as ReactionsSchema

  return {
    reactions: Object.entries(schema.reactions).reduce(
      (acc, [key, reaction]) => {
        const typedReaction = reaction as ReactionsSchema["reactions"][string]

        acc[key] = {
          label: typedReaction.label,
          ...(typedReaction.desc ? { desc: typedReaction.desc } : {}),
          cond: typedReaction.cond,
          ...(typedReaction.read ? { read: typedReaction.read } : {}),
          ...(typedReaction.write ? { write: typedReaction.write } : {}),
          src: typedReaction.src,
        }

        return acc
      },
      {} as Record<string, ReactionDefinitionJson>,
    ),
    superposition: schema.superposition,
  }
}

export function normalizeMetaDSLToMetaAST(
  meta: MetaDSLLike,
  options: NormalizeMetaASTOptions = {},
): MetaAST {
  const inputFields = meta?.fields
  if (!inputFields || typeof inputFields !== "object") {
    throw new Error("fields не найден или не является объектом")
  }

  const fields = normalizeFields(inputFields, options.arrayElementTypes ?? {})
  const superposition = meta.superposition || {}
  const processes = normalizeProcesses(meta.processes)
  const reactions = normalizeReactions(meta.reactions)
  const matter = meta.matter

  validateMatterAST(matter, fields, meta.name)

  return {
    name: meta.name,
    fields,
    superposition,
    ...(processes ? { processes } : {}),
    ...(reactions ? { reactions } : {}),
    ...(matter ? { matter } : {}),
    ...(meta.view ? { bulk: { view: meta.view } } : {}),
    ...(meta.mass ? { mass: meta.mass } : {}),
  }
}

export function convertMetaDSLToMetaAST(meta: MetaDSLLike, sourceText?: string): MetaAST {
  const arrayElementTypes = sourceText ? extractArrayElementTypesFromSource(sourceText) : null

  return normalizeMetaDSLToMetaAST(meta, arrayElementTypes ? { arrayElementTypes } : {})
}
