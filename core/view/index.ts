import type { ExtractValues, Update } from "../context/index.t.ts"
import type { ContextSchema } from "../context/types.t.ts"
import { choose } from "../html/directives/choose.ts"
import { map } from "../html/directives/map.ts"
import { ref } from "../html/directives/ref.ts"
import { repeat } from "../html/directives/repeat.ts"
import { styleMap } from "../html/directives/style-map.ts"
import { when } from "../html/directives/when.ts"
import { html, render } from "../html/index.ts"
import type { Core } from "../index.t.ts"
import type { RenderFunc, ViewConfig } from "./index.t.ts"

export class View<C extends ContextSchema, S extends string, I extends Core> {
  #render: RenderFunc<C, S, I> | null = null
  #style: ((params: { css: (strings: TemplateStringsArray, ...values: unknown[]) => void }) => void) | null = null

  sheet: CSSStyleSheet | null = null

  onMount: ({ core }: { core: I }) => void = () => {}
  onDestroy: ({ core }: { core: I }) => void = () => {}
  attachStyles = (shadow: ShadowRoot) => this.sheet && shadow.adoptedStyleSheets.push(this.sheet)

  /**
   * @param config конфигурация представления {@linkcode ViewConfig} [опционально]
   */
  constructor(config?: ViewConfig<C, S, I>) {
    if (!config) return
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
    if (config.render) {
      this.#render = config.render
    }
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
      html,
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
    if (!this.#render) return ''
    
    const fnString = this.#render.toString()
    
    // Извлекаем template literal
    const templateMatch = fnString.match(/html`([\s\S]*)`/)
    if (!templateMatch) return ''
    
    let template = templateMatch[1]!
    
    // Обрабатываем динамические meta-теги
    template = template.replace(/meta-\$\{"([^"]+)"\}/g, 'meta-$1')
    
    return template
  }

  /**
   * Извлекает style template для snapshot
   */
  #extractStyleTemplate(): string {
    if (!this.#style) return ''
    
    const fnString = this.#style.toString()
    
    // Извлекаем CSS template literal
    const match = fnString.match(/css`([\s\S]*)`/)
    if (!match) return ''
    
    return match[1]!
  }
}

export type { ViewConfig } from "./index.t.ts"
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
 * Создает статическую view функцию с заменой динамических тегов
 *
 * @param originalView - оригинальная view функция с динамическими тегами
 * @param tagName - имя тега для замены
 * @returns новая view функция со статическими тегами
 *
 * @example
 * ```typescript
 * const originalView = ({ context, html }) => html`
 *   <div>
 *     <meta-${childTag} context=${context}></meta-${childTag}>
 *   </div>
 * `
 *
 * const staticView = createStaticViewFunction(originalView, 'child-243232')
 * ```
 */
export function createStaticViewFunction<C extends ContextSchema, S extends string, I extends Core>(
  originalView: RenderFunc<C, S, I>,
  tagName: string
): any {
  // 1. Извлекаем template literal из оригинальной функции
  const template = extractTemplateLiteral(originalView)

  // 2. Заменяем динамический тег на статический
  // Ищем любые переменные в meta- тегах и заменяем на реальное значение
  const staticTemplate = template.replace(/meta-\$\{([^}]+)\}/g, `meta-${tagName}`)

  // 3. Создаем новую функцию с замененным шаблоном
  return restoreViewFunction(staticTemplate)
}

/**
 * Создает статическую view функцию с заменой нескольких динамических тегов
 *
 * @param originalView - оригинальная view функция с динамическими тегами
 * @param replacements - объект с заменами { childTag: 'child-123', parentTag: 'parent-456' }
 * @returns новая view функция со статическими тегами
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
 *   parentTag: 'parent-123',
 *   childTag: 'child-456'
 * })
 * ```
 */
export function createStaticViewFunctionWithReplacements(
  originalView: Function,
  replacements: Record<string, string>
): Function {
  // 1. Извлекаем template literal из оригинальной функции
  const template = extractTemplateLiteral(originalView)

  // 2. Заменяем все динамические теги на статические
  let staticTemplate = template
  for (const [variableName, tagName] of Object.entries(replacements)) {
    // Заменяем переменные в meta- тегах
    // Ищем как переменные, так и их значения в кавычках
    const regex1 = new RegExp(`meta-\\$\\{${variableName}\\}`, "g")
    const regex2 = new RegExp(`meta-\\$\\{"${tagName}"\\}`, "g")
    staticTemplate = staticTemplate.replace(regex1, `meta-${tagName}`)
    staticTemplate = staticTemplate.replace(regex2, `meta-${tagName}`)
  }

  // 3. Создаем новую функцию с замененным шаблоном
  return restoreViewFunction(staticTemplate)
}
