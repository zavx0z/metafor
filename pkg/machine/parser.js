const pattern = {
  dot: /context\.(\w+)/g,
  destructParams: /context:\s*{([^}]+)}/g,
  destructBody: /(?:const|let|var)\s*{([^}]+)}\s*=\s*context(?:\s*,\s*{([^}]+)}\s*=\s*context)*/g,
  update: /update\(\s*{([^}]+)}\s*\)/g
}

/**
 * Парсит функцию и извлекает читаемые и обновляемые свойства контекста
 * @typedef {Object} ParsedResult
 * @property {string[]} read - Список читаемых свойств контекста
 * @property {string[]} write - Список обновляемых свойств контекста
 *
 * @param {Function} func - Функция для анализа
 * @returns {ParsedResult} Результат парсинга
 */
export function parseFunction(func) {
  const code = func.toString()
  // Множества для хранения уникальных свойств
  const readProperties = new Set()
  const writeProperties = new Set()

  // Поиск всех обращений к параметрам контекста
  let match
  while ((match = pattern.dot.exec(code)) !== null) {
    readProperties.add(match[1])
  }

  // Поиск деструктуризации контекста в параметрах функции
  while ((match = pattern.destructParams.exec(code)) !== null) {
    const props = match[1]
      .split(",")
      .map(prop => prop.trim())
      .filter(prop => prop.length > 0)
    props.forEach(prop => readProperties.add(prop))
  }

  // Обработка всех деструктуризаций в теле функции
  const destructMatches = [...code.matchAll(pattern.destructBody)]
  destructMatches.forEach(match => {
    const allProps = [match[1], match[2]].filter(Boolean).join(",")
    const props = allProps
      .split(",")
      .map(prop => prop.trim().split(":")[0].trim())
      .filter(prop => prop.length > 0)
    props.forEach(prop => readProperties.add(prop))
  })

  // Поиск всех обновлений через update
  while ((match = pattern.update.exec(code)) !== null) {
    const props = match[1]
      .split(",")
      .map(prop => prop.split(":")[0].trim())
      .filter(prop => prop.length > 0)
    props.forEach(prop => writeProperties.add(prop))
  }

  return {read: Array.from(readProperties), write: Array.from(writeProperties)}
}

/**
 * Парсит все функции объекта (действия или ядро)
 * @param {Record<string, Function>} funcs - Объект с функциями
 * @returns {Record<string, ParsedResult>} Результаты парсинга для каждой функции
 */
export const parseFunctions = funcs =>
  Object.entries(funcs).reduce((/** @type {Record<string, ParsedResult>} */ acc, [name, func]) => {
    acc[name] = parseFunction(func)
    return acc
  }, {})
