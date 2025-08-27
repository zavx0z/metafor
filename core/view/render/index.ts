import type { ExtractValues, Update } from "../../context/index.t"
import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import type { Node, NodeElement, NodeText } from "../parser/index.t"

/**
 * Основная функция рендеринга
 */
export function render<C extends ContextSchema, S extends string, I extends Core>({
  state,
  context,
  core,
  container,
  update,
  schema,
}: {
  state: S
  context: ExtractValues<C>
  core: I
  container: HTMLElement | DocumentFragment
  update: Update<C>
  schema: Node[]
}): void {
  if (!schema) return

  // Очищаем контейнер
  if ("innerHTML" in container) {
    container.innerHTML = ""
  } else {
    // Для DocumentFragment очищаем все дочерние элементы
    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }
  }

  // Рендерим каждый узел схемы
  for (const node of schema) {
    const element = renderNode(node, { state, context, core, update })
    if (element) {
      container.appendChild(element)
    }
  }
}

/**
 * Рендерит отдельный узел
 */
function renderNode<C extends ContextSchema>(
  node: Node,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  }
): HTMLElement | Text | null {
  switch (node.type) {
    case "el":
      return renderElement(node as NodeElement, params)
    case "text":
      return renderText(node as NodeText, params)
    default:
      return null
  }
}

/**
 * Рендерит HTML элемент
 */
function renderElement<C extends ContextSchema>(
  node: NodeElement,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  }
): HTMLElement {
  const element = document.createElement(node.tag)

  // Добавляем атрибуты
  if (node.string) {
    for (const [key, value] of Object.entries(node.string)) {
      element.setAttribute(key, String(value))
    }
  }

  // Рендерим дочерние элементы
  if (node.child) {
    for (const childNode of node.child) {
      const childElement = renderNode(childNode, params)
      if (childElement) {
        element.appendChild(childElement)
      }
    }
  }

  return element
}

/**
 * Рендерит текстовый узел
 */
function renderText<C extends ContextSchema>(
  node: NodeText,
  params: {
    state: string
    context: ExtractValues<C>
    core: Record<string, any>
    update: Update<C>
  }
): Text {
  let text = ""

  if (node.value) {
    // Статический текст
    text = node.value
  } else if (node.data && node.expr) {
    // Смешанный текст с интерполяцией
    text = evaluateExpression(node.expr, node.data, params.context)
  } else if (node.data) {
    // Простая интерполяция
    const value = getValueByPath(node.data, params.context)
    text = String(value)
  }

  return document.createTextNode(text)
}

/**
 * Получает значение по пути из объекта
 */
function getValueByPath(path: string | string[], obj: Record<string, any>): any {
  if (typeof path === "string") {
    // Убираем префикс "/context/" если есть
    const cleanPath = path.startsWith("/context/") ? path.slice(9) : path
    return obj[cleanPath]
  }

  // Для массива путей берем первый
  if (Array.isArray(path) && path.length > 0) {
    const firstPath = path[0]
    if (firstPath) {
      const cleanPath = firstPath.startsWith("/context/") ? firstPath.slice(9) : firstPath
      return obj[cleanPath]
    }
  }

  return undefined
}

/**
 * Вычисляет выражение с интерполяцией
 */
function evaluateExpression(expr: string, dataPath: string | string[], context: Record<string, any>): string {
  const value = getValueByPath(dataPath, context)

  // Заменяем ${0} на значение
  return expr.replace(/\$\{0\}/g, String(value))
}
