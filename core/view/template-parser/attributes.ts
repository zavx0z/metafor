import type { AttributeValue, ConditionalAttributeInfo } from "./index.t"

// Парсинг атрибутов для обычного контекста
export function parseAttributes(
  attributesStr: string,
  interpolationMap?: Map<string, string>,
  conditionalAttributeMap?: Map<string, ConditionalAttributeInfo>
): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {}

  if (!attributesStr.trim()) {
    return attributes
  }

  // Проверяем, является ли вся строка условным именем атрибута
  if (conditionalAttributeMap) {
    for (const [placeholder, info] of conditionalAttributeMap) {
      if (attributesStr.trim() === placeholder) {
        const conditionalAttr: any = {
          type: "conditional",
          src: info.condition.split(".")[0] || info.condition,
          key: info.condition.split(".").pop() || info.condition,
          trueValue: info.trueValue,
        }

        // Добавляем falseValue только если оно есть
        if (info.falseValue !== undefined) {
          conditionalAttr.falseValue = info.falseValue
        }

        return {
          [info.trueValue]: conditionalAttr,
        }
      }
    }
  }

  // Проверяем, является ли вся строка условным атрибутом (без имени атрибута)
  if (conditionalAttributeMap) {
    for (const [placeholder, info] of conditionalAttributeMap) {
      if (attributesStr.trim() === placeholder) {
        // Это условный атрибут без имени, используем trueValue как имя атрибута
        const conditionalAttr: any = {
          type: "conditional",
          src: info.condition.split(".")[0] || info.condition,
          key: info.condition.split(".").pop() || info.condition,
          trueValue: info.trueValue,
        }

        // Добавляем falseValue только если оно есть
        if (info.falseValue !== undefined) {
          conditionalAttr.falseValue = info.falseValue
        }

        return {
          [info.trueValue]: conditionalAttr,
        }
      }
    }
  }

  // Используем регулярное выражение для парсинга атрибутов
  const attrRegex = /(\w+(?:-\w+)*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))|(\w+(?:-\w+)*)/g
  let match

  while ((match = attrRegex.exec(attributesStr)) !== null) {
    const [, attrName, doubleQuotedValue, singleQuotedValue, unquotedValue, booleanAttr] = match

    if (booleanAttr) {
      // Булев атрибут без значения
      attributes[booleanAttr] = ""
    } else if (attrName) {
      // Атрибут со значением
      const attrValue = doubleQuotedValue || singleQuotedValue || unquotedValue || ""

      // Проверяем, является ли значение условным атрибутом
      if (conditionalAttributeMap) {
        let isConditional = false
        for (const [placeholder, info] of conditionalAttributeMap) {
          if (attrValue === placeholder) {
            const conditionalAttr: any = {
              type: "conditional",
              src: info.condition.split(".")[0] || info.condition,
              key: info.condition.split(".").pop() || info.condition,
              trueValue: info.trueValue,
            }

            // Добавляем falseValue только если оно есть
            if (info.falseValue !== undefined) {
              conditionalAttr.falseValue = info.falseValue
            }

            attributes[attrName] = conditionalAttr
            isConditional = true
            break
          }
        }
        if (isConditional) {
          continue
        }
      }

      // Проверяем, является ли значение условным атрибутом
      const conditionalMatch = attrValue.match(/CONDITIONAL_(\d+)/)
      if (conditionalMatch && conditionalAttributeMap) {
        const [, index] = conditionalMatch
        const placeholder = `CONDITIONAL_${index}`
        const info = conditionalAttributeMap.get(placeholder)
        if (info) {
          attributes[attrName] = {
            type: "conditional",
            src: info.condition.split(".")[0] || info.condition,
            key: info.condition.split(".").pop() || info.condition,
            trueValue: info.trueValue,
            ...(info.falseValue !== undefined && { falseValue: info.falseValue }),
          }
          continue
        }
      }

      // Парсим обычное значение атрибута
      attributes[attrName] = parseAttributeValue(attrValue, interpolationMap, conditionalAttributeMap)
    }
  }

  return attributes
}

// Парсинг атрибутов для элементов массива
export function parseAttributesForArray(
  attributesStr: string,
  interpolationMap?: Map<string, string>,
  itemConditionalAttributeMap?: Map<string, ConditionalAttributeInfo>
): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {}

  if (!attributesStr.trim()) {
    return attributes
  }

  // Проверяем, является ли вся строка условным именем атрибута
  if (itemConditionalAttributeMap) {
    for (const [placeholder, info] of itemConditionalAttributeMap) {
      if (attributesStr.trim() === placeholder) {
        const conditionalAttr: any = {
          type: "conditional",
          src: info.condition.split(".")[0] || info.condition,
          key: info.condition.split(".").pop() || info.condition,
          trueValue: info.trueValue,
        }

        // Добавляем falseValue только если оно есть
        if (info.falseValue !== undefined) {
          conditionalAttr.falseValue = info.falseValue
        }

        return {
          [info.trueValue]: conditionalAttr,
        }
      }
    }
  }

  // Используем регулярное выражение для парсинга атрибутов
  const attrRegex = /(\w+(?:-\w+)*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))|(\w+(?:-\w+)*)/g
  let match

  while ((match = attrRegex.exec(attributesStr)) !== null) {
    const [, attrName, doubleQuotedValue, singleQuotedValue, unquotedValue, booleanAttr] = match

    if (booleanAttr) {
      // Булев атрибут без значения
      attributes[booleanAttr] = ""
    } else if (attrName) {
      // Атрибут со значением
      const attrValue = doubleQuotedValue || singleQuotedValue || unquotedValue || ""

      // Проверяем, является ли значение условным атрибутом
      if (itemConditionalAttributeMap) {
        let isConditional = false
        for (const [placeholder, info] of itemConditionalAttributeMap) {
          if (attrValue === placeholder) {
            const conditionalAttr: any = {
              type: "conditional",
              src: info.condition.split(".")[0] || info.condition,
              key: info.condition.split(".").pop() || info.condition,
              trueValue: info.trueValue,
            }

            // Добавляем falseValue только если оно есть
            if (info.falseValue !== undefined) {
              conditionalAttr.falseValue = info.falseValue
            }

            attributes[attrName] = conditionalAttr
            isConditional = true
            break
          }
        }
        if (isConditional) {
          continue
        }
      }

      // Парсим обычное значение атрибута
      attributes[attrName] = parseAttributeValueForArray(attrValue, interpolationMap, itemConditionalAttributeMap)
    }
  }

  return attributes
}

// Парсинг значения атрибута для обычного контекста
export function parseAttributeValue(
  value: string,
  interpolationMap?: Map<string, string>,
  conditionalAttributeMap?: Map<string, ConditionalAttributeInfo>,
  itemConditionalAttributeMap?: Map<string, ConditionalAttributeInfo>
): AttributeValue {
  if (!value) {
    return ""
  }

  // Проверяем, является ли значение условным атрибутом
  if (itemConditionalAttributeMap) {
    for (const [placeholder, info] of itemConditionalAttributeMap) {
      if (value.trim() === placeholder) {
        const conditionalAttr: any = {
          type: "conditional",
          src: info.condition.split(".")[0] || info.condition,
          key: info.condition.split(".").pop() || info.condition,
          trueValue: info.trueValue,
        }

        // Добавляем falseValue только если оно есть
        if (info.falseValue !== undefined) {
          conditionalAttr.falseValue = info.falseValue
        }

        return conditionalAttr
      }
    }
  }

  if (conditionalAttributeMap) {
    for (const [placeholder, info] of conditionalAttributeMap) {
      if (value.trim() === placeholder) {
        const conditionalAttr: any = {
          type: "conditional",
          src: info.condition.split(".")[0] || info.condition,
          key: info.condition.split(".").pop() || info.condition,
          trueValue: info.trueValue,
        }

        // Добавляем falseValue только если оно есть
        if (info.falseValue !== undefined) {
          conditionalAttr.falseValue = info.falseValue
        }

        return conditionalAttr
      }
    }
  }

  // Проверяем, содержит ли значение условные плейсхолдеры
  if (conditionalAttributeMap) {
    for (const [placeholder, info] of conditionalAttributeMap) {
      if (value.includes(placeholder)) {
        // Восстанавливаем полное выражение для смешанного контента
        let fullExpression = value
        if (info.originalExpression) {
          fullExpression = value.replace(placeholder, info.originalExpression)
        }

        const conditionalAttr: any = {
          type: "conditional",
          src: info.condition.split(".")[0] || info.condition,
          key: info.condition.split(".").pop() || info.condition,
          trueValue: info.trueValue,
          result: fullExpression, // Сохраняем полное выражение
        }

        // Добавляем falseValue только если оно есть
        if (info.falseValue !== undefined) {
          conditionalAttr.falseValue = info.falseValue
        }

        return conditionalAttr
      }
    }
  }

  if (itemConditionalAttributeMap) {
    for (const [placeholder, info] of itemConditionalAttributeMap) {
      if (value.includes(placeholder)) {
        const conditionalAttr: any = {
          type: "conditional",
          src: info.condition.split(".")[0] || info.condition,
          key: info.condition.split(".").pop() || info.condition,
          trueValue: info.trueValue,
          result: value, // Сохраняем полное выражение
        }

        // Добавляем falseValue только если оно есть
        if (info.falseValue !== undefined) {
          conditionalAttr.falseValue = info.falseValue
        }

        return conditionalAttr
      }
    }
  }

  // Проверяем, является ли значение простой интерполяцией
  if (interpolationMap) {
    for (const [placeholder, interpolation] of interpolationMap) {
      if (value === placeholder) {
        // Извлекаем только имя свойства из полного пути
        const propertyName = interpolation.split(".").pop() || interpolation
        // Извлекаем базовый путь (context или core)
        const basePath = interpolation.split(".")[0] || interpolation
        return {
          src: basePath,
          key: propertyName,
        }
      }
    }
  }

  // Проверяем, содержит ли значение интерполяции (смешанный контент)
  if (value.includes("INTERPOLATION_") || value.includes("${")) {
    let mixedContent = value
    let hasInterpolation = false
    let originalExpression = value

    if (interpolationMap) {
      for (const [placeholder, interpolation] of interpolationMap) {
        if (value.includes(placeholder)) {
          // Восстанавливаем оригинальное выражение
          originalExpression = originalExpression.replace(placeholder, `\${${interpolation}}`)
          mixedContent = mixedContent.replace(placeholder, interpolation)
          hasInterpolation = true
        }
      }
    }

    if (hasInterpolation) {
      // Извлекаем ключ и базовый путь из первой интерполяции
      let key = ""
      let basePath = ""
      if (interpolationMap) {
        for (const [placeholder, interpolation] of interpolationMap) {
          if (value.includes(placeholder)) {
            key = interpolation.split(".").pop() || interpolation
            basePath = interpolation.split(".")[0] || interpolation
            break
          }
        }
      }

      return {
        src: basePath,
        key: key,
        result: originalExpression,
      }
    }
  }

  // Статическое значение
  return value
}

// Парсинг значения атрибута для элементов массива
export function parseAttributeValueForArray(
  value: string,
  interpolationMap?: Map<string, string>,
  itemConditionalAttributeMap?: Map<string, ConditionalAttributeInfo>
): AttributeValue {
  if (!value) {
    return ""
  }

  // Проверяем, является ли значение условным атрибутом
  if (itemConditionalAttributeMap) {
    for (const [placeholder, info] of itemConditionalAttributeMap) {
      if (value.trim() === placeholder) {
        const conditionalAttr: any = {
          type: "conditional",
          src: info.condition.split(".")[0] || info.condition,
          key: info.condition.split(".").pop() || info.condition,
          trueValue: info.trueValue,
        }

        // Добавляем falseValue только если оно есть
        if (info.falseValue !== undefined) {
          conditionalAttr.falseValue = info.falseValue
        }

        return conditionalAttr
      }
    }
  }

  // Проверяем, содержит ли значение условные плейсхолдеры
  if (itemConditionalAttributeMap) {
    for (const [placeholder, info] of itemConditionalAttributeMap) {
      if (value.includes(placeholder)) {
        // Восстанавливаем полное выражение для смешанного контента
        let fullExpression = value
        if (info.originalExpression) {
          fullExpression = value.replace(placeholder, info.originalExpression)
        }

        const conditionalAttr: any = {
          type: "conditional",
          src: info.condition.split(".")[0] || info.condition,
          key: info.condition.split(".").pop() || info.condition,
          trueValue: info.trueValue,
          result: fullExpression, // Сохраняем полное выражение
        }

        // Добавляем falseValue только если оно есть
        if (info.falseValue !== undefined) {
          conditionalAttr.falseValue = info.falseValue
        }

        return conditionalAttr
      }
    }
  }

  // Проверяем, является ли значение простой интерполяцией
  if (interpolationMap) {
    for (const [placeholder, interpolation] of interpolationMap) {
      if (value === placeholder) {
        // Извлекаем только имя свойства из полного пути
        const propertyName = interpolation.split(".").pop() || interpolation
        // Извлекаем базовый путь (context или core)
        const basePath = interpolation.split(".")[0] || interpolation
        return {
          src: basePath,
          key: propertyName,
        }
      }
    }
  }

  // Проверяем, содержит ли значение интерполяции (смешанный контент)
  if (value.includes("INTERPOLATION_") || value.includes("${")) {
    let mixedContent = value
    let hasInterpolation = false
    let originalExpression = value

    if (interpolationMap) {
      for (const [placeholder, interpolation] of interpolationMap) {
        if (value.includes(placeholder)) {
          // Восстанавливаем оригинальное выражение
          originalExpression = originalExpression.replace(placeholder, `\${${interpolation}}`)
          mixedContent = mixedContent.replace(placeholder, interpolation)
          hasInterpolation = true
        }
      }
    }

    if (hasInterpolation) {
      // Извлекаем ключ и базовый путь из первой интерполяции
      let key = ""
      let basePath = ""
      if (interpolationMap) {
        for (const [placeholder, interpolation] of interpolationMap) {
          if (value.includes(placeholder)) {
            key = interpolation.split(".").pop() || interpolation
            basePath = interpolation.split(".")[0] || interpolation
            break
          }
        }
      }

      return {
        src: basePath,
        key: key,
        result: originalExpression,
      }
    }
  }

  // Статическое значение
  return value
}

// Парсинг условных атрибутов
export function parseConditionalAttributes(
  htmlString: string,
  conditionalAttributeMap: Map<string, ConditionalAttributeInfo>
): string {
  let result = htmlString
  let counter = 0

  // Паттерн для условных значений атрибутов: class="${isActive ? 'active' : 'inactive'}"
  // Разрешаем пустые строки в обеих ветках
  const conditionalValuePattern = /\$\{([^}]+)\s*\?\s*['"`]([^'"`]*)['"`]\s*:\s*['"`]([^'"`]*)['"`]\}/g
  let match

  while ((match = conditionalValuePattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, trueValue, falseValue] = match
    const placeholder = `CONDITIONAL_ATTR_${counter}`

    conditionalAttributeMap.set(placeholder, {
      condition: condition.trim(),
      trueValue,
      falseValue: falseValue || "",
      originalExpression: fullMatch, // Сохраняем оригинальное выражение
    })

    result = result.replace(fullMatch, placeholder)
    counter++
  }

  // Паттерн для логического AND в значениях: class="${isActive && 'active'}"
  const andValuePattern = /\$\{([^}]+)\s*&&\s*['"`]([^'"`]+)['"`]\}/g

  while ((match = andValuePattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, trueValue] = match
    const placeholder = `CONDITIONAL_ATTR_${counter}`

    conditionalAttributeMap.set(placeholder, {
      condition: condition.trim(),
      trueValue,
      originalExpression: fullMatch, // Сохраняем оригинальное выражение
    })

    result = result.replace(fullMatch, placeholder)
    counter++
  }

  // Паттерн для логического OR в значениях: class="${role || 'user'}"
  const orValuePattern = /\$\{([^}]+)\s*\|\|\s*['"`]([^'"`]+)['"`]\}/g

  while ((match = orValuePattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, falseValue] = match
    const placeholder = `CONDITIONAL_ATTR_${counter}`

    conditionalAttributeMap.set(placeholder, {
      condition: condition.trim(),
      trueValue: condition.trim(),
      falseValue,
      originalExpression: fullMatch, // Сохраняем оригинальное выражение
    })

    result = result.replace(fullMatch, placeholder)
    counter++
  }

  // Паттерн для условных имен атрибутов: <button ${condition && "disabled"}>
  const andNamePattern = /\$\{([^}]+)\s*&&\s*['"`]([^'"`]+)['"`]\}/g

  while ((match = andNamePattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, attrName] = match
    const placeholder = `CONDITIONAL_ATTR_NAME_${counter}`

    conditionalAttributeMap.set(placeholder, {
      condition: condition.trim(),
      trueValue: attrName,
      originalExpression: fullMatch, // Сохраняем оригинальное выражение
    })

    result = result.replace(fullMatch, placeholder)
    counter++
  }

  // Паттерн для условных атрибутов без имени: <input ${condition && "readonly"}>
  const andAttrPattern = /\$\{([^}]+)\s*&&\s*['"`]([^'"`]+)['"`]\}/g

  while ((match = andAttrPattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, attrName] = match
    const placeholder = `CONDITIONAL_ATTR_${counter}`

    conditionalAttributeMap.set(placeholder, {
      condition: condition.trim(),
      trueValue: attrName,
      originalExpression: fullMatch, // Сохраняем оригинальное выражение
    })

    result = result.replace(fullMatch, placeholder)
    counter++
  }

  return result
}

// Парсинг условных атрибутов для массивов
export function parseConditionalAttributesForArray(
  template: string,
  itemConditionalAttributeMap: Map<string, ConditionalAttributeInfo>
): string {
  let result = template
  let counter = 0

  // Паттерн для условных значений атрибутов: class="${item.isActive ? 'active' : 'inactive'}"
  // Разрешаем пустые строки в обеих ветках
  const conditionalValuePattern = /\$\{([^}]+)\s*\?\s*['"`]([^'"`]*)['"`]\s*:\s*['"`]([^'"`]*)['"`]\}/g
  let match

  while ((match = conditionalValuePattern.exec(template)) !== null) {
    const [fullMatch, condition, trueValue, falseValue] = match
    const placeholder = `CONDITIONAL_ATTR_ITEM_${counter}`

    itemConditionalAttributeMap.set(placeholder, {
      condition: condition.trim(),
      trueValue,
      falseValue: falseValue || "",
      originalExpression: fullMatch, // Сохраняем оригинальное выражение
    })

    result = result.replace(fullMatch, placeholder)
    counter++
  }

  // Паттерн для логического AND в значениях: class="${item.isActive && 'active'}"
  const andValuePattern = /\$\{([^}]+)\s*&&\s*['"`]([^'"`]+)['"`]\}/g

  while ((match = andValuePattern.exec(template)) !== null) {
    const [fullMatch, condition, trueValue] = match
    const placeholder = `CONDITIONAL_ATTR_ITEM_${counter}`

    itemConditionalAttributeMap.set(placeholder, {
      condition: condition.trim(),
      trueValue,
      falseValue: "",
      originalExpression: fullMatch, // Сохраняем оригинальное выражение
    })

    result = result.replace(fullMatch, placeholder)
    counter++
  }

  // Паттерн для логического OR в значениях: class="${item.role || 'user'}"
  const orValuePattern = /\$\{([^}]+)\s*\|\|\s*['"`]([^'"`]+)['"`]\}/g

  while ((match = orValuePattern.exec(template)) !== null) {
    const [fullMatch, condition, falseValue] = match
    const placeholder = `CONDITIONAL_ATTR_ITEM_${counter}`

    itemConditionalAttributeMap.set(placeholder, {
      condition: condition.trim(),
      trueValue: condition.trim(),
      falseValue,
      originalExpression: fullMatch, // Сохраняем оригинальное выражение
    })

    result = result.replace(fullMatch, placeholder)
    counter++
  }

  // Паттерн для условных имен атрибутов: <div ${item.isAdmin && "admin-user"}>
  const andNameItemPattern = /\$\{([^}]+)\s*&&\s*['"`]([^'"`]+)['"`]\}/g

  while ((match = andNameItemPattern.exec(template)) !== null) {
    const [fullMatch, condition, attrName] = match
    const placeholder = `CONDITIONAL_ATTR_NAME_ITEM_${counter}`

    itemConditionalAttributeMap.set(placeholder, {
      condition: condition.trim(),
      trueValue: attrName,
      falseValue: "",
      originalExpression: fullMatch, // Сохраняем оригинальное выражение
    })

    result = result.replace(fullMatch, placeholder)
    counter++
  }

  return result
}