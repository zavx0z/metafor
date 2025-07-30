/**
 * Утилиты для сериализации и десериализации view
 * @module View.Serialization
 */

import type { TemplateResult, CompiledTemplateResult } from "../html/html.t"
import { CHILD_PART, ATTRIBUTE_PART, ELEMENT_PART, COMMENT_PART } from "../html/html.t"
import type {
  SerializedView,
  SerializationContext,
  SerializedDirective,
  FunctionMarker,
  SerializedValue,
  SerializedViewJSON,
  SerializationConfig,
  ViewParams,
  RestoredViewParams,
  DirectiveValue,
  HasProperty,
  IsDirective,
} from "./serialization.t"

/**
 * Сериализует TemplateResult в SerializedView
 */
export function serializeView(templateResult: TemplateResult, config: SerializationConfig = {}): SerializedView {
  const { version = "1.0", includeMetadata = true } = config

  // Извлекаем строки и значения
  const { strings, values } = templateResult

  // Сериализуем шаблон
  const serializedTemplate = {
    h: Array.from(strings),
    parts: strings.map((_, index) => ({
      type: CHILD_PART,
      index,
    })),
  }

  // Сериализуем значения
  const serializedValues = values.map((value) => {
    if (isDirective(value)) {
      return value // Директивы сохраняем как есть
    }
    if (typeof value === "function") {
      return createFunctionMarker(value)
    }
    return value
  })

  // Создаем метаданные
  const metadata = includeMetadata
    ? {
        version,
        timestamp: Date.now(),
      }
    : {
        version,
        timestamp: 0,
      }

  return {
    template: serializedTemplate,
    values: serializedValues,
    metadata,
  }
}

/**
 * Десериализует SerializedView в TemplateResult
 */
export function deserializeView(serializedView: SerializedView, context: SerializationContext): TemplateResult {
  const { template, values } = serializedView

  // Восстанавливаем шаблон
  const restoredStrings = Object.assign(template.h, { raw: template.h })

  // Восстанавливаем значения
  const restoredValues = values.map((value) => {
    if (isSerializedDirective(value)) {
      return restoreDirective(value, context)
    }
    if (isFunctionMarker(value)) {
      return restoreFunction(value, context)
    }
    return value
  })

  return {
    ["_$htmlType$"]: 1, // HTML_RESULT
    strings: restoredStrings,
    values: restoredValues,
  } as TemplateResult
}

/**
 * Создает CompiledTemplateResult из SerializedView
 */
export function createCompiledTemplateResult(serializedView: SerializedView): CompiledTemplateResult {
  const { template } = serializedView

  return {
    ["_$htmlType$"]: {
      h: Object.assign(template.h, { raw: template.h }),
      parts: template.parts.map((part) => ({
        type: part.type as any,
        index: part.index,
      })),
    },
    values: serializedView.values,
  }
}

/**
 * Сериализует TemplateResult в JSON строку
 */
export function serializeViewToString(templateResult: TemplateResult, config: SerializationConfig = {}): string {
  const serialized = serializeView(templateResult, config)

  // Преобразуем для JSON совместимости
  const jsonCompatible: SerializedViewJSON = {
    template: {
      h: Array.from(serialized.template.h),
      parts: serialized.template.parts,
    },
    values: serialized.values.map((value) => {
      if (typeof value === "function") {
        return createFunctionMarker(value)
      }
      return value
    }),
    metadata: serialized.metadata,
  }

  return JSON.stringify(jsonCompatible)
}

/**
 * Десериализует TemplateResult из JSON строки
 */
export function deserializeViewFromString(jsonString: string, context: SerializationContext): TemplateResult {
  const parsed: SerializedViewJSON = JSON.parse(jsonString)

  // Восстанавливаем TemplateStringsArray
  const restoredStrings = Object.assign(parsed.template.h, { raw: parsed.template.h })

  // Восстанавливаем значения
  const restoredValues = parsed.values.map((value) => {
    if (isFunctionMarker(value)) {
      return restoreFunction(value, context)
    }
    return value
  })

  return {
    ["_$htmlType$"]: 1, // HTML_RESULT
    strings: restoredStrings,
    values: restoredValues,
  } as TemplateResult
}

/**
 * Десериализует view с параметрами из SerializationContext.meta
 */
export function deserializeViewWithParams(
  serializedView: SerializedView,
  context: SerializationContext
): { template: TemplateResult; params: RestoredViewParams } {
  const template = deserializeView(serializedView, context)

  const params: RestoredViewParams = {
    update: context.meta.update,
    context: context.meta.context,
    core: context.meta.core,
    state: context.meta.state,
  }

  return { template, params }
}

/**
 * Десериализует view с параметрами из JSON строки
 */
export function deserializeViewFromStringWithParams(
  jsonString: string,
  context: SerializationContext
): { template: TemplateResult; params: RestoredViewParams } {
  const template = deserializeViewFromString(jsonString, context)

  const params: RestoredViewParams = {
    update: context.meta.update,
    context: context.meta.context,
    core: context.meta.core,
    state: context.meta.state,
  }

  return { template, params }
}

// Вспомогательные функции

function createFunctionMarker(func: Function): FunctionMarker {
  return {
    type: "function",
    name: func.name || "anonymous",
    toString: func.toString(),
  }
}

function restoreFunction(marker: FunctionMarker, context: SerializationContext): Function {
  // Пытаемся найти функцию в контексте
  const funcName = marker.name
  if (funcName in context.directives) {
    return context.directives[funcName as keyof typeof context.directives] as Function
  }
  if (funcName in context.utils) {
    return context.utils[funcName as keyof typeof context.utils] as Function
  }

  // Если не найдена, возвращаем пустую функцию
  return () => {}
}

function restoreDirective(serialized: SerializedDirective, context: SerializationContext): unknown {
  const directiveName = serialized.name
  if (directiveName in context.directives) {
    return context.directives[directiveName as keyof typeof context.directives]
  }
  return serialized.value
}

// Type guards

function isDirective(value: unknown): value is DirectiveValue {
  return (
    typeof value === "function" &&
    (value as any).name !== undefined &&
    ["ref", "repeat", "when", "map", "styleMap", "choose"].includes((value as any).name)
  )
}

function isSerializedDirective(value: unknown): value is SerializedDirective {
  return typeof value === "object" && value !== null && (value as SerializedDirective).type === "directive"
}

function isFunctionMarker(value: unknown): value is FunctionMarker {
  return typeof value === "object" && value !== null && (value as FunctionMarker).type === "function"
}
