import type { ValueDynamic, ValueVariable } from "@metafor/template/types/parser"
import type { PartsAttr, NodeType } from "@metafor/template/types/node/index"
import type { Attributes } from "@metafor/template/types/attribute/index"
import type { PartAttrMap, TokenMapClose, TokenMapOpen } from "@metafor/template/types/node/map"
import type { PartAttrCondition, TokenCondClose, TokenCondElse, TokenCondOpen } from "@metafor/template/types/node/condition"
import type { PartAttrMeta } from "@metafor/template/types/node/meta"
import type { PartAttrElement } from "@metafor/template/types/node/element"
import type { ParseContext, ParseResult } from "@metafor/template/types/parser"
import type { TokenText } from "@metafor/template/types/node/text"
import type { TokenLogicalOpen } from "@metafor/template/types/node/logical"
import { formatAttributeText, parseAttributes } from "./attribute"
import { findAllConditions, findCondElse, findCondClose } from "./node/condition.ts"
import { findLogicalOperators } from "./node/logical.ts"
import { findText } from "./node/text.ts"
import { findMapOpen, findMapClose } from "./node/map.ts"
import { processArrayAttributes } from "./attribute/array.ts"
import { processBooleanAttributes } from "./attribute/boolean.ts"
import { processEventAttributes } from "./attribute/event.ts"
import { processStringAttributes } from "./attribute/string.ts"
import { processStyleAttributes } from "./attribute/style.ts"
import { createNode } from "./node"
import { VOID_TAGS } from "./node/element.ts"

// ============================================================================
// КОНСТАНТЫ И УТИЛИТЫ
// ============================================================================
// Быстрый lookahead на теги (включая meta-${...})
const TAG_LOOKAHEAD = /(?=<\/?[A-Za-z][A-Za-z0-9:-]*[^>]*>|<\/?meta-[^>]*>|<\/?meta-\$\{[^}]*\}[^>]*>)/gi

const isValidTagName = (name: string) =>
  (/^[A-Za-z][A-Za-z0-9:-]*$/.test(name) && !name.includes("*")) || name.startsWith("meta-")

const shouldIgnoreAt = (input: string, i: number) => input[i + 1] === "!" || input[i + 1] === "?"

/**
 * Извлекает HTML элементы из строки и строит иерархию узлов.
 *
 * Функция парсит HTML-строку, распознаёт:
 * - Открывающие и закрывающие теги
 * - Самозакрывающиеся теги
 * - Динамические атрибуты с `${...}`
 * - Template literals внутри атрибутов
 *
 * @param input - HTML-строка для парсинга (содержимое `html`...``)
 * @returns Иерархия узлов с атрибутами и текстовым содержимым
 *
 * @example
 * ```typescript
 * const input = `<div class="container"><h1>${fields.title}</h1></div>`
 * const hierarchy = extractHtmlElements(input)
 * // hierarchy: [{
 * //   tag: "div",
 * //   type: "el",
 * //   string: { class: "container" },
 * //   child: [{
 * //     tag: "h1",
 * //     type: "el",
 * //     child: [{ type: "text", text: "${fields.title}" }]
 * //   }]
 * // }]
 * ```
 */
export const extractHtmlElements = (input: string): PartsAttr => {
  const store = new Hierarchy()

  let lastIndex = 0

  TAG_LOOKAHEAD.lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = TAG_LOOKAHEAD.exec(input)) !== null) {
    const localIndex = m.index
    if (shouldIgnoreAt(input, localIndex)) {
      TAG_LOOKAHEAD.lastIndex = localIndex + 1
      continue
    }
    if (input.trim()) parseTextAndOperators(input.slice(lastIndex, localIndex), store)
    const tagStart = localIndex
    let tagEnd = -1
    let i = localIndex + 1

    while (i < input.length) {
      const ch = input[i]

      if (ch === ">") {
        tagEnd = i + 1
        break
      }

      if (ch === `"` || ch === `'`) {
        const quote = ch
        i++
        while (i < input.length && input[i] !== quote) {
          if (input[i] === "\\") {
            i += 2
            continue
          }
          if (input[i] === "$" && input[i + 1] === "{") {
            i += 2
            let b = 1
            while (i < input.length && b > 0) {
              if (input[i] === "{") b++
              else if (input[i] === "}") b--
              i++
            }
            continue
          }
          i++
        }
        if (i < input.length) i++
        continue
      }

      if (ch === "$" && input[i + 1] === "{") {
        i += 2
        let b = 1
        while (i < input.length && b > 0) {
          if (input[i] === "{") b++
          else if (input[i] === "}") b--
          i++
        }
        continue
      }

      i++
    }

    if (tagEnd === -1) {
      TAG_LOOKAHEAD.lastIndex = localIndex + 1
      continue
    }

    const full = input.slice(tagStart, tagEnd)

    let name = ""
    let valid = false
    let type: "el" | "meta" = "el"

    const tagNameMatch = full.match(/^<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s|>|\/)/i)

    if (tagNameMatch) {
      name = (tagNameMatch[1] || "").toLowerCase()
      valid = isValidTagName(tagNameMatch[1] || "")
      if (name.startsWith("meta-")) {
        type = "meta"
      }
    }

    if (!valid) {
      const metaMatch = full.match(/^<\/?(meta-\$\{[^}]+\})/i)
      if (metaMatch) {
        name = metaMatch[1] || ""
        valid = true
        type = "meta"
      }
    }

    if (!valid) {
      TAG_LOOKAHEAD.lastIndex = localIndex + 1
      continue
    }

    if (full.startsWith("</")) {
      store.close(name)
    } else if (full.endsWith("/>")) {
      const text = formatAttributeText(full.replace(`<${name}`, "").replace(/\/>$/, ""))
      store.self({ tag: name, type, ...(text ? parseAttributes(text) : {}) })
    } else if (VOID_TAGS.has(name) && !name.startsWith("meta-")) {
      const text = formatAttributeText(full.replace(`<${name}`, "").replace(/\/>$/, ""))
      store.self({ tag: name, type, ...(text ? parseAttributes(text) : {}) })
    } else {
      const text = formatAttributeText(full.replace(`<${name}`, "").replace(/>$/, ""))
      store.open({ tag: name, type, ...(text ? parseAttributes(text) : {}) })
    }

    TAG_LOOKAHEAD.lastIndex = tagEnd
    lastIndex = tagEnd
  }

  const tail = input.slice(lastIndex)
  if (tail.trim()) parseTextAndOperators(tail, store)
  return store.child
}

/**
 * Обрабатывает текстовые узлы и операторы (условные, логические, map).
 *
 * Функция анализирует текст между HTML тегами и добавляет в иерархию:
 * - Текстовые узлы (`text`)
 * - Условные операторы (`if`/`else`)
 * - Логические операторы (`&&`)
 * - Map операции (`.map()`)
 *
 * @param input - Текст для обработки (между тегами или внутри атрибутов)
 * @param store - Иерархия узлов для добавления результатов
 *
 * @example
 * ```typescript
 * const input = "Привет, ${fields.name}!"
 * parseTextAndOperators(input, hierarchy)
 * // Добавляет в hierarchy: { type: "text", text: "Привет, ${fields.name}!" }
 * ```
 *
 * @example
 * ```typescript
 * const input = "${fields.isLoggedIn ? html`<span>Добро пожаловать!</span>` : html`<a href="/login">Войти</a>`}"
 * parseTextAndOperators(input, hierarchy)
 * // Добавляет в hierarchy: { type: "cond", text: "...", child: [...] }
 * ```
 */
export const parseTextAndOperators = (input: string, store: Hierarchy) => {
  // текст между предыдущим и текущим тегом
  const map = new Map<
    number,
    TokenText | TokenCondOpen | TokenCondElse | TokenCondClose | TokenMapOpen | TokenMapClose | TokenLogicalOpen
  >()

  const text = findText(input)
  text && map.set(text.start, { text: text.text, kind: "text" })

  const isNotInText = (index: number) => (text ? index < text.start || index > text.end : true)
  // --------- conditions ---------
  const conds = findAllConditions(input)
  for (const cond of conds) isNotInText(cond[0]) && map.set(...cond)

  const tokenCondElse = findCondElse(input)
  tokenCondElse && isNotInText(tokenCondElse[0]) && map.set(...tokenCondElse)

  const tokenCondClose = findCondClose(input)
  tokenCondClose && isNotInText(tokenCondClose[0]) && map.set(...tokenCondClose)

  // --------- logical operators ---------
  const logicals = findLogicalOperators(input)
  for (const logical of logicals) isNotInText(logical[0]) && map.set(...logical)

  // ------------- map -------------
  const tokenMapOpen = findMapOpen(input)
  tokenMapOpen && isNotInText(tokenMapOpen[0]) && map.set(...tokenMapOpen)

  const tokenMapClose = findMapClose(input)
  tokenMapClose && isNotInText(tokenMapClose[0]) && map.set(...tokenMapClose)

  // Сортируем по позиции токены
  const tokens = Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([, token]) => token)

  for (const token of tokens) {
    switch (token.kind) {
      case "text":
        store.text(token.text)
        break
      case "cond-open":
        store.if(token.expr)
        break
      case "cond-else":
        store.else()
        break
      case "cond-close":
        break
      case "log-open":
        store.logical(token.expr)
        break
      case "map-open":
        store.map(token.sig)
        break
      case "map-close":
        store.close("map")
        break
    }
  }
}

// Обрезаем всё после первого открытия следующего html-шаблона
export const cutBeforeNextHtml = (s: string): string => {
  const idx = s.indexOf("html`")
  return idx >= 0 ? s.slice(0, idx) : s
}

// ============================================================================
// КЛАССЫ ДЛЯ УПРАВЛЕНИЯ ИЕРАРХИЕЙ
// ============================================================================
/**
 * Курсор для навигации по иерархии узлов парсера.
 *
 * Курсор отслеживает текущую позицию в дереве узлов через:
 * - `path` — массив индексов для доступа к текущему узлу
 * - `parts` — имена узлов в пути (например, `["div", "h1", "span"]`)
 *
 * **Важно:** Курсор не устанавливается на самозакрывающиеся теги и void элементы.
 */
class Cursor {
  /** Структура элементов, по которым двигается курсор */
  child: PartsAttr = []

  constructor(child: PartsAttr) {
    this.child = child
  }

  /** Путь к текущему элементу (массив индексов) */
  path: number[] = []
  /** Имена элементов в пути (например, `["div", "h1"]`) */
  parts: string[] = []

  /**
   * Возвращает текущий элемент иерархии.
   *
   * Вычисляет узел по `path`, последовательно проходя по дочерним элементам.
   */
  get element(): PartsAttr {
    let el: PartsAttr = this as unknown as PartsAttr
    for (const path of this.path) {
      const { child } = el as unknown as PartAttrElement | PartAttrMeta | PartAttrMap | PartAttrCondition
      el = child![path] as unknown as PartsAttr
    }
    return el
  }

  /** Возвращает имя текущего элемента (последний в `parts`) */
  get part() {
    return this.parts[this.parts.length - 1]
  }

  /**
   * Удаляет последний элемент из пути и возвращает его имя.
   *
   * @returns Имя последнего элемента или `undefined` если путь пуст
   */
  back() {
    this.path.pop()
    return this.parts.pop()
  }

  /**
   * Добавляет элемент в путь.
   *
   * @param name - Имя элемента для добавления в путь
   *
   * **Side effects:**
   * - Добавляет `name` в `parts`
   * - Вычисляет индекс текущего элемента через `this.element.child!.length - 1`
   * - Добавляет индекс в `path`
   */
  push(name: string) {
    this.parts.push(name)
    this.path.push((this.element as unknown as PartAttrElement | PartAttrMeta).child!.length - 1)
  }
}

class Hierarchy {
  child: PartsAttr = []
  cursor: Cursor
  constructor() {
    this.child = []
    this.cursor = new Cursor(this.child)
  }
  /**
   * Добавляет текстовый узел в `child` массив.
   *
   * @param value - Текст узла (например, `"Привет, ${fields.name}!"`)
   *
   * **Side effects:** Не изменяет курсор.
   */
  text(value: string) {
    const curEl = this.cursor.element as unknown as PartAttrElement | PartAttrMeta
    !Object.hasOwn(curEl, "child") && (curEl.child = [])
    curEl.child!.push({ type: "text", text: value })
    return
  }

  /**
   * Добавляет условный оператор `if` в `child` массив.
   *
   * @param value - Выражение условия (например, `"fields.isLoggedIn ? html`...` : html`...`"`)
   *
   * **Side effects:**
   * - Создаёт новый узел `{ type: "cond", text: value, child: [] }`
   * - Перемещает курсор на новый узел (добавляет в `path`)
   */
  if(value: string) {
    const curEl = this.cursor.element as unknown as PartAttrElement | PartAttrMeta
    !Object.hasOwn(curEl, "child") && (curEl.child = [])
    curEl.child!.push({ type: "cond", text: value, child: [] })
    this.cursor.push("if")
    return
  }
  /**
   * Переключает курсор на ветку `else` условного оператора.
   *
   * **Side effects:**
   * - Заменяет `"if"` на `"else"` в `cursor.parts`
   * - Не изменяет `cursor.path` (остаётся на том же узле)
   */
  else() {
    const curEl = this.cursor.element as unknown as PartAttrElement | PartAttrMeta
    !Object.hasOwn(curEl, "child") && (curEl.child = [])
    if (this.cursor.part === "if") {
      const condition = curEl as unknown as PartAttrCondition
      condition.elseIndex = condition.child.length
      this.cursor.parts.pop()
      this.cursor.parts.push("else")
    }
    return
  }

  /**
   * Добавляет логический оператор `&&` в `child` массив.
   *
   * @param value - Выражение условия (например, `"fields.isAdmin && html`...`"`)
   *
   * **Side effects:**
   * - Создаёт новый узел `{ type: "log", text: value, child: [] }`
   * - Перемещает курсор на новый узел
   */
  logical(value: string) {
    const curEl = this.cursor.element as unknown as PartAttrElement | PartAttrMeta
    !Object.hasOwn(curEl, "child") && (curEl.child = [])
    curEl.child!.push({ type: "log", text: value, child: [] })
    this.cursor.push("log")
    return
  }

  /**
   * Добавляет map операцию в `child` массив.
   *
   * @param value - Выражение map (например, `"value.itemIds.map(item => html`...`)"`)
   *
   * **Side effects:**
   * - Создаёт новый узел `{ type: "map", text: value, child: [] }`
   * - Перемещает курсор на новый узел
   */
  map(value: string) {
    const curEl = this.cursor.element as unknown as PartAttrElement | PartAttrMeta
    !Object.hasOwn(curEl, "child") && (curEl.child = [])
    curEl.child!.push({ type: "map", text: value, child: [] })
    this.cursor.push("map")
    return
  }

  /**
   * Добавляет HTML элемент в `child` массив без перемещения курсора.
   *
   * @param part - Узел элемента
   *
   * **Side effects:**
   * - Добавляет `part` в `child`
   * - Если курсор находится в `"log"`, выходит из логического оператора
   */
  self(part: PartAttrElement | PartAttrMeta) {
    const curEl = this.cursor.element as unknown as PartAttrElement | PartAttrMeta
    !Object.hasOwn(curEl, "child") && (curEl.child = [])
    curEl.child!.push(part)
    /** Выходим из логического оператора если были в блоке log */
    if (this.cursor.part === "log") {
      this.cursor.back() // удаляем log и выходим из логического оператора
    }
    return
  }

  /**
   * Добавляет HTML элемент в `child` массив с перемещением курсора.
   *
   * @param part - Узел элемента
   *
   * **Side effects:**
   * - Добавляет `part` в `child`
   * - Перемещает курсор на новый элемент (добавляет тег в `parts`, индекс в `path`)
   * - Если курсор находится в `"log"`, выходит из логического оператора
   */
  open(part: PartAttrElement | PartAttrMeta) {
    const curEl = this.cursor.element as unknown as PartAttrElement | PartAttrMeta
    !Object.hasOwn(curEl, "child") && (curEl.child = [])
    curEl.child!.push(part)
    this.cursor.push(part.tag)
    /** Выходим из логического оператора если были в блоке log */
    if (this.cursor.part === "log") {
      this.cursor.back() // удаляем log и выходим из логического оператора
    }
    return
  }
  #recursiveCloseMultipleElse() {
    if (this.cursor.part === "else") {
      this.cursor.back()
      this.#recursiveCloseMultipleElse()
    }
  }
  close(tagName: string) {
    /** html`<div>${context.flag ? html`<br />` : html`<img src="x" />`}⬇️</div>`
     *                                              самозакрывающийся тег
     */
    if (this.cursor.part === "else") {
      // выходим из всех else
      this.#recursiveCloseMultipleElse()
      // закрываем тег
      const deleted = this.cursor.back()
      if (deleted !== tagName) {
        throw new Error(`Expected ${tagName} but got ${deleted}`)
      }
      return
    } else if (this.cursor.part === "log") {
      // выходим из логического оператора
      this.cursor.back()
      // закрываем тег
      const deleted = this.cursor.back()
      if (deleted !== tagName) {
        throw new Error(`Expected ${tagName} but got ${deleted}`)
      }
      return
    } else {
      const deleted = this.cursor.back()
      if (deleted !== tagName) {
        throw new Error(`Expected ${tagName} but got ${deleted}`)
      }
      /** Выходим из else если были в блоке else */
      if (this.cursor.part === "else") {
        this.cursor.back() // удаляем else и выходим из элемента cond
      }
      /** Выходим из логического оператора если были в блоке log */
      if (this.cursor.part === "log") {
        this.cursor.back() // удаляем log и выходим из логического оператора
      }
      return
    }
  }
}
// ============================================================================
// REGEX PATTERNS
// ============================================================================
// Паттерны для парсинга переменных

export const VARIABLE_WITH_DOTS_PATTERN = /([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)/g
export const VALID_VARIABLE_PATTERN = /^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/
// Паттерны для парсинга событий

export const UPDATE_OBJECT_PATTERN = /update\(\s*\{([^}]+)\}\s*\)/
export const OBJECT_KEY_PATTERN = /([a-zA-Z_$][\w$]*)\s*:/g
export const CONDITIONAL_OPERATORS_PATTERN = /\?.*:/
// Паттерны для форматирования

export const WHITESPACE_PATTERN = /\s+/g
export const TEMPLATE_WRAPPER_PATTERN = /^\$\{|\}$/g
/**
 * Единый префикс для индексационных плейсхолдеров внутри expr.
 *
 * Формирует вид подстановок в унифицированных выражениях:
 *   \`${${ARGUMENTS_PREFIX}[0]}\`, \`${${ARGUMENTS_PREFIX}[1]}\`, ...
 *
 * Изменяя значение здесь, вы централизованно влияете на весь рендер expr
 * (parseEventExpression, createUnifiedExpression, parseTemplateLiteral, parseText, условия).
 * Допустимые варианты: "arguments" (классический JS) или пустая строка для специфического рантайма.
 */

export const ARGUMENTS_PREFIX = "_"
// ============================================================================
// PATH RESOLUTION UTILITIES
// ============================================================================
/**
 * Ищет переменную в стеке map контекстов и возвращает относительный путь.
 *
 * Функция анализирует стек map контекстов от самого глубокого уровня к внешнему,
 * определяя правильные относительные пути для доступа к данным.
 *
 * @param variable - Имя переменной (например, `"item"`, `"dept.name"`, `"title"`)
 * @param context - Контекст парсера со стеком map контекстов
 * @returns Относительный путь или `null` если переменная не найдена
 *
 * @example
 * ```typescript
 * // В контексте: departments.map((dept) => teams.map((team) => members.map((member) => ...)))
 * findVariableInMapStack("dept.name", context) // "../../[item]/name"
 * findVariableInMapStack("team.id", context)   // "../[item]/id"
 * findVariableInMapStack("member", context)    // "[item]"
 * ```
 */
const findVariableInMapStack = (variable: string, context: ParseContext): string | null => {
  if (!context.mapContextStack?.length) return null

  const variableParts = variable.split(".")
  const variableName = variableParts[0] || ""

  // Ищем переменную от самого глубокого уровня к внешнему
  for (let i = context.mapContextStack.length - 1; i >= 0; i--) {
    const mapContext = context.mapContextStack[i]
    if (!mapContext?.params.includes(variableName)) continue

    const levelsUp = context.mapContextStack.length - 1 - i
    const prefix = "../".repeat(levelsUp)
    const paramIndex = mapContext.params.indexOf(variableName)

    // Используем информацию о деструктуризации из контекста
    // В режиме деструктуризации все параметры относятся к полям [item]
    if (mapContext.isDestructured) {
      const hasProperty = variableParts.length > 1
      // variableParts[0] — имя деструктурированного поля
      return hasProperty ? `${prefix}[item]/${variableParts.join("/")}` : `${prefix}[item]/${variableParts[0]}`
    }

    // Обычный режим: первый параметр — элемент, остальные — индекс
    return paramIndex === 0 ? buildItemPath(prefix, variableParts, false) : `${prefix}[index]`
  }

  return null
}
const buildItemPath = (prefix: string, variableParts: string[], isDestructured: boolean): string => {
  const hasProperty = variableParts.length > 1

  if (isDestructured) {
    return hasProperty ? `${prefix}[item]/${variableParts.slice(1).join("/")}` : `${prefix}[item]/${variableParts[0]}`
  }

  return hasProperty ? `${prefix}[item]/${variableParts.slice(1).join("/")}` : `${prefix}[item]`
}
/**
 * Обрабатывает семантические атрибуты (mass/fields) с поддержкой переменных.
 *
 * Функция извлекает переменные из строки объекта и создаёт унифицированное выражение:
 * - Извлекает все переменные из строки `{ key: value, key2: value2 }`
 * - Разрешает пути к данным для каждой переменной
 * - Создаёт выражение с индексами `${_[0]}`, `${_[1]}`, ...
 *
 * @param str - Строка объекта в формате `"{ key: value, key2: value2 }"`
 * @param ctx - Контекст парсера (по умолчанию `{ pathStack: [], level: 0 }`)
 * @returns Результат с путями к данным и унифицированным выражением, или `null` если нет переменных
 *
 * @example
 * ```typescript
 * // Простой объект с одной переменной
 * processSemanticAttributes("{ name: fields.userName }", context)
 * // { data: "/fields/userName", expr: "{ name: ${_[0]} }" }
 *
 * // Объект с несколькими переменными
 * processSemanticAttributes("{ user: value.userId, cache: mass.cache }", context)
 * // { data: ["/value/userId", "/mass/cache"], expr: "{ user: ${_[0]}, cache: ${_[1]} }" }
 * ```
 */
export const processSemanticAttributes = (
  str: string,
  ctx: ParseContext = { pathStack: [], level: 0 }
): ValueVariable | ValueDynamic | null => {
  const { protectedExpr, stringLiterals } = protectStringLiterals(str)

  // Извлекаем все переменные из строки объекта
  const variableMatches = protectedExpr.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)/g) || []

  if (variableMatches.length === 0) {
    return null
  }

  // Убираем дубликаты переменных
  const uniqueVariables = [...new Set(variableMatches)]

  // Разрешаем пути к данным для каждой уникальной переменной
  const paths = uniqueVariables.map((variable: string) => resolveDataPath(variable, ctx) || variable)

  // Создаем унифицированное выражение, заменяя переменные на индексы
  let expr = protectedExpr

  uniqueVariables.forEach((variable: string, index: number) => {
    // Заменяем переменные на индексы во всем выражении
    const variableRegex = new RegExp(`(?<!\\w)${variable.replace(/\./g, "\\.")}(?!\\w)`, "g")
    expr = expr.replace(variableRegex, `${ARGUMENTS_PREFIX}[${index}]`)
  })

  // Применяем форматирование к выражению
  expr = expr.replace(WHITESPACE_PATTERN, " ").trim()

  // Восстанавливаем строковые литералы после форматирования
  expr = restoreStringLiterals(expr, stringLiterals)

  // Возвращаем результат в новом формате
  return {
    data: paths.length === 1 ? paths[0] || "" : paths,
    expr: expr,
  }
}
/**
 * Разрешает путь к данным для переменной в текущем контексте.
 *
 * Функция определяет формат пути в зависимости от контекста:
 * - **Вне map**: `/fields/...` или `/mass/...`
 * - **В map**: `[item]` для элемента, `[index]` для индекса
 * - **Во вложенном map**: `../[item]` для доступа к родительскому контексту
 *
 * @param variable - Имя переменной (например, `"fields.name"`, `"item"`, `"title"`)
 * @param context - Контекст парсера с текущим map контекстом и pathStack
 * @returns Путь к данным в формате парсера
 *
 * @example
 * ```typescript
 * // Вне map
 * resolveDataPath("fields.name", context)     // "/fields/name"
 * resolveDataPath("mass.profile", context)    // "/mass/profile" (MassHandle)
 *
 * // В map с простым параметром: map((item) => ...)
 * resolveDataPath("item.name", context)       // "[item]/name"
 * resolveDataPath("item", context)            // "[item]"
 *
 * // В map с деструктуризацией: map(({ title, id }) => ...)
 * resolveDataPath("title", context)           // "[item]/title"
 * resolveDataPath("id", context)              // "[item]/id"
 *
 * // Во вложенном map
 * resolveDataPath("dept.name", context)       // "../[item]/name"
 * ```
 */
export const resolveDataPath = (variable: string, context: ParseContext): string => {
  // Сначала пытаемся найти переменную в стеке map контекстов
  const mapStackPath = findVariableInMapStack(variable, context)
  if (mapStackPath !== null) {
    return mapStackPath
  }

  // Если не найдена в стеке map, используем старую логику для обратной совместимости
  if (context.mapParams && context.mapParams.length > 0) {
    // В контексте map - различаем простые параметры и деструктурированные свойства
    const variableParts = variable.split(".")
    const mapParamVariable = variableParts[0] || ""

    // Проверяем, является ли первая часть переменной параметром map
    if (context.mapParams.includes(mapParamVariable)) {
      const paramIndex = context.mapParams.indexOf(mapParamVariable)

      if (paramIndex === 0) {
        // Первый параметр - элемент массива
        if (variableParts.length > 1) {
          // Свойство первого параметра (например, dept.id -> [item]/id)
          const propertyPath = variableParts.slice(1).join("/")
          return `[item]/${propertyPath}`
        } else {
          // Сам первый параметр (например, dept -> [item])
          return "[item]"
        }
      } else {
        // Второй и последующие параметры - индекс
        return "[index]"
      }
    } else if (variableParts[0] && context.mapParams.includes(variableParts[0])) {
      // Переменная начинается с имени параметра, но не содержит точку (например, dept в map((dept) => ...))
      const paramIndex = context.mapParams.indexOf(variableParts[0])
      if (paramIndex === 0) {
        // Первый параметр - элемент массива
        if (variableParts.length > 1) {
          // Свойство первого параметра (например, dept.id)
          const propertyPath = variableParts.slice(1).join("/")
          return `[item]/${propertyPath}`
        } else {
          // Сам первый параметр (например, dept)
          return "[item]"
        }
      } else {
        // Второй и последующие параметры - индекс
        return "[index]"
      }
    } else if (context.mapParams.includes(variable)) {
      // Переменная точно совпадает с параметром текущего map
      const paramIndex = context.mapParams.indexOf(variable)

      if (paramIndex === 0) {
        // Первый параметр - элемент массива
        // Для деструктуризации всегда возвращаем [item]/property
        return `[item]/${variable}`
      } else {
        // Второй и последующие параметры - индекс
        return "[index]"
      }
    } else {
      // Переменная не найдена в текущих mapParams
      // Если переменная начинается с mass., то это абсолютный путь
      if (variable.startsWith("mass.")) {
        return `/${variable.replace(/\./g, "/")}`
      }

      // Проверяем, есть ли вложенный map
      if (context.currentPath && context.currentPath.includes("[item]")) {
        // Вложенный map - переменная может быть из внешнего контекста
        // Проверяем, есть ли в pathStack другие map контексты
        if (context.pathStack && context.pathStack.length > 1) {
          // Есть внешний map - вычисляем количество уровней подъема
          // Считаем количество map контекстов в pathStack (каждый map добавляет уровень)
          const mapLevels = context.pathStack.filter((path) => path.includes("[item]")).length
          const levelsUp = mapLevels - 1 // текущий уровень не считаем

          // Создаем префикс с нужным количеством "../"
          const prefix = "../".repeat(levelsUp)

          // Извлекаем только свойство из переменной (например, из g.id берем только id)
          const propertyPath = variableParts.length > 1 ? variableParts.slice(1).join("/") : variable
          return `${prefix}[item]/${propertyPath}`
        } else {
          // Нет внешнего map - обычный путь
          return `[item]/${variable.replace(/\./g, "/")}`
        }
      } else {
        // Обычный путь
        return `[item]/${variable.replace(/\./g, "/")}`
      }
    }
  } else if (context.currentPath && !context.currentPath.includes("[item]")) {
    // В контексте, но не map - добавляем к текущему пути
    return `${context.currentPath}/${variable.replace(/\./g, "/")}`
  } else {
    // Абсолютный путь
    return `/${variable.replace(/\./g, "/")}`
  }
}
/**
 * Создаёт унифицированное выражение с заменой переменных на индексы.
 *
 * Функция выполняет:
 * 1. Заменяет переменные в выражении на индексы `${_[0]}`, `${_[1]}`, ...
 * 2. Форматирует выражение, удаляя избыточные пробелы
 * 3. Сохраняет строковые литералы без изменений
 *
 * @param value - Исходное выражение с переменными (например, `"${user.name} is ${user.age} years"`)
 * @param variables - Массив переменных для замены (например, `["user.name", "user.age"]`)
 * @returns Унифицированное выражение с индексами
 *
 * @example
 * ```typescript
 * createUnifiedExpression("${user.name} is ${user.age} years old", ["user.name", "user.age"])
 * // "${_[0]} is ${_[1]} years old"
 *
 * createUnifiedExpression("${active ? 'Enabled' : 'Disabled'}", ["active"])
 * // "${_[0]} ? 'Enabled' : 'Disabled'"
 * ```
 */
export const createUnifiedExpression = (value: string, variables: string[]): string => {
  // Сначала защищаем строковые литералы от замены
  const { protectedExpr, stringLiterals } = protectStringLiterals(value)
  let expr = protectedExpr

  // Заменяем переменные в ${} на индексы
  variables.forEach((variable, index) => {
    // Сначала заменяем точные совпадения ${variable}
    const exactRegex = new RegExp(`\\$\\{${variable.replace(/\./g, "\\.")}\\}`, "g")
    expr = expr.replace(exactRegex, `\${${ARGUMENTS_PREFIX}[${index}]}`)

    // Затем заменяем переменные внутри ${} выражений (для условных выражений)
    // Но только если это не точное совпадение
    const insideRegex = new RegExp(`\\$\\{([^}]*?)\\b${variable.replace(/\./g, "\\.")}\\b([^}]*?)\\}`, "g")
    expr = expr.replace(insideRegex, (match, before, after) => {
      // Проверяем, что это не точное совпадение
      if (before.trim() === "" && after.trim() === "") {
        return match // Не заменяем точные совпадения
      }
      return `\${${before}${ARGUMENTS_PREFIX}[${index}]${after}}`
    })
  })

  // Удаляем лишние пробелы и переносы строк в выражениях
  expr = expr.replace(WHITESPACE_PATTERN, " ").trim()

  // Восстанавливаем строковые литералы
  expr = restoreStringLiterals(expr, stringLiterals)

  return expr
}
/**
 * Парсит путь к данным из map-выражения и создает новый контекст.
 *
 * Эта функция анализирует map-выражения и определяет:
 * - Путь к массиву данных
 * - Параметры map-функции
 * - Тип пути (абсолютный или относительный)
 * - Новый контекст для вложенных операций
 *
 * Поддерживает различные сценарии:
 * - Абсолютные пути к данным (например, value.itemIds.map)
 * - Относительные пути в контексте map (например, nested.map)
 * - Вложенные map в контексте существующих map
 *
 * @param mapText - Текст map-выражения для парсинга
 * @param context - Текущий контекст парсера (опционально)
 * @returns Результат парсинга с путем, новым контекстом и метаданными
 *
 * @example
 * parseMap("value.itemIds.map((itemId) => ...)")
 * // Возвращает: { path: "/value/itemIds", context: {...}, metadata: { params: ["itemId"] } }
 *
 * parseMap("nested.map((item) => ...)", context)
 * // Возвращает: { path: "[item]/nested", context: {...}, metadata: { params: ["item"] } }
 */

/**
 * Общая функция для обработки атрибутов с template literals.
 * Устраняет дублирование кода между различными типами атрибутов.
 */
export const processTemplateLiteralAttribute = (
  value: string,
  context: ParseContext
): ValueDynamic | ValueVariable | null => {
  const templateResult = parseTemplateLiteral(value, context)
  if (templateResult) {
    if (templateResult.expr === `\${${ARGUMENTS_PREFIX}[0]}` && !Array.isArray(templateResult.data))
      return { data: templateResult.data }
    return { data: templateResult.data, expr: templateResult.expr }
  }
  return null
}

/**
 * Общая функция для обработки базовых атрибутов элемента.
 * Устраняет дублирование кода между createNodeDataElement и createNodeDataMeta.
 */
export const processBasicAttributes = (node: PartAttrElement | PartAttrMeta, context: ParseContext): Attributes => {
  const result: Attributes = {}

  // Обрабатываем базовые атрибуты
  if (node.string) {
    result.string = processStringAttributes(node.string, context)
  }

  if (node.event) {
    const eventAttrs = processEventAttributes(node.event, context)
    if (Object.keys(eventAttrs).length > 0) {
      result.event = eventAttrs
    }
  }

  if (node.array) {
    result.array = processArrayAttributes(node.array, context)
  }

  if (node.boolean) {
    result.boolean = processBooleanAttributes(node.boolean, context)
  }

  if (node.style) {
    const styleResult = processStyleAttributes(node.style, context)
    if (styleResult) {
      result.style = styleResult
    }
  }

  return result
}

/**
 * Парсит путь к данным из условного выражения.
 *
 * Функция извлекает переменные из тернарного оператора и создаёт выражение:
 * - Удаляет `html`...`` блоки из условия
 * - Извлекает переменные (например, `value.isLoggedIn`, `value.role`)
 * - Создаёт выражение с индексами для сложного условия
 *
 * @param condText - Текст условия (например, `"fields.isLoggedIn ? html`...` : html`...`"`)
 * @param context - Контекст парсера (по умолчанию `{ pathStack: [], level: 0 }`)
 * @returns Результат парсинга с путями к данным и выражением
 *
 * @example
 * ```typescript
 * // Простое условие
 * parseCondition("fields.isLoggedIn ? html`...` : html`...`", context)
 * // { path: "/fields/isLoggedIn", metadata: { expression: "_[0]" } }
 *
 * // Сложное условие
 * parseCondition("value.role === 'admin' && value.canWrite ? html`...` : html`...`", context)
 * // { path: ["/value/role", "/value/canWrite"], metadata: { expression: "_[0] === 'admin' && _[1]" } }
 * ```
 */
export const parseCondition = (condText: string, context: ParseContext = { pathStack: [], level: 0 }): ParseResult => {
  const cleanCondText = cleanConditionText(condText)

  // Защищаем строковые литералы от обработки
  const { protectedExpr } = protectStringLiterals(cleanCondText)

  const allMatches = protectedExpr.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || []
  const pathMatches = allMatches.filter((match) => !match.startsWith("__STRING_"))

  if (pathMatches.length === 0) return { path: "" }

  const expression = extractConditionExpression(cleanCondText, pathMatches)
  const paths =
    pathMatches.length === 1
      ? resolveDataPath(pathMatches[0] || "", context)
      : pathMatches.map((variable) => resolveDataPath(variable, context))

  return { path: paths, metadata: { expression } }
}
const cleanConditionText = (condText: string): string => {
  let cleanText = condText.replace(/html`[^`]*`/g, "")

  if (cleanText.includes("Index")) {
    const indexMatches = cleanText.match(/([a-zA-Z_$][\w$]*\s*[=!<>]+\s*[0-9]+)/g) || []
    return indexMatches.length > 0 ? indexMatches.join(" && ") : cleanText
  }

  return cleanText.includes("?") ? cleanText.split("?")[0]?.trim() || cleanText : cleanText
}
/**
 * Извлекает выражение условия.
 */
export const extractConditionExpression = (condText: string, pathMatches?: string[]): string => {
  const { protectedExpr, stringLiterals } = protectStringLiterals(condText)
  const restore = (expression: string): string => restoreStringLiterals(expression, stringLiterals)

  // Для условий с индексами, извлекаем только логическое выражение
  if (protectedExpr.includes("Index")) {
    // Ищем все логические выражения с индексами
    const indexMatches = protectedExpr.match(/([a-zA-Z_$][\w$]*\s*[=!<>]+\s*[0-9]+)/g) || []
    if (indexMatches.length > 0) {
      // Собираем все логические выражения
      let logicalExpression = indexMatches.join(" && ")

      // Ищем переменные в логическом выражении
      const pathMatches = logicalExpression.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || []

      // Заменяем переменные на индексы ${ARGUMENTS_PREFIX}[0]}, ${ARGUMENTS_PREFIX}[1]}, и т.д.
      pathMatches.forEach((path, index) => {
        logicalExpression = logicalExpression.replace(
          new RegExp(`\\b${path.replace(/\./g, "\\.")}\\b`, "g"),
          `${ARGUMENTS_PREFIX}[${index}]`
        )
      })

      return restore(logicalExpression.replace(/\s+/g, " ").trim())
    }
  }

  // Ищем все переменные в условии (но не числа)
  const variables = pathMatches || protectedExpr.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || []

  // Проверяем, есть ли математические операции или другие сложные операции
  const hasComplexOperations = /[%+\-*/===!===!=<>().]/.test(protectedExpr)
  const hasLogicalOperators = /[&&||]/.test(protectedExpr)

  // Если найдена только одна переменная и нет сложных операций, возвращаем простое выражение
  if (variables.length === 1 && !hasComplexOperations && !hasLogicalOperators) {
    return `${ARGUMENTS_PREFIX}[0]`
  }

  // Если найдена только одна переменная, но есть простые математические операции (например, i % 2)
  if (variables.length === 1 && hasComplexOperations && !hasLogicalOperators) {
    // Заменяем переменную на индекс и оборачиваем в ${}
    let expression = protectedExpr
    expression = expression.replace(
      new RegExp(`\\b${variables[0]!.replace(/\./g, "\\.")}\\b`, "g"),
      `${ARGUMENTS_PREFIX}[0]`
    )
    return restore(expression)
  }

  // Заменяем переменные на индексы ${${ARGUMENTS_PREFIX}[0]}, ${${ARGUMENTS_PREFIX}[1]}, и т.д.
  // Сортируем переменные по длине (сначала более длинные), чтобы избежать частичной замены
  const sortedVariables = [...variables].sort((a, b) => b.length - a.length)

  let expression = protectedExpr
  sortedVariables.forEach((path) => {
    const index = variables.indexOf(path)
    expression = expression.replace(
      new RegExp(`\\b${path.replace(/\./g, "\\.")}\\b`, "g"),
      `${ARGUMENTS_PREFIX}[${index}]`
    )
  })

  return restore(expression.replace(/\s+/g, " ").trim())
}

/**
 * Общая функция для обработки template literals.
 * Используется как для text узлов, так и для атрибутов.
 */
export const parseTemplateLiteral = (
  value: string,
  context: ParseContext = { pathStack: [], level: 0 }
): ValueDynamic | null => {
  // Если значение не содержит ${}, возвращаем null (статическое значение)
  if (!value.includes("${")) return null

  // Извлекаем все переменные из выражения, включая вложенные ${...}
  const variables: string[] = []

  // Функция для извлечения переменных из строки с учетом вложенных ${...}
  const extractVariables = (str: string) => {
    const { protectedExpr } = protectStringLiterals(str)

    // Извлекаем все переменные в порядке их появления в строке
    const allVariableMatches = protectedExpr.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || []
    allVariableMatches.forEach((variable) => {
      if (
        variable.length > 1 &&
        variable.includes(".") && // Только переменные с точками
        variable !== "true" &&
        variable !== "false" &&
        variable !== "null" &&
        variable !== "undefined" &&
        !variables.includes(variable)
      ) {
        // Проверяем, не является ли переменная частью метода
        const variableIndex = protectedExpr.indexOf(variable)
        const afterVariable = protectedExpr.slice(variableIndex + variable.length)
        const isMethodCall = afterVariable.match(/^\s*\(/)

        if (!isMethodCall) {
          variables.push(variable)
        }
      }
    })

    // Защищаем строковые литералы
    const protectedStr = protectedExpr
      .replace(/`[^`]*`/g, "__STRING_TEMPLATE__")

    // Рекурсивно извлекаем переменные из всех ${...} выражений
    const extractFromTemplate = (content: string) => {
      // Находим переменные в текущем содержимом, исключая защищенные строковые литералы
      const variableMatches = content.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || []

      variableMatches.forEach((variable) => {
        if (
          variable.length > 1 &&
          !variable.startsWith("__STRING_") &&
          !variable.startsWith("STRING") &&
          variable !== "true" &&
          variable !== "false" &&
          variable !== "null" &&
          variable !== "undefined" &&
          !variables.includes(variable)
        ) {
          variables.push(variable)
        }
      })

      // Рекурсивно обрабатываем вложенные ${...}
      const nestedMatches = content.match(/\$\{([^}]+)\}/g) || []
      nestedMatches.forEach((nestedMatch) => {
        const nestedContent = nestedMatch.slice(2, -1)
        extractFromTemplate(nestedContent)
      })
    }

    // Если строка содержит ${...}, извлекаем переменные из всего содержимого
    if (protectedStr.includes("${")) {
      // Находим все ${...} выражения
      const templateMatches = protectedStr.match(/\$\{([^}]+)\}/g) || []

      templateMatches.forEach((match) => {
        // Извлекаем содержимое ${...} из защищенной строки
        const content = match.slice(2, -1) // убираем ${ и }
        extractFromTemplate(content)
      })
    }
  }

  // Извлекаем переменные из всего выражения
  extractVariables(value)

  if (variables.length === 0) {
    return null
  }

  // Разрешаем пути к данным для каждой переменной
  const paths = variables.map((variable: string) => resolveDataPath(variable, context))

  // Создаем унифицированное выражение, заменяя переменные на индексы
  // Защищаем строковые литералы от замены
  const { protectedExpr, stringLiterals } = protectStringLiterals(value)
  let expr = protectedExpr

  variables.forEach((variable: string, index: number) => {
    // Заменяем переменные на индексы во всем выражении
    // Используем регулярное выражение с границами слов для точной замены
    const variableRegex = new RegExp(`\\b${variable.replace(/\./g, "\\.")}\\b`, "g")
    expr = expr.replace(variableRegex, `${ARGUMENTS_PREFIX}[${index}]`)
  })

  // Применяем форматирование к выражению
  expr = expr.replace(WHITESPACE_PATTERN, " ").trim()

  // Восстанавливаем строковые литералы после форматирования
  expr = restoreStringLiterals(expr, stringLiterals)

  // Возвращаем результат в новом формате
  return {
    data: paths.length === 1 ? paths[0] || "" : paths,
    expr: expr,
  }
}

export const enrichWithData = (
  hierarchy: PartsAttr,
  context: ParseContext = { pathStack: [], level: 0 }
): NodeType[] => {
  return hierarchy.map((node) => createNode(node, context))
}

/**
 * Защищает строковые литералы от замены переменных.
 */
const protectStringLiterals = (expr: string): { protectedExpr: string; stringLiterals: string[] } => {
  const stringLiterals: string[] = []
  const protectedExpr = expr
    .replace(/"[^"]*"/g, (match) => {
      stringLiterals.push(match)
      return `__STRING_${stringLiterals.length - 1}__`
    })
    .replace(/'[^']*'/g, (match) => {
      stringLiterals.push(match)
      return `__STRING_${stringLiterals.length - 1}__`
    })

  return { protectedExpr, stringLiterals }
}
/**
 * Восстанавливает строковые литералы после обработки.
 */
const restoreStringLiterals = (expr: string, stringLiterals: string[]): string => {
  let result = expr
  stringLiterals.forEach((literal, index) => {
    result = result.replace(`__STRING_${index}__`, literal)
  })
  return result
}
