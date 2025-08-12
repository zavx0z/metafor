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
              const originalConditional = info.falseValue
                ? `\${${info.src}.${info.key} ? '${info.trueValue}' : '${info.falseValue}'}`
                : `\${${info.src}.${info.key} && '${info.trueValue}'}`
              const resultValue = value.replace(placeholder, originalConditional)
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
              const originalConditional = info.falseValue
                ? `\${${info.src}.${info.key} ? '${info.trueValue}' : '${info.falseValue}'}`
                : `\${${info.src}.${info.key} && '${info.trueValue}'}`
              const resultValue = value.replace(placeholder, originalConditional)
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

  const simpleItemMatch = value.match(/^\$\{item\.([\w\.]+)\}$/)
  if (simpleItemMatch) {
    const [, key] = simpleItemMatch
    if (key) return { src: "item", key: key.includes(".") ? key.split(".") : key }
  }

  const simpleVarMatch = value.match(/^\$\{(\w+)\}$/)
  if (simpleVarMatch) return { src: "item" }

  for (const [placeholder, info] of itemInterpolationMap) {
    if (value.includes(placeholder)) {
      if (value === placeholder) {
        return info.key
          ? {
              src: info.src,
              key: Array.isArray(info.key) ? info.key : info.key.includes(".") ? info.key.split(".") : info.key,
            }
          : { src: info.src }
      }
      // Строим шаблонный формат { template, items }
      const items: any[] = []
      const replaced = value.replaceAll(placeholder, () => {
        const normalizedKey = Array.isArray(info.key)
          ? (info.key as string[])
          : info.key && typeof info.key === "string" && info.key.includes(".")
            ? (info.key as string).split(".")
            : info.key
        const idx = items.push(info.key ? { src: "item", key: normalizedKey as any } : { src: "item" }) - 1
        return `\${${idx}}`
      })
      return { template: replaced, items } as any
    }
  }

  const hasItemInterpolation = /\$\{item\.([\w\.]+)\}/.test(value)
  if (hasItemInterpolation) {
    const items: any[] = []
    const replaced = value.replace(/\$\{item\.([\w\.]+)\}/g, (_m, key) => {
      const normalizedKey = String(key)
      const idx =
        items.push({ src: "item", key: normalizedKey.includes(".") ? normalizedKey.split(".") : normalizedKey }) - 1
      return `\${${idx}}`
    })
    return { template: replaced, items } as any
  }

  const hasSimpleVar = /\$\{(\w+)\}/.test(value)
  if (hasSimpleVar)
    return { template: value.replace(/\$\{(\w+)\}/g, (_m, _n, _i) => "${0}"), items: [{ src: "item" }] } as any

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
              const srcForCond = info.src === "item" && currentPath ? "VALUE" : `${info.src}.${info.key}`
              const originalConditional = info.falseValue
                ? `\${${srcForCond} ? '${info.trueValue}' : '${info.falseValue}'}`
                : `\${${srcForCond} && '${info.trueValue}'}`
              const resultValue = value.replace(placeholder, originalConditional)
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
              else if (hasSrc(parsed)) {
                const out: any = { ...parsed }
                if (parsed.src === "item" && currentPath) out.src = currentPath as any
                if ("result" in parsed && parsed.result && parsed.src === "item") {
                  out.result = parsed.result.replace(/\$\{item\.[^}]+\}/g, "${VALUE}")
                }
                attrs[name] = out
              } else attrs[name] = parsed
            }
          }
        } else {
          {
            const parsed = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
            if (typeof parsed === "string") attrs[name] = parsed
            else if (hasSrc(parsed)) {
              const out: any = { ...parsed }
              if (parsed.src === "item" && currentPath) out.src = currentPath as any
              if ("result" in parsed && parsed.result && parsed.src === "item") {
                out.result = parsed.result.replace(/\$\{item\.[^}]+\}/g, "${VALUE}")
              }
              attrs[name] = out
            } else attrs[name] = parsed
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
              const srcForCond = info.src === "item" && currentPath ? "VALUE" : `${info.src}.${info.key}`
              const originalConditional = info.falseValue
                ? `\${${srcForCond} ? '${info.trueValue}' : '${info.falseValue}'}`
                : `\${${srcForCond} && '${info.trueValue}'}`
              const resultValue = value.replace(placeholder, originalConditional)
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
              else if (hasSrc(parsed)) {
                const out: any = { ...parsed }
                if (parsed.src === "item" && currentPath) out.src = currentPath as any
                if ("result" in parsed && parsed.result && parsed.src === "item") {
                  out.result = parsed.result.replace(/\$\{item\.[^}]+\}/g, "${VALUE}")
                }
                attrs[name] = out
              } else attrs[name] = parsed
            }
          }
        } else {
          {
            const parsed = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
            if (typeof parsed === "string") attrs[name] = parsed
            else if (hasSrc(parsed)) {
              const out: any = { ...parsed }
              if (parsed.src === "item" && currentPath) out.src = currentPath as any
              if ("result" in parsed && parsed.result && parsed.src === "item") {
                out.result = parsed.result.replace(/\$\{item\.[^}]+\}/g, "${VALUE}")
              }
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
