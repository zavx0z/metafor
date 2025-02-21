import type {ResultType, TemplateResult} from "./types/html"
/**
 * Генерирует функцию тега шаблона, которая возвращает TemplateResult с заданным типом результата.*/
export type TagFunction = <T extends ResultType>(type: T) => (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult<T>

/**
 * Интерпретирует литерал шаблона как HTML-шаблон, который может эффективно отрисовываться и обновлять контейнер.
 *
 * ```ts
 * const header = (title: string) => html`<h1>${title}</h1>`;
 * ```
 *
 * Тег `html` возвращает описание DOM для отрисовки в виде значения. Он является
 * ленивым, то есть никакая работа не выполняется до момента рендеринга шаблона. При рендеринге,
 * если шаблон происходит из того же выражения, что и ранее отрисованный результат,
 * он эффективно обновляется вместо полной замены.
 *
 * @returns {(strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult<1>}
 */
export type HTML = (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult<1>

/**
 * Интерпретирует литерал шаблона как SVG-фрагмент, который может эффективно отрисовываться и обновлять контейнер.
 *
 * ```ts
 * const rect = svg`<rect width="10" height="10"></rect>`;
 *
 * const myImage = html`
 *   <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
 *     ${rect}
 *   </svg>`;
 * ```
 *
 * Тег-функция `svg` должна использоваться только для SVG-фрагментов или элементов,
 * которые должны находиться **внутри** HTML-элемента `<svg>`. Распространенная ошибка -
 * размещение *элемента* `<svg>` в шаблоне с тегом-функцией `svg`. Элемент `<svg>`
 * является HTML-элементом и должен использоваться в шаблоне с тегом-функцией {@linkcode html}.
 *
 * При использовании недопустимо возвращать SVG-фрагмент из метода
 * `render()`, так как SVG-фрагмент будет содержаться в теневом DOM элемента
 * и, следовательно, не будет правильно размещен внутри HTML-элемента `<svg>`.
 *
 * @returns {(strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult<2>}
 */
export type SVGElement = (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult<2>

/**
 * Интерпретирует литерал шаблона как MathML-фрагмент, который может эффективно отрисовываться и обновлять контейнер.
 * @example
 *
 * ```ts
 * const num = mathml`<mn>1</mn>`;
 *
 * const eq = html`
 *   <math>
 *     ${num}
 *   </math>`;
 * ```
 *
 * Тег-функция `mathml` должна использоваться только для MathML-фрагментов или элементов,
 * которые должны находиться **внутри** HTML-элемента `<math>`. Распространенная ошибка -
 * размещение *элемента* `<math>` в шаблоне с тегом-функцией `mathml`. Элемент `<math>`
 * является HTML-элементом и должен использоваться в шаблоне с тегом-функцией {@linkcode html}.
 *
 * При использовании недопустимо возвращать MathML-фрагмент из метода
 * `render()`, так как MathML-фрагмент будет содержаться в теневом DOM элемента
 * и, следовательно, не будет правильно размещен внутри HTML-элемента `<math>`.
 *
 * @template T
 * @param {T} type
 * @returns {(strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult<3>}
 */
export type MathML = (strings: TemplateStringsArray, ...values: any[]) => TemplateResult<3>
