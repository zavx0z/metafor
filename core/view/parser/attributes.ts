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
          for (const [placeholder, info] of conditionalAttributeMap) {
            if (value === placeholder) {
              attrs[name] = {
                src: info.src,
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
                src: info.src,
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
              attrs[name] = {
                src: info.src,
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
                src: info.src,
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
            const attrName = info.trueValue || name
            attrs[attrName] = {
              src: info.src,
              key: info.key,
              trueValue: info.trueValue,
              falseValue: info.falseValue,
              type: "conditional" as const,
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

export function parseConditionalAttributes(
  htmlString: string,
  conditionalAttributeMap: Map<
    string,
    { src: string; key: string; trueValue: string; falseValue?: string; result?: string }
  >
): string {
  let processedHtml = htmlString
  let conditionalIndex = 0

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
        if (falseValue !== undefined) conditionalInfo.falseValue = falseValue
        conditionalAttributeMap.set(placeholder, conditionalInfo)
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
        conditionalAttributeMap.set(placeholder, { src, key, trueValue: trueValue || "" })
        processedHtml = processedHtml.replace(fullMatch, placeholder)
      }
    }
  }

  // Отрицание: ${!context.key && 'value'}
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
        conditionalAttributeMap.set(placeholder, { src, key, trueValue: "", falseValue: falseValue || "" })
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
            attrs[attrName] = {
              src: info.src,
              key: info.key,
              trueValue: info.trueValue,
              falseValue: info.falseValue,
              type: "conditional" as const,
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

  return processedTemplate
}
