/**
 * Проверяет условие для строкового значения
 */
export function checkStringCondition(value: string, condition: any): boolean {
  if (typeof condition === "string") {
    return value === condition
  }
  if (condition instanceof RegExp) {
    return condition.test(value)
  }
  if (typeof condition === "object" && condition !== null) {
    if (condition.eq !== undefined && value !== condition.eq) return false
    if (condition.notEq !== undefined && value === condition.notEq) return false
    if (condition.startsWith !== undefined && !value.startsWith(condition.startsWith)) return false
    if (condition.endsWith !== undefined && !value.endsWith(condition.endsWith)) return false
    if (condition.include !== undefined && !value.includes(condition.include)) return false
    if (condition.notInclude !== undefined && value.includes(condition.notInclude)) return false
    if (condition.notStartsWith !== undefined && value.startsWith(condition.notStartsWith)) return false
    if (condition.notEndsWith !== undefined && value.endsWith(condition.notEndsWith)) return false
    if (condition.pattern !== undefined && !condition.pattern.test(value)) return false
    if (condition.length !== undefined) {
      if (typeof condition.length === "number") {
        if (value.length !== condition.length) return false
      } else {
        if (condition.length.min !== undefined && value.length < condition.length.min) return false
        if (condition.length.max !== undefined && value.length > condition.length.max) return false
      }
    }
    if (condition.between !== undefined) {
      const [min, max] = condition.between
      if (value < min || value > max) return false
    }
  }
  return true
}
/**
 * Проверяет условие для числового значения
 */
export function checkNumberCondition(value: number, condition: any): boolean {
  if (typeof condition === "number") {
    return value === condition
  }
  if (typeof condition === "object" && condition !== null) {
    if (condition.eq !== undefined && value !== condition.eq) return false
    if (condition.notEq !== undefined && value === condition.notEq) return false
    if (condition.gt !== undefined && value <= condition.gt) return false
    if (condition.gte !== undefined && value < condition.gte) return false
    if (condition.lt !== undefined && value >= condition.lt) return false
    if (condition.lte !== undefined && value > condition.lte) return false
    if (condition.notGt !== undefined && value > condition.notGt) return false
    if (condition.notGte !== undefined && value >= condition.notGte) return false
    if (condition.notLt !== undefined && value < condition.notLt) return false
    if (condition.notLte !== undefined && value <= condition.notLte) return false
    if (condition.between !== undefined) {
      const [min, max] = condition.between
      if (value < min || value > max) return false
    }
  }
  return true
}
/**
 * Проверяет условие для булевого значения
 */
function checkBooleanCondition(value: boolean, condition: any): boolean {
  if (typeof condition === "boolean") {
    return value === condition
  }
  if (typeof condition === "object" && condition !== null) {
    if (condition.eq !== undefined && value !== condition.eq) return false
    if (condition.notEq !== undefined && value === condition.notEq) return false
    if (condition.logicalEq !== undefined && Boolean(value) !== condition.logicalEq) return false
  }
  return true
}
/**
 * Проверяет условие для массива
 */
function checkArrayCondition(value: any[], condition: any): boolean {
  if (Array.isArray(condition)) {
    return JSON.stringify(value) === JSON.stringify(condition)
  }
  if (typeof condition === "object" && condition !== null) {
    if (condition.length !== undefined) {
      if (typeof condition.length === "number") {
        if (value.length !== condition.length) return false
      } else {
        if (condition.length.min !== undefined && value.length < condition.length.min) return false
        if (condition.length.max !== undefined && value.length > condition.length.max) return false
      }
    }
    if (condition.includes !== undefined && !value.includes(condition.includes)) return false
    if (condition.notIncludes !== undefined && value.includes(condition.notIncludes)) return false
    if (condition.isEmpty !== undefined && (condition.isEmpty ? value.length !== 0 : value.length === 0)) return false
    if (condition.every !== undefined) {
      if (
        !value.every((item) => {
          if (typeof item === "number") return checkNumberCondition(item, condition.every)
          if (typeof item === "string") return checkStringCondition(item, condition.every)
          return false
        })
      )
        return false
    }
    if (condition.some !== undefined) {
      if (
        !value.some((item) => {
          if (typeof item === "number") return checkNumberCondition(item, condition.some)
          if (typeof item === "string") return checkStringCondition(item, condition.some)
          return false
        })
      )
        return false
    }
  }
  return true
}
/**
 * Проверяет условие для любого значения
 */
export function checkValueCondition(value: any, condition: any): boolean {
  // Проверка на null
  if (condition === null) {
    return value === null
  }

  // Проверка на undefined
  if (condition === undefined) {
    return value === undefined
  }

  // Проверка на null в объекте условий
  if (typeof condition === "object" && condition !== null && condition.null !== undefined) {
    if (condition.null && value !== null) return false
    if (!condition.null && value === null) return false
    return true // Если проверка null прошла успешно, возвращаем true
  }

  // Проверка по типу значения
  if (typeof value === "string") {
    return checkStringCondition(value, condition)
  }
  if (typeof value === "number") {
    return checkNumberCondition(value, condition)
  }
  if (typeof value === "boolean") {
    return checkBooleanCondition(value, condition)
  }
  if (Array.isArray(value)) {
    return checkArrayCondition(value, condition)
  }

  // Для объектов и других типов - прямое сравнение
  if (typeof condition === "object" && condition !== null) {
    // Если это объект условий, но не подходящий тип - возвращаем false
    if (condition.eq !== undefined || condition.gt !== undefined || condition.startsWith !== undefined) {
      return false
    }
  }

  // Прямое сравнение для объектов и других типов
  return JSON.stringify(value) === JSON.stringify(condition)
}
