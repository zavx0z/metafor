/**
 * HTML Template Parser - модуль для парсинга HTML шаблонов в JSON схемы
 * @module TemplateParser
 */

import type { ArrayInfo, Schema, ElementSchema, TextSchema, AttributeValue, ConditionSchema } from "./index.t.ts"

interface ConditionalInfo {
  placeholder: string
  condition: ConditionSchema
  trueTemplate: string
  falseTemplate?: string
  type: "ternary" | "and" | "or"
}

/**
 * Основной класс парсера HTML шаблонов
 */
export class TemplateParser {
  /**
   * Парсит HTML строку в JSON схему
   */
  parseHtmlToSchema(htmlString: string): Schema {
    // Сначала находим и обрабатываем массивы из контекста и core
    let processedHtml = htmlString
    const arrayInfo: ArrayInfo[] = []
    const interpolationMap = new Map<string, { src: string; key: string }>()

    // Используем более умный парсер для массивов с вложенными backticks
    processedHtml = this.parseArrayBlocks(processedHtml, arrayInfo)

    // Обрабатываем условные блоки рекурсивно до полной обработки
    const conditionalInfo: ConditionalInfo[] = []
    processedHtml = this.parseConditionalBlocksRecursively(processedHtml, conditionalInfo)

    // Обрабатываем условные выражения в атрибутах
    const conditionalAttributeMap = new Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >()
    processedHtml = this.parseConditionalAttributes(processedHtml, conditionalAttributeMap)

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
    const rootRegex = /<(\w+)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>|>)/g

    let match
    while ((match = rootRegex.exec(processedHtml)) !== null) {
      const [, tagName, attributesStr, innerContent] = match

      if (!tagName) continue

      const element: ElementSchema = {
        tag: tagName,
        type: "el",
      }

      // Парсим атрибуты
      const attrs = this.parseAttributes(attributesStr || "", interpolationMap, conditionalAttributeMap)
      

      
      if (Object.keys(attrs).length > 0) {
        element.attrs = attrs
      }

      // Парсим дочерние элементы
      if (innerContent !== undefined) {
        const child = this.parseChildren(
          innerContent.trim(),
          arrayInfo,
          interpolationMap,
          conditionalInfo,
          conditionalAttributeMap
        )
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
  private parseAttributes(
    attributesStr: string,
    interpolationMap?: Map<string, { src: string; key: string }>,
    conditionalAttributeMap?: Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >
  ): Record<string, AttributeValue> {
    const attrs: Record<string, AttributeValue> = {}

    // Используем более сложный подход для правильной обработки кавычек
    let currentIndex = 0
    const length = attributesStr.length

    while (currentIndex < length) {
      // Пропускаем пробелы
      while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) {
        currentIndex++
      }
      if (currentIndex >= length) break

      // Ищем имя атрибута
      const nameStart = currentIndex
      while (currentIndex < length && /[\w-]/.test(attributesStr[currentIndex]!)) {
        currentIndex++
      }
      const name = attributesStr.slice(nameStart, currentIndex)
      if (!name) break

      // Пропускаем пробелы и знак равенства
      while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) {
        currentIndex++
      }
      if (currentIndex < length && attributesStr[currentIndex] === "=") {
        currentIndex++
        while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) {
          currentIndex++
        }

        // Ищем кавычки или плейсхолдеры
        if (currentIndex < length && (attributesStr[currentIndex] === '"' || attributesStr[currentIndex] === "'")) {
          const quote = attributesStr[currentIndex]!
          currentIndex++
          const valueStart = currentIndex

          // Ищем закрывающую кавычку
          while (currentIndex < length && attributesStr[currentIndex] !== quote) {
            currentIndex++
          }
          const value = attributesStr.slice(valueStart, currentIndex)
          currentIndex++ // Пропускаем закрывающую кавычку

          // Проверяем плейсхолдеры условных атрибутов
          if (conditionalAttributeMap) {
            let foundPlaceholder = false
            for (const [placeholder, info] of conditionalAttributeMap) {
              if (value === placeholder) {
                attrs[name] = {
                  src: info.src,
                  key: info.key,
                  trueValue: info.trueValue,
                  falseValue: info.falseValue,
                  type: "conditional" as const,
                }
                foundPlaceholder = true
                break
              }
              // Проверяем смешанный контент с условными плейсхолдерами
              if (value.includes(placeholder)) {
                const originalConditional = info.falseValue
                  ? `\${${info.src}.${info.key} ? '${info.trueValue}' : '${info.falseValue}'}`
                  : `\${${info.src}.${info.key} && '${info.trueValue}'}`
                const resultValue = value.replace(placeholder, originalConditional)

                attrs[name] = {
                  src: info.src,
                  key: info.key,
                  trueValue: info.trueValue,
                  falseValue: info.falseValue,
                  result: resultValue,
                  type: "conditional" as const,
                }
                foundPlaceholder = true
                break
              }
            }
            if (!foundPlaceholder) {
              attrs[name] = this.parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
            }
          } else {
            attrs[name] = this.parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
          }
        } else {
          // Значение без кавычек (может быть плейсхолдер)
          const valueStart = currentIndex
          while (currentIndex < length && !/\s/.test(attributesStr[currentIndex]!)) {
            currentIndex++
          }
          const value = attributesStr.slice(valueStart, currentIndex)
          
          // Проверяем плейсхолдеры условных атрибутов
          if (conditionalAttributeMap) {
            let foundPlaceholder = false
            for (const [placeholder, info] of conditionalAttributeMap) {
              if (value === placeholder) {
                attrs[name] = {
                  src: info.src,
                  key: info.key,
                  trueValue: info.trueValue,
                  falseValue: info.falseValue,
                  type: "conditional" as const,
                }
                foundPlaceholder = true
                break
              }
              // Проверяем смешанный контент с условными плейсхолдерами
              if (value.includes(placeholder)) {
                const originalConditional = info.falseValue
                  ? `\${${info.src}.${info.key} ? '${info.trueValue}' : '${info.falseValue}'}`
                  : `\${${info.src}.${info.key} && '${info.trueValue}'}`
                const resultValue = value.replace(placeholder, originalConditional)

                attrs[name] = {
                  src: info.src,
                  key: info.key,
                  trueValue: info.trueValue,
                  falseValue: info.falseValue,
                  result: resultValue,
                  type: "conditional" as const,
                }
                foundPlaceholder = true
                break
              }
            }
            if (!foundPlaceholder) {
              attrs[name] = this.parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
            }
          } else {
            attrs[name] = this.parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
          }
        }
      } else {
        // Булев атрибут без значения
        attrs[name] = ""
      }
    }

    return attrs
  }

  /**
   * Парсит значение атрибута с поддержкой интерполяций
   */
  private parseAttributeValue(
    value: string,
    interpolationMap?: Map<string, { src: string; key: string }>,
    conditionalAttributeMap?: Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >
  ): AttributeValue {
    // Проверяем условные атрибуты (приоритет выше чем обычные интерполяции)
    if (conditionalAttributeMap) {
      for (const [placeholder, info] of conditionalAttributeMap) {
        if (value === placeholder) {
          return {
            src: info.src,
            key: info.key,
            trueValue: info.trueValue,
            falseValue: info.falseValue,
            type: "conditional" as const,
          }
        }
        // Проверяем смешанный контент с условными плейсхолдерами
        if (value.includes(placeholder)) {
          // Восстанавливаем оригинальную условную строку
          const originalConditional = info.falseValue
            ? `\${${info.src}.${info.key} ? '${info.trueValue}' : '${info.falseValue}'}`
            : `\${${info.src}.${info.key} && '${info.trueValue}'}`
          const resultValue = value.replace(placeholder, originalConditional)

          return {
            src: info.src,
            key: info.key,
            trueValue: info.trueValue,
            falseValue: info.falseValue,
            result: resultValue,
            type: "conditional" as const,
          }
        }
      }
    }

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
            result: resultValue,
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
  private parseChildren(
    content: string,
    arrayInfo: ArrayInfo[] = [],
    interpolationMap?: Map<string, { src: string; key: string }>,
    conditionalInfo: ConditionalInfo[] = [],
    conditionalAttributeMap?: Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >
  ): Array<ElementSchema | TextSchema> {
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

    // Проверяем на условные блоки
    for (const conditionalItem of conditionalInfo) {
      if (content.trim() === conditionalItem.placeholder) {
        // Весь контент это условный блок
        const conditionalElements = this.parseConditionalElements(
          conditionalItem,
          arrayInfo,
          interpolationMap,
          conditionalInfo
        )
        child.push(...conditionalElements)
        return child
      }
    }

    // Если контент содержит только текст (без тегов)
    if (!content.includes("<")) {
      // Проверяем на условные блоки в основном контексте
      for (const conditionalItem of conditionalInfo) {
        if (content.trim() === conditionalItem.placeholder) {
          // Весь контент это условный блок
          const conditionalElements = this.parseConditionalElements(
            conditionalItem,
            arrayInfo,
            interpolationMap,
            conditionalInfo
          )
          child.push(...conditionalElements)
          return child
        }
      }

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
        this.parseTextWithPlaceholders(content.trim(), child, interpolationMap, conditionalInfo)
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
          this.parseTextWithPlaceholders(textBefore, child, interpolationMap, conditionalInfo)
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

        const attrs = this.parseAttributes(attributesStr || "", interpolationMap, conditionalAttributeMap)
        if (Object.keys(attrs).length > 0) {
          element.attrs = attrs
        }

        if (innerContent !== undefined) {
          const nestedChild = this.parseChildren(
            innerContent.trim(),
            arrayInfo,
            interpolationMap,
            conditionalInfo,
            conditionalAttributeMap
          )
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
        this.parseTextWithPlaceholders(textAfter, child, interpolationMap, conditionalInfo)
      }
    }

    return child
  }

  /**
   * Парсит текст с плейсхолдерами
   */
  private parseTextWithPlaceholders(
    text: string,
    child: Array<ElementSchema | TextSchema>,
    interpolationMap?: Map<string, { src: string; key: string }>,
    conditionalInfo: ConditionalInfo[] = []
  ) {
    // Сначала проверяем на условные блоки
    for (const conditionalItem of conditionalInfo) {
      if (text.trim() === conditionalItem.placeholder) {
        // Весь текст это условный блок
        const conditionalElements = this.parseConditionalElements(
          conditionalItem,
          [],
          interpolationMap,
          conditionalInfo
        )
        child.push(...conditionalElements)
        return
      }
    }

    // Затем обрабатываем простые интерполяции
    const interpolationPattern = /INTERPOLATION_\d+/g
    let processedText = text
    const interpolations: Array<{ index: number; info: { src: string; key: string } }> = []

    let match
    while ((match = interpolationPattern.exec(text)) !== null) {
      const interpolationInfo = interpolationMap?.get(match[0])
      if (interpolationInfo) {
        interpolations.push({
          index: match.index,
          info: interpolationInfo,
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

    // Сначала обрабатываем условные блоки внутри массива (только для item.*)
    const itemConditionalInfo: ConditionalInfo[] = []
    let cleanTemplate = this.parseConditionalBlocksForArray(template, itemConditionalInfo)

    // Обрабатываем условные атрибуты для item.*
    const itemConditionalAttributeMap = new Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >()
    cleanTemplate = this.parseConditionalAttributesForArray(cleanTemplate, itemConditionalAttributeMap)

    // Заменяем интерполяции внутри массива на плейсхолдеры с извлечением ключей
    cleanTemplate = cleanTemplate
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
      processedAttributesStr = processedAttributesStr.replace(new RegExp(placeholder, "g"), "SIMPLE_PLACEHOLDER")
    }

    const attrs = this.parseAttributesForArray(attributesStr || "", itemInterpolationMap, itemConditionalAttributeMap)
    if (Object.keys(attrs).length > 0) {
      element.attrs = attrs
    }

    // Парсим дочерние элементы
    if (innerContent) {
      const child = this.parseChildrenForArrayItem(
        innerContent.trim(),
        itemInterpolationMap,
        itemConditionalInfo,
        itemConditionalAttributeMap
      )
      if (child.length > 0) {
        element.child = child
      }
    }

    return element
  }

  /**
   * Парсит дочерние элементы для элементов массива
   */
  private parseChildrenForArrayItem(
    content: string,
    itemInterpolationMap: Map<string, { src: string; key?: string }>,
    itemConditionalInfo: ConditionalInfo[] = [],
    itemConditionalAttributeMap?: Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >
  ): Array<ElementSchema | TextSchema> {
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
          info: interpolationInfo,
        })
      }
    }

    // processedContent остается с ITEM_INTERPOLATION для корректной обработки

    // Проверяем на условные блоки в массиве
    for (const conditionalItem of itemConditionalInfo) {
      if (content.trim() === conditionalItem.placeholder) {
        // Весь контент это условный блок
        const conditionalElements = this.parseConditionalElementsForArray(
          conditionalItem,
          itemInterpolationMap,
          itemConditionalInfo
        )
        child.push(...conditionalElements)
        return child
      }
    }

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
        this.parseTextWithPlaceholdersForArray(
          content,
          child,
          interpolations,
          itemInterpolationMap,
          itemConditionalInfo
        )
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
          this.parseTextWithPlaceholdersForArray(
            textBefore,
            child,
            interpolations,
            itemInterpolationMap,
            itemConditionalInfo
          )
        }

        // Создаем элемент
        const element: ElementSchema = {
          tag: tagName,
          type: "el",
        }

        // Парсим атрибуты
        const attrs = this.parseAttributesForArray(
          attributesStr || "",
          itemInterpolationMap,
          itemConditionalAttributeMap
        )
        if (Object.keys(attrs).length > 0) {
          element.attrs = attrs
        }

        // Парсим дочерние элементы рекурсивно
        if (innerContent !== undefined) {
          const nestedChild = this.parseChildrenForArrayItem(
            innerContent.trim(),
            itemInterpolationMap,
            itemConditionalInfo
          )
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
        this.parseTextWithPlaceholdersForArray(
          textAfter,
          child,
          interpolations,
          itemInterpolationMap,
          itemConditionalInfo
        )
      }
    }

    return child
  }

  /**
   * Парсит текст с плейсхолдерами для элементов массива
   */
  private parseTextWithPlaceholdersForArray(
    text: string,
    child: Array<ElementSchema | TextSchema>,
    interpolations: Array<{ placeholder: string; info: { src: string; key?: string } }>,
    itemInterpolationMap: Map<string, { src: string; key?: string }>,
    itemConditionalInfo: ConditionalInfo[] = []
  ) {
    // Сначала проверяем на условные блоки
    for (const conditionalItem of itemConditionalInfo) {
      if (text.trim() === conditionalItem.placeholder) {
        // Весь текст это условный блок
        const conditionalElements = this.parseConditionalElementsForArray(
          conditionalItem,
          itemInterpolationMap,
          itemConditionalInfo
        )
        child.push(...conditionalElements)
        return
      }
    }

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
  private parseAttributesForArray(
    attributesStr: string,
    itemInterpolationMap: Map<string, { src: string; key?: string }>,
    itemConditionalAttributeMap?: Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >
  ): Record<string, AttributeValue> {
    const attrs: Record<string, AttributeValue> = {}

    // Используем более сложный подход для правильной обработки кавычек
    let currentIndex = 0
    const length = attributesStr.length

    while (currentIndex < length) {
      // Пропускаем пробелы
      while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) {
        currentIndex++
      }
      if (currentIndex >= length) break

      // Ищем имя атрибута
      const nameStart = currentIndex
      while (currentIndex < length && /[\w-]/.test(attributesStr[currentIndex]!)) {
        currentIndex++
      }
      const name = attributesStr.slice(nameStart, currentIndex)
      if (!name) break

      // Пропускаем пробелы и знак равенства
      while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) {
        currentIndex++
      }
      if (currentIndex < length && attributesStr[currentIndex] === "=") {
        currentIndex++
        while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) {
          currentIndex++
        }

        // Ищем кавычки
        if (currentIndex < length && (attributesStr[currentIndex] === '"' || attributesStr[currentIndex] === "'")) {
          const quote = attributesStr[currentIndex]!
          currentIndex++
          const valueStart = currentIndex

          // Ищем закрывающую кавычку
          while (currentIndex < length && attributesStr[currentIndex] !== quote) {
            currentIndex++
          }
          const value = attributesStr.slice(valueStart, currentIndex)
          currentIndex++ // Пропускаем закрывающую кавычку

          // Проверяем плейсхолдеры условных атрибутов
          if (itemConditionalAttributeMap) {
            let foundPlaceholder = false
            for (const [placeholder, info] of itemConditionalAttributeMap) {
              if (value === placeholder) {
                attrs[name] = {
                  src: info.src,
                  key: info.key,
                  trueValue: info.trueValue,
                  falseValue: info.falseValue,
                  type: "conditional" as const,
                }
                foundPlaceholder = true
                break
              }
              // Проверяем смешанный контент с условными плейсхолдерами
              if (value.includes(placeholder)) {
                const originalConditional = info.falseValue
                  ? `\${${info.src}.${info.key} ? '${info.trueValue}' : '${info.falseValue}'}`
                  : `\${${info.src}.${info.key} && '${info.trueValue}'}`
                const resultValue = value.replace(placeholder, originalConditional)

                attrs[name] = {
                  src: info.src,
                  key: info.key,
                  trueValue: info.trueValue,
                  falseValue: info.falseValue,
                  result: resultValue,
                  type: "conditional" as const,
                }
                foundPlaceholder = true
                break
              }
            }
            if (!foundPlaceholder) {
              attrs[name] = this.parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
            }
          } else {
            attrs[name] = this.parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
          }
        } else {
          // Значение без кавычек (нестандартный случай)
          const valueStart = currentIndex
          while (currentIndex < length && !/\s/.test(attributesStr[currentIndex]!)) {
            currentIndex++
          }
          const value = attributesStr.slice(valueStart, currentIndex)
          // Проверяем плейсхолдеры условных атрибутов
          if (itemConditionalAttributeMap) {
            let foundPlaceholder = false
            for (const [placeholder, info] of itemConditionalAttributeMap) {
              if (value === placeholder) {
                attrs[name] = {
                  src: info.src,
                  key: info.key,
                  trueValue: info.trueValue,
                  falseValue: info.falseValue,
                  type: "conditional" as const,
                }
                foundPlaceholder = true
                break
              }
              // Проверяем смешанный контент с условными плейсхолдерами
              if (value.includes(placeholder)) {
                const originalConditional = info.falseValue
                  ? `\${${info.src}.${info.key} ? '${info.trueValue}' : '${info.falseValue}'}`
                  : `\${${info.src}.${info.key} && '${info.trueValue}'}`
                const resultValue = value.replace(placeholder, originalConditional)

                attrs[name] = {
                  src: info.src,
                  key: info.key,
                  trueValue: info.trueValue,
                  falseValue: info.falseValue,
                  result: resultValue,
                  type: "conditional" as const,
                }
                foundPlaceholder = true
                break
              }
            }
            if (!foundPlaceholder) {
              attrs[name] = this.parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
            }
          } else {
            attrs[name] = this.parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
          }
        }
      } else {
        // Булев атрибут без значения
        attrs[name] = ""
      }
    }

    return attrs
  }

  /**
   * Парсит значение атрибута для элементов массива
   */
  private parseAttributeValueForArray(
    value: string,
    itemInterpolationMap: Map<string, { src: string; key?: string }>,
    itemConditionalAttributeMap?: Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >
  ): AttributeValue {
    // Проверяем условные атрибуты для массивов (приоритет выше чем обычные интерполяции)
    if (itemConditionalAttributeMap) {
      for (const [placeholder, info] of itemConditionalAttributeMap) {
        if (value === placeholder) {
          return {
            src: info.src,
            key: info.key,
            trueValue: info.trueValue,
            falseValue: info.falseValue,
            type: "conditional" as const,
          }
        }
        // Проверяем смешанный контент с условными плейсхолдерами
        if (value.includes(placeholder)) {
          return {
            src: info.src,
            key: info.key,
            trueValue: info.trueValue,
            falseValue: info.falseValue,
            result: info.result || value,
            type: "conditional" as const,
          }
        }
      }
    }

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
        return info.key
          ? {
              src: info.src,
              key: info.key,
              result: resultValue,
            }
          : {
              src: info.src,
              result: resultValue,
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

  /**
   * Парсит условные блоки в HTML строке
   */
  private parseConditionalBlocks(htmlString: string, conditionalInfo: ConditionalInfo[]): string {
    let processedHtml = htmlString

    // Используем умный парсер для условных блоков с вложенными backticks
    processedHtml = this.parseConditionalBlocksSmart(processedHtml, conditionalInfo)

    // Логическое И: ${condition && html`template`}
    const andPattern = /\$\{((?:context|core|item)\.(?:\w+))\s*&&\s*html`([^`]*)`\}/g

    let match
    while ((match = andPattern.exec(htmlString)) !== null) {
      const [fullMatch, conditionExpr, template] = match

      if (!conditionExpr || !template) continue

      const conditionParts = conditionExpr.split(".")
      if (conditionParts.length >= 2) {
        const src = conditionParts[0] as "context" | "core" | "item"
        const key = conditionParts[1]

        if (!key) continue

        const placeholder = `CONDITIONAL_${conditionalInfo.length}`
        const condition: ConditionSchema = { src, key, eq: true }

        conditionalInfo.push({
          placeholder,
          condition,
          trueTemplate: template,
          type: "and",
        })

        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    }

    // Логическое ИЛИ: ${condition || html`fallback`}
    const orPattern = /\$\{((?:context|core|item)\.(?:\w+))\s*\|\|\s*html`([^`]*)`\}/g

    match = null // reset match
    while ((match = orPattern.exec(htmlString)) !== null) {
      const [fullMatch, conditionExpr, template] = match

      if (!conditionExpr || !template) continue

      const conditionParts = conditionExpr.split(".")
      if (conditionParts.length >= 2) {
        const src = conditionParts[0] as "context" | "core" | "item"
        const key = conditionParts[1]

        if (!key) continue

        const placeholder = `CONDITIONAL_${conditionalInfo.length}`
        const condition: ConditionSchema = { src, key, eq: null } // fallback когда значение пустое/null

        conditionalInfo.push({
          placeholder,
          condition,
          trueTemplate: template, // в случае || это fallback шаблон
          type: "or",
        })

        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    }

    return processedHtml
  }

  /**
   * Рекурсивно обрабатывает условные блоки до полной обработки
   */
  private parseConditionalBlocksRecursively(htmlString: string, conditionalInfo: ConditionalInfo[]): string {
    let processedHtml = htmlString
    let hasChanges = true
    let maxIterations = 10 // защита от бесконечной рекурсии
    let iteration = 0

    while (hasChanges && iteration < maxIterations) {
      const beforeLength = processedHtml.length
      const beforeConditionalCount = conditionalInfo.length

      // Обрабатываем один уровень условных блоков в основной строке
      processedHtml = this.parseConditionalBlocks(processedHtml, conditionalInfo)

      // Также обрабатываем условные блоки внутри уже найденных templates
      for (let i = beforeConditionalCount; i < conditionalInfo.length; i++) {
        const conditionalItem = conditionalInfo[i]

        if (conditionalItem && conditionalItem.trueTemplate) {
          conditionalItem.trueTemplate = this.parseConditionalBlocks(conditionalItem.trueTemplate, conditionalInfo)
        }

        if (conditionalItem && conditionalItem.falseTemplate) {
          conditionalItem.falseTemplate = this.parseConditionalBlocks(conditionalItem.falseTemplate, conditionalInfo)
        }
      }

      // Проверяем были ли изменения
      hasChanges = processedHtml.length !== beforeLength || conditionalInfo.length !== beforeConditionalCount
      iteration++
    }

    if (iteration >= maxIterations) {
      console.warn("Достигнут максимум итераций при рекурсивной обработке условных блоков")
    }

    return processedHtml
  }

  /**
   * Парсит условные выражения в атрибутах
   */
  private parseConditionalAttributes(
    htmlString: string,
    conditionalAttributeMap: Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >
  ): string {
    let processedHtml = htmlString
    let conditionalIndex = 0
    


    // Тернарный оператор в атрибутах: ${condition ? 'true' : 'false'}
    const ternaryPattern = /\$\{((?:context|core|item)\.(?:\w+))\s*\?\s*['"]([^'"]*)['"]\s*:\s*['"]([^'"]*)['"]\}/g

    let match
    while ((match = ternaryPattern.exec(htmlString)) !== null) {
      const [fullMatch, conditionExpr, trueValue, falseValue] = match

      if (!conditionExpr) continue

      const conditionParts = conditionExpr.split(".")
      if (conditionParts.length >= 2) {
        const src = conditionParts[0] as "context" | "core" | "item"
        const key = conditionParts[1]

        if (key) {
          const placeholder = `CONDITIONAL_ATTR_${conditionalIndex++}`

          const conditionalInfo: { src: string; key: string; trueValue: string; falseValue?: string } = {
            src,
            key,
            trueValue: trueValue || "",
          }

          if (falseValue !== undefined) {
            conditionalInfo.falseValue = falseValue
          }

          conditionalAttributeMap.set(placeholder, conditionalInfo)

          processedHtml = processedHtml.replace(fullMatch, placeholder)
        }
      }
    }

    // Логическое И в атрибутах: ${condition && 'value'}
    const andPattern = /\$\{((?:context|core|item)\.(?:\w+))\s*&&\s*['"]([^'"]*)['"]\}/g
    


    while ((match = andPattern.exec(htmlString)) !== null) {
      const [fullMatch, conditionExpr, trueValue] = match

      if (!conditionExpr) continue

      const conditionParts = conditionExpr.split(".")
      if (conditionParts.length >= 2) {
        const src = conditionParts[0] as "context" | "core" | "item"
        const key = conditionParts[1]

        if (key) {
          const placeholder = `CONDITIONAL_ATTR_${conditionalIndex++}`

          conditionalAttributeMap.set(placeholder, {
            src,
            key,
            trueValue: trueValue || "",
          })

          processedHtml = processedHtml.replace(fullMatch, placeholder)
        }
      }
    }

    return processedHtml
  }

  /**
   * Парсит условные выражения в атрибутах для элементов массива
   */
  private parseConditionalAttributesForArray(
    template: string,
    itemConditionalAttributeMap: Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >
  ): string {
    let processedTemplate = template
    let conditionalIndex = 0

    // Тернарный оператор для item: ${item.property ? 'true' : 'false'}
    const ternaryPattern = /\$\{(\w+)\.(\w+)\s*\?\s*['"]([^'"]*)['"]\s*:\s*['"]([^'"]*)['"]\}/g

    let match
    while ((match = ternaryPattern.exec(template)) !== null) {
      const [fullMatch, itemName, key, trueValue, falseValue] = match

      if (!key) continue

      const placeholder = `CONDITIONAL_ATTR_ITEM_${conditionalIndex++}`

      const conditionalInfo: { src: string; key: string; trueValue: string; falseValue?: string } = {
        src: "item",
        key,
        trueValue: trueValue || "",
      }

      if (falseValue) {
        conditionalInfo.falseValue = falseValue
      }

      itemConditionalAttributeMap.set(placeholder, conditionalInfo)

      processedTemplate = processedTemplate.replace(fullMatch, placeholder)
    }

    // Логическое И для item: ${item.property && 'value'}
    const andPattern = /\$\{(\w+)\.(\w+)\s*&&\s*['"]([^'"]*)['"]\}/g

    while ((match = andPattern.exec(template)) !== null) {
      const [fullMatch, itemName, key, trueValue] = match

      if (!key) continue

      const placeholder = `CONDITIONAL_ATTR_ITEM_${conditionalIndex++}`

      itemConditionalAttributeMap.set(placeholder, {
        src: "item",
        key,
        trueValue: trueValue || "",
      })

      processedTemplate = processedTemplate.replace(fullMatch, placeholder)
    }

    return processedTemplate
  }

  /**
   * Умный парсер условных блоков с поддержкой вложенных backticks
   */
  private parseConditionalBlocksSmart(htmlString: string, conditionalInfo: ConditionalInfo[]): string {
    let processedHtml = htmlString
    const conditionalStartPattern = /\$\{((?:context|core|item)\.(?:\w+))(?:\s*===\s*"([^"]+)")?\s*\?\s*/g

    let match
    while ((match = conditionalStartPattern.exec(htmlString)) !== null) {
      const [startMatch, conditionExpr, compareValue] = match
      const startIndex = match.index
      const afterStart = startIndex + startMatch.length

      // Ищем первый html`
      const htmlTemplateStart = htmlString.indexOf("html`", afterStart)
      if (htmlTemplateStart === -1) continue

      // Извлекаем true template
      const trueContent = this.extractTemplateContent(htmlString, htmlTemplateStart + 5)
      if (trueContent === null) continue

      // Ищем `:` после true template
      const afterTrueTemplate = htmlTemplateStart + 5 + trueContent.length + 1 // +1 для закрывающего `
      const colonIndex = htmlString.indexOf(":", afterTrueTemplate)
      if (colonIndex === -1) continue

      // Ищем второй html`
      const htmlTemplateStart2 = htmlString.indexOf("html`", colonIndex)
      if (htmlTemplateStart2 === -1) continue

      // Извлекаем false template
      const falseContent = this.extractTemplateContent(htmlString, htmlTemplateStart2 + 5)
      if (falseContent === null) continue

      // Находим закрывающую скобку
      const afterFalseTemplate = htmlTemplateStart2 + 5 + falseContent.length + 1 // +1 для закрывающего `
      const closingBrace = this.findClosingBrace(htmlString, startIndex)
      if (closingBrace === -1) continue

      // Извлекаем полное выражение
      const fullMatch = htmlString.substring(startIndex, closingBrace + 1)

      // Парсим условие
      if (!conditionExpr) continue

      const conditionParts = conditionExpr.split(".")
      if (conditionParts.length >= 2) {
        const src = conditionParts[0] as "context" | "core" | "item"
        const key = conditionParts[1]

        if (key) {
          const placeholder = `CONDITIONAL_${conditionalInfo.length}`
          const condition: ConditionSchema = compareValue ? { src, key, eq: compareValue } : { src, key, eq: true }

          conditionalInfo.push({
            placeholder,
            condition,
            trueTemplate: trueContent,
            falseTemplate: falseContent,
            type: "ternary",
          })

          processedHtml = processedHtml.replace(fullMatch, placeholder)
        }
      }
    }

    return processedHtml
  }

  /**
   * Парсит условные блоки для элементов массива (только item.*)
   */
  private parseConditionalBlocksForArray(htmlString: string, conditionalInfo: ConditionalInfo[]): string {
    let processedHtml = htmlString

    // Тернарный оператор для переменных массива: ${varname.property ? html`true` : html`false`}
    const ternaryPattern = /\$\{((\w+)\.(\w+))(?:\s*===\s*"([^"]+)")?\s*\?\s*html`([^`]*)`\s*:\s*html`([^`]*)`\}/g

    let match
    while ((match = ternaryPattern.exec(htmlString)) !== null) {
      const [fullMatch, conditionExpr, varName, key, value, trueTemplate, falseTemplate] = match

      if (!conditionExpr || !key) continue

      const placeholder = `CONDITIONAL_${conditionalInfo.length}`
      const condition: ConditionSchema = value ? { src: "item", key, eq: value } : { src: "item", key, eq: true }

      conditionalInfo.push({
        placeholder,
        condition,
        trueTemplate: trueTemplate || "",
        falseTemplate: falseTemplate || "",
        type: "ternary",
      })

      processedHtml = processedHtml.replace(fullMatch, placeholder)
    }

    // Логическое И для переменных массива: ${varname.property && html`template`}
    const andPattern = /\$\{((\w+)\.(\w+))\s*&&\s*html`([^`]*)`\}/g

    while ((match = andPattern.exec(htmlString)) !== null) {
      const [fullMatch, conditionExpr, varName, key, template] = match

      if (!conditionExpr || !template || !key) continue

      const placeholder = `CONDITIONAL_${conditionalInfo.length}`
      const condition: ConditionSchema = { src: "item", key, eq: true }

      conditionalInfo.push({
        placeholder,
        condition,
        trueTemplate: template,
        type: "and",
      })

      processedHtml = processedHtml.replace(fullMatch, placeholder)
    }

    // Логическое ИЛИ для переменных массива: ${varname.property || html`fallback`}
    const orPattern = /\$\{((\w+)\.(\w+))\s*\|\|\s*html`([^`]*)`\}/g

    while ((match = orPattern.exec(htmlString)) !== null) {
      const [fullMatch, conditionExpr, varName, key, template] = match

      if (!conditionExpr || !template || !key) continue

      const placeholder = `CONDITIONAL_${conditionalInfo.length}`
      const condition: ConditionSchema = { src: "item", key, eq: null }

      conditionalInfo.push({
        placeholder,
        condition,
        trueTemplate: template,
        type: "or",
      })

      processedHtml = processedHtml.replace(fullMatch, placeholder)
    }

    return processedHtml
  }

  /**
   * Парсит условный блок в элементы с полем cond
   */
  private parseConditionalElements(
    conditionalItem: ConditionalInfo,
    arrayInfo: ArrayInfo[],
    interpolationMap?: Map<string, { src: string; key: string }>,
    conditionalInfo: ConditionalInfo[] = []
  ): Array<ElementSchema | TextSchema> {
    const elements: Array<ElementSchema | TextSchema> = []

    // Парсим true ветвь
    if (conditionalItem.trueTemplate) {
      const trueElements = this.parseChildren(
        conditionalItem.trueTemplate,
        arrayInfo,
        interpolationMap,
        conditionalInfo
      )
      trueElements.forEach((element) => {
        if (element.type === "el") {
          // Добавляем условие eq: true к элементу
          ;(element as ElementSchema).cond = conditionalItem.condition
        }
        elements.push(element)
      })
    }

    // Парсим false ветвь (если есть)
    if (conditionalItem.falseTemplate && conditionalItem.type === "ternary") {
      const falseElements = this.parseChildren(
        conditionalItem.falseTemplate,
        arrayInfo,
        interpolationMap,
        conditionalInfo
      )
      falseElements.forEach((element) => {
        if (element.type === "el") {
          // Добавляем условие eq: false к элементу
          const falseCondition: ConditionSchema =
            conditionalItem.condition.eq !== undefined && conditionalItem.condition.eq !== true
              ? { ...conditionalItem.condition, notEq: conditionalItem.condition.eq }
              : { ...conditionalItem.condition, eq: false }

          // Удаляем eq если добавили notEq
          if (falseCondition.notEq !== undefined) {
            delete falseCondition.eq
          }

          ;(element as ElementSchema).cond = falseCondition
        }
        elements.push(element)
      })
    }

    return elements
  }

  /**
   * Парсит условный блок для элементов массива
   */
  private parseConditionalElementsForArray(
    conditionalItem: ConditionalInfo,
    itemInterpolationMap: Map<string, { src: string; key?: string }>,
    itemConditionalInfo: ConditionalInfo[] = []
  ): Array<ElementSchema | TextSchema> {
    const elements: Array<ElementSchema | TextSchema> = []

    // Парсим true ветвь
    if (conditionalItem.trueTemplate) {
      // Обрабатываем интерполяции в шаблоне
      const processedTrueTemplate = this.processInterpolationsInTemplate(
        conditionalItem.trueTemplate,
        itemInterpolationMap
      )
      const trueElements = this.parseChildrenForArrayItem(
        processedTrueTemplate,
        itemInterpolationMap,
        itemConditionalInfo
      )
      trueElements.forEach((element) => {
        if (element.type === "el") {
          // Добавляем условие eq: true к элементу
          ;(element as ElementSchema).cond = conditionalItem.condition
        }
        elements.push(element)
      })
    }

    // Парсим false ветвь (если есть)
    if (conditionalItem.falseTemplate && conditionalItem.type === "ternary") {
      // Обрабатываем интерполяции в шаблоне
      const processedFalseTemplate = this.processInterpolationsInTemplate(
        conditionalItem.falseTemplate,
        itemInterpolationMap
      )
      const falseElements = this.parseChildrenForArrayItem(
        processedFalseTemplate,
        itemInterpolationMap,
        itemConditionalInfo
      )
      falseElements.forEach((element) => {
        if (element.type === "el") {
          // Добавляем условие eq: false к элементу
          const falseCondition: ConditionSchema =
            conditionalItem.condition.eq !== undefined && conditionalItem.condition.eq !== true
              ? { ...conditionalItem.condition, notEq: conditionalItem.condition.eq }
              : { ...conditionalItem.condition, eq: false }

          // Удаляем eq если добавили notEq
          if (falseCondition.notEq !== undefined) {
            delete falseCondition.eq
          }

          ;(element as ElementSchema).cond = falseCondition
        }
        elements.push(element)
      })
    }

    return elements
  }

  /**
   * Обрабатывает интерполяции в шаблоне условного блока
   */
  private processInterpolationsInTemplate(
    template: string,
    itemInterpolationMap: Map<string, { src: string; key?: string }>
  ): string {
    let processedTemplate = template
    let interpolationIndex = itemInterpolationMap.size

    // Заменяем интерполяции varname.key на плейсхолдеры (для любых имен переменных)
    processedTemplate = processedTemplate.replace(/\$\{(\w+)\.(\w+)\}/g, (match, varName, key) => {
      const placeholder = `ITEM_INTERPOLATION_${interpolationIndex++}`
      itemInterpolationMap.set(placeholder, { src: "item", key })
      return placeholder
    })

    // Заменяем простые переменные без ключа (как ${id})
    processedTemplate = processedTemplate.replace(/\$\{(\w+)\}/g, (match, varName) => {
      // Исключаем переменные которые могут быть другими (context, core)
      if (!["context", "core"].includes(varName)) {
        const placeholder = `ITEM_INTERPOLATION_${interpolationIndex++}`
        itemInterpolationMap.set(placeholder, { src: "item" })
        return placeholder
      }
      return match
    })

    return processedTemplate
  }

  /**
   * Парсит блоки массивов с учетом вложенных backticks
   */
  private parseArrayBlocks(htmlString: string, arrayInfo: ArrayInfo[]): string {
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
      const templateContent = this.extractTemplateContent(htmlString, htmlTemplateStart + 5)
      if (!templateContent) continue

      // Находим закрывающую скобку после шаблона
      const afterTemplate = htmlTemplateStart + 5 + templateContent.length + 1 // +1 для закрывающего `
      const closingBrace = this.findClosingBrace(htmlString, startIndex)
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

  /**
   * Извлекает содержимое template literal с учетом вложенных backticks
   */
  private extractTemplateContent(htmlString: string, startIndex: number): string | null {
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
  private findClosingBrace(htmlString: string, startIndex: number): number {
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
}

/**
 * Создает экземпляр парсера и парсит HTML строку
 */
export function parseTemplate(htmlString: string): Schema {
  const parser = new TemplateParser()
  return parser.parseHtmlToSchema(htmlString)
}

// Реэкспорт типов
export type { ArrayInfo, Schema, ElementSchema, TextSchema, AttributeValue, ConditionSchema } from "./index.t.ts"
