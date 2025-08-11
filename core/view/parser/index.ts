/**
 * HTML модуль для парсинга HTML шаблонов в JSON схемы
 * @module TemplateParser
 */

import type { ArrayInfo, Schema, ElementSchema, TextSchema, ConditionSchema } from "./index.t.ts"
import { extractTemplateContent, findClosingBrace } from "./utils.ts"
import { parseArrayBlocks } from "./arrays.ts"
import {
  parseAttributes,
  parseConditionalAttributes,
  parseAttributesForArray,
  parseConditionalAttributesForArray,
} from "./attributes.ts"
import {
  type ConditionalInfo,
  parseConditionalBlocksRecursively,
  parseConditionalBlocksForArray,
} from "./conditionals.ts"

//

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
    const dynamicMetaTagMap = new Map<string, { src: "core"; key: string | string[] }>()

    // Используем более умный парсер для массивов с вложенными backticks
    processedHtml = parseArrayBlocks(processedHtml, arrayInfo)

    // Обрабатываем динамические meta-теги: только из core
    // self-closing с поддержкой атрибутов
    let dynIdx = 0
    processedHtml = processedHtml.replace(/<meta-\$\{core\.([\w\.]+)\}([^>]*)\/\s*>/g, (_m, key, attrs) => {
      const placeholder = `MDYN${dynIdx++}`
      dynamicMetaTagMap.set(placeholder, {
        src: "core",
        key: String(key).includes(".") ? String(key).split(".") : String(key),
      })
      return `<${placeholder}${attrs || ""}/>`
    })
    // paired с поддержкой атрибутов
    processedHtml = processedHtml.replace(
      /<meta-\$\{core\.([\w\.]+)\}([^>]*)>([\s\S]*?)<\/meta-\$\{core\.\1\}\s*>/g,
      (_m, key, attrs, inner) => {
        const placeholder = `MDYN${dynIdx++}`
        dynamicMetaTagMap.set(placeholder, {
          src: "core",
          key: String(key).includes(".") ? String(key).split(".") : String(key),
        })
        return `<${placeholder}${attrs || ""}>${inner}</${placeholder}>`
      }
    )

    // Обрабатываем условные блоки рекурсивно до полной обработки
    const conditionalInfo: ConditionalInfo[] = []
    processedHtml = parseConditionalBlocksRecursively(processedHtml, conditionalInfo)

    // Обрабатываем условные выражения в атрибутах
    const conditionalAttributeMap = new Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >()
    processedHtml = parseConditionalAttributes(processedHtml, conditionalAttributeMap)

    // Сохраняем исходные строки обработчиков событий on* (включая стрелочные функции)
    const eventAttributeMap = new Map<string, string>()
    processedHtml = this.parseEventAttributes(processedHtml, eventAttributeMap)

    // Дополнительный проход по условным блокам для случаев сложных цепочек тернарных выражений
    processedHtml = parseConditionalBlocksRecursively(processedHtml, conditionalInfo)

    // Обрабатываем простые интерполяции и сохраняем их информацию
    let interpolationIndex = 0
    processedHtml = processedHtml.replace(/\$\{(context|core)\.([\w\.]+)\}/g, (match, src, key) => {
      const placeholder = `INTERPOLATION_${interpolationIndex++}`
      interpolationMap.set(placeholder, { src, key })
      return placeholder
    })

    // Не трогаем остальные выражения ${...} — они могут быть условными блоками/цепочками и будут обработаны ниже

    // Парсим корневые элементы
    const elements: Schema = []
    // Тег может содержать дефисы (web-components, meta-* наши акторы)
    const rootRegex = /<([a-zA-Z]+[a-zA-Z0-9-]*)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>|>)/g

    let match
    let lastIndex = 0
    while ((match = rootRegex.exec(processedHtml)) !== null) {
      const [, tagName, attributesStr] = match

      if (!tagName) continue

      // Добавляем элементы, полученные из текста перед текущим тегом (в т.ч. условные плейсхолдеры на корне)
      const textBefore = processedHtml.slice(lastIndex, match.index).trim()
      if (textBefore) {
        const beforeChildren = this.parseChildren(
          textBefore,
          arrayInfo,
          interpolationMap,
          conditionalInfo,
          conditionalAttributeMap,
          dynamicMetaTagMap
        )
        if (beforeChildren.length > 0) {
          beforeChildren.forEach((c) => elements.push(c as ElementSchema))
        }
      }

      // Корректно находим границу закрывающего тега с учетом вложенных одноименных тегов
      const openStart = match.index
      const tagOpenEnd = processedHtml.indexOf(">", openStart)
      if (tagOpenEnd === -1) {
        lastIndex = openStart + 1
        continue
      }
      const isSelfClosing = /\/>\s*$/.test(processedHtml.slice(openStart, tagOpenEnd + 1))

      let innerContent: string | undefined
      let fullMatch: string
      if (isSelfClosing) {
        innerContent = undefined
        fullMatch = processedHtml.slice(openStart, tagOpenEnd + 1)
      } else {
        const closingToken = `</${tagName}>`
        let searchPos = tagOpenEnd + 1
        let depth = 1
        while (depth > 0 && searchPos < processedHtml.length) {
          const nextOpen = processedHtml.indexOf(`<${tagName}`, searchPos)
          const nextClose = processedHtml.indexOf(closingToken, searchPos)
          if (nextClose === -1) break
          if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++
            searchPos = nextOpen + 1
          } else {
            depth--
            searchPos = nextClose + closingToken.length
          }
        }
        const endIndex = searchPos
        fullMatch = processedHtml.slice(openStart, endIndex)
        innerContent = processedHtml.slice(tagOpenEnd + 1, endIndex - closingToken.length)
      }

      // Определяем тип элемента: actor (meta-*), web-component (с дефисом), обычный элемент
      const dynamicMeta = dynamicMetaTagMap.get(tagName)
      const element: ElementSchema = dynamicMeta
        ? { tag: dynamicMeta, type: "meta" }
        : {
            tag: tagName,
            type: tagName.startsWith("meta-") ? "meta" : tagName.includes("-") ? "wc" : "el",
          }

      // Парсим атрибуты
      const attrs = parseAttributes(attributesStr || "", interpolationMap, conditionalAttributeMap, eventAttributeMap)

      if (Object.keys(attrs).length > 0) {
        element.attrs = attrs
      }

      // Специальная обработка meta-* тегов: объектные атрибуты context/core
      if (element.type === "meta" && attributesStr) {
        const { metaContext, metaCore } = this.parseMetaObjects(attributesStr, interpolationMap)
        if (metaContext) (element as any).context = metaContext
        if (metaCore) (element as any).core = metaCore
        // Удаляем исходные атрибуты context/core из attrs и возможные разложенные ключи объекта
        if (element.attrs) {
          delete (element.attrs as any).context
          delete (element.attrs as any).core
          if (metaContext) {
            for (const k of Object.keys(metaContext)) delete (element.attrs as any)[k]
          }
          if (metaCore) {
            for (const k of Object.keys(metaCore)) delete (element.attrs as any)[k]
          }
          if (Object.keys(element.attrs).length === 0) delete (element as any).attrs
        }
      }

      // Парсим дочерние элементы
      if (innerContent !== undefined) {
        const child = this.parseChildren(
          innerContent.trim(),
          arrayInfo,
          interpolationMap,
          conditionalInfo,
          conditionalAttributeMap,
          dynamicMetaTagMap
        )
        if (child.length > 0) {
          element.child = child
        }
      }

      elements.push(element)

      // Обновляем позицию после текущего тега и продвигаем regex каретку
      lastIndex = match.index + fullMatch.length
      rootRegex.lastIndex = lastIndex
    }

    // Добавляем элементы из текста после последнего тега (в т.ч. условные плейсхолдеры на корне)
    const textAfter = processedHtml.slice(lastIndex).trim()
    if (textAfter) {
      const afterChildren = this.parseChildren(
        textAfter,
        arrayInfo,
        interpolationMap,
        conditionalInfo,
        conditionalAttributeMap,
        dynamicMetaTagMap
      )
      if (afterChildren.length > 0) {
        afterChildren.forEach((c) => elements.push(c as ElementSchema))
      }
    }

    return elements
  }

  /**
   * Парсит значение атрибута с поддержкой интерполяций
   */

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
    >,
    dynamicMetaTagMap?: Map<string, { src: "core"; key: string | string[] }>
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
        // Обрабатываем смешанный текст с плейсхолдерами массивов и условных блоков
        const tokenPattern = /(CONTEXT_ARRAY_\d+|CONDITIONAL_\d+)/g
        let cursor = 0
        let m: RegExpExecArray | null
        let sawToken = false

        while ((m = tokenPattern.exec(content)) !== null) {
          sawToken = true
          const before = content.slice(cursor, m.index).trim()
          if (before) {
            this.parseTextWithPlaceholders(before, child, interpolationMap, conditionalInfo)
          }
          const token = m[1]
          if (!token) {
            cursor = m.index
            continue
          }
          if (token.startsWith("CONTEXT_ARRAY_")) {
            const arr = arrayInfo.find((a) => a.placeholder === token)
            if (arr) {
              const itemElement = this.parseArrayItemTemplate(arr.itemTemplate, arr.source, arr.contextKey)
              child.push(itemElement)
            }
          } else if (token.startsWith("CONDITIONAL_")) {
            const cond = conditionalInfo.find((c) => c.placeholder === token)
            if (cond) {
              const condElements = this.parseConditionalElements(cond, arrayInfo, interpolationMap, conditionalInfo)
              child.push(...condElements)
            }
          }
          cursor = m.index + token.length
        }

        if (sawToken) {
          const after = content.slice(cursor).trim()
          if (after) {
            this.parseTextWithPlaceholders(after, child, interpolationMap, conditionalInfo)
          }
        } else {
          // Обычный текст без плейсхолдеров массивов/условий
          this.parseTextWithPlaceholders(content.trim(), child, interpolationMap, conditionalInfo)
        }
      }
      return child
    }

    // Парсим вложенные элементы
    const tagRegex = /<([a-zA-Z]+[a-zA-Z0-9-]*)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>)/g
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

      // Не считаем тег элементом массива лишь из-за наличия плейсхолдера внутри содержимого.
      // Плейсхолдеры внутри innerContent будут обработаны рекурсивным разбором ниже.
      // Обычный элемент
      const dynamicMeta = dynamicMetaTagMap?.get(tagName)
      const element: ElementSchema = dynamicMeta
        ? { tag: dynamicMeta, type: "meta" }
        : {
            tag: tagName,
            type: tagName.startsWith("meta-") ? "meta" : tagName.includes("-") ? "wc" : "el",
          }

      const attrs = parseAttributes(attributesStr || "", interpolationMap, conditionalAttributeMap)
      if (Object.keys(attrs).length > 0) {
        element.attrs = attrs
      }

      if (element.type === "meta" && attributesStr) {
        const { metaContext, metaCore } = this.parseMetaObjects(attributesStr, interpolationMap)
        if (metaContext) (element as any).context = metaContext
        if (metaCore) (element as any).core = metaCore
        if (element.attrs) {
          delete (element.attrs as any).context
          delete (element.attrs as any).core
          // Удаляем возможные разложенные ключи объектных атрибутов из attrs
          if (metaContext) {
            for (const k of Object.keys(metaContext)) delete (element.attrs as any)[k]
          }
          if (metaCore) {
            for (const k of Object.keys(metaCore)) delete (element.attrs as any)[k]
          }
          if (Object.keys(element.attrs).length === 0) delete (element as any).attrs
        }
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
    // Раскладываем плейсхолдеры массивов/условий даже если их несколько подряд
    const tokenPattern = /(CONTEXT_ARRAY_\d+|CONDITIONAL_\d+)/g
    let cursor = 0
    let tokenMatch: RegExpExecArray | null
    let expanded = false
    while ((tokenMatch = tokenPattern.exec(text)) !== null) {
      expanded = true
      const before = text.slice(cursor, tokenMatch.index).trim()
      if (before) {
        this.parseTextWithPlaceholders(before, child, interpolationMap, conditionalInfo)
      }
      const token = tokenMatch[1]
      if (!token) {
        cursor = tokenMatch.index
        continue
      }
      if (token.startsWith("CONTEXT_ARRAY_")) {
        // В текстовом контексте массива быть не должно; оставляем как текст фолбэк
        child.push({ type: "text", value: token as string })
      } else if (token.startsWith("CONDITIONAL_")) {
        const cond = conditionalInfo.find((c) => c.placeholder === token)
        if (cond) {
          const condElements = this.parseConditionalElements(cond, [], interpolationMap, conditionalInfo)
          child.push(...condElements)
        }
      }
      cursor = tokenMatch.index + token.length
    }
    if (expanded) {
      const after = text.slice(cursor).trim()
      if (after) {
        // Остаток текста обработаем обычным способом
        this.parseTextWithPlaceholders(after, child, interpolationMap, conditionalInfo)
      }
      return
    }

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
      const interpolationInfo = interpolationMap?.get(match[0]!)
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

    // Специальный случай: одна интерполяция и есть окружение текстом — объединяем в один узел с result
    if (interpolations.length === 1 && parts.length === 2) {
      const beforeRaw = parts[0] ?? ""
      const afterRaw = parts[1] ?? ""
      const onlyInterpolation = interpolations[0]!
      const { src, key } = onlyInterpolation.info
      const keyStr = key
      const placeholderExpr = keyStr ? `\${${src}.${keyStr}}` : `\${${src}}`
      child.push({
        type: "text",
        value: {
          src,
          ...(key ? { key: key.includes(".") ? key.split(".") : key } : {}),
          result: `${beforeRaw}${placeholderExpr}${afterRaw}`,
        },
      })
      return
    }

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]?.trim()

      if (part) {
        child.push({
          type: "text",
          value: part,
        })
      }

      if (i < parts.length - 1) {
        if (interpolationIndex < interpolations.length) {
          const interpolation = interpolations[interpolationIndex]
          if (interpolation) {
            child.push({
              type: "text",
              value: {
                src: interpolation.info.src,
                key: interpolation.info.key.includes(".") ? interpolation.info.key.split(".") : interpolation.info.key,
              },
            })
          }
          interpolationIndex++
        } else {
          child.push({
            type: "text",
            value: { src: "item" },
          })
        }
      }
    }
  }

  // Разбор объектных атрибутов context/core у meta-элементов
  private parseMetaObjects(
    attributesStr: string,
    interpolationMap?: Map<string, { src: string; key: string }>
  ): {
    metaContext?: Record<string, string | number | boolean | null | { src: "context" | "core"; key: string }>
    metaCore?: Record<string, string | number | boolean | null | { src: "context" | "core"; key: string }>
  } {
    // Находим context="${{...}}" и core="${{...}}" (также допускаем без кавычек: context=${{...}})
    const findObjectAttr = (
      name: string
    ): Record<string, string | number | boolean | null | { src: "context" | "core"; key: string }> | undefined => {
      const reQuoted = new RegExp(`${name}\\s*=\\s*\"(\\$\\{\\{[\\s\\S]*?\\}\\})\"`)
      const reUnquoted = new RegExp(`${name}\\s*=\\s*(\\$\\{\\{[\\s\\S]*?\\}\\})`)
      const m = reQuoted.exec(attributesStr) || reUnquoted.exec(attributesStr)
      if (!m) return undefined
      const objExpr = m[1] as string // ${ {...} }
      const inner = objExpr.slice(2, -1).trim() // {{...}}
      if (!(inner.startsWith("{") && inner.endsWith("}"))) return undefined
      const jsonish = inner.slice(1, -1)
      // Разбираем пары ключ: значение, допускаем значения: строка/число/boolean/null и ${context.x}/${core.a.b}
      const result: Record<string, string | number | boolean | null | { src: "context" | "core"; key: string }> = {}
      // Простейший парсер: разделяем по запятым верхнего уровня
      const parts: string[] = []
      let depth = 0
      let buf = ""
      for (let i = 0; i < jsonish.length; i++) {
        const ch = jsonish[i]!
        if (ch === "{" || ch === "[") depth++
        if (ch === "}" || ch === "]") depth--
        if (ch === "," && depth === 0) {
          parts.push(buf)
          buf = ""
          continue
        }
        buf += ch
      }
      if (buf.trim()) parts.push(buf)

      for (const raw of parts) {
        const seg = raw.trim()
        if (!seg) continue
        const colon = seg.indexOf(":")
        if (colon === -1) continue
        const key = seg
          .slice(0, colon)
          .trim()
          .replace(/^['"]|['"]$/g, "")
        let value = seg.slice(colon + 1).trim()
        // Строка
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
          result[key] = value.slice(1, -1)
          continue
        }
        // boolean/number/null
        if (/^(true|false|null)$/i.test(value)) {
          result[key] = value.toLowerCase() === "true" ? true : value.toLowerCase() === "false" ? false : null
          continue
        }
        if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
          result[key] = Number(value)
          continue
        }
        // Ссылки на context/core: допускаем как ${context.x} так и context.x
        let mInt = value.match(/^\$\{(context|core)\.([\w\.]+)\}$/)
        if (!mInt) mInt = value.match(/^(context|core)\.([\w\.]+)$/)
        if (mInt) {
          result[key] = { src: mInt[1]! as "context" | "core", key: mInt[2]! }
          continue
        }
        // Fallback: оставить как строку без кавычек
        result[key] = value
      }
      return result
    }

    const metaContext = findObjectAttr("context")
    const metaCore = findObjectAttr("core")
    const ret: {
      metaContext?: Record<string, string | number | boolean | null | { src: "context" | "core"; key: string }>
      metaCore?: Record<string, string | number | boolean | null | { src: "context" | "core"; key: string }>
    } = {}
    if (metaContext) ret.metaContext = metaContext
    if (metaCore) ret.metaCore = metaCore
    return ret
  }

  // Выделяет обработчики событий on* в плейсхолдеры и запоминает исходные строки
  private parseEventAttributes(htmlString: string, eventAttributeMap: Map<string, string>): string {
    let processed = htmlString
    let idx = 0
    // Матчит on*=${...} и on*="${...}" где внутри может быть стрелка или ссылка на context/core/item
    const re = /\son([a-z]+)\s*=\s*(?:"(\$\{[\s\S]*?\})"|(\$\{[\s\S]*?\}))/g
    let m
    while ((m = re.exec(htmlString)) !== null) {
      const full = m[0]!
      const expr = (m[2] || m[3])!
      const placeholder = `EVENT_ATTR_${idx++}`
      eventAttributeMap.set(placeholder, expr)
      const attrName = `on${m[1]}`
      processed = processed.replace(full, ` ${attrName}="${placeholder}"`)
    }
    return processed
  }

  /**
   * Парсит шаблон элемента массива
   */
  private parseArrayItemTemplate(template: string, source: string | string[], contextKey: string): ElementSchema {
    // Создаем карту интерполяций внутри элемента массива
    const itemInterpolationMap = new Map<string, { src: string; key?: string | string[] }>()
    let interpolationIndex = 0

    // Сначала обрабатываем условные блоки внутри массива (только для item.*)
    const itemConditionalInfo: ConditionalInfo[] = []
    let cleanTemplate = parseConditionalBlocksForArray(template, itemConditionalInfo)

    // Накапливаем путь для вложенных массивов: basePath = [...sourcePath, contextKey]
    const basePath: string[] = Array.isArray(source) ? [...source, contextKey] : [source, contextKey]

    // Ищем вложенные map внутри элемента массива: ${var.childKey.map((x) => html`...`)}
    type NestedInfo = { placeholder: string; sourcePath: string[]; contextKey: string; itemTemplate: string }
    const nestedInfos: NestedInfo[] = []
    let nestedIndex = 0
    const nestedRe = /\$\{(\w+)\.(\w+)\.map\(/g
    let nm: RegExpExecArray | null
    while ((nm = nestedRe.exec(cleanTemplate)) !== null) {
      const startIndex = nm.index
      const afterStart = startIndex + nm[0]!.length
      const htmlStart = cleanTemplate.indexOf("html`", afterStart)
      if (htmlStart === -1) continue
      const content = extractTemplateContent(cleanTemplate, htmlStart + 5)
      if (content == null) continue
      const closing = findClosingBrace(cleanTemplate, startIndex)
      if (closing === -1) continue
      const fullMatch = cleanTemplate.substring(startIndex, closing + 1)
      const placeholder = `NESTED_ARRAY_${nestedIndex++}`
      nestedInfos.push({ placeholder, sourcePath: basePath, contextKey: nm[2]!, itemTemplate: content })
      cleanTemplate = cleanTemplate.replace(fullMatch, placeholder)
    }

    // Обрабатываем условные атрибуты для item.*
    const itemConditionalAttributeMap = new Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >()
    cleanTemplate = parseConditionalAttributesForArray(cleanTemplate, itemConditionalAttributeMap)

    // Заменяем интерполяции внутри массива на плейсхолдеры с извлечением ключей
    cleanTemplate = cleanTemplate
      // Сначала обрабатываем `item.key` формат
      .replace(/\$\{(\w+)\.([\w\.]+)\}/g, (_m: string, _itemName: string, key: string) => {
        const placeholder = `ITEM_INTERPOLATION_${interpolationIndex++}`
        itemInterpolationMap.set(placeholder, { src: "item", key })
        return placeholder
      })
      // Затем обрабатываем простые переменные без ключа (как ${id})
      .replace(/\$\{(\w+)\}/g, (_m: string, _itemName: string) => {
        const placeholder = `ITEM_INTERPOLATION_${interpolationIndex++}`
        itemInterpolationMap.set(placeholder, { src: "item" })
        return placeholder
      })

    // Заменяем оставшиеся интерполяции на SIMPLE_PLACEHOLDER
    cleanTemplate = cleanTemplate.replace(/\$\{[^}]*\}/g, "SIMPLE_PLACEHOLDER")

    // Парсим один элемент
    const tagRegex = /<([a-zA-Z]+[a-zA-Z0-9-]*)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>)/s
    const match = tagRegex.exec(cleanTemplate)

    if (!match) {
      // Если не удалось распарсить как элемент, возвращаем текстовый узел
      return {
        tag: "span", // fallback тег
        type: "el",
        child: [
          {
            type: "text",
            value: { src: basePath },
          },
        ],
        item: {
          src: Array.isArray(source) ? source : source,
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
      type: tagName.startsWith("meta-") ? "meta" : tagName.includes("-") ? "wc" : "el",
      item: {
        src: Array.isArray(source) ? source : source,
        key: contextKey,
      },
    }

    // Парсим атрибуты с заменой ITEM_INTERPOLATION на SIMPLE_PLACEHOLDER
    let processedAttributesStr = attributesStr || ""
    for (const [placeholder] of itemInterpolationMap) {
      processedAttributesStr = processedAttributesStr.replace(new RegExp(placeholder, "g"), "SIMPLE_PLACEHOLDER")
    }

    const attrs = parseAttributesForArray(
      attributesStr || "",
      itemInterpolationMap,
      itemConditionalAttributeMap,
      undefined,
      basePath
    )
    if (Object.keys(attrs).length > 0) {
      element.attrs = attrs
    }

    // Парсим дочерние элементы
    if (innerContent) {
      const child = this.parseChildrenForArrayItem(
        innerContent.trim(),
        itemInterpolationMap as Map<string, { src: string; key?: string | string[] }>,
        itemConditionalInfo,
        itemConditionalAttributeMap,
        nestedInfos,
        basePath
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
    itemInterpolationMap: Map<string, { src: string; key?: string | string[] }>,
    itemConditionalInfo: ConditionalInfo[] = [],
    itemConditionalAttributeMap?: Map<
      string,
      { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
    >,
    nestedInfos: Array<{ placeholder: string; sourcePath: string[]; contextKey: string; itemTemplate: string }> = [],
    currentPath: string[] = []
  ): Array<ElementSchema | TextSchema> {
    const child: Array<ElementSchema | TextSchema> = []

    // Обрабатываем интерполяции элементов массива
    const itemInterpolationPattern = /ITEM_INTERPOLATION_\d+/g
    let processedContent = content
    const interpolations: Array<{ placeholder: string; info: { src: string; key?: string | string[] } }> = []

    // НЕ заменяем ITEM_INTERPOLATION в основном содержимом
    // Просто сохраняем их для обработки
    let match: RegExpExecArray | null
    while ((match = itemInterpolationPattern.exec(content)) !== null) {
      const interpolationInfo = itemInterpolationMap.get(match[0])
      if (interpolationInfo) {
        interpolations.push({
          placeholder: match[0],
          info: interpolationInfo,
        })
      }
    }

    // Обрабатываем вложенные массивы: плейсхолдеры NESTED_ARRAY_*
    for (const nested of nestedInfos) {
      const { placeholder, sourcePath, contextKey, itemTemplate } = nested
      if (content.trim().includes(placeholder)) {
        // Превращаем плейсхолдер в элемент с item= { src: [...sourcePath], key: contextKey }
        const nestedElement = this.parseArrayItemTemplate(itemTemplate, sourcePath, contextKey)
        child.push(nestedElement)
        // Удаляем плейсхолдер из контента для дальнейшей текстовой обработки
        content = content.replace(placeholder, "")
      }
    }

    // processedContent остается с ITEM_INTERPOLATION для корректной обработки

    // Проверяем на условные блоки в массиве
    for (const conditionalItem of itemConditionalInfo) {
      if (content.trim() === conditionalItem.placeholder) {
        // Весь контент это условный блок
        const conditionalElements = this.parseConditionalElementsForArray(
          conditionalItem,
          itemInterpolationMap as Map<string, { src: string; key?: string | string[] }>,
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
          const hasKey = interpolationInfo.key !== undefined
          const srcVal: any = currentPath.length ? currentPath : interpolationInfo.src
          const value: any = { src: srcVal }
          if (hasKey) value.key = interpolationInfo.key
          child.push({ type: "text", value })
        } else {
          child.push({
            type: "text",
            value: { src: currentPath.length ? currentPath : "item" },
          })
        }
      } else if (processedContent.trim() === "SIMPLE_PLACEHOLDER") {
        // Ищем первую подходящую интерполяцию
        if (interpolations.length > 0 && interpolations[0]) {
          const info = interpolations[0].info
          const hasKey = info.key !== undefined
          const srcVal: any = currentPath.length ? currentPath : info.src
          const value: any = { src: srcVal }
          if (hasKey) value.key = info.key
          child.push({ type: "text", value })
        } else {
          // Это обычный SIMPLE_PLACEHOLDER без информации об источнике
          child.push({
            type: "text",
            value: { src: currentPath.length ? currentPath : "item" },
          })
        }
      } else {
        // Смешанный текст с плейсхолдерами или ITEM_INTERPOLATION
        this.parseTextWithPlaceholdersForArray(
          content,
          child,
          interpolations,
          itemInterpolationMap,
          itemConditionalInfo,
          currentPath
        )
      }
    } else {
      // Есть HTML элементы - парсим их
      const tagRegex = /<([a-zA-Z]+[a-zA-Z0-9-]*)([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/\1>)/g
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
            itemConditionalInfo,
            currentPath
          )
        }

        // Создаем элемент
        const element: ElementSchema = {
          tag: tagName,
          type: tagName.startsWith("meta-") ? "meta" : tagName.includes("-") ? "wc" : "el",
        }

        // Парсим атрибуты
        const attrs = parseAttributesForArray(
          attributesStr || "",
          itemInterpolationMap,
          itemConditionalAttributeMap,
          undefined,
          currentPath
        )
        if (Object.keys(attrs).length > 0) {
          element.attrs = attrs
        }

        // Парсим дочерние элементы рекурсивно
        if (innerContent !== undefined) {
          const nestedChild = this.parseChildrenForArrayItem(
            innerContent.trim(),
            itemInterpolationMap as Map<string, { src: string; key?: string | string[] }>,
            itemConditionalInfo,
            undefined,
            nestedInfos,
            currentPath
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
          itemConditionalInfo,
          currentPath
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
    interpolations: Array<{ placeholder: string; info: { src: string; key?: string | string[] } }>,
    itemInterpolationMap: Map<string, { src: string; key?: string | string[] }>,
    itemConditionalInfo: ConditionalInfo[] = [],
    currentPath: string[] = []
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
    const foundInterpolations: Array<{ src: string; key?: string | string[] }> = []

    let match: RegExpExecArray | null
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
          const hasKey = interpolation.key !== undefined
          const srcVal: any = currentPath.length ? currentPath : interpolation.src
          const value: any = { src: srcVal }
          if (hasKey) value.key = interpolation.key
          child.push({ type: "text", value })
        }
        interpolationIndex++
      }
    }
  }

  /**
   * Парсит атрибуты для элементов массива
   */

  /**
   * Парсит значение атрибута для элементов массива
   */

  /**
   * Парсит условные блоки в HTML строке
   */

  /**
   * Рекурсивно обрабатывает условные блоки до полной обработки
   */

  /**
   * Парсит условные выражения в атрибутах
   */

  /**
   * Парсит условные выражения в атрибутах для элементов массива
   */

  /**
   * Умный парсер условных блоков с поддержкой вложенных backticks
   */

  /**
   * Парсит условные блоки для элементов массива (только item.*)
   */

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
          // Инвертируем условие для false ветви
          const cond = conditionalItem.condition
          let falseCondition: ConditionSchema
          if (cond.gt !== undefined) {
            falseCondition = { src: cond.src, key: cond.key, lte: cond.gt }
          } else if (cond.gte !== undefined) {
            falseCondition = { src: cond.src, key: cond.key, lt: cond.gte }
          } else if (cond.lt !== undefined) {
            falseCondition = { src: cond.src, key: cond.key, gte: cond.lt }
          } else if (cond.lte !== undefined) {
            falseCondition = { src: cond.src, key: cond.key, gt: cond.lte }
          } else if (cond.eq !== undefined && cond.eq !== true) {
            falseCondition = { src: cond.src, key: cond.key, notEq: cond.eq }
          } else {
            falseCondition = { src: cond.src, key: cond.key, eq: false }
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
    itemInterpolationMap: Map<string, { src: string; key?: string | string[] }>,
    itemConditionalInfo: ConditionalInfo[] = []
  ): Array<ElementSchema | TextSchema> {
    const elements: Array<ElementSchema | TextSchema> = []

    // Парсим true ветвь
    if (conditionalItem.trueTemplate) {
      // Обрабатываем интерполяции в шаблоне
      const processedTrueTemplate = this.processInterpolationsInTemplate(
        conditionalItem.trueTemplate,
        itemInterpolationMap as Map<string, { src: string; key?: string }>
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
        itemInterpolationMap as Map<string, { src: string; key?: string }>
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
  // перенесено в arrays.ts

  // Удалено: дублирующая внутренняя реализация extractTemplateContent (используются функции из utils.ts)

  // Удалено: дублирующая внутренняя реализация findClosingBrace (используются функции из utils.ts)
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
