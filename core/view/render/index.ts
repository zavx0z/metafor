import type { ExtractValues, Update } from "../../context"
import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import type { Schema, ElementSchema, TextSchema, AttributeValue, ConditionSchema } from "../parser/index.t.ts"
import type {
  RenderParams,
  ConditionResult,
  AttributeResult,
  ArrayRenderContext,
  ConditionEvaluator,
  AttributeEvaluator,
} from "./index.t.ts"

/**
 * Оценивает условие на основе данных контекста и core
 */
function evaluateCondition(
  condition: ConditionSchema,
  context: any,
  core: any,
  arrayContext?: ArrayRenderContext
): ConditionResult {
  let source: any
  let value: any

  // Определяем источник данных
  switch (condition.src) {
    case "context":
      source = context
      break
    case "core":
      source = core
      break
    case "item":
      if (!arrayContext) return false
      source = arrayContext.item
      break
    default:
      return false
  }

  // Получаем значение
  if (condition.key) {
    value = source[condition.key]
  } else {
    value = source
  }

  // Оцениваем условие
  if (condition.eq !== undefined) {
    return value === condition.eq
  }
  if (condition.notEq !== undefined) {
    return value !== condition.notEq
  }
  if (condition.gt !== undefined) {
    return typeof value === "number" && value > condition.gt
  }
  if (condition.gte !== undefined) {
    return typeof value === "number" && value >= condition.gte
  }
  if (condition.lt !== undefined) {
    return typeof value === "number" && value < condition.lt
  }
  if (condition.lte !== undefined) {
    return typeof value === "number" && value <= condition.lte
  }

  return false
}

/**
 * Оценивает значение атрибута
 */
function evaluateAttribute(
  attribute: AttributeValue,
  context: any,
  core: any,
  arrayContext?: ArrayRenderContext
): AttributeResult {
  // Статическое значение
  if (typeof attribute === "string") {
    return attribute
  }

  // Условный атрибут (проверяем первым)
  if ("type" in attribute && attribute.type === "conditional" && "trueValue" in attribute) {
    const conditionalAttr = attribute as { src: string; key: string; trueValue: string; falseValue?: string }

    // Для условных атрибутов в массивах используем arrayContext
    if (conditionalAttr.src === "item" && arrayContext) {
      // Для item.* используем прямое сравнение
      if (conditionalAttr.key) {
        const value = arrayContext.item[conditionalAttr.key]
        const isTrue = Boolean(value)
        return isTrue ? conditionalAttr.trueValue : conditionalAttr.falseValue || ""
      }
      return conditionalAttr.falseValue || ""
    } else {
      const condition = {
        src: conditionalAttr.src,
        key: conditionalAttr.key || "",
        eq: true,
      }
      const isTrue = evaluateCondition(condition, context, core, arrayContext)
      return isTrue ? conditionalAttr.trueValue : conditionalAttr.falseValue || ""
    }
  }

  // Интерполяция
  if ("src" in attribute && "key" in attribute) {
    let source: any

    switch (attribute.src) {
      case "context":
        source = context
        break
      case "core":
        source = core
        break
      case "item":
        if (!arrayContext) return ""
        source = arrayContext.item
        break
      default:
        return ""
    }

    if (attribute.key) {
      return source[attribute.key]
    } else {
      return source
    }
  }

  // Смешанный контент
  if ("result" in attribute) {
    return attribute.result
  }

  return ""
}

/**
 * Рендерит элемент массива
 */
function renderArrayElement(
  element: ElementSchema,
  context: any,
  core: any,
  parentElement: HTMLElement | DocumentFragment,
  update: Update<any>
): void {
  if (!element.item) return

  let source: any
  switch (element.item.src) {
    case "context":
      source = context[element.item.key]
      break
    case "core":
      source = core[element.item.key]
      break
    default:
      return
  }

  if (!Array.isArray(source)) return

  source.forEach((item, index) => {
    const arrayContext: ArrayRenderContext = {
      item,
      index,
      array: source,
    }

    // Проверяем условие
    if (element.cond) {
      const shouldRender = evaluateCondition(element.cond, context, core, arrayContext)
      if (!shouldRender) return
    }

    // Создаем элемент
    const el = document.createElement(element.tag)

    // Устанавливаем атрибуты
    if (element.attrs) {
      for (const [name, value] of Object.entries(element.attrs)) {
        const evaluatedValue = evaluateAttribute(value, context, core, arrayContext)

        if (evaluatedValue === true) {
          // Булев атрибут
          el.setAttribute(name, "")
        } else if (evaluatedValue === false || evaluatedValue === undefined || evaluatedValue === "") {
          // Пропускаем false/undefined/пустые атрибуты
          continue
        } else {
          // Обычный атрибут
          el.setAttribute(name, String(evaluatedValue))
        }
      }
    }

    // Рендерим дочерние элементы
    if (element.child) {
      element.child.forEach((child) => {
        if (child.type === "el") {
          renderElement(child, context, core, el, update, arrayContext)
        } else if (child.type === "text") {
          renderText(child, context, core, el, arrayContext)
        }
      })
    }

    parentElement.appendChild(el)
  })
}

/**
 * Рендерит текстовый узел
 */
function renderText(
  text: TextSchema,
  context: any,
  core: any,
  parentElement: HTMLElement | DocumentFragment,
  arrayContext?: ArrayRenderContext
): void {
  let value: string

  if (typeof text.value === "string") {
    value = text.value
  } else {
    // Интерполяция
    let source: any
    switch (text.value.src) {
      case "context":
        source = context
        break
      case "core":
        source = core
        break
      case "item":
        if (!arrayContext) {
          value = ""
          break
        }
        source = arrayContext.item
        break
      default:
        value = ""
        break
    }

    if (text.value.key) {
      value = String(source?.[text.value.key] || "")
    } else {
      value = String(source || "")
    }
  }

  if (value) {
    parentElement.appendChild(document.createTextNode(value))
  }
}

/**
 * Рендерит HTML элемент
 */
function renderElement(
  element: ElementSchema,
  context: any,
  core: any,
  parentElement: HTMLElement | DocumentFragment,
  update: Update<any>,
  arrayContext?: ArrayRenderContext
): void {
  // Проверяем условие
  if (element.cond) {
    const shouldRender = evaluateCondition(element.cond, context, core, arrayContext)
    if (!shouldRender) return
  }

  // Если это элемент массива, рендерим его как массив
  if (element.item) {
    renderArrayElement(element, context, core, parentElement, update)
    return
  }

  // Создаем элемент
  const el = document.createElement(element.tag)

  // Устанавливаем атрибуты
  if (element.attrs) {
    for (const [name, value] of Object.entries(element.attrs)) {
      const evaluatedValue = evaluateAttribute(value, context, core, arrayContext)

      if (evaluatedValue === true) {
        // Булев атрибут
        el.setAttribute(name, "")
      } else if (evaluatedValue === false || evaluatedValue === undefined) {
        // Пропускаем false/undefined атрибуты
        continue
      } else {
        // Обычный атрибут
        el.setAttribute(name, String(evaluatedValue))
      }
    }
  }

  // Рендерим дочерние элементы
  if (element.child) {
    element.child.forEach((child) => {
      if (child.type === "el") {
        renderElement(child, context, core, el, update, arrayContext)
      } else if (child.type === "text") {
        renderText(child, context, core, el, arrayContext)
      }
    })
  }

  parentElement.appendChild(el)
}

/**
 * Основная функция рендеринга
 */
export function render<C extends ContextSchema, S extends string, I extends Core>({
  state,
  context,
  core,
  element,
  update,
  schema,
}: RenderParams<C, S, I>): void {
  if (!schema) return

  // Очищаем элемент
  if ("innerHTML" in element) {
    element.innerHTML = ""
  } else {
    // Для DocumentFragment удаляем все дочерние элементы
    while (element.firstChild) {
      element.removeChild(element.firstChild)
    }
  }

  // Рендерим каждый элемент схемы
  for (const item of schema) {
    if (item.type === "el") {
      renderElement(item, context, core, element, update)
    } else if (item.type === "text") {
      renderText(item, context, core, element)
    }
  }
}
