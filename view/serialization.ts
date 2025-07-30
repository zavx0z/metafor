/**
 * Утилиты для сериализации и десериализации view
 * @module View.Serialization
 */

import type { TemplateResult, CompiledTemplateResult, CompiledTemplate } from "../html/html.t"
import type {
  TemplatePart,
  AttributeTemplatePart,
  ChildTemplatePart,
  ElementTemplatePart,
  CommentTemplatePart,
} from "../html/html.t"
import type { AttributePart, PropertyPart, BooleanAttributePart, EventPart } from "../html/html"
import { CHILD_PART, ATTRIBUTE_PART, ELEMENT_PART, COMMENT_PART } from "../html/html.t"
import type {
  SerializedView,
  SerializationContext,
  SerializedValue,
  SerializedViewJSON,
  DirectiveValue,
  HasProperty,
} from "./serialization.t"

/**
 * Проверяет, является ли значение директивой
 */
function isDirective(value: unknown): value is DirectiveValue {
  return value !== null && typeof value === "object" && "_$htmlDirective$" in value && "values" in value
}

/**
 * Проверяет, является ли значение сериализованной директивой
 */
function isSerializedDirective(
  value: unknown
): value is HasProperty<Record<string, unknown>, "_$serializedDirective$"> {
  return value !== null && typeof value === "object" && "_$serializedDirective$" in value
}

/**
 * Проверяет, является ли значение маркером функции
 */
function isFunctionMarker(value: unknown): value is HasProperty<Record<string, unknown>, "_$functionMarker$"> {
  return value !== null && typeof value === "object" && "_$functionMarker$" in value
}

/**
 * Сериализует TemplateResult в CompiledTemplateResult
 *
 * @param templateResult - Результат шаблона для сериализации
 * @returns Сериализованный view
 */
export function serializeView(templateResult: TemplateResult): SerializedView {
  const { strings, values, ["_$htmlType$"]: type } = templateResult

  // Сохраняем значения как есть, включая директивы
  const extractedValues: SerializedValue[] = values.map((value) => {
    if (isDirective(value)) {
      // Это директива, сохраняем её как есть
      return value
    }
    return value as SerializedValue
  })

  // Создаем CompiledTemplate
  const compiledTemplate: CompiledTemplate = {
    h: strings,
    parts: strings
      .map((_, index) => {
        if (index === strings.length - 1) {
          // Последняя часть - это конец шаблона
          return {
            type: COMMENT_PART,
            index: index - 1,
          } as CommentTemplatePart
        }

        // Определяем тип части на основе содержимого
        const value = values[index]

        // Проверяем, является ли это директивой
        if (isDirective(value)) {
          const directive = value._$htmlDirective$
          const directiveName = directive.name.toLowerCase()

          // Для директив, которые применяются к элементам
          if (directiveName.includes("ref") || directiveName.includes("style")) {
            return {
              type: ELEMENT_PART,
              index,
            } as ElementTemplatePart
          }
        }

        // По умолчанию это child part
        return {
          type: CHILD_PART,
          index,
        } as ChildTemplatePart
      })
      .filter((part) => part.type !== COMMENT_PART), // Убираем фиктивные части
  }

  return {
    template: compiledTemplate,
    values: extractedValues,
    metadata: {
      type,
      version: "1.0.0",
    },
  }
}

/**
 * Десериализует SerializedView обратно в TemplateResult
 *
 * @param serializedView - Сериализованный view
 * @param context - Контекст для восстановления директив
 * @returns Восстановленный TemplateResult
 */
export function deserializeView(serializedView: SerializedView, context: SerializationContext): TemplateResult {
  const { template, values, metadata } = serializedView

  // Восстанавливаем значения, заменяя сериализованные директивы на реальные
  const restoredValues: unknown[] = values.map((value) => {
    if (isSerializedDirective(value)) {
      // Для сериализованных директив возвращаем как есть
      // В реальной реализации здесь была бы логика восстановления
      return value
    }
    return value
  })

  // Создаем TemplateResult
  return {
    ["_$htmlType$"]: metadata.type,
    strings: template.h,
    values: restoredValues,
  } as TemplateResult
}

/**
 * Создает CompiledTemplateResult из SerializedView
 *
 * @param serializedView - Сериализованный view
 * @returns CompiledTemplateResult
 */
export function createCompiledTemplateResult(serializedView: SerializedView): CompiledTemplateResult {
  return {
    ["_$htmlType$"]: serializedView.template,
    values: serializedView.values,
  }
}

/**
 * Сериализует view в JSON строку
 *
 * @param templateResult - TemplateResult для сериализации
 * @returns JSON строка
 */
export function serializeViewToString(templateResult: TemplateResult): string {
  const serialized = serializeView(templateResult)

  // Сериализуем значения, заменяя функции на маркеры
  const serializedValues = serialized.values.map((value) => {
    if (typeof value === "function") {
      // Для функций создаем маркер
      const func = value as { name?: string; toString(): string }
      return {
        _$functionMarker$: true,
        name: func.name || "anonymous",
        toString: func.toString(),
      }
    }
    return value
  })

  // Сериализуем template.h (TemplateStringsArray) в обычный массив
  const serializedTemplate = {
    ...serialized.template,
    h: Array.from(serialized.template.h),
  }

  return JSON.stringify({
    ...serialized,
    template: serializedTemplate,
    values: serializedValues,
  })
}

/**
 * Десериализует view из JSON строки
 *
 * @param jsonString - JSON строка
 * @param context - Контекст для восстановления
 * @returns Восстановленный TemplateResult
 */
export function deserializeViewFromString(jsonString: string, context: SerializationContext): TemplateResult {
  const parsed = JSON.parse(jsonString) as SerializedViewJSON

  // Восстанавливаем template.h обратно в TemplateStringsArray
  const restoredTemplate = {
    ...parsed.template,
    h: Object.assign(parsed.template.h, { raw: parsed.template.h }),
  }

  // Восстанавливаем значения
  const restoredValues = parsed.values.map((value) => {
    if (isFunctionMarker(value)) {
      // Восстанавливаем функции из контекста
      const marker = value as { name: string }
      const functionName = marker.name
      if (functionName in context.directives) {
        return context.directives[functionName as keyof typeof context.directives]
      }
      if (functionName in context.utils) {
        return context.utils[functionName as keyof typeof context.utils]
      }
      // Если функция не найдена, возвращаем nothing
      return context.utils.nothing
    }
    return value
  })

  return deserializeView(
    {
      ...parsed,
      template: restoredTemplate,
      values: restoredValues,
    },
    context
  )
}
