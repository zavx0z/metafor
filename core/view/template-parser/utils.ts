import type { ConditionSchema } from "./index.t.ts"

/**
 * Извлекает содержимое template literal с учетом вложенных backticks
 */
export function extractTemplateContent(htmlString: string, startIndex: number): string | null {
  let depth = 0
  let i = startIndex
  let result = ""

  while (i < htmlString.length) {
    const char = htmlString[i]

    if (char === "h" && htmlString.substr(i, 5) === "html`") {
      // Начало вложенного template
      depth++
      result += htmlString.substr(i, 5)
      i += 5
      continue
    } else if (char === "`") {
      if (depth === 0) {
        // Это закрывающий backtick основного template
        return result
      } else {
        // Это закрывающий backtick вложенного template
        depth--
      }
    }

    result += char
    i++
  }

  return null // не найден закрывающий backtick
}

/**
 * Находит закрывающую скобку с учетом вложенности
 */
export function findClosingBrace(htmlString: string, startIndex: number): number {
  let depth = 0
  let i = startIndex

  while (i < htmlString.length) {
    const char = htmlString[i]

    if (char === "{") {
      depth++
    } else if (char === "}") {
      depth--
      if (depth === 0) {
        return i
      }
    }

    i++
  }

  return -1 // не найдена закрывающая скобка
}


