/**
 * HTML Template Parser - модуль для парсинга HTML шаблонов в JSON схемы
 * @module TemplateParser
 */

export interface ArrayInfo {
  placeholder: string
  source: string
  contextKey: string
  itemTemplate: string
}

export interface ElementSchema {
  tag: string
  type: "el"
  attrs?: Record<string, string>
  child?: Array<ElementSchema | TextSchema>
  item?: {
    src: string
    key: string
  }
}

export interface TextSchema {
  type: "text"
  value: string | { src: "item" }
}

export type Schema = Array<ElementSchema | TextSchema>

/**
 * Основной класс парсера HTML шаблонов
 */
export class TemplateParser {
  /**
   * Парсит HTML строку в JSON схему
   */
  parseHtmlToSchema(htmlString: string): Schema {
    // Сначала находим и обрабатываем массивы из контекста и core
    const contextArrayPattern = /\$\{(context|core)\.(\w+)\.map\([^}]*html`([^`]*)`[^}]*\)\}/g
    let processedHtml = htmlString
    const arrayInfo: ArrayInfo[] = []

    let match
    while ((match = contextArrayPattern.exec(htmlString)) !== null) {
      const [fullMatch, source, contextKey, itemTemplate] = match
      if (source && contextKey && itemTemplate) {
        const placeholder = `CONTEXT_ARRAY_${arrayInfo.length}`
        arrayInfo.push({ placeholder, source, contextKey, itemTemplate })
        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    }

    // Заменяем остальные интерполяции на простые плейсхолдеры
    processedHtml = processedHtml.replace(/\$\{[^}]*\}/g, "SIMPLE_PLACEHOLDER")

    // Парсим корневые элементы
    const elements: Schema = []
    const rootRegex = /<(\w+)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>)/g

    while ((match = rootRegex.exec(processedHtml)) !== null) {
      const [, tagName, attributesStr, innerContent] = match

      const element: ElementSchema = {
        tag: tagName,
        type: "el",
      }

      // Парсим атрибуты
      const attrs = this.parseAttributes(attributesStr || "")
      if (Object.keys(attrs).length > 0) {
        element.attrs = attrs
      } else {
        element.attrs = {}
      }

      // Парсим дочерние элементы
      if (innerContent !== undefined) {
        const child = this.parseChildren(innerContent.trim(), arrayInfo)
        if (child.length > 0) {
          element.child = child
        }
      }

      elements.push(element)
    }

    return elements
  }

  /**
   * Парсит атрибуты элемента
   */
  private parseAttributes(attributesStr: string): Record<string, string> {
    const attrs: Record<string, string> = {}
    // Исправленный regex для атрибутов включая data-* и другие с дефисами
    const attrRegex = /([\w-]+)(?:\s*=\s*["']([^"']*)["'])?/g
    let match

    while ((match = attrRegex.exec(attributesStr)) !== null) {
      const [, name, value] = match
      if (name) {
        attrs[name] = value || ""
      }
    }

    return attrs
  }

  /**
   * Парсит дочерние элементы
   */
  private parseChildren(content: string, arrayInfo: ArrayInfo[] = []): Array<ElementSchema | TextSchema> {
    const child: Array<ElementSchema | TextSchema> = []

    // Проверяем на массивы из контекста
    for (const arrayItem of arrayInfo) {
      if (content.trim() === arrayItem.placeholder) {
        // Весь контент это плейсхолдер массива
        const itemElement = this.parseArrayItemTemplate(arrayItem.itemTemplate, arrayItem.source, arrayItem.contextKey)
        child.push(itemElement)
        return child
      }
    }

    // Если контент содержит только текст (без тегов)
    if (!content.includes("<")) {
      if (content.trim() === "SIMPLE_PLACEHOLDER") {
        // Интерполяция - добавляем заглушку для текста
        child.push({
          type: "text",
          value: { src: "item" },
        })
      } else if (content.trim()) {
        // Обрабатываем смешанный текст с плейсхолдерами
        this.parseTextWithPlaceholders(content.trim(), child)
      }
      return child
    }

    // Парсим вложенные элементы
    const tagRegex = /<(\w+)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>)/g
    let match
    let lastIndex = 0

    while ((match = tagRegex.exec(content)) !== null) {
      const [fullMatch, tagName, attributesStr, innerContent] = match

      // Добавляем текст перед тегом
      const textBefore = content.slice(lastIndex, match.index).trim()
      if (textBefore) {
        // Проверяем на плейсхолдер массива в тексте
        let isArrayPlaceholder = false
        for (const arrayItem of arrayInfo) {
          if (textBefore === arrayItem.placeholder) {
            const itemElement = this.parseArrayItemTemplate(
              arrayItem.itemTemplate,
              arrayItem.source,
              arrayItem.contextKey
            )
            child.push(itemElement)
            isArrayPlaceholder = true
            break
          }
        }

        if (!isArrayPlaceholder) {
          this.parseTextWithPlaceholders(textBefore, child)
        }
      }

      // Проверяем на плейсхолдер массива в теге
      let isArrayElement = false
      for (const arrayItem of arrayInfo) {
        if (fullMatch.includes(arrayItem.placeholder)) {
          const itemElement = this.parseArrayItemTemplate(
            arrayItem.itemTemplate,
            arrayItem.source,
            arrayItem.contextKey
          )
          child.push(itemElement)
          isArrayElement = true
          break
        }
      }

      if (!isArrayElement) {
        // Обычный элемент
        const element: ElementSchema = {
          tag: tagName,
          type: "el",
        }

        const attrs = this.parseAttributes(attributesStr || "")
        if (Object.keys(attrs).length > 0) {
          element.attrs = attrs
        } else {
          element.attrs = {}
        }

        if (innerContent !== undefined) {
          const nestedChild = this.parseChildren(innerContent.trim(), arrayInfo)
          if (nestedChild.length > 0) {
            element.child = nestedChild
          }
        }

        child.push(element)
      }

      lastIndex = match.index + fullMatch.length
    }

    // Добавляем текст после последнего тега
    const textAfter = content.slice(lastIndex).trim()
    if (textAfter) {
      // Проверяем на плейсхолдер массива в тексте
      let isArrayPlaceholder = false
      for (const arrayItem of arrayInfo) {
        if (textAfter === arrayItem.placeholder) {
          const itemElement = this.parseArrayItemTemplate(
            arrayItem.itemTemplate,
            arrayItem.source,
            arrayItem.contextKey
          )
          child.push(itemElement)
          isArrayPlaceholder = true
          break
        }
      }

      if (!isArrayPlaceholder) {
        this.parseTextWithPlaceholders(textAfter, child)
      }
    }

    return child
  }

  /**
   * Парсит текст с плейсхолдерами
   */
  private parseTextWithPlaceholders(text: string, child: Array<ElementSchema | TextSchema>) {
    const parts = text.split("SIMPLE_PLACEHOLDER")

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]?.trim()

      // Добавляем текстовую часть если она есть
      if (part) {
        child.push({
          type: "text",
          value: part,
        })
      }

      // Добавляем плейсхолдер если это не последняя часть
      if (i < parts.length - 1) {
        child.push({
          type: "text",
          value: { src: "item" },
        })
      }
    }
  }

  /**
   * Парсит шаблон элемента массива
   */
  private parseArrayItemTemplate(template: string, source: string, contextKey: string): ElementSchema {
    // Заменяем интерполяции в шаблоне элемента на плейсхолдеры
    const cleanTemplate = template.replace(/\$\{[^}]*\}/g, "SIMPLE_PLACEHOLDER")

    // Парсим один элемент
    const tagRegex = /<(\w+)([^>]*?)(?:\s*\/\s*>|>(.*?)<\/\1>)/s
    const match = tagRegex.exec(cleanTemplate)

    if (!match) {
      // Если не удалось распарсить как элемент, возвращаем текстовый узел
      return {
        tag: "span", // fallback тег
        type: "el",
        attrs: {},
        child: [
          {
            type: "text",
            value: { src: "item" },
          },
        ],
        item: {
          src: source,
          key: contextKey,
        },
      }
    }

    const [, tagName, attributesStr, innerContent] = match

    const element: ElementSchema = {
      tag: tagName,
      type: "el",
      item: {
        src: source,
        key: contextKey,
      },
    }

    // Парсим атрибуты
    const attrs = this.parseAttributes(attributesStr || "")
    if (Object.keys(attrs).length > 0) {
      element.attrs = attrs
    } else {
      // Добавляем пустые attrs если их нет (согласно тесту)
      element.attrs = {}
    }

    // Парсим дочерние элементы
    if (innerContent) {
      const child = this.parseChildren(innerContent.trim())
      if (child.length > 0) {
        element.child = child
      }
    }

    return element
  }
}

/**
 * Создает экземпляр парсера и парсит HTML строку
 */
export function parseTemplate(htmlString: string): Schema {
  const parser = new TemplateParser()
  return parser.parseHtmlToSchema(htmlString)
}
