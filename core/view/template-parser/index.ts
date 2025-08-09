/**
 * HTML Template Parser - модуль для парсинга HTML шаблонов в JSON схемы
 * @module TemplateParser
 */

import type { ArrayInfo, Schema, ElementSchema, TextSchema, AttributeValue } from "./index.t.ts"

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
    const interpolationMap = new Map<string, { src: string; key: string }>()

    let match
    while ((match = contextArrayPattern.exec(htmlString)) !== null) {
      const [fullMatch, source, contextKey, itemTemplate] = match
      if (source && contextKey && itemTemplate) {
        const placeholder = `CONTEXT_ARRAY_${arrayInfo.length}`
        arrayInfo.push({ placeholder, source, contextKey, itemTemplate })
        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    }

    // Обрабатываем простые интерполяции и сохраняем их информацию
    let interpolationIndex = 0
    processedHtml = processedHtml.replace(/\$\{(context|core)\.(\w+)\}/g, (match, src, key) => {
      const placeholder = `INTERPOLATION_${interpolationIndex++}`
      interpolationMap.set(placeholder, { src, key })
      return placeholder
    })

    // Заменяем оставшиеся интерполяции на простые плейсхолдеры
    processedHtml = processedHtml.replace(/\$\{[^}]*\}/g, "SIMPLE_PLACEHOLDER")

    // Парсим корневые элементы
    const elements: Schema = []
    const rootRegex = /<(\w+)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>)/g

    while ((match = rootRegex.exec(processedHtml)) !== null) {
      const [, tagName, attributesStr, innerContent] = match
      
      if (!tagName) continue

      const element: ElementSchema = {
        tag: tagName,
        type: "el",
      }

      // Парсим атрибуты
      const attrs = this.parseAttributes(attributesStr || "", interpolationMap)
      if (Object.keys(attrs).length > 0) {
        element.attrs = attrs
      }

      // Парсим дочерние элементы
      if (innerContent !== undefined) {
        const child = this.parseChildren(innerContent.trim(), arrayInfo, interpolationMap)
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
  private parseAttributes(attributesStr: string, interpolationMap?: Map<string, { src: string; key: string }>): Record<string, AttributeValue> {
    const attrs: Record<string, AttributeValue> = {}
    // Исправленный regex для атрибутов включая data-* и другие с дефисами
    const attrRegex = /([\w-]+)(?:\s*=\s*["']([^"']*)["'])?/g
    let match

    while ((match = attrRegex.exec(attributesStr)) !== null) {
      const [, name, value] = match
      if (name && value !== undefined) {
        attrs[name] = this.parseAttributeValue(value, interpolationMap)
      }
    }

    return attrs
  }

  /**
   * Парсит значение атрибута с поддержкой интерполяций
   */
  private parseAttributeValue(value: string, interpolationMap?: Map<string, { src: string; key: string }>): AttributeValue {
    // Проверяем плейсхолдеры из interpolationMap (чистые плейсхолдеры)
    if (interpolationMap) {
      for (const [placeholder, info] of interpolationMap) {
        if (value === placeholder) {
          return info
        }
      }
    }

    // Проверяем смешанный контент с плейсхолдерами
    if (interpolationMap) {
      for (const [placeholder, info] of interpolationMap) {
        if (value.includes(placeholder)) {
          // Восстанавливаем оригинальную интерполяцию для result
          const originalInterpolation = `\${${info.src}.${info.key}}`
          const resultValue = value.replace(placeholder, originalInterpolation)
          return {
            src: info.src,
            key: info.key,
            result: resultValue
          }
        }
      }
    }

    // Простая интерполяция: ${context.name} или ${core.setting} (если не была заменена)
    const simpleInterpolationMatch = value.match(/^\$\{(context|core)\.(\w+)\}$/)
    if (simpleInterpolationMatch) {
      const [, src, key] = simpleInterpolationMatch
      if (src && key) {
        return { src, key }
      }
    }

    // Смешанный контент с интерполяциями: prefix-${context.name} или ${context.name}-suffix (если не был заменен)
    const hasInterpolation = /\$\{(context|core)\.(\w+)\}/.test(value)
    if (hasInterpolation) {
      const interpolationMatch = value.match(/\$\{(context|core)\.(\w+)\}/)
      if (interpolationMatch) {
        const [, src, key] = interpolationMatch
        if (src && key) {
          return { src, key, result: value }
        }
      }
    }

    // Обычное статическое значение
    return value
  }

  /**
   * Парсит дочерние элементы
   */
  private parseChildren(content: string, arrayInfo: ArrayInfo[] = [], interpolationMap?: Map<string, { src: string; key: string }>): Array<ElementSchema | TextSchema> {
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
      } else if (content.trim().startsWith("INTERPOLATION_") && interpolationMap) {
        // Простая интерполяция
        const interpolationInfo = interpolationMap.get(content.trim())
        if (interpolationInfo) {
          child.push({
            type: "text",
            value: interpolationInfo,
          })
        }
      } else if (content.trim()) {
        // Обрабатываем смешанный текст с плейсхолдерами
        this.parseTextWithPlaceholders(content.trim(), child, interpolationMap)
      }
      return child
    }

    // Парсим вложенные элементы
    const tagRegex = /<(\w+)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>)/g
    let match
    let lastIndex = 0

    while ((match = tagRegex.exec(content)) !== null) {
      const [fullMatch, tagName, attributesStr, innerContent] = match
      
      if (!tagName) continue

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
          this.parseTextWithPlaceholders(textBefore, child, interpolationMap)
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

        const attrs = this.parseAttributes(attributesStr || "", interpolationMap)
        if (Object.keys(attrs).length > 0) {
          element.attrs = attrs
        }

        if (innerContent !== undefined) {
          const nestedChild = this.parseChildren(innerContent.trim(), arrayInfo, interpolationMap)
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
        this.parseTextWithPlaceholders(textAfter, child, interpolationMap)
      }
    }

    return child
  }

  /**
   * Парсит текст с плейсхолдерами
   */
  private parseTextWithPlaceholders(text: string, child: Array<ElementSchema | TextSchema>, interpolationMap?: Map<string, { src: string; key: string }>) {
    // Сначала обрабатываем простые интерполяции
    const interpolationPattern = /INTERPOLATION_\d+/g
    let processedText = text
    const interpolations: Array<{ index: number; info: { src: string; key: string } }> = []

    let match
    while ((match = interpolationPattern.exec(text)) !== null) {
      const interpolationInfo = interpolationMap?.get(match[0])
      if (interpolationInfo) {
        interpolations.push({
          index: match.index,
          info: interpolationInfo
        })
        processedText = processedText.replace(match[0], "SIMPLE_PLACEHOLDER")
      }
    }

    const parts = processedText.split("SIMPLE_PLACEHOLDER")
    let interpolationIndex = 0

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
        if (interpolationIndex < interpolations.length) {
          const interpolation = interpolations[interpolationIndex]
          if (interpolation) {
            // Это простая интерполяция
            child.push({
              type: "text",
              value: interpolation.info,
            })
          }
          interpolationIndex++
        } else {
          // Это интерполяция внутри массива
          child.push({
            type: "text",
            value: { src: "item" },
          })
        }
      }
    }
  }

  /**
   * Парсит шаблон элемента массива
   */
  private parseArrayItemTemplate(template: string, source: string, contextKey: string): ElementSchema {
    // Создаем карту интерполяций внутри элемента массива
    const itemInterpolationMap = new Map<string, { src: string; key?: string }>()
    let interpolationIndex = 0
    

    
    // Заменяем интерполяции внутри массива на плейсхолдеры с извлечением ключей
    let cleanTemplate = template
      // Сначала обрабатываем `item.key` формат  
      .replace(/\$\{(\w+)\.(\w+)\}/g, (match, itemName, key) => {
        const placeholder = `ITEM_INTERPOLATION_${interpolationIndex++}`
        itemInterpolationMap.set(placeholder, { src: "item", key })
        return placeholder
      })
      // Затем обрабатываем простые переменные без ключа (как ${id})
      .replace(/\$\{(\w+)\}/g, (match, itemName) => {
        const placeholder = `ITEM_INTERPOLATION_${interpolationIndex++}`
        itemInterpolationMap.set(placeholder, { src: "item" })
        return placeholder
      })
    
    // Заменяем оставшиеся интерполяции на SIMPLE_PLACEHOLDER
    cleanTemplate = cleanTemplate.replace(/\$\{[^}]*\}/g, "SIMPLE_PLACEHOLDER")

    // Парсим один элемент
    const tagRegex = /<(\w+)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>)/s
    const match = tagRegex.exec(cleanTemplate)

    if (!match) {
      // Если не удалось распарсить как элемент, возвращаем текстовый узел
      return {
        tag: "span", // fallback тег
        type: "el",
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
    
    if (!tagName) {
      // Если tagName undefined, возвращаем fallback
      return {
        tag: "span",
        type: "el",
        item: {
          src: source,
          key: contextKey,
        },
      }
    }

    const element: ElementSchema = {
      tag: tagName,
      type: "el",
      item: {
        src: source,
        key: contextKey,
      },
    }

    // Парсим атрибуты с заменой ITEM_INTERPOLATION на SIMPLE_PLACEHOLDER
    let processedAttributesStr = attributesStr || ""
    for (const [placeholder] of itemInterpolationMap) {
      processedAttributesStr = processedAttributesStr.replace(new RegExp(placeholder, 'g'), "SIMPLE_PLACEHOLDER")
    }
    
    const attrs = this.parseAttributesForArray(attributesStr || "", itemInterpolationMap)
    if (Object.keys(attrs).length > 0) {
      element.attrs = attrs
    }

    // Парсим дочерние элементы
    if (innerContent) {
      const child = this.parseChildrenForArrayItem(innerContent.trim(), itemInterpolationMap)
      if (child.length > 0) {
        element.child = child
      }
    }

    return element
  }

  /**
   * Парсит дочерние элементы для элементов массива
   */
  private parseChildrenForArrayItem(content: string, itemInterpolationMap: Map<string, { src: string; key?: string }>): Array<ElementSchema | TextSchema> {
    const child: Array<ElementSchema | TextSchema> = []

    // Обрабатываем интерполяции элементов массива  
    const itemInterpolationPattern = /ITEM_INTERPOLATION_\d+/g
    let processedContent = content
    const interpolations: Array<{ placeholder: string; info: { src: string; key?: string } }> = []

    // НЕ заменяем ITEM_INTERPOLATION в основном содержимом
    // Просто сохраняем их для обработки
    let match
    while ((match = itemInterpolationPattern.exec(content)) !== null) {
      const interpolationInfo = itemInterpolationMap.get(match[0])
      if (interpolationInfo) {
        interpolations.push({
          placeholder: match[0],
          info: interpolationInfo
        })
      }
    }
    
    // processedContent остается с ITEM_INTERPOLATION для корректной обработки

    // Если это только текст (без HTML тегов)
    if (!processedContent.includes("<")) {
      // Проверяем на ITEM_INTERPOLATION напрямую
      const itemMatch = content.trim().match(/^ITEM_INTERPOLATION_\d+$/)
      if (itemMatch) {
        const interpolationInfo = itemInterpolationMap.get(itemMatch[0])
        if (interpolationInfo) {
          child.push({
            type: "text",
            value: interpolationInfo,
          })
        } else {
          child.push({
            type: "text",
            value: { src: "item" },
          })
        }
      } else if (processedContent.trim() === "SIMPLE_PLACEHOLDER") {
        // Ищем первую подходящую интерполяцию
        if (interpolations.length > 0 && interpolations[0]) {
          child.push({
            type: "text",
            value: interpolations[0].info,
          })
        } else {
          // Это обычный SIMPLE_PLACEHOLDER без информации об источнике
          child.push({
            type: "text",
            value: { src: "item" },
          })
        }
      } else {
        // Смешанный текст с плейсхолдерами или ITEM_INTERPOLATION
        this.parseTextWithPlaceholdersForArray(content, child, interpolations, itemInterpolationMap)
      }
    } else {
      // Есть HTML элементы - парсим их
      const tagRegex = /<(\w+)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>)/g
      let tagMatch
      let lastIndex = 0

      while ((tagMatch = tagRegex.exec(content)) !== null) {
        const [fullMatch, tagName, attributesStr, innerContent] = tagMatch
        
        if (!tagName) continue

        // Добавляем текст перед тегом
        const textBefore = content.slice(lastIndex, tagMatch.index).trim()
        if (textBefore) {
          this.parseTextWithPlaceholdersForArray(textBefore, child, interpolations, itemInterpolationMap)
        }

        // Создаем элемент
        const element: ElementSchema = {
          tag: tagName,
          type: "el",
        }

        // Парсим атрибуты
        const attrs = this.parseAttributesForArray(attributesStr || "", itemInterpolationMap)
        if (Object.keys(attrs).length > 0) {
          element.attrs = attrs
        }

        // Парсим дочерние элементы рекурсивно
        if (innerContent !== undefined) {
          const nestedChild = this.parseChildrenForArrayItem(innerContent.trim(), itemInterpolationMap)
          if (nestedChild.length > 0) {
            element.child = nestedChild
          }
        }

        child.push(element)
        lastIndex = tagMatch.index + fullMatch.length
      }

      // Добавляем текст после последнего тега
      const textAfter = content.slice(lastIndex).trim()
      if (textAfter) {
        this.parseTextWithPlaceholdersForArray(textAfter, child, interpolations, itemInterpolationMap)
      }
    }

    return child
  }

  /**
   * Парсит текст с плейсхолдерами для элементов массива
   */
  private parseTextWithPlaceholdersForArray(text: string, child: Array<ElementSchema | TextSchema>, interpolations: Array<{ placeholder: string; info: { src: string; key?: string } }>, itemInterpolationMap: Map<string, { src: string; key?: string }>) {
    // Заменяем ITEM_INTERPOLATION на SIMPLE_PLACEHOLDER для обработки как смешанного текста
    const itemInterpolationPattern = /ITEM_INTERPOLATION_\d+/g
    let processedText = text
    const foundInterpolations: Array<{ src: string; key?: string }> = []
    
    let match
    while ((match = itemInterpolationPattern.exec(text)) !== null) {
      const interpolationInfo = itemInterpolationMap.get(match[0])
      if (interpolationInfo) {
        foundInterpolations.push(interpolationInfo)
        processedText = processedText.replace(match[0], "SIMPLE_PLACEHOLDER")
      }
    }

    const parts = processedText.split("SIMPLE_PLACEHOLDER")
    let interpolationIndex = 0

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]?.trim()

      if (part) {
        child.push({
          type: "text",
          value: part,
        })
      }

      if (i < parts.length - 1 && interpolationIndex < foundInterpolations.length) {
        const interpolation = foundInterpolations[interpolationIndex]
        if (interpolation) {
          child.push({
            type: "text",
            value: interpolation,
          })
        }
        interpolationIndex++
      }
    }
  }

  /**
   * Парсит атрибуты для элементов массива
   */
  private parseAttributesForArray(attributesStr: string, itemInterpolationMap: Map<string, { src: string; key?: string }>): Record<string, AttributeValue> {
    const attrs: Record<string, AttributeValue> = {}
    
    const attrRegex = /([\w-]+)(?:\s*=\s*["']([^"']*)["'])?/g
    let match

    while ((match = attrRegex.exec(attributesStr)) !== null) {
      const [, name, value] = match
      if (name && value !== undefined) {
        attrs[name] = this.parseAttributeValueForArray(value, itemInterpolationMap)
      }
    }

    return attrs
  }

  /**
   * Парсит значение атрибута для элементов массива
   */
  private parseAttributeValueForArray(value: string, itemInterpolationMap: Map<string, { src: string; key?: string }>): AttributeValue {
    // Простая интерполяция item: ${item.property}
    const simpleItemMatch = value.match(/^\$\{item\.(\w+)\}$/)
    if (simpleItemMatch) {
      const [, key] = simpleItemMatch
      if (key) {
        return { src: "item", key }
      }
    }

    // Простая переменная: ${id}
    const simpleVarMatch = value.match(/^\$\{(\w+)\}$/)
    if (simpleVarMatch) {
      return { src: "item" }
    }

    // Проверяем ITEM_INTERPOLATION плейсхолдеры
    for (const [placeholder, info] of itemInterpolationMap) {
      if (value.includes(placeholder)) {
        // Если это чистый плейсхолдер
        if (value === placeholder) {
          return info.key ? { src: info.src, key: info.key } : { src: info.src }
        }
        // Если это смешанный контент - восстанавливаем оригинальную интерполяцию
        const originalInterpolation = info.key ? `\${item.${info.key}}` : `\${id}` // для простых переменных используем общий паттерн
        const resultValue = value.replace(placeholder, originalInterpolation)
        return info.key ? {
          src: info.src,
          key: info.key,
          result: resultValue
        } : {
          src: info.src,
          result: resultValue
        }
      }
    }

    // Смешанный контент с item интерполяциями
    const hasItemInterpolation = /\$\{item\.(\w+)\}/.test(value)
    if (hasItemInterpolation) {
      const itemMatch = value.match(/\$\{item\.(\w+)\}/)
      if (itemMatch) {
        const [, key] = itemMatch
        if (key) {
          return { src: "item", key, result: value }
        }
      }
    }

    // Смешанный контент с простыми переменными
    const hasSimpleVar = /\$\{(\w+)\}/.test(value)
    if (hasSimpleVar) {
      return { src: "item", result: value }
    }

    // Обычное статическое значение
    return value
  }
}

/**
 * Создает экземпляр парсера и парсит HTML строку
 */
export function parseTemplate(htmlString: string): Schema {
  const parser = new TemplateParser()
  return parser.parseHtmlToSchema(htmlString)
}

// Реэкспорт типов
export type { ArrayInfo, Schema, ElementSchema, TextSchema, AttributeValue } from "./index.t.ts"


