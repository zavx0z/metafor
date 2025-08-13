import type { AttributeValue } from "../render/attribute.t.ts"
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null
const hasSrc = (v: unknown): v is { src: string; key?: string | string[] } =>
  isObject(v) && typeof (v as any).src === "string"

export function parseAttributeValue(
  value: string,
  interpolationMap?: Map<string, { src: string; key: string }>,
  conditionalAttributeMap?: Map<
    string,
    { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
  >
): AttributeValue {
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
      if (value.includes(placeholder)) {
        const originalConditional = info.falseValue
          ? `\${${info.src}.${info.key} ? '${info.trueValue}' : '${info.falseValue}'}`
          : `\${${info.src}.${info.key} && '${info.trueValue}'}`
        const resultValue = value.replace(placeholder, originalConditional)
        return {
          src: info.src,
          key: info.key,
          trueValue: info.trueValue,
          falseValue: info.falseValue,
          type: "conditional" as const,
        }
      }
    }
  }

  if (interpolationMap) {
    for (const [placeholder, info] of interpolationMap) {
      if (value === placeholder) {
        return { src: info.src, key: info.key.includes(".") ? info.key.split(".") : info.key }
      }
    }
  }

  if (interpolationMap) {
    // Поддержка множественных интерполяций в одном атрибуте — формируем template/items
    let templ = value
    let matched = false
    const items: any[] = []
    for (const [placeholder, info] of interpolationMap) {
      if (templ.includes(placeholder)) {
        const normalizedKey = info.key.includes(".") ? info.key.split(".") : info.key
        const idx = items.push({ src: info.src, key: normalizedKey }) - 1
        templ = templ.replaceAll(placeholder, `\${${idx}}`)
        matched = true
      }
    }
    if (matched) return { template: templ, items } as any
  }

  const simpleInterpolationMatch = value.match(/^\$\{(context|core)\.([\w\.]+)\}$/)
  if (simpleInterpolationMatch) {
    const [, src, key] = simpleInterpolationMatch
    if (src && key) {
      return { src, key: key.includes(".") ? key.split(".") : key }
    }
  }

  const hasInterpolation = /\$\{(context|core)\.([\w\.]+)\}/.test(value)
  if (hasInterpolation) {
    const items: any[] = []
    const replaced = value.replace(/\$\{(context|core)\.([\w\.]+)\}/g, (_m, src, key) => {
      const normalizedKey = String(key)
      const idx = items.push({ src, key: normalizedKey.includes(".") ? normalizedKey.split(".") : normalizedKey }) - 1
      return `\${${idx}}`
    })
    return { template: replaced, items } as any
  }

  return value
}

export function parseAttributes(
  attributesStr: string,
  interpolationMap?: Map<string, { src: string; key: string }>,
  conditionalAttributeMap?: Map<
    string,
    { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
  >,
  eventAttributeMap?: Map<string, string>
): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = {}
  let currentIndex = 0
  const length = attributesStr.length
  const isEventAttr = (name: string) => /^on[a-z]+$/.test(name)

  while (currentIndex < length) {
    while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) currentIndex++
    if (currentIndex >= length) break

    const nameStart = currentIndex
    while (currentIndex < length && /[\w-]/.test(attributesStr[currentIndex]!)) currentIndex++
    const name = attributesStr.slice(nameStart, currentIndex)
    if (!name) break

    while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) currentIndex++
    if (currentIndex < length && attributesStr[currentIndex] === "=") {
      currentIndex++
      while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) currentIndex++

      if (currentIndex < length && (attributesStr[currentIndex] === '"' || attributesStr[currentIndex] === "'")) {
        const quote = attributesStr[currentIndex]!
        currentIndex++
        const valueStart = currentIndex
        while (currentIndex < length && attributesStr[currentIndex] !== quote) currentIndex++
        const value = attributesStr.slice(valueStart, currentIndex)
        currentIndex++

        // Локальная обработка сложного тернария с backtick-ветвью прямо в значении атрибута: ${ expr ? `...` : "..." }
        {
          const m = value.match(/^\$\{\s*([^?]+?)\s*\?\s*`([^`]*)`\s*:\s*['"]([^'"]*)['"]\s*\}$/)
          if (m) {
            const [, exprBody, trueRaw, falseLiteral] = m
            const varRe = /(item|context|core|state)\.([\w\.]+)/g
            const seen = new Map<string, number>()
            const items: any[] = []
            let idxI = 0
            let mm: RegExpExecArray | null
            while ((mm = varRe.exec(exprBody)) !== null) {
              const id = `${mm[1]!}.${mm[2]!}`
              if (!seen.has(id)) {
                const key: any = mm[2]!.includes(".") ? mm[2]!.split(".") : mm[2]!
                const srcRaw: any = mm[1] === "item" && Array.isArray(currentPath) ? currentPath : mm[1]
                items.push(mm[2] ? { src: srcRaw, key } : { src: srcRaw })
                seen.set(id, idxI++)
              }
            }
            const exprTemplate = exprBody
              .replace(varRe, (_s: string, a: string, b: string) => `\${${seen.get(`${a}.${b}`)!}}`)
              .replace(/\s+/g, "")

            const trueSeen = new Map<string, number>()
            const trueItems: any[] = []
            let tIdx = 0
            const trueTpl = trueRaw.replace(/\$\{(item|context|core|state)\.([\w\.]+)\}/g, (_m, a, b) => {
              const id = `${a}.${b}`
              if (!trueSeen.has(id)) {
                const key: any = (b as string).includes(".") ? (b as string).split(".") : (b as string)
                const srcRaw: any = a === "item" && Array.isArray(currentPath) ? currentPath : a
                trueItems.push(b ? { src: srcRaw, key } : { src: srcRaw })
                trueSeen.set(id, tIdx++)
              }
              return `\${${trueSeen.get(id)!}}`
            })

            // Если trueRaw/falseLiteral — это один и тот же статический шаблон с ${0} и речь про class-атрибут
            // но здесь falseLiteral — строковый литерал, оставляем как строку
            ;(attrs as any)[name] = {
              items,
              template: exprTemplate,
              true: { template: trueTpl, items: trueItems },
              false: falseLiteral,
            }
            continue
          }
        }

        // Событийные атрибуты: сериализуем функцию в строку (восстанавливаем из плейсхолдера, если есть)
        if (isEventAttr(name)) {
          if (eventAttributeMap && eventAttributeMap.has(value)) {
            attrs[name] = eventAttributeMap.get(value) ?? ""
            continue
          }
          const parsed = parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
          attrs[name] = parsed as any
          continue
        }

        // Событийные атрибуты: фиксируем наличие обработчика, но не сериализуем функцию
        if (isEventAttr(name)) {
          attrs[name] = ""
          continue
        }

        if (conditionalAttributeMap) {
          if (isEventAttr(name)) {
            if (eventAttributeMap && eventAttributeMap.has(value)) {
              attrs[name] = eventAttributeMap.get(value) ?? ""
              continue
            }
            const parsed = parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
            attrs[name] = parsed as any
            continue
          }
          let foundPlaceholder = false
          for (const [placeholder, infoAny] of conditionalAttributeMap) {
            const info: any = infoAny as any
            if (value === placeholder) {
              if ((info as any).items && typeof (info as any).template === "string") {
                const i: any = info as any
                const isSingleVar = Array.isArray(i.items) && i.items.length === 1 && i.template === "${0}"
                if (isSingleVar) {
                  const single = i.items[0]
                  ;(attrs as any)[name] = {
                    src: single.src,
                    key: single.key,
                    true: i.trueValue ?? i.true ?? "",
                    ...(i.falseValue !== undefined || i.false !== undefined ? { false: i.falseValue ?? i.false } : {}),
                  }
                } else {
                  ;(attrs as any)[name] = {
                    items: i.items,
                    template: i.template,
                    true: i.trueValue ?? i.true ?? "",
                    false: i.falseValue ?? i.false ?? "",
                  }
                }
              } else {
                ;(attrs as any)[name] = {
                  src: (info as any).src,
                  key: (info as any).key,
                  true: (info as any).trueValue ?? (info as any).true,
                  ...((info as any).falseValue !== undefined || (info as any).false !== undefined
                    ? { false: (info as any).falseValue ?? (info as any).false }
                    : {}),
                }
              }
              foundPlaceholder = true
              break
            }
            if (value.includes(placeholder)) {
              const infoAny: any = info as any
              if (name === "class") {
                const idxPh = value.indexOf(placeholder)
                const before = value.slice(0, idxPh).trim()
                const after = value.slice(idxPh + placeholder.length).trim()
                const hasSpaceAround =
                  /\s$/.test(value.slice(0, idxPh)) || /^\s/.test(value.slice(idxPh + placeholder.length))
                // Если это expr с одним item и template === "${0}", можно деградировать до source-based
                if (infoAny.items && typeof infoAny.template === "string") {
                  const isSingleVar =
                    Array.isArray(infoAny.items) && infoAny.items.length === 1 && infoAny.template === "${0}"
                  const single = isSingleVar ? infoAny.items[0] : undefined
                  if (isSingleVar && hasSpaceAround) {
                    // массив частей: статическое + объект по источнику
                    const parts: any[] = []
                    if (before) before.split(/\s+/).forEach((t) => t && parts.push(t))
                    parts.push({
                      src: single.src,
                      key: single.key,
                      true: infoAny.trueValue ?? infoAny.true,
                      ...(infoAny.falseValue !== undefined || infoAny.false !== undefined
                        ? { false: infoAny.falseValue ?? infoAny.false }
                        : {}),
                    })
                    if (after) after.split(/\s+/).forEach((t) => t && parts.push(t))
                    ;(attrs as any)[name] = parts
                  } else if (isSingleVar) {
                    // Префикс/суффикс слеплен: обе ветви как шаблоны с тем же src/key
                    const tpl = `${value.slice(0, idxPh)}${"${0}"}${value.slice(idxPh + placeholder.length)}`
                    ;(attrs as any)[name] = {
                      src: single.src,
                      key: single.key,
                      true: { src: single.src, key: single.key, template: tpl },
                      false: { src: single.src, key: single.key, template: tpl },
                    }
                  } else {
                    // Общее выражение: собираем единый template с выражением
                    const idx = value.indexOf(placeholder)
                    const beforeRaw = value.slice(0, idx)
                    const afterRaw = value.slice(idx + placeholder.length)
                    ;(attrs as any)[name] = {
                      items: infoAny.items,
                      template: `${beforeRaw}${"${0}"}${afterRaw}`,
                      true: infoAny.trueValue ?? infoAny.true ?? "",
                      false: infoAny.falseValue ?? infoAny.false ?? "",
                    }
                  }
                } else {
                  // Старый source-based: массив частей
                  const parts: any[] = []
                  if (before) before.split(/\s+/).forEach((t) => t && parts.push(t))
                  parts.push({
                    src: (info as any).src,
                    key: (info as any).key,
                    true: (info as any).trueValue ?? (info as any).true,
                    ...((info as any).falseValue !== undefined || (info as any).false !== undefined
                      ? { false: (info as any).falseValue ?? (info as any).false }
                      : {}),
                  })
                  if (after) after.split(/\s+/).forEach((t) => t && parts.push(t))
                  ;(attrs as any)[name] = parts
                }
              } else {
                if (infoAny.items && typeof infoAny.template === "string") {
                  const idx = value.indexOf(placeholder)
                  const beforeRaw = value.slice(0, idx)
                  const afterRaw = value.slice(idx + placeholder.length)
                  ;(attrs as any)[name] = {
                    items: infoAny.items,
                    template: `${beforeRaw}${"${0}"}${afterRaw}`,
                    true: infoAny.trueValue ?? infoAny.true ?? "",
                    false: infoAny.falseValue ?? infoAny.false ?? "",
                  }
                } else {
                  const idxPh = value.indexOf(placeholder)
                  const beforeRaw = value.slice(0, idxPh)
                  const afterRaw = value.slice(idxPh + placeholder.length)
                  ;(attrs as any)[name] = {
                    items: [{ src: (info as any).src, key: (info as any).key }],
                    template: `${beforeRaw}${"${0}"}${afterRaw}`,
                    true: (info as any).trueValue ?? (info as any).true,
                    false: (info as any).falseValue ?? (info as any).false ?? "",
                  }
                }
              }
              foundPlaceholder = true
              break
            }
          }
          if (!foundPlaceholder) {
            attrs[name] = parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
          }
        } else {
          attrs[name] = parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
        }
      } else {
        const valueStart = currentIndex
        while (currentIndex < length && !/\s/.test(attributesStr[currentIndex]!)) currentIndex++
        const value = attributesStr.slice(valueStart, currentIndex)

        // Событийные атрибуты: фиксируем наличие обработчика
        if (isEventAttr(name)) {
          attrs[name] = ""
          continue
        }

        if (isEventAttr(name)) {
          attrs[name] = ""
          continue
        }
        if (conditionalAttributeMap) {
          let foundPlaceholder = false
          for (const [placeholder, info] of conditionalAttributeMap) {
            if (value === placeholder) {
              ;(attrs as any)[name] = {
                items: [{ src: info.src, key: info.key }],
                template: "${0}",
                true: info.trueValue,
                false: info.falseValue ?? "",
              }
              foundPlaceholder = true
              break
            }
            if (value.includes(placeholder)) {
              // Смешанный контент — не формируем result, оставляем conditional
              const idx = value.indexOf(placeholder)
              const beforeRaw = value.slice(0, idx)
              const afterRaw = value.slice(idx + placeholder.length)
              ;(attrs as any)[name] = {
                items: [{ src: info.src, key: info.key }],
                template: `${beforeRaw}${"${0}"}${afterRaw}`,
                true: info.trueValue,
                false: info.falseValue ?? "",
              }
              foundPlaceholder = true
              break
            }
          }
          if (!foundPlaceholder) {
            attrs[name] = parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
          }
        } else {
          attrs[name] = parseAttributeValue(value, interpolationMap, conditionalAttributeMap)
        }
      }
    } else {
      // Булев атрибут без значения или плейсхолдер условного атрибута
      if (conditionalAttributeMap) {
        let matchedPlaceholder = false
        for (const [placeholder, info] of conditionalAttributeMap) {
          if (name === placeholder) {
            const attrName = info.trueValue && info.trueValue.length > 0 ? info.trueValue : info.falseValue || name
            ;(attrs as any)[attrName] = {
              src: info.src,
              key: info.key,
              true: info.trueValue,
              ...(info.falseValue !== undefined ? { false: info.falseValue } : {}),
            }
            matchedPlaceholder = true
            break
          }
        }
        if (!matchedPlaceholder) {
          if (isEventAttr(name)) {
            attrs[name] = ""
          } else {
            attrs[name] = ""
          }
        }
      } else {
        if (isEventAttr(name)) {
          attrs[name] = ""
        } else {
          attrs[name] = ""
        }
      }
    }
  }

  return attrs
}

export function parseConditionalAttributes(htmlString: string, conditionalAttributeMap: Map<string, any>): string {
  let processedHtml = htmlString
  let conditionalIndex = 0

  // Специальный случай: ${ expr ? `template` : "literal" }
  {
    const startRe = /\$\{/g
    let m: RegExpExecArray | null
    while ((m = startRe.exec(processedHtml)) !== null) {
      const startIndex = m.index
      // Найти закрывающую скобку для этой конструкции
      // Простой балансировочный поиск
      let depth = 0
      let inBacktick = false
      let i = startIndex
      let endIndex = -1
      while (i < processedHtml.length) {
        const ch = processedHtml[i]!
        const prev = i > 0 ? processedHtml[i - 1] : ""
        if (ch === "`" && prev !== "\\") {
          inBacktick = !inBacktick
          i++
          continue
        }
        if (!inBacktick) {
          if (ch === "{") depth++
          if (ch === "}") {
            depth--
            if (depth === 0) {
              endIndex = i
              break
            }
          }
        }
        i++
      }
      if (endIndex === -1) break
      const full = processedHtml.slice(startIndex, endIndex + 1)
      const body = processedHtml.slice(startIndex + 2, endIndex)
      const qPos = body.indexOf("?")
      if (qPos === -1) {
        startRe.lastIndex = endIndex + 1
        continue
      }
      const exprBody = body.slice(0, qPos).trim()
      // Найти начало true-ветви в оригинальной строке
      const absAfterQ = startIndex + 2 + qPos + 1
      // Пропустить пробелы
      let tStart = absAfterQ
      while (tStart < processedHtml.length && /\s/.test(processedHtml[tStart]!)) tStart++
      if (processedHtml[tStart] !== "`") {
        startRe.lastIndex = endIndex + 1
        continue
      }
      // Считать содержимое до следующего backtick
      let tEnd = tStart + 1
      while (tEnd < processedHtml.length && processedHtml[tEnd] !== "`") tEnd++
      if (tEnd >= processedHtml.length) {
        startRe.lastIndex = endIndex + 1
        continue
      }
      const trueRaw = processedHtml.slice(tStart + 1, tEnd)
      // Найти ':' после true-ветви
      let colonPos = tEnd + 1
      while (colonPos < endIndex && processedHtml[colonPos] !== ":") colonPos++
      if (colonPos >= endIndex) {
        startRe.lastIndex = endIndex + 1
        continue
      }
      // Найти false-ветвь (предполагаем строковый литерал в кавычках)
      let fStart = colonPos + 1
      while (fStart < endIndex && /\s/.test(processedHtml[fStart]!)) fStart++
      const quote = processedHtml[fStart]
      if (quote !== '"' && quote !== "'") {
        startRe.lastIndex = endIndex + 1
        continue
      }
      let fEnd = fStart + 1
      while (fEnd < endIndex && processedHtml[fEnd] !== quote) fEnd++
      const falseLiteral = processedHtml.slice(fStart + 1, fEnd)

      // Построить items/template для expr
      const varRe = /(item|context|core|state)\.([\w\.]+)/g
      const exprSeen = new Map<string, number>()
      const exprItems: Array<{ src: string; key?: string | string[] }> = []
      let exprIdx = 0
      let tmp: RegExpExecArray | null
      while ((tmp = varRe.exec(exprBody)) !== null) {
        const id = `${tmp[1]!}.${tmp[2]!}`
        if (!exprSeen.has(id)) {
          const key = tmp[2]!.includes(".") ? tmp[2]!.split(".") : tmp[2]!
          exprItems.push({ src: tmp[1]!, ...(tmp[2] ? { key } : {}) } as any)
          exprSeen.set(id, exprIdx++)
        }
      }
      let exprTemplate = exprBody.replace(varRe, (_s: string, a: string, b: string) => {
        const id = `${a}.${b}`
        const iRepl = exprSeen.get(id)!
        return `\${${iRepl}}`
      })
      exprTemplate = exprTemplate.replace(/\s+/g, "")

      // Построить items/template для true-ветви
      const trueSeen = new Map<string, number>()
      const trueItems: Array<{ src: string; key?: string | string[] }> = []
      let tIdx = 0
      const trueTpl = trueRaw.replace(/\$\{(item|context|core|state)\.([\w\.]+)\}/g, (_m, a, b) => {
        const id = `${a}.${b}`
        if (!trueSeen.has(id)) {
          const key = (b as string).includes(".") ? (b as string).split(".") : (b as string)
          trueItems.push({ src: a as string, ...(b ? { key } : {}) } as any)
          trueSeen.set(id, tIdx++)
        }
        const idx = trueSeen.get(id)!
        return `\${${idx}}`
      })

      const placeholder = `CONDITIONAL_ATTR_${conditionalIndex++}`
      conditionalAttributeMap.set(placeholder, {
        items: exprItems,
        template: exprTemplate,
        true: { template: trueTpl, items: trueItems },
        false: falseLiteral,
      })
      processedHtml = processedHtml.replace(full, placeholder)
      startRe.lastIndex = startIndex + placeholder.length
    }
  }

  // Общий тернарный: ${ <expr> ? 'true' : 'false' }
  const genericTernary = /\$\{\s*([^?]+?)\s*\?\s*['"]([^'"]*)['"]\s*:\s*['"]([^'"]*)['"]\s*\}/g

  let match
  while ((match = genericTernary.exec(htmlString)) !== null) {
    const [fullMatch, expr, tVal, fVal] = match
    if (!expr) continue
    // Собираем переменные только из context|core|state
    const varRe = /(context|core|state)\.([\w\.]+)/g
    const seen = new Map<string, number>()
    const items: Array<{ src: string; key?: string | string[] }> = []
    let idx = 0
    let m: RegExpExecArray | null
    while ((m = varRe.exec(expr)) !== null) {
      const id = `${m[1]!}.${m[2]!}`
      if (!seen.has(id)) {
        const key = m[2]!.includes(".") ? m[2]!.split(".") : m[2]!
        items.push({ src: m[1]!, ...(m[2] ? { key } : {}) } as any)
        seen.set(id, idx++)
      }
    }
    // Строим template, заменяя ссылки на ${i}
    let template = expr.replace(varRe, (_s: string, a: string, b: string) => {
      const id = `${a}.${b}`
      const i = seen.get(id)!
      return `\${${i}}`
    })
    template = template.replace(/\s+/g, "")
    const placeholder = `CONDITIONAL_ATTR_${conditionalIndex++}`
    conditionalAttributeMap.set(placeholder, {
      kind: "expr",
      items,
      template,
      trueValue: tVal || "",
      falseValue: fVal || "",
    })
    processedHtml = processedHtml.replace(fullMatch, placeholder)
  }

  const ternaryPattern = /\$\{((?:context|core|item)\.(?:\w+))\s*\?\s*['"]([^'"]*)['"]\s*:\s*['"]([^'"]*)['"]\}/g

  // Простой тернарий по источнику
  while ((match = ternaryPattern.exec(htmlString)) !== null) {
    const [fullMatch, conditionExpr, trueValue, falseValue] = match
    if (!conditionExpr) continue
    const conditionParts = conditionExpr.split(".")
    if (conditionParts.length >= 2) {
      const src = conditionParts[0] as "context" | "core" | "item"
      const key = conditionParts[1]
      if (key) {
        const placeholder = `CONDITIONAL_ATTR_${conditionalIndex++}`
        const itemObj: any = { src, key }
        conditionalAttributeMap.set(placeholder, {
          items: [itemObj],
          template: "${0}",
          trueValue: trueValue || "",
          falseValue: falseValue || "",
        })
        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    }
  }

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
        conditionalAttributeMap.set(placeholder, { kind: "source", src, key, trueValue: trueValue || "" })
        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    }
  }

  // Отрицание: ${!context.key && 'value'} => trueValue = '', falseValue = 'value'
  const notAndPattern = /\$\{!\s*((?:context|core|item)\.(?:\w+))\s*&&\s*['"]([^'"]*)['"]\}/g
  while ((match = notAndPattern.exec(htmlString)) !== null) {
    const [fullMatch, conditionExpr, falseValue] = match
    if (!conditionExpr) continue
    const conditionParts = conditionExpr.split(".")
    if (conditionParts.length >= 2) {
      const src = conditionParts[0] as "context" | "core" | "item"
      const key = conditionParts[1]
      if (key) {
        const placeholder = `CONDITIONAL_ATTR_${conditionalIndex++}`
        // Инверсия: !A && 'v' => true: '', false: 'v'
        conditionalAttributeMap.set(placeholder, {
          kind: "source",
          src,
          key,
          trueValue: "",
          falseValue: falseValue || "",
        })
        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    }
  }

  return processedHtml
}

export function parseAttributeValueForArray(
  value: string,
  itemInterpolationMap: Map<string, { src: string; key?: string | string[] }>,
  itemConditionalAttributeMap?: Map<
    string,
    { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
  >
): AttributeValue {
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
      if (value.includes(placeholder)) {
        return {
          src: info.src,
          key: info.key,
          trueValue: info.trueValue,
          falseValue: info.falseValue,
          type: "conditional" as const,
        }
      }
    }
  }

  const simpleItemMatch = value.match(/^\$\{(\w+)\.([\w\.]+)\}$/)
  if (simpleItemMatch) {
    const [, varName, key] = simpleItemMatch
    if (key) return { src: varName, key: key.includes(".") ? key.split(".") : key }
  }

  const simpleVarMatch = value.match(/^\$\{(\w+)\}$/)
  if (simpleVarMatch) {
    const [, varName] = simpleVarMatch
    return { src: varName }
  }

  // Если значение атрибута — это ровно один плейсхолдер ITEM_INTERPOLATION_X,
  // вернем простую интерполяцию без template/items
  {
    const m = value.match(/^ITEM_INTERPOLATION_\d+$/)
    if (m) {
      const info = itemInterpolationMap.get(value)
      if (info) {
        const normalizedKey = Array.isArray(info.key)
          ? (info.key as string[])
          : info.key && typeof info.key === "string" && info.key.includes(".")
            ? (info.key as string).split(".")
            : info.key
        return info.key
          ? ({ src: info.src as any, key: normalizedKey as any } as any)
          : ({ src: info.src as any } as any)
      }
    }
  }

  // Мульти-интерполяции: собираем ВСЕ ITEM_INTERPOLATION_* плейсхолдеры в порядке появления
  {
    const seen = new Map<string, number>()
    const items: any[] = []
    let templ = value
    let foundAny = false
    const re = /ITEM_INTERPOLATION_\d+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(value)) !== null) {
      const ph = m[0]!
      if (!seen.has(ph)) {
        const info = itemInterpolationMap.get(ph)
        if (info) {
          const normalizedKey = Array.isArray(info.key)
            ? (info.key as string[])
            : info.key && typeof info.key === "string" && info.key.includes(".")
              ? (info.key as string).split(".")
              : info.key
          const idx = items.push(info.key ? { src: info.src, key: normalizedKey as any } : { src: info.src }) - 1
          seen.set(ph, idx)
          foundAny = true
        }
      }
    }
    if (foundAny) {
      templ = templ.replace(re, (ph) => {
        const idx = seen.get(ph)
        return idx !== undefined ? `\${${idx}}` : ph
      })
      return { template: templ, items } as any
    }
  }

  const hasItemInterpolation = /\$\{\w+\.([\w\.]+)\}/.test(value)
  if (hasItemInterpolation) {
    const items: any[] = []
    const replaced = value.replace(/\$\{(\w+)\.([\w\.]+)\}/g, (_m, varName, key) => {
      const normalizedKey = String(key)
      const idx =
        items.push({ src: varName, key: normalizedKey.includes(".") ? normalizedKey.split(".") : normalizedKey }) - 1
      return `\${${idx}}`
    })
    return { template: replaced, items } as any
  }

  const hasSimpleVar = /\$\{(\w+)\}/.test(value)
  if (hasSimpleVar) {
    const items: any[] = []
    let idxCounter = 0
    const replaced = value.replace(/\$\{(\w+)\}/g, (_m, varName) => {
      const idx = idxCounter++
      items.push({ src: varName })
      return `\${${idx}}`
    })
    return { template: replaced, items } as any
  }

  return value
}

export function parseAttributesForArray(
  attributesStr: string,
  itemInterpolationMap: Map<string, { src: string; key?: string | string[] }>,
  itemConditionalAttributeMap?: Map<
    string,
    { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
  >,
  eventAttributeMap?: Map<string, string>,
  currentPath?: string[]
): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = {}
  let currentIndex = 0
  const length = attributesStr.length
  const isEventAttr = (name: string) => /^on[a-z]+$/.test(name)

  while (currentIndex < length) {
    while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) currentIndex++
    if (currentIndex >= length) break

    const nameStart = currentIndex
    while (currentIndex < length && /[\w-]/.test(attributesStr[currentIndex]!)) currentIndex++
    const name = attributesStr.slice(nameStart, currentIndex)
    if (!name) break

    while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) currentIndex++
    if (currentIndex < length && attributesStr[currentIndex] === "=") {
      currentIndex++
      while (currentIndex < length && /\s/.test(attributesStr[currentIndex]!)) currentIndex++

      if (currentIndex < length && (attributesStr[currentIndex] === '"' || attributesStr[currentIndex] === "'")) {
        const quote = attributesStr[currentIndex]!
        currentIndex++
        const valueStart = currentIndex
        while (currentIndex < length && attributesStr[currentIndex] !== quote) currentIndex++
        const value = attributesStr.slice(valueStart, currentIndex)
        currentIndex++

        if (itemConditionalAttributeMap) {
          // Событийные атрибуты: фиксируем наличие обработчика, не сериализуем функцию
          if (isEventAttr(name)) {
            if (eventAttributeMap && eventAttributeMap.has(value)) {
              attrs[name] = eventAttributeMap.get(value) ?? ""
            } else {
              attrs[name] = ""
            }
            continue
          }
          let foundPlaceholder = false
          for (const [placeholder, info] of itemConditionalAttributeMap) {
            if (value === placeholder) {
              const srcOut: any = info.src === "item" && currentPath ? (currentPath as any) : info.src
              // Поддержка expr-плейсхолдеров с items/template (в том числе 1 переменная)
              const anyInfo: any = info as any
              if (anyInfo.items && typeof anyInfo.template === "string") {
                ;(attrs as any)[name] = {
                  items: anyInfo.items.map((it: any) =>
                    it && it.src === "item" && currentPath ? { ...it, src: currentPath } : it
                  ),
                  template: anyInfo.template,
                  true: anyInfo.trueValue ?? anyInfo.true ?? "",
                  false: anyInfo.falseValue ?? anyInfo.false ?? "",
                }
              } else {
                ;(attrs as any)[name] = {
                  src: srcOut,
                  key: info.key,
                  true: info.trueValue,
                  ...(info.falseValue !== undefined ? { false: info.falseValue } : {}),
                }
              }
              foundPlaceholder = true
              break
            }
            if (value.includes(placeholder)) {
              // Смешанный контент — не формируем result, оставляем conditional
              const srcOut: any = info.src === "item" && currentPath ? (currentPath as any) : info.src
              const idx = value.indexOf(placeholder)
              const beforeRaw = value.slice(0, idx)
              const afterRaw = value.slice(idx + placeholder.length)
              // Если вокруг есть пробелы — массив частей class, иначе шаблон с template
              if (name === "class") {
                const parts: any[] = []
                const before = beforeRaw.trim()
                const after = afterRaw.trim()
                if (before) before.split(/\s+/).forEach((t) => t && parts.push(t))
                parts.push({
                  src: srcOut,
                  key: info.key,
                  true: info.trueValue,
                  ...(info.falseValue !== undefined ? { false: info.falseValue } : {}),
                })
                if (after) after.split(/\s+/).forEach((t) => t && parts.push(t))
                ;(attrs as any)[name] = parts
              } else {
                ;(attrs as any)[name] = {
                  items: [{ src: srcOut, key: info.key }],
                  template: `${beforeRaw}${"${0}"}${afterRaw}`,
                  true: info.trueValue,
                  false: info.falseValue ?? "",
                }
              }
              foundPlaceholder = true
              break
            }
          }
          if (!foundPlaceholder) {
            {
              const parsed = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
              if (typeof parsed === "string") {
                attrs[name] = parsed
              } else if ((parsed as any) && typeof parsed === "object" && "template" in (parsed as any)) {
                const p: any = parsed as any
                const items = Array.isArray(p.items)
                  ? p.items.map((it: any) =>
                      it && it.src === "item" && currentPath ? { ...it, src: currentPath } : it
                    )
                  : []
                attrs[name] = { template: p.template, items }
              } else if (hasSrc(parsed)) {
                const out: any = { ...parsed }
                if ((parsed as any).src === "item" && currentPath) out.src = currentPath as any
                attrs[name] = out
              } else {
                attrs[name] = parsed
              }
            }
          }
        } else {
          {
            const parsed = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
            if (typeof parsed === "string") {
              attrs[name] = parsed
            } else if ((parsed as any) && typeof parsed === "object" && "template" in (parsed as any)) {
              const p: any = parsed as any
              const items = Array.isArray(p.items)
                ? p.items.map((it: any) => (it && it.src === "item" && currentPath ? { ...it, src: currentPath } : it))
                : []
              attrs[name] = { template: p.template, items }
            } else if (hasSrc(parsed)) {
              const out: any = { ...parsed }
              if ((parsed as any).src === "item" && currentPath) out.src = currentPath as any
              attrs[name] = out
            } else {
              attrs[name] = parsed
            }
          }
        }
      } else {
        const valueStart = currentIndex
        while (currentIndex < length && !/\s/.test(attributesStr[currentIndex]!)) currentIndex++
        const value = attributesStr.slice(valueStart, currentIndex)
        if (itemConditionalAttributeMap) {
          // Событийные атрибуты: фиксируем наличие обработчика, не сериализуем функцию
          if (isEventAttr(name)) {
            if (eventAttributeMap && eventAttributeMap.has(value)) {
              attrs[name] = eventAttributeMap.get(value) ?? ""
            } else {
              attrs[name] = ""
            }
            continue
          }
          let foundPlaceholder = false
          for (const [placeholder, info] of itemConditionalAttributeMap) {
            if (value === placeholder) {
              attrs[name] = {
                src: info.src === "item" && currentPath ? (currentPath as any) : info.src,
                key: info.key,
                trueValue: info.trueValue,
                falseValue: info.falseValue,
                type: "conditional",
              }
              foundPlaceholder = true
              break
            }
            if (value.includes(placeholder)) {
              // Смешанный контент — не формируем result, оставляем conditional
              attrs[name] = {
                src: info.src === "item" && currentPath ? (currentPath as any) : info.src,
                key: info.key,
                trueValue: info.trueValue,
                falseValue: info.falseValue,
                type: "conditional",
              }
              foundPlaceholder = true
              break
            }
          }
          if (!foundPlaceholder) {
            {
              const parsed = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
              if (typeof parsed === "string") attrs[name] = parsed
              else if ((parsed as any) && typeof parsed === "object" && "template" in (parsed as any)) {
                const p: any = parsed as any
                const items = Array.isArray(p.items)
                  ? p.items.map((it: any) =>
                      it && it.src === "item" && currentPath ? { ...it, src: currentPath } : it
                    )
                  : []
                attrs[name] = { template: p.template, items }
              } else if (hasSrc(parsed)) {
                const out: any = { ...parsed }
                if ((parsed as any).src === "item" && currentPath) out.src = currentPath as any
                attrs[name] = out
              } else attrs[name] = parsed
            }
          }
        } else {
          {
            const parsed = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
            if (typeof parsed === "string") attrs[name] = parsed
            else if ((parsed as any) && typeof parsed === "object" && "template" in (parsed as any)) {
              const p: any = parsed as any
              const items = Array.isArray(p.items)
                ? p.items.map((it: any) => (it && it.src === "item" && currentPath ? { ...it, src: currentPath } : it))
                : []
              attrs[name] = { template: p.template, items }
            } else if (hasSrc(parsed)) {
              const out: any = { ...parsed }
              if ((parsed as any).src === "item" && currentPath) out.src = currentPath as any
              attrs[name] = out
            } else attrs[name] = parsed
          }
        }
      }
    } else {
      // Булев атрибут без значения или плейсхолдер условного атрибута (item.*)
      if (itemConditionalAttributeMap) {
        let matchedPlaceholder = false
        for (const [placeholder, info] of itemConditionalAttributeMap) {
          if (name === placeholder) {
            const attrName = info.trueValue || name
            ;(attrs as any)[attrName] = {
              src: info.src === "item" && currentPath ? (currentPath as any) : info.src,
              key: info.key,
              true: info.trueValue,
              ...(info.falseValue !== undefined ? { false: info.falseValue } : {}),
            }
            matchedPlaceholder = true
            break
          }
        }
        if (!matchedPlaceholder) {
          // Событийный атрибут без значения (редко, но допустимо)
          if (isEventAttr(name)) {
            attrs[name] = ""
          } else {
            attrs[name] = ""
          }
        }
      } else {
        // Событийный атрибут без значения
        if (isEventAttr(name)) {
          attrs[name] = ""
        } else {
          attrs[name] = ""
        }
      }
    }
  }

  return attrs
}

export function parseConditionalAttributesForArray(
  template: string,
  itemConditionalAttributeMap: Map<
    string,
    { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
  >
): string {
  let processedTemplate = template
  let conditionalIndex = 0
  // Обработка общего тернария с backtick в true-ветви: ${ expr ? `...` : "..." }
  {
    const startRe = /\$\{/g
    let m: RegExpExecArray | null
    while ((m = startRe.exec(processedTemplate)) !== null) {
      const startIndex = m.index
      // найти конец \}
      let depth = 0
      let i = startIndex
      let endIndex = -1
      while (i < processedTemplate.length) {
        const ch = processedTemplate[i]!
        if (ch === "{") depth++
        if (ch === "}") {
          depth--
          if (depth === 0) {
            endIndex = i
            break
          }
        }
        i++
      }
      if (endIndex === -1) break
      const full = processedTemplate.slice(startIndex, endIndex + 1)
      const body = processedTemplate.slice(startIndex + 2, endIndex)
      const qPos = body.indexOf("?")
      if (qPos === -1) {
        startRe.lastIndex = endIndex + 1
        continue
      }
      const exprBody = body.slice(0, qPos).trim()
      const absAfterQ = startIndex + 2 + qPos + 1
      let tStart = absAfterQ
      while (tStart < processedTemplate.length && /\s/.test(processedTemplate[tStart]!)) tStart++
      if (processedTemplate[tStart] !== "`") {
        startRe.lastIndex = endIndex + 1
        continue
      }
      let tEnd = tStart + 1
      while (tEnd < processedTemplate.length && processedTemplate[tEnd] !== "`") tEnd++
      if (tEnd >= processedTemplate.length) {
        startRe.lastIndex = endIndex + 1
        continue
      }
      const trueRaw = processedTemplate.slice(tStart + 1, tEnd)
      let colonPos = tEnd + 1
      while (colonPos < endIndex && processedTemplate[colonPos] !== ":") colonPos++
      if (colonPos >= endIndex) {
        startRe.lastIndex = endIndex + 1
        continue
      }
      let fStart = colonPos + 1
      while (fStart < endIndex && /\s/.test(processedTemplate[fStart]!)) fStart++
      const quote = processedTemplate[fStart]
      if (quote !== '"' && quote !== "'") {
        startRe.lastIndex = endIndex + 1
        continue
      }
      let fEnd = fStart + 1
      while (fEnd < endIndex && processedTemplate[fEnd] !== quote) fEnd++
      const falseLiteral = processedTemplate.slice(fStart + 1, fEnd)

      // expr items: допускаем item|context|core|state
      const varRe = /(item|context|core|state)\.([\w\.]+)/g
      const exprSeen = new Map<string, number>()
      const exprItems: Array<{ src: string; key?: string | string[] }> = []
      let idxExpr = 0
      let mm: RegExpExecArray | null
      while ((mm = varRe.exec(exprBody)) !== null) {
        const id = `${mm[1]!}.${mm[2]!}`
        if (!exprSeen.has(id)) {
          const key = mm[2]!.includes(".") ? mm[2]!.split(".") : mm[2]!
          exprItems.push({ src: mm[1]!, ...(mm[2] ? { key } : {}) } as any)
          exprSeen.set(id, idxExpr++)
        }
      }
      let exprTemplate = exprBody
        .replace(varRe, (_s: string, a: string, b: string) => {
          const id = `${a}.${b}`
          const iRepl = exprSeen.get(id)!
          return `\${${iRepl}}`
        })
        .replace(/\s+/g, "")

      const trueSeen = new Map<string, number>()
      const trueItems: Array<{ src: string; key?: string | string[] }> = []
      let tIdx = 0
      const trueTpl = trueRaw.replace(/\$\{(item|context|core|state)\.([\w\.]+)\}/g, (_m, a, b) => {
        const id = `${a}.${b}`
        if (!trueSeen.has(id)) {
          const key = (b as string).includes(".") ? (b as string).split(".") : (b as string)
          trueItems.push({ src: a as string, ...(b ? { key } : {}) } as any)
          trueSeen.set(id, tIdx++)
        }
        const idx = trueSeen.get(id)!
        return `\${${idx}}`
      })

      const ph = `CONDITIONAL_ATTR_ITEM_${conditionalIndex++}`
      ;(itemConditionalAttributeMap as any).set(ph, {
        items: exprItems,
        template: exprTemplate,
        true: { template: trueTpl, items: trueItems },
        false: falseLiteral,
      })
      processedTemplate = processedTemplate.replace(full, ph)
      startRe.lastIndex = startIndex + ph.length
    }
  }
  const ternaryPattern = /\$\{(\w+)\.(\w+)\s*\?\s*['"]([^'"]*)['"]\s*:\s*['"]([^'"]*)['"]\}/g

  let match
  while ((match = ternaryPattern.exec(template)) !== null) {
    const [fullMatch, _itemName, key, trueValue, falseValue] = match
    if (!key) continue
    const placeholder = `CONDITIONAL_ATTR_ITEM_${conditionalIndex++}`
    const conditionalInfo: { src: string; key: string; trueValue: string; falseValue?: string } = {
      src: "item",
      key,
      trueValue: trueValue || "",
    }
    if (falseValue) conditionalInfo.falseValue = falseValue
    itemConditionalAttributeMap.set(placeholder, conditionalInfo)
    processedTemplate = processedTemplate.replace(fullMatch, placeholder)
  }

  const andPattern = /\$\{(\w+)\.(\w+)\s*&&\s*['"]([^'"]*)['"]\}/g
  while ((match = andPattern.exec(template)) !== null) {
    const [fullMatch, _itemName, key, trueValue] = match
    if (!key) continue
    const placeholder = `CONDITIONAL_ATTR_ITEM_${conditionalIndex++}`
    itemConditionalAttributeMap.set(placeholder, { src: "item", key, trueValue: trueValue || "" })
    processedTemplate = processedTemplate.replace(fullMatch, placeholder)
  }

  // Отрицание: ${!item.key && 'value'} => trueValue = 'value', falseValue = ''
  const notAndPattern = /\$\{!\s*(\w+)\.(\w+)\s*&&\s*['"]([^'"]*)['"]\}/g
  while ((match = notAndPattern.exec(template)) !== null) {
    const [fullMatch, _itemName, key, trueValue] = match
    if (!key) continue
    const placeholder = `CONDITIONAL_ATTR_ITEM_${conditionalIndex++}`
    itemConditionalAttributeMap.set(placeholder, {
      src: "item",
      key,
      trueValue: trueValue || "",
      falseValue: "",
      result: "not",
    })
    processedTemplate = processedTemplate.replace(fullMatch, placeholder)
  }

  return processedTemplate
}
