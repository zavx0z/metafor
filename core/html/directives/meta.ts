/**
 * Директива meta
 *
 * Позволяет включать мета-теги компонентов в шаблон актора.
 * Директива принимает хеш компонента и функцию рендера, которая получает готовый тег.
 *
 * @module HTML
 */

import { html, type ChildPart } from "../index.js"
import { directive, AsyncDirective } from "../async-directive.js"
import type { TemplateResult } from "../index.t"
import { extractTemplateLiteral } from "../../view"

/**
 * Тип функции рендера для мета-тега
 */
export type MetaRenderFunction = (tag: string) => TemplateResult

class MetaDirective extends AsyncDirective {
  private _lastHash?: string
  private _lastResult?: TemplateResult
  private _lastFn?: (html: any) => TemplateResult

  render(hash: string, renderFn: MetaRenderFunction): TemplateResult {
    // // Кешируем результат для одинаковых хешей
    // if (this._lastHash === hash && this._lastResult) {
    //   return this._lastResult
    // }
    // const template = extractTemplateLiteral(renderFn)
    // const newTemplate = template
    //   .replace(/<\$\{([^}]+)\}/g, `<meta-${hash}`)
    //   .replace(/<\/\$\{([^}]+)\}>/g, `</meta-${hash}>`)
    // const functionString = `() => html\`${newTemplate}\``
    // this._lastFn = eval(functionString)

    // // Вызываем функцию рендера с готовым тегом
    // const result = this._lastFn!(html)

    // // Кешируем результат
    // this._lastHash = hash
    // this._lastResult = result

    // return result
    const template = extractTemplateLiteral(renderFn)
    const newTemplate = template
      .replace(/<\$\{([^}]+)\}/g, `<meta-${hash}`)
      .replace(/<\/\$\{([^}]+)\}>/g, `</meta-${hash}>`)
    const functionString = `() => html\`${newTemplate}\``
    const fn = eval(functionString)
    return fn()
  }

  override update(part: ChildPart, [hash, renderFn]: Parameters<this["render"]>) {
    return this.render(hash, renderFn)
  }
}

/**
 * Директива для включения мета-тегов компонентов в шаблон.
 *
 * Принимает хеш компонента и функцию рендера, которая получает готовый тег `meta-<hash>`.
 * Результат кешируется для оптимизации производительности.
 *
 * @example
 * ```js
 * // Простое использование
 * render: ({ html, meta }) => html`
 *   ${meta(childHash, (tag) => html`<${tag}></${tag}>`)}
 * `
 *
 * // С передачей атрибутов
 * render: ({ html, meta, context }) => html`
 *   ${meta(childHash, (tag) => html`<${tag} context=${context}></${tag}>`)}
 * `
 * ```
 */
// export const meta = directive(MetaDirective) as unknown as (
//   hash: string,
//   renderFn: MetaRenderFunction
// ) => TemplateResult

// export const meta = (hash: string, renderFn: MetaRenderFunction) => {
//   const template = extractTemplateLiteral(renderFn)
//   const newTemplate = template
//     .replace(/<\$\{([^}]+)\}/g, `<meta-${hash}`)
//     .replace(/<\/\$\{([^}]+)\}>/g, `</meta-${hash}>`)
//   const functionString = `() => html\`${newTemplate}\``
//   const fn = eval(functionString)
//   return fn()
// }
export const meta = (hash: string, renderFn: MetaRenderFunction) => {
  const template = extractTemplateLiteral(renderFn)
  const newTemplate = template
    .replace(/<\$\{([^}]+)\}/g, `<meta-${hash}`)
    .replace(/<\/\$\{([^}]+)\}>/g, `</meta-${hash}>`)
  return `html\`${newTemplate}\``
}
/**
 * Тип класса, реализующего эту директиву
 */
export type { MetaDirective }
