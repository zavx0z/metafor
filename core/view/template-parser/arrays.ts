import type { ArrayInfo } from "./index.t.ts"
import { extractTemplateContent, findClosingBrace } from "./utils.ts"

/**
 * Парсит блоки массивов с учетом вложенных backticks
 */
export function parseArrayBlocks(htmlString: string, arrayInfo: ArrayInfo[]): string {
  let processedHtml = htmlString
  const arrayStartPattern = /\$\{(context|core)\.(\w+)\.map\(/g

  let match
  while ((match = arrayStartPattern.exec(htmlString)) !== null) {
    const [startMatch, source, contextKey] = match
    const startIndex = match.index
    const afterStart = startIndex + startMatch.length

    // Ищем соответствующий html` и закрывающую скобку
    const htmlTemplateStart = htmlString.indexOf("html`", afterStart)
    if (htmlTemplateStart === -1) continue

    // Находим содержимое между html`...` учитывая вложенные backticks
    const templateContent = extractTemplateContent(htmlString, htmlTemplateStart + 5)
    if (!templateContent) continue

    // Находим закрывающую скобку после шаблона
    const afterTemplate = htmlTemplateStart + 5 + templateContent.length + 1 // +1 для закрывающего `
    const closingBrace = findClosingBrace(htmlString, startIndex)
    if (closingBrace === -1) continue

    // Извлекаем полное выражение массива
    const fullMatch = htmlString.substring(startIndex, closingBrace + 1)

    if (source && contextKey) {
      const placeholder = `CONTEXT_ARRAY_${arrayInfo.length}`
      arrayInfo.push({ placeholder, source, contextKey, itemTemplate: templateContent })
      processedHtml = processedHtml.replace(fullMatch, placeholder)
    }
  }

  return processedHtml
}


