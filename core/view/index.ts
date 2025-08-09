import { isHtmlDebugEnabled } from "../../web/debug/config.ts"
import type { ExtractValues, Update } from "../context/index.t.ts"
import type { ContextSchema } from "../context/types.t.ts"
import { choose } from "./html/directives/choose.ts"
import { map } from "./html/directives/map.ts"
import { ref } from "./html/directives/ref.ts"
import { repeat } from "./html/directives/repeat.ts"
import { styleMap } from "./html/directives/style-map.ts"
import { when } from "./html/directives/when.ts"
import type { TemplateResult } from "./html/index.t.ts"
import { render } from "./html/index.ts"
import type { Core } from "../index.t.ts"
import type { RenderFunc, ViewDeclaration } from "./index.t.ts"
import { metaTemplateCache } from "./maps"

export class View<C extends ContextSchema, S extends string, I extends Core> {
  #render: RenderFunc<C, S, I> | null = null
  #style: ((params: { css: (strings: TemplateStringsArray, ...values: unknown[]) => void }) => void) | null = null

  sheet: CSSStyleSheet | null = null
  path: string[] = []

  onMount: ({ core }: { core: I }) => void = () => {}
  onDestroy: ({ core }: { core: I }) => void = () => {}
  attachStyles = (shadow: ShadowRoot) => this.sheet && shadow.adoptedStyleSheets.push(this.sheet)
  html = (strings: TemplateStringsArray, ...values: unknown[]): TemplateResult<1> => {
    if (isHtmlDebugEnabled()) {
      if (values.some((val) => (val as { _$htmlStatic$: unknown })?.["_$htmlStatic$"])) {
        console.warn(
          `Статические значения 'literal' или 'unsafeStatic' не могут использоваться в нестатических шаблонах.\n` +
            `Пожалуйста, используйте статическую функцию 'html' для тега, чтобы увидеть https://metafor.dev/docs/templates/expressions/#static-expressions`
        )
      }
    }
    // Обрабатываем meta- теги (динамические имена тегов вида <meta-${hash}>)
    const hasMetaTags = strings.some((str) => str.includes("meta-"))
    if (hasMetaTags) {
      let cached = metaTemplateCache.get(strings)
      if (!cached) {
        const resultStrings: string[] = []
        const metaIndices = new Set<number>()
        let stripNextLeadingGt = false
        let pendingMetaPrefix: string | null = null

        for (let index = 0; index < strings.length; index++) {
          let str = strings[index]!
          let injectedFromPending = false
          if (pendingMetaPrefix) {
            // Перенос ранее собранного `<meta-<hash>` в начало текущего сегмента
            str = pendingMetaPrefix + str
            pendingMetaPrefix = null
            injectedFromPending = true
          }
          if (stripNextLeadingGt && str.startsWith(">")) {
            str = str.slice(1)
            stripNextLeadingGt = false
          }

          const inject = (token: string) => {
            const pos = str.lastIndexOf(token)
            if (pos === -1 || index >= values.length) return false
            const before = str.slice(0, pos)
            const after = str.slice(pos + token.length)
            let joined = before + token + String(values[index]) + after
            const next = strings[index + 1] ?? ""
            if (next.startsWith(">")) {
              // Случай без атрибутов: переносим '>' в текущую строку
              joined += ">"
              stripNextLeadingGt = true
            } else if (token === "<meta-" && next && !next.startsWith(">")) {
              // Случай с атрибутами: переносим `<meta-` + hash к следующему сегменту,
              // чтобы meta-<hash> оказался в strings[index+1]
              resultStrings.push(before)
              pendingMetaPrefix = `<meta-${String(values[index])}${after}`
              metaIndices.add(index)
              return true
            } else if (next && !/^\s|^>|^\/>/.test(next)) {
              // Защита от склейки имени тега с атрибутом без пробела
              if (!/\s$/.test(joined)) joined += " "
            }
            resultStrings.push(joined)
            metaIndices.add(index)
            return true
          }

          if (!injectedFromPending && (inject("</meta-") || inject("<meta-"))) {
            // инъекция выполнена
          } else {
            resultStrings.push(str)
          }
        }

        const processedStrings = Object.assign([...resultStrings], {
          raw: resultStrings.slice(),
        }) as TemplateStringsArray
        cached = { processedStrings, metaIndices }
        metaTemplateCache.set(strings, cached)
      }
      // Формируем values, исключая встроенные в строки
      const resultValues: unknown[] = []
      for (let i = 0; i < values.length; i++) {
        if (!cached.metaIndices.has(i)) {
          resultValues.push(values[i])
        }
      }
      return { ["_$htmlType$"]: 1, strings: cached.processedStrings, values: resultValues }
    }
    return { ["_$htmlType$"]: 1, strings, values }
  }
  /**
   * @param config конфигурация представления {@linkcode ViewDeclaration} [опционально]
   */
  constructor(config: ViewDeclaration<C, S, I> = {}, path: string[] = []) {
    this.path = path
    if (config.style) {
      this.#style = config.style
      config.style({
        css: (strings, ...values) => {
          const sheet = new CSSStyleSheet()
          const result = strings.reduce((acc, str, i) => acc + str + (values[i] || ""), "")
          sheet.replaceSync(result)
          this.sheet = sheet
        },
      })
    }
    if (config.render) this.#render = config.render
    this.onMount = config.onMount || (() => {})
    this.onDestroy = config.onDestroy || (() => {})
  }
  render({
    state,
    context,
    core,
    shadow,
    update,
  }: {
    state: S
    context: ExtractValues<C>
    core: I
    shadow: ShadowRoot
    update: Update<C>
  }) {
    if (!this.#render) return
    const template = this.#render({
      state,
      context,
      core,
      update,
      style: styleMap,
      html: this.html,
      ref,
      repeat,
      when,
      map,
      choose,
    })
    render(template, shadow)
  }
  get snapshot() {
    const result: { render?: string; style?: string } = {}

    if (this.#render) {
      result.render = this.#extractRenderTemplate()
    }

    if (this.#style) {
      result.style = this.#extractStyleTemplate()
    }

    return result
  }

  /**
   * Извлекает и обрабатывает render template для snapshot
   */
  #extractRenderTemplate(): string {
    if (!this.#render) return ""

    const fnString = this.#render.toString()

    // Извлекаем template literal
    const templateMatch = fnString.match(/html`([\s\S]*)`/)
    if (!templateMatch) return ""

    let template = templateMatch[1]!

    // Обрабатываем динамические meta-хеши
    template = template.replace(/meta-\$\{"([^"]+)"\}/g, "meta-$1")

    return template
  }

  /**
   * Извлекает style template для snapshot
   */
  #extractStyleTemplate(): string {
    if (!this.#style) return ""

    const fnString = this.#style.toString()

    // Извлекаем CSS template literal
    const match = fnString.match(/css`([\s\S]*)`/)
    if (!match) return ""

    return match[1]!
  }
}

export type { ViewDeclaration as ViewConfig } from "./index.t.ts"
/**
 * Реализация представления (View)
 * @module View
 */

/**
 * Извлекает template literal из view функции
 */
export function extractTemplateLiteral(fn: Function): string {
  const fnString = fn.toString()

  // Извлекаем template literal через regex
  const match = fnString.match(/html`([\s\S]*)`/)
  if (!match) {
    throw new Error("Не удалось найти template literal в функции")
  }

  return match[1]!
}

/**
 * Извлекает CSS template literal из style функции
 */
export function extractCSSTemplateLiteral(fn: Function): string {
  const fnString = fn.toString()

  // Извлекаем CSS template literal через regex
  const match = fnString.match(/css`([\s\S]*)`/)
  if (!match) {
    throw new Error("Не удалось найти CSS template literal в функции")
  }

  return match[1]!
}

/**
 * Восстанавливает view функцию из template literal
 */
export function restoreViewFunction(template: string) {
  // Создаем функцию через eval с фиксированными параметрами
  const functionString = `({ html, update, context, ref, repeat, when, map, style, choose, core, state }) => html\`${template}\``
  return eval(functionString)
}

/**
 * Восстанавливает CSS функцию из template literal
 */
export function restoreCSSFunction(template: string) {
  // Создаем функцию через eval с фиксированными параметрами
  const functionString = `({ css }) => css\`${template}\``
  return eval(functionString)
}

/**
 * Создает статическую view функцию с заменой нескольких динамических хешей мет
 *
 * @param originalView - оригинальная view функция с динамическими хешами мет
 * @param replacements - объект с заменами { childHash: 'child-123', parentHash: 'parent-456' }
 * @returns новая view функция со статическими хешами мет
 *
 * @example
 * ```typescript
 * const originalView = ({ context, html }) => html`
 *   <div>
 *     <meta-${parentTag}>
 *       <meta-${childTag} context=${context}></meta-${childTag}>
 *     </meta-${parentTag}>
 *   </div>
 * `
 *
 * const staticView = createStaticViewFunctionWithReplacements(originalView, {
 *   parentHash: 'parent-123',
 *   childHash: 'child-456'
 * })
 * ```
 */
export function createStaticViewFunctionWithReplacements(
  originalView: Function,
  replacements: Record<string, string>
): Function {
  // 1. Извлекаем template literal из оригинальной функции
  const template = extractTemplateLiteral(originalView)

  // 2. Заменяем все динамические хеши мет на статические
  let staticTemplate = template
  for (const [variableName, hashName] of Object.entries(replacements)) {
    // Заменяем переменные в meta- элементах
    // Ищем как переменные, так и их значения в кавычках
    const regex1 = new RegExp(`meta-\\$\\{${variableName}\\}`, "g")
    const regex2 = new RegExp(`meta-\\$\\{"${hashName}"\\}`, "g")
    staticTemplate = staticTemplate.replace(regex1, `meta-${hashName}`)
    staticTemplate = staticTemplate.replace(regex2, `meta-${hashName}`)
  }

  // 3. Создаем новую функцию с замененным шаблоном
  return restoreViewFunction(staticTemplate)
}
