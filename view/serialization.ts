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

/**
 * Сериализованный view
 */
export interface SerializedView {
  /** Скомпилированный шаблон */
  template: CompiledTemplate
  /** Значения для шаблона */
  values: unknown[]
  /** Метаданные для восстановления */
  metadata: {
    /** Тип view (html, svg, mathml) */
    type: number
    /** Версия сериализации */
    version: string
  }
}

/**
 * Контекст сериализации для восстановления директив
 */
export interface SerializationContext {
  /** Функции для восстановления директив */
  directives: {
    ref: any
    repeat: any
    when: any
    map: any
    styleMap: any
    choose: any
  }
  /** Утилиты для восстановления */
  utils: {
    html: any
    nothing: any
  }
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
  const extractedValues = values.map((value) => {
    if (value && typeof value === "object" && "_$htmlDirective$" in value) {
      // Это директива, сохраняем её как есть
      return value
    }
    return value
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
        if (value && typeof value === "object" && "_$htmlDirective$" in value) {
          const directive = (value as any)._$htmlDirective$
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
  const restoredValues = values.map((value) => {
    if (value && typeof value === "object" && "_$serializedDirective$" in value) {
      const directiveData = value as any
      const directiveType = directiveData._$serializedDirective$

      switch (directiveType) {
        case "ref":
          return context.directives.ref(directiveData.value)
        case "repeat":
          return context.directives.repeat(directiveData.items, directiveData.keyFn, directiveData.template)
        case "when":
          return context.directives.when(directiveData.condition, directiveData.trueCase, directiveData.falseCase)
        case "map":
          return context.directives.map(directiveData.items, directiveData.fn)
        case "styleMap":
          return context.directives.styleMap(directiveData.styleInfo)
        case "choose":
          return context.directives.choose(directiveData.value, directiveData.cases, directiveData.defaultCase)
        default:
          return value
      }
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
      return {
        _$functionMarker$: true,
        name: value.name || "anonymous",
        toString: value.toString(),
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
  const parsed = JSON.parse(jsonString)

  // Восстанавливаем template.h обратно в TemplateStringsArray
  const restoredTemplate = {
    ...parsed.template,
    h: Object.assign(parsed.template.h, { raw: parsed.template.h }),
  }

  // Восстанавливаем значения
  const restoredValues = parsed.values.map((value: any) => {
    if (value && value._$functionMarker$) {
      // Восстанавливаем функции из контекста
      const functionName = value.name
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
