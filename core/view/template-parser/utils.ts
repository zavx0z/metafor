import type { Schema, ElementSchema, TextSchema, ArrayInfo, ConditionalInfo, ConditionalAttributeInfo } from "./index.t"
import { parseAttributes, parseConditionalAttributes, parseConditionalAttributesForArray } from "./attributes"
import { parseConditionalBlocks } from "./conditionals"
import { parseArrayBlocks } from "./arrays"

// Функция для обработки интерполяций в template literals
export function processInterpolationsInTemplate(template: string, interpolationMap: Map<string, string>, itemName?: string): string {
  let result = template;
  let counter = 0;
  
  // Ищем интерполяции вида ${item.property}
  const interpolationPattern = /\$\{([^}]+)\}/g;
  let match;
  
  while ((match = interpolationPattern.exec(template)) !== null) {
    const [fullMatch, interpolation] = match;
    const placeholder = `ITEM_INTERPOLATION_${counter}`;
    
    // Заменяем имя переменной на "item" для единообразия
    let normalizedInterpolation = interpolation.trim();
    if (itemName && normalizedInterpolation.startsWith(itemName + ".")) {
      normalizedInterpolation = normalizedInterpolation.replace(itemName + ".", "item.");
    } else if (itemName && normalizedInterpolation === itemName) {
      normalizedInterpolation = "item";
    }
    
    interpolationMap.set(placeholder, normalizedInterpolation);
    result = result.replace(fullMatch, placeholder);
    counter++;
  }
  
  return result;
}

// Функция для парсинга интерполяций в HTML строке
export function parseInterpolations(htmlString: string): {
  processedHtml: string
  interpolationMap: Map<string, string>
} {
  const interpolationMap = new Map<string, string>()
  let processedHtml = htmlString
  let counter = 0

  // Ищем все интерполяции вида ${...}
  const interpolationPattern = /\$\{([^}]+)\}/g
  let match

  while ((match = interpolationPattern.exec(htmlString)) !== null) {
    const [fullMatch, interpolation] = match
    const placeholder = `INTERPOLATION_${counter}`

    interpolationMap.set(placeholder, interpolation.trim())
    processedHtml = processedHtml.replace(fullMatch, placeholder)
    counter++
  }

  return {
    processedHtml,
    interpolationMap,
  }
}

// Парсинг дочерних элементов
export function parseChildren(
  childrenStr: string,
  interpolationMap?: Map<string, string>,
  conditionalAttributeMap?: Map<string, { condition: string; trueValue: string; falseValue?: string }>
): (ElementSchema | TextSchema)[] {
  const children: (ElementSchema | TextSchema)[] = []

  if (!childrenStr.trim()) {
    return children
  }

  // Обрабатываем условные блоки
  const conditionalInfo: Array<{ condition: string; trueTemplate: string; falseTemplate: string }> = []
  let processedChildren = parseConditionalBlocks(childrenStr, conditionalInfo)

  // Разбиваем на отдельные элементы и текст
  const elementRegex = /<([a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*)([^>]*?)(?:\s*\/\s*>|>([^<]*(?:<(?!\/\1)[^<]*)*)<\/\1>)/g
  let match
  let lastIndex = 0

  while ((match = elementRegex.exec(processedChildren)) !== null) {
    const [fullMatch, tagName, attributesStr, content] = match
    const startIndex = match.index

    // Добавляем текст перед элементом
    if (startIndex > lastIndex) {
      const textBefore = processedChildren.substring(lastIndex, startIndex).trim()
      if (textBefore) {
        // Обрабатываем смешанный контент с интерполяциями
        const textParts = parseTextIntoSegments(textBefore, interpolationMap, conditionalInfo)
        children.push(...textParts)
      }
    }

    // Парсим атрибуты
    const attributes = parseAttributes(attributesStr, interpolationMap, conditionalAttributeMap)

    // Создаем элемент
    const element: ElementSchema = {
      type: "el",
      tag: tagName,
    }

    // Добавляем атрибуты только если они есть
    if (Object.keys(attributes).length > 0) {
      element.attrs = attributes
    }

    // Парсим содержимое элемента (если есть)
    if (content !== undefined) {
      const childElements = parseChildren(content, interpolationMap, conditionalAttributeMap)
      if (childElements.length > 0) {
        element.child = childElements
      }
    }

    children.push(element)
    lastIndex = startIndex + fullMatch.length
  }

  // Добавляем оставшийся текст
  if (lastIndex < processedChildren.length) {
    const remainingText = processedChildren.substring(lastIndex).trim()
    if (remainingText) {
      // Обрабатываем смешанный контент с интерполяциями
      const textParts = parseTextIntoSegments(remainingText, interpolationMap, conditionalInfo)
      children.push(...textParts)
    }
  }

  return children
}

// Разбиение текста на сегменты для обработки смешанного контента
function parseTextIntoSegments(
  text: string,
  interpolationMap?: Map<string, string>,
  conditionalInfo?: Array<{ condition: string; trueTemplate: string; falseTemplate: string }>
): TextSchema[] {
  if (!interpolationMap) {
    return [parseTextWithPlaceholders(text, interpolationMap, conditionalInfo)]
  }

  // Ищем все интерполяции в тексте
  let segments: TextSchema[] = []
  let currentText = text
  let found = false

  for (const [placeholder, interpolation] of interpolationMap) {
    if (currentText.includes(placeholder)) {
      const parts = currentText.split(placeholder)
      if (parts.length === 2) {
        found = true
                          // Добавляем текст до интерполяции
         if (parts[0]) {
           segments.push({ type: "text", value: parts[0] })
        }
        
        // Добавляем интерполяцию
        if (interpolation === "item") {
          segments.push({
            type: "text",
            value: { src: "item" }
          })
        } else {
          const propertyName = interpolation.split(".").pop() || interpolation
          const basePath = interpolation.split(".")[0] || interpolation
          segments.push({
            type: "text",
            value: { src: basePath, key: propertyName }
          })
        }
        
        // Добавляем текст после интерполяции
        if (parts[1]) {
          segments.push({ type: "text", value: parts[1] })
        }
        
        return segments
      }
    }
  }

  // Если не найдено интерполяций, возвращаем как есть
  return [parseTextWithPlaceholders(text, interpolationMap, conditionalInfo)]
}

// Парсинг текста с плейсхолдерами
export function parseTextWithPlaceholders(
  text: string,
  interpolationMap?: Map<string, string>,
  conditionalInfo?: Array<{ condition: string; trueTemplate: string; falseTemplate: string }>
): TextSchema {
  if (!text) {
    return { type: "text", value: "" }
  }

  // Проверяем, является ли текст условным блоком
  if (conditionalInfo) {
    for (let i = 0; i < conditionalInfo.length; i++) {
      const placeholder = `CONDITIONAL_${i}`
      if (text.trim() === placeholder) {
        const conditional = conditionalInfo[i]
        return {
          type: "text",
          value: "",
          cond: {
            src: conditional.condition.split(".")[0] || conditional.condition,
            key: conditional.condition.split(".").pop() || conditional.condition,
            eq: true,
          },
          trueContent: conditional.trueTemplate,
          falseContent: conditional.falseTemplate,
        } as any
      }
    }
  }

  // Проверяем, является ли текст плейсхолдером массива
  if (text.includes("CONTEXT_ARRAY_")) {
    return { type: "text", value: text }
  }

  // Проверяем, является ли текст интерполяцией
  if (interpolationMap) {
    for (const [placeholder, interpolation] of interpolationMap) {
      if (text.trim() === placeholder) {
        // Извлекаем только имя свойства из полного пути
        const propertyName = interpolation.split(".").pop() || interpolation
        // Извлекаем базовый путь (context или core)
        const basePath = interpolation.split(".")[0] || interpolation
        
        // Если это простая переменная без свойства (например, ${item})
        if (interpolation === "item") {
          return {
            type: "text",
            value: {
              src: "item",
            },
          }
        }
        
        return {
          type: "text",
          value: {
            src: basePath,
            key: propertyName,
          },
        }
      }
    }
  }

  // Проверяем, содержит ли текст интерполяции (смешанный контент)
  if (text.includes("INTERPOLATION_") || text.includes("ITEM_INTERPOLATION_") || text.includes("${")) {
    let hasInterpolation = false
    let resultText = text

    if (interpolationMap) {
      for (const [placeholder, interpolation] of interpolationMap) {
        if (text.includes(placeholder)) {
          hasInterpolation = true
          // Для смешанного контента разбиваем на части
          const parts = text.split(placeholder)
          if (parts.length === 2 && parts[0] && parts[1]) {
            // Смешанный контент - создаем несколько текстовых узлов
            return { type: "text", value: text }
          } else if (parts.length === 2 && parts[0] && !parts[1]) {
            // Интерполяция в конце
            return { type: "text", value: text }
          } else if (parts.length === 2 && !parts[0] && parts[1]) {
            // Интерполяция в начале
            return { type: "text", value: text }
          }
        }
      }
    }

    if (hasInterpolation) {
      // Если есть интерполяции, возвращаем как есть, рендерер разберется
      return { type: "text", value: text }
    }
  }

  // Обычный текст
  return { type: "text", value: text }
}

// Основная функция парсинга HTML в схему
export function parseHtmlToSchema(htmlString: string): Schema {
  if (!htmlString.trim()) {
    return []
  }

  // Обрабатываем массивы
  const arrayInfo: ArrayInfo[] = []
  let processedHtml = htmlString

  // Сначала обрабатываем условные атрибуты
  const conditionalAttributeMap = new Map<string, ConditionalAttributeInfo>()
  processedHtml = parseConditionalAttributes(processedHtml, conditionalAttributeMap)

  // Затем обрабатываем массивы
  const arrayPlaceholders = new Map<string, string>()
  const arrayItemTemplates = new Map<string, string>()
  
  // Находим все блоки массивов
  const arrayPattern = /\$\{(context|core)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*map\s*\(\s*\(([^)]+)\)\s*=>\s*html`([^`]*)`\s*\)\s*\}/g
  let arrayMatch
  let arrayCounter = 0

  while ((arrayMatch = arrayPattern.exec(htmlString)) !== null) {
    const [fullMatch, source, arrayName, itemName, template] = arrayMatch
    const placeholder = `CONTEXT_ARRAY_${arrayCounter}`
    
    arrayPlaceholders.set(placeholder, fullMatch)
    arrayItemTemplates.set(placeholder, template)
    
    // Создаем информацию о массиве
    arrayInfo.push({
      placeholder,
      source,
      contextKey: arrayName,
      itemTemplate: template
    })
    
    processedHtml = processedHtml.replace(fullMatch, placeholder)
    arrayCounter++
  }

  // Парсим интерполяции
  const { processedHtml: htmlWithInterpolations, interpolationMap } = parseInterpolations(processedHtml)

  // Парсим основную структуру
  const schema = parseChildren(htmlWithInterpolations, interpolationMap, conditionalAttributeMap)

  // Обрабатываем массивы в схеме
  const processArraysInSchema = (items: (ElementSchema | TextSchema)[]): (ElementSchema | TextSchema)[] => {
    return items.map(item => {
      if (item.type === "text" && typeof item.value === "string") {
        // Проверяем, является ли текст плейсхолдером массива
        for (const info of arrayInfo) {
          if (item.value.includes(info.placeholder)) {
            const template = info.itemTemplate
            
            // Обрабатываем условные атрибуты для элементов массива
            const itemConditionalAttributeMap = new Map<string, ConditionalAttributeInfo>()
            let processedTemplate = parseConditionalAttributesForArray(template, itemConditionalAttributeMap)
            
            // Парсим интерполяции в шаблоне элемента
            const itemInterpolationMap = new Map<string, string>()
            // Извлекаем имя переменной из .map((itemName) => ...)
            const itemNameMatch = htmlString.match(new RegExp(`\\$\\{(context|core)\\.${info.contextKey}\\s*\\.\\s*map\\s*\\(\\s*\\(([^)]+)\\)\\s*=>`))
            const itemName = itemNameMatch ? itemNameMatch[2].trim() : undefined
            processedTemplate = processInterpolationsInTemplate(processedTemplate, itemInterpolationMap, itemName)
            
            // Парсим элементы массива
            const arrayElements = parseChildren(processedTemplate, itemInterpolationMap, itemConditionalAttributeMap)
            
            if (arrayElements.length > 0) {
              const firstElement = arrayElements[0]
              if (firstElement.type === "el") {
                // Добавляем информацию о массиве к первому элементу
                firstElement.item = {
                  src: info.source,
                  key: info.contextKey
                }
                
                return firstElement
              }
            }
          }
        }
      }
      
      // Рекурсивно обрабатываем дочерние элементы
      if (item.type === "el" && item.child) {
        item.child = processArraysInSchema(item.child)
      }
      
      return item
    })
  }

  const finalSchema = processArraysInSchema(schema)

  return finalSchema
}