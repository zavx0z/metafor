import type {SplitterFn, SplitterResolved, ValueType} from "@metafor/template/types/attribute/index"
import type { RawAttrArray } from "@metafor/template/types/attribute/array"
import type { RawAttrBoolean } from "@metafor/template/types/attribute/boolean"
import type { RawAttrEvent } from "@metafor/template/types/attribute/event"
import type { RawAttrString } from "@metafor/template/types/attribute/string"

// ============================
// ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ
// ============================

/**
 * Форматирует выражение по HTML-правилам схлопывания пробелов.
 * - Схлопывает последовательности пробельных символов в один пробел
 * - Обрезает пробелы по краям
 *
 * @param expr - Исходная строка для форматирования
 * @returns Отформатированная строка с нормализованными пробелами
 */
export function formatExpression(expr: string): string {
  return expr.replace(/\s+/g, " ").trim()
}

/**
 * Найти позицию ПОСЛЕ закрывающей '}' для сбалансированного блока, начиная с индекса после '{' в последовательности `${`
 *
 * @param s - Строка для поиска
 * @param startAfterBraceIndex - Индекс после открывающей '{' в последовательности `${`
 * @returns Индекс после закрывающей '}' или -1 если блок не сбалансирован
 */
export function matchBalancedBraces(s: string, startAfterBraceIndex: number): number {
  let depth = 1
  for (let i = startAfterBraceIndex; i < s.length; i++) {
    const ch = s[i]
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/**
 * Найти позицию ПОСЛЕ закрывающей '}' для двойных фигурных скобок ${{...}}
 *
 * @param s - Строка для поиска
 * @param startIndex - Индекс начала последовательности `${{`
 * @returns Индекс после закрывающей '}' или -1 если блок не сбалансирован
 */
export function matchDoubleBraces(s: string, startIndex: number): number {
  let depth = 1
  for (let i = startIndex + 2; i < s.length; i++) {
    const ch = s[i]
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/**
 * Полностью ли токен — одиночный ${...} без префикса/суффикса
 *
 * @param token - Токен для проверки
 * @returns true если токен является полностью динамическим выражением
 */
export function isFullyDynamicToken(token: string): boolean {
  const v = token.trim()
  if (!(v.startsWith("${") && v.endsWith("}"))) return false
  const end = matchBalancedBraces(v, 2)
  return end === v.length
}

/**
 * Классифицировать значение: static / dynamic / mixed
 *
 * @param token - Токен для классификации
 * @returns Тип значения: "static", "dynamic" или "mixed"
 */
export function classifyValue(token: string): ValueType {
  if (isFullyDynamicToken(token)) return "dynamic"
  if (token.includes("${")) return "mixed"
  return "static"
}

/**
 * Нормализует исходное значение атрибута для записи в результат.
 * - Форматирует строку целиком, сохраняя структуру ${...}
 *
 * @param token - Исходное значение атрибута
 * @returns Нормализованное значение
 */
export function normalizeValueForOutput(token: string): string {
  return formatExpression(token)
}

/**
 * Проверить, является ли значение атрибута пустым
 *
 * @param value - Значение атрибута для проверки
 * @returns true если значение пустое или null, false если содержит динамические выражения или непустое значение
 */
export function isEmptyAttributeValue(value: string | null): boolean {
  if (value === null) return false
  // Если значение содержит динамические выражения, не считаем его пустым
  if (value.includes("${")) return false
  const normalized = normalizeValueForOutput(value)
  return normalized === "" || normalized.trim() === ""
}

/**
 * Резка по разделителю на верхнем уровне (вне кавычек и ${...})
 *
 * @param raw - Исходная строка для разбиения
 * @param sep - Разделитель для разбиения
 * @returns Массив подстрок, разбитых по разделителю
 */
export function splitTopLevel(raw: string, sep: string): string[] {
  const out: string[] = []
  let buf = ""
  let inSingle = false
  let inDouble = false

  const push = () => {
    const t = buf.trim()
    if (t) out.push(t)
    buf = ""
  }

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]

    // ${...}
    if (!inSingle && !inDouble && ch === "$" && raw[i + 1] === "{") {
      const end = matchBalancedBraces(raw, i + 2)
      if (end === -1) {
        buf += ch
        continue
      } else {
        buf += raw.slice(i, end)
        i = end - 1
        continue
      }
    }

    // кавычки
    if (!inDouble && ch === "'") {
      inSingle = !inSingle
      buf += ch
      continue
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble
      buf += ch
      continue
    }

    if (!inSingle && !inDouble && ch === sep) {
      push()
      continue
    }

    buf += ch
  }
  push()
  return out
}

/**
 * Резка по пробелам верхнего уровня (как для class), учитывая ${} и кавычки
 *
 * @param raw - Исходная строка для разбиения
 * @returns Массив подстрок, разбитых по пробелам
 */
export function splitBySpace(raw: string): string[] {
  const out: string[] = []
  let buf = ""
  let inSingle = false
  let inDouble = false

  const push = () => {
    const t = buf.trim()
    if (t) out.push(t)
    buf = ""
  }

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]

    if (inSingle || inDouble) {
      buf += ch
      if (inSingle && ch === "'") inSingle = false
      else if (inDouble && ch === '"') inDouble = false
      continue
    }

    if (ch === "$" && raw[i + 1] === "{") {
      const end = matchBalancedBraces(raw, i + 2)
      if (end === -1) {
        buf += raw.slice(i)
        break
      } else {
        buf += raw.slice(i, end)
        i = end - 1
        continue
      }
    }

    if (ch === "'") {
      inSingle = true
      buf += ch
      continue
    }
    if (ch === '"') {
      inDouble = true
      buf += ch
      continue
    }

    if (ch && /\s/.test(ch)) {
      push()
      while (i + 1 < raw.length && /\s/.test(raw[i + 1] || "")) i++
      continue
    }

    buf += ch
  }
  push()
  return out
}

/**
 * Разбивает строку по запятым на верхнем уровне
 *
 * @param raw - Исходная строка для разбиения
 * @returns Массив подстрок, разбитых по запятым
 */
export const splitByComma = (raw: string) => splitTopLevel(raw, ",")

/**
 * Разбивает строку по точкам с запятой на верхнем уровне
 *
 * @param raw - Исходная строка для разбиения
 * @returns Массив подстрок, разбитых по точкам с запятой
 */
export const splitBySemicolon = (raw: string) => splitTopLevel(raw, ";")

/**
 * Получить встроенный разделитель для атрибута по имени
 *
 * @param name - Имя атрибута
 * @returns Объект с функцией разделения и разделителем, или null если атрибут не поддерживается
 */
export function getBuiltinResolved(name: string): SplitterResolved | null {
  const lower = name.toLowerCase()
  // aria-hidden является булевым атрибутом, а не списковым
  if (lower.startsWith("aria-") && lower !== "aria-hidden") return { fn: splitBySpace, delim: " " }
  return BUILTIN_LIST_SPLITTERS[lower] || null
}

/**
 * Обрабатывает интерполяцию ${...} и ${{...}} в значениях атрибутов
 *
 * @param inside - Строка содержащая значение атрибута
 * @param cursor - Текущая позиция курсора в строке
 * @returns Объект с извлеченным значением и следующей позицией курсора
 */
function handleInterpolation(inside: string, cursor: number): { value: string; nextIndex: number } {
  if (inside[cursor] === "$" && inside[cursor + 1] === "{") {
    // Проверяем двойные фигурные скобки ${{...}}
    if (inside[cursor + 2] === "{") {
      const end = matchDoubleBraces(inside, cursor)
      if (end === -1) {
        return { value: inside.slice(cursor), nextIndex: inside.length }
      } else {
        return { value: inside.slice(cursor, end), nextIndex: end }
      }
    } else {
      // Обычные фигурные скобки ${...}
      const end = matchBalancedBraces(inside, cursor + 2)
      if (end === -1) {
        return { value: inside.slice(cursor), nextIndex: inside.length }
      } else {
        return { value: inside.slice(cursor, end), nextIndex: end }
      }
    }
  }
  return { value: "", nextIndex: cursor }
}

/**
 * Читает значение атрибута и обновляет позицию курсора
 *
 * @param inside - Строка содержащая HTML-код
 * @param i - Текущая позиция курсора
 * @returns Объект с прочитанным значением и обновленной позицией курсора
 */
function readAttributeValue(
  inside: string,
  i: number
): { value: string | null; nextIndex: number; hasQuotes: boolean } {
  let value: string | null = null
  let hasQuotes = false

  if (inside[i] === "=") {
    i++
    hasQuotes = inside[i] === '"' || inside[i] === "'"
    const r = readAttributeRawValue(inside, i)
    value = r.value
    i = r.nextIndex
  }

  return { value, nextIndex: i, hasQuotes }
}

/**
 * Прочитать "сырое" значение атрибута из строки inside, начиная с позиции cursor
 *
 * @param inside - Строка содержащая HTML-код
 * @param cursor - Начальная позиция для чтения значения
 * @returns Объект с прочитанным значением и следующей позицией курсора
 */
export function readAttributeRawValue(inside: string, cursor: number): { value: string; nextIndex: number } {
  const len = inside.length
  while (cursor < len && /\s/.test(inside[cursor] ?? "")) cursor++
  if (cursor >= len) return { value: "", nextIndex: cursor }

  const first = inside[cursor]
  if (first === '"' || first === "'") {
    const quote = first as '"' | "'"
    cursor++
    let v = ""
    while (cursor < len) {
      const c = inside[cursor]
      if (c === "$" && inside[cursor + 1] === "{") {
        const result = handleInterpolation(inside, cursor)
        v += result.value
        cursor = result.nextIndex
        continue
      }
      if (c === quote) {
        cursor++
        break
      }
      v += c
      cursor++
    }
    return { value: v, nextIndex: cursor }
  }

  let v = ""
  while (cursor < len) {
    const c = inside[cursor]
    if (c === ">" || (c && /\s/.test(c))) break
    if (c === "$" && inside[cursor + 1] === "{") {
      const result = handleInterpolation(inside, cursor)
      v += result.value
      cursor = result.nextIndex
      continue
    }
    v += c
    cursor++
  }
  return { value: v, nextIndex: cursor }
}
/** Преднастройка известных списковых атрибутов */
export const BUILTIN_LIST_SPLITTERS: Record<string, SplitterResolved> = {
  class: { fn: splitBySpace, delim: " " },
  rel: { fn: splitBySpace, delim: " " },
  headers: { fn: splitBySpace, delim: " " },
  itemref: { fn: splitBySpace, delim: " " },
  ping: { fn: splitBySpace, delim: " " },
  sandbox: { fn: splitBySpace, delim: " " },
  sizes: { fn: splitBySpace, delim: " " },
  "accept-charset": { fn: splitBySpace, delim: " " },
  accept: { fn: splitByComma, delim: "," },
  allow: { fn: splitBySemicolon, delim: ";" },
  srcset: {
    fn: (raw) =>
      splitByComma(raw)
        .map((s) => s.trim())
        .filter(Boolean),
    delim: ",",
  },
  coords: {
    fn: (raw) =>
      splitTopLevel(raw, ",")
        .map((s) => s.trim())
        .filter(Boolean),
    delim: ",",
  },
}
export const parseAttributes = (
  inside: string
): {
  event?: RawAttrEvent
  array?: RawAttrArray
  string?: RawAttrString
  boolean?: RawAttrBoolean
  style?: string
  fields?: string
  mass?: string
  energy?: string
} => {
  const len = inside.length
  let i = 0

  const result: {
    event?: RawAttrEvent
    array?: RawAttrArray
    string?: RawAttrString
    boolean?: RawAttrBoolean
    style?: string
    fields?: string
    mass?: string
    energy?: string
  } = {}

  const ensure = {
    event: () => (result.event ??= {}),
    array: () => (result.array ??= {}),
    string: () => (result.string ??= {}),
    boolean: () => (result.boolean ??= {}),
    style: () => (result.style ??= ""),
    fields: () => (result.fields ??= ""),
    mass: () => (result.mass ??= ""),
    energy: () => (result.energy ??= ""),
  }

  while (i < len) {
    while (i < len && /\s/.test(inside[i] || "")) i++
    if (i >= len) break

    // Обработка условных булевых атрибутов ${condition && 'attribute'}
    if (inside[i] === "$" && inside[i + 1] === "{") {
      const braceStart = i
      const braceEnd = matchBalancedBraces(inside, i + 2)
      if (braceEnd === -1) break

      const braceContent = inside.slice(braceStart + 2, braceEnd - 1)

      // Проверяем, является ли это условным выражением вида condition ? "attr1" : "attr2"
      const ternaryMatch = braceContent.match(/^(.+?)\s*\?\s*["']([^"']+)["']\s*:\s*["']([^"']+)["']$/)

      if (ternaryMatch) {
        const [, condition, trueAttr, falseAttr] = ternaryMatch

        if (condition && trueAttr && falseAttr) {
          // Создаем два атрибута: один для true случая, другой для false
          ensure.boolean()[trueAttr] = {
            type: "dynamic",
            value: condition.trim(),
          }

          ensure.boolean()[falseAttr] = {
            type: "dynamic",
            value: `!(${condition.trim()})`,
          }
        }

        i = braceEnd
        continue
      }

      // Обработка обычных условных атрибутов ${condition && 'attribute'}
      const parts = braceContent.split("&&").map((s) => s.trim())

      if (parts.length >= 2) {
        // Последняя часть - это имя атрибута в кавычках
        const attributeName = parts[parts.length - 1]?.replace(/['"]/g, "") // убираем кавычки

        if (attributeName) {
          // Все части кроме последней - это условие
          const condition = parts.slice(0, -1).join(" && ")

          ensure.boolean()[attributeName] = {
            type: "dynamic",
            value: condition || "",
          }
        }
      }

      i = braceEnd
      continue
    }

    const nameStart = i
    while (i < len) {
      const ch = inside[i]
      if (!ch || /\s/.test(ch) || ch === "=") break
      i++
    }
    const name = inside.slice(nameStart, i)
    if (!name) break

    // Игнорируем атрибут "/" для самозакрывающихся тегов
    if (name === "/") {
      continue
    }

    // события - обрабатываем в первую очередь
    if (name.startsWith("on")) {
      while (i < len && /\s/.test(inside[i] || "")) i++

      const { value, nextIndex } = readAttributeValue(inside, i)
      i = nextIndex

      ensure.event()[name] = value ? formatExpression(value.slice(2, -1)) : ""
      continue
    }

    // стили - обрабатываем как объекты
    if (name === "style") {
      while (i < len && /\s/.test(inside[i] || "")) i++

      const { value, nextIndex } = readAttributeValue(inside, i)
      i = nextIndex

      if (value && value.startsWith("${{")) {
        // Извлекаем содержимое объекта стилей и возвращаем как строку
        const styleContent = value.slice(3, -2).trim()
        if (styleContent) {
          result.style = `{ ${formatExpression(styleContent)} }`
        } else {
          result.style = "{}"
        }
      }
      continue
    }

    // fields, mass и energy для meta-компонентов - обрабатываем как объекты
    if (name === "fields" || name === "mass" || name === "energy") {
      while (i < len && /\s/.test(inside[i] || "")) i++

      const { value, nextIndex } = readAttributeValue(inside, i)
      i = nextIndex

      const objectValue = value
        ? value.startsWith("${{")
          ? value.slice(3, -2).trim()
            ? `{ ${formatExpression(value.slice(3, -2))} }`
            : "{}"
          : formatExpression(value.slice(2, -1))
        : "{}"

      // Не добавляем пустые fields, mass и energy атрибуты
      if (objectValue === "{}") {
        continue
      }

      // Для meta-компонентов fields, mass и energy будут обработаны отдельно
      if (name === "fields") {
        result.fields = objectValue
      } else if (name === "mass") {
        result.mass = objectValue
      } else {
        result.energy = objectValue
      }
      continue
    }

    while (i < len && /\s/.test(inside[i] || "")) i++

    const { value, nextIndex, hasQuotes } = readAttributeValue(inside, i)
    i = nextIndex

    // списковые атрибуты (class и встроенные)
    const isClass = name === "class"
    const resolved = isClass ? null : getBuiltinResolved(name)

    if (isClass || resolved) {
      if (isEmptyAttributeValue(value)) {
        continue
      }

      const tokens = isClass ? splitBySpace(value ?? "") : resolved!.fn(value ?? "")

      // Если только одно значение, обрабатываем как строку
      if (tokens.length === 1) {
        ensure.string()[name] = {
          type: classifyValue(value ?? ""),
          value: normalizeValueForOutput(value ?? ""),
        }
        continue
      }
      ensure.array()[name] = tokens.map((tok) => ({
        type: classifyValue(tok),
        value: normalizeValueForOutput(tok),
      }))
      continue
    }

    if (
      !hasQuotes &&
      !name.startsWith("on") &&
      (value === null ||
        value === "true" ||
        value === "false" ||
        (value && isFullyDynamicToken(value) && !value.includes("?") && !value.includes(":")) ||
        (value &&
          isFullyDynamicToken(value) &&
          value.includes("?") &&
          value.includes(":") &&
          (value.includes("true") || value.includes("false"))))
    ) {
      if (value && isFullyDynamicToken(value)) {
        ensure.boolean()[name] = {
          type: "dynamic",
          value: normalizeValueForOutput(value).replace(/^\${/, "").replace(/}$/, ""),
        }
      } else {
        ensure.boolean()[name] = { type: "static", value: value === "true" || value === null }
      }
      continue
    }

    // string
    if (!isEmptyAttributeValue(value)) {
      ensure.string()[name] = {
        type: classifyValue(value ?? ""),
        value: normalizeValueForOutput(value ?? ""),
      }
    }
  }

  return result
}
export const formatAttributeText = (text: string): string =>
  text
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
