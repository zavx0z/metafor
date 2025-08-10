import type { AttributeValue } from "./index.t.ts"
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null
const hasResult = (v: unknown): v is { result: string } => isObject(v) && typeof (v as any).result === "string"
const hasSrc = (v: unknown): v is { src: string; key?: string } => isObject(v) && typeof (v as any).src === "string"

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
          result: resultValue,
          type: "conditional" as const,
        }
      }
    }
  }

  if (interpolationMap) {
    for (const [placeholder, info] of interpolationMap) {
      if (value === placeholder) {
        return info
      }
    }
  }

  if (interpolationMap) {
    // Поддержка множественных интерполяций в одном атрибуте
    let resultValue = value
    let firstInfo: { src: string; key: string } | null = null
    let matched = false
    for (const [placeholder, info] of interpolationMap) {
      if (resultValue.includes(placeholder)) {
        const originalInterpolation = `\${${info.src}.${info.key}}`
        resultValue = resultValue.replaceAll(placeholder, originalInterpolation)
        if (!firstInfo) firstInfo = info
        matched = true
      }
    }
    if (matched) {
      return firstInfo ? { src: firstInfo.src, key: firstInfo.key, result: resultValue } : (resultValue as any)
    }
  }

  const simpleInterpolationMatch = value.match(/^\$\{(context|core)\.(\w+)\}$/)
  if (simpleInterpolationMatch) {
    const [, src, key] = simpleInterpolationMatch
    if (src && key) {
      return { src, key }
    }
  }

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
          if (typeof parsed === "string") {
            attrs[name] = parsed
          } else if (hasResult(parsed)) {
            attrs[name] = parsed.result
          } else if (hasSrc(parsed)) {
            attrs[name] = parsed.key ? `\${${parsed.src}.${parsed.key}}` : ""
          } else {
            attrs[name] = value
          }
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
            if (typeof parsed === "string") {
              attrs[name] = parsed
            } else if (hasResult(parsed)) {
              attrs[name] = parsed.result
            } else if (hasSrc(parsed)) {
              attrs[name] = parsed.key ? `\${${parsed.src}.${parsed.key}}` : ""
            } else {
              attrs[name] = value
            }
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
                result: resultValue,
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
                result: resultValue,
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
  itemInterpolationMap: Map<string, { src: string; key?: string }>,
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
          result: info.result || value,
          type: "conditional" as const,
        }
      }
    }
  }

  const simpleItemMatch = value.match(/^\$\{item\.(\w+)\}$/)
  if (simpleItemMatch) {
    const [, key] = simpleItemMatch
    if (key) return { src: "item", key }
  }

  const simpleVarMatch = value.match(/^\$\{(\w+)\}$/)
  if (simpleVarMatch) return { src: "item" }

  for (const [placeholder, info] of itemInterpolationMap) {
    if (value.includes(placeholder)) {
      if (value === placeholder) {
        return info.key ? { src: info.src, key: info.key } : { src: info.src }
      }
      const originalInterpolation = info.key ? `\${item.${info.key}}` : `\${id}`
      const resultValue = value.replace(placeholder, originalInterpolation)
      return info.key ? { src: info.src, key: info.key, result: resultValue } : { src: info.src, result: resultValue }
    }
  }

  const hasItemInterpolation = /\$\{item\.(\w+)\}/.test(value)
  if (hasItemInterpolation) {
    const itemMatch = value.match(/\$\{item\.(\w+)\}/)
    if (itemMatch) {
      const [, key] = itemMatch
      if (key) return { src: "item", key, result: value }
    }
  }

  const hasSimpleVar = /\$\{(\w+)\}/.test(value)
  if (hasSimpleVar) return { src: "item", result: value }

  return value
}

export function parseAttributesForArray(
  attributesStr: string,
  itemInterpolationMap: Map<string, { src: string; key?: string }>,
  itemConditionalAttributeMap?: Map<
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
                result: resultValue,
                type: "conditional",
              }
              foundPlaceholder = true
              break
            }
          }
          if (!foundPlaceholder) {
            attrs[name] = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
          }
        } else {
          attrs[name] = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
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
                result: resultValue,
                type: "conditional",
              }
              foundPlaceholder = true
              break
            }
          }
          if (!foundPlaceholder) {
            attrs[name] = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
          }
        } else {
          attrs[name] = parseAttributeValueForArray(value, itemInterpolationMap, itemConditionalAttributeMap)
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
