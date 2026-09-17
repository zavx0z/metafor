// @ts-nocheck
/**
 * @template {import('./types/index.ts').ContextDefinition} C
 *
 * @param {import('./types/trigger.ts').TriggerType<C>} trigger
 * @param {import('./types/index.ts').ContextData<C>} context
 * @param {import('./types/index.ts').ContextDefinition} types
 */
export function matchTrigger(trigger, context, types) {
  for (const key in trigger) {
    const condition = trigger[key]
    const value = context[key]
    const contextParam = types[key]
    const contextParamType = contextParam?.type

    // Проверка null значений
    if (condition === null) {
      if (!contextParam?.nullable) return false
      if (value !== null) return false
      continue
    }

    //Проверка isNull в объектных условиях
    if (typeof condition === "object" && "isNull" in condition) {
      const isNullCheck = condition.isNull
      const valueIsNull = value === null || value === undefined

      if (!isNullCheck && valueIsNull) return false
      if (isNullCheck && !valueIsNull) return false

      // Если isNull: false и значение не null, продолжаем проверять другие условия
      if (isNullCheck) continue
    }

    // Если значение null, а условие не проверяет null - возвращаем false
    if (value === null) return false

    // Проверка прямых значений
    if (typeof condition !== "object") {
      if (value !== condition) return false
      continue
    }

    // Проверка объектных условий по типам
    switch (contextParamType) {
      case "string":
        if ("include" in condition && !value?.includes(condition.include)) return false
        if ("startsWith" in condition && !value?.startsWith(condition.startsWith)) return false
        if ("endsWith" in condition && !value?.endsWith(condition.endsWith)) return false
        if ("notEndsWith" in condition && value?.endsWith(condition.notEndsWith)) return false
        continue
      case "number":
        if ("eq" in condition && value !== condition.eq) return false
        if ("gt" in condition && value <= condition.gt) return false
        if ("gte" in condition && value < condition.gte) return false
        if ("lt" in condition && value >= condition.lt) return false
        if ("lte" in condition && value > condition.lte) return false
        if ("between" in condition && Array.isArray(condition.between)) {
          const [min, max] = condition.between
          if (value < min || value > max) return false
        }
        continue
      case "boolean":
        if ("eq" in condition && value !== condition.eq) return false
        if ("notEq" in condition && value === condition.notEq) return false
        if ("logicalEq" in condition && Boolean(value) !== Boolean(condition.logicalEq)) return false
        continue
      case "enum":
        if ("eq" in condition && value !== condition.eq) return false
        if ("notEq" in condition && value === condition.notEq) return false
        if ("oneOf" in condition && Array.isArray(condition.oneOf) && !condition.oneOf.includes(value)) return false
        if ("notOneOf" in condition && Array.isArray(condition.notOneOf) && condition.notOneOf.includes(value)) return false
        continue
      case "array":
        if ("length" in condition) {
          if (typeof condition.length === "number" && value.length !== condition.length) return false
          if (typeof condition.length === "object") {
            if ("min" in condition.length && value.length < condition.length.min) return false
            if ("max" in condition.length && value.length > condition.length.max) return false
          }
        }
        if ("includes" in condition && !value.includes(condition.includes)) return false
        if ("notIncludes" in condition && value.includes(condition.notIncludes)) return false
        if ("empty" in condition && condition.empty !== (value.length === 0)) return false
        continue
      default:
        return false
    }
  }
  return true
}
