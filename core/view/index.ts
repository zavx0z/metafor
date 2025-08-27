/**
 * Реализация представления (View)
 * @packageDocumentation
 * @module View
 */

import type { ExtractValues, Update } from "../context/index.t.ts"
import type { ContextSchema } from "../context/types.t.ts"
import type { Core } from "../index.t.ts"
import type { ViewDeclaration } from "./index.t.ts"
import { parse } from "./parser/index.ts"
import type { Node, RenderParams } from "./parser/index.t.ts"
import { render } from "./render/index.ts"

export type { ViewDeclaration }

export class View<C extends ContextSchema, I extends Core = Record<string, any>, S extends string = string> {
  #style: ((params: { css: (strings: TemplateStringsArray, ...values: unknown[]) => void }) => void) | null = null
  schema: Node[] = []

  sheet: CSSStyleSheet | null = null
  path: string[] = []

  onMount: ({ core }: { core: I }) => void = () => {}
  onDestroy: ({ core }: { core: I }) => void = () => {}
  attachStyles = (shadow: ShadowRoot) => this.sheet && shadow.adoptedStyleSheets.push(this.sheet)
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
    if (config.render) {
      try {
        this.schema = parse(config.render as any)
      } catch (error) {
        console.warn("Не удалось распарсить шаблон:", error)
        this.schema = []
      }
    }
    this.onMount = config.onMount || (() => {})
    this.onDestroy = config.onDestroy || (() => {})
  }
  render({
    container,
    state = "" as S,
    context = {} as ExtractValues<C>,
    core = {} as I,
    update = () => ({}),
  }: {
    container: HTMLElement | DocumentFragment
    state?: S
    context?: ExtractValues<C>
    core?: I
    update?: Update<C>
  }) {
    if (!this.schema) return
    render({ schema: this.schema, container, state, context, core, update })
  }
  get snapshot() {
    const result: { render?: string; style?: string } = {}

    if (this.#style) result.style = this.#extractStyleTemplate()

    return result
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
