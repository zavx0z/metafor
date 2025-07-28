import type { ContextSchema, ExtractValues, SerializedSchema, Update } from "./context"

import type { StatesConfig } from "./state/index.t.ts"
import type { TemplateResult } from "./html/html.t.ts"
import type { html } from "./html/html.ts"

/**
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends ContextSchema, S extends string> {
  state: S
  states: StatesConfig<S, C>
  context: ExtractValues<C>
  schema: SerializedSchema<C>
  // actions: ActionsConfig<C, S>
}

/**
 * Параметры функции рендеринга представления актора.
 *
 * В функцию render компонента MetaFor передаётся объект с полезными утилитами и данными для построения UI.
 *
 * Пример использования всех параметров:
 *
 * ```ts
 * render({ context, update, state, html, ref, repeat, when, map, style }) {
 *   const inputRef = ref();
 *   return html`
 *     <div ${style({ color: state === 'error' ? 'red' : 'black' })}>
 *       <h2>${context.title}</h2>
 *       <input ${ref(inputRef)} value=${context.value} @input=${e => update({ value: e.target.value })} />
 *       <ul>
 *         ${repeat(context.items, (item, i) => html`<li>${i}: ${item}</li>`)}
 *       </ul>
 *       ${when(context.items.length > 0, () => html`<span>Есть элементы</span>`, () => html`<span>Пусто</span>`) }
 *       <ol>
 *         ${map(context.items, (item, i) => html`<li>${item}</li>`)}
 *       </ol>
 *     </div>
 *   `;
 * }
 * ```
 *
 * @property update - Функция для обновления контекста. Например: `update({ value: 42 })`
 * @property context - Текущее состояние контекста. Например: `context.value`
 * @property state - Текущее состояние автомата/актора. Например: `state === 'error'`
 * @property html - Функция шаблонизации (аналог lit-html). Например: `html`<div>...</div>`
 * @property ref - Директива для получения ссылки на DOM-элемент. Например: `const r = ref(); html`<input ${ref(r)} />``
 * @property repeat - Директива для эффективного рендера списков с ключами. Например: `repeat(items, (item, i) => html`<li>${i}: ${item}</li>` )`
 * @property when - Директива для условного рендера. Например: `when(flag, () => html`<span>Да</span>`, () => html`<span>Нет</span>`)
 * @property map - Директива для простого отображения массива в элементы. Например: `map(items, (item, i) => html`<li>${item}</li>` )`
 * @property style - Директива для применения inline-стилей. Например: `style({ color: 'red', fontWeight: 600 })`
 */
type ViewDefinitionParams<C extends ContextSchema, S extends string> = {
  /**
   * Функция для обновления контекста.
   * Вызывается с частичным объектом контекста для изменения состояния.
   * @example
   *   update({ value: 42 })
   */
  update: Update<C>
  /**
   * Текущее состояние контекста.
   * Содержит все поля, определённые в .context(...)
   * @example
   *   html`<div>${context.value}</div>`
   */
  context: ExtractValues<C>
  /**
   * Текущее состояние автомата/актора.
   * Обычно строка, определённая в .states(...)
   * @example
   *   html`<span>${state === 'error' ? 'Ошибка' : 'Ок'}</span>`
   */
  state: S
  /**
   * Функция шаблонизации (аналог lit-html).
   * Используется для создания HTML-шаблонов с интерполяцией.
   * @example
   *   html`<div>${context.value}</div>`
   */
  html: typeof html
  /**
   * Директива для получения ссылки на DOM-элемент.
   * Используется для доступа к элементу после рендера.
   * @example
   *   html`<input ${ref(r)} />`
   *   // r.value будет содержать DOM-элемент
   */
  ref: typeof ref
  /**
   * Директива для эффективного рендера списков с ключами.
   * Позволяет оптимально обновлять DOM при изменении массива.
   * @example
   *   html`<ul>${repeat(context.items, (item, i) => html`<li>${i}: ${item}</li>`)}</ul>`
   *
   * Или просто без html render может возвращать
   * @example
   *    repeat(context.items, (item, i) => html`<li>${i}: ${item}</li>`)
   */
  repeat: typeof repeat
  /**
   * Директива для условного рендера.
   * Позволяет элегантно отображать разные шаблоны в зависимости от условия.
   * @example
   *   html`<div>${when(flag, () => html`<span>Да</span>`, () => html`<span>Нет</span>`)}</div>`
   *
   * Или render может возвращать напрямую:
   * @example
   *   return when(flag, () => html`<span>Да</span>`, () => html`<span>Нет</span>`)
   */
  when: typeof when
  /**
   * Директива для простого отображения массива в элементы.
   * Удобна для простых случаев, когда не нужны ключи.
   * @example
   *   html`<ul>${map(items, (item, i) => html`<li>${item}</li>`)}</ul>`
   *
   * Или render может возвращать напрямую:
   * @example
   *   return map(items, (item, i) => html`<li>${item}</li>`)
   */
  map: typeof map
  /**
   * Директива для применения inline-стилей к элементу.
   * Позволяет динамически задавать стили через объект.
   * @example
   *   html`<div ${style({ color: 'red', fontWeight: 600 })}></div>`
   */
  style: typeof styleMap
}

/**
 * Конфигурация для view
 */
export interface ViewConfig<C extends ContextSchema, S extends string> {
  /** Шаблонизатор */
  render?: (params: ViewDefinitionParams<C, S>) => TemplateResult
  /**  монтирования */
  onMount?: (...args: unknown[]) => unknown
  /**  уничтожения */
  onDestroy?: (...args: unknown[]) => unknown
  /** Стили */
  style?: ({ css }: { css: (strings: TemplateStringsArray, ...values: any[]) => CSSStyleSheet }) => void
}

import { MetaFor as FrameWork } from "./metafor"
import type { ref } from "./html/directives/ref.ts"
import type { repeat } from "./html/directives/repeat.ts"
import type { when } from "./html/directives/when.ts"
import type { map } from "./html/directives/map.ts"
import type { styleMap } from "./html/directives/style-map.ts"

declare global {
  interface Window {
    MetaFor: typeof FrameWork
    debugMetaFor: boolean
  }
  var debugMetaFor: boolean
  var htmlIssuedWarnings: Set<string>
  var MetaFor: typeof FrameWork
  var htmlPolyfillSupport: ((Template: any, ChildPart: any) => void) | undefined
  var htmlPolyfillSupportDevMode: ((Template: any, ChildPart: any) => void) | undefined
  var htmlVersions: string[]
  var emitHtmlDebugLogEvents: boolean
}
export {}
