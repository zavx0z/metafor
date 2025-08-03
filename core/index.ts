/**
 * Основная реализация MetaFor
 * @module Core
 */

/**
 * MetaFor - фреймворк для создания актора конечного автомата
 *
 * MetaFor предоставляет декларативный способ создания web-компонентов с конечным автоматом.
 * Каждый компонент имеет типизированный контекст, состояния, процессы, реакции и представление.
 *
 * **ВАЖНО: Акторы MetaFor имеют полную изоляцию и используют shadow-dom closed**
 * Прямой доступ к акторам через экспорты не нужен и не рекомендуется
 * Все взаимодействия между акторами происходят через патчи в сообщениях
 * Акторы регистрируются автоматически при импорте файла, экспорт не требуется
 * Используйте систему сообщений и реакций для связи между компонентами
 *
 * @example
 * ```typescript
 * MetaFor("user-profile")
 *   .context((types) => ({
 *     userId: types.number.required(0),
 *     userName: types.string.required(""),
 *     isLoading: types.boolean.required(false),
 *   }))
 *   .states({
 *     idle: { loading: {} },
 *     loading: { success: {}, error: {} },
 *     success: { idle: {} },
 *     error: { idle: {} },
 *   })
 *   .core({ users: [] })
 *   .processes((process) => ({
 *     loadUser: process()
 *       .action(async ({ context }) => {
 *         const response = await fetch(`/api/users/${context.userId}`)
 *         return await response.json()
 *       })
 *       .success(({ update, data }) => {
 *         update({ userName: data.name, isLoading: false })
 *       })
 *   }))
 *   .view({
 *     render: ({ context, html, update }) => html`
 *       <div>
 *         <h1>${context.userName}</h1>
 *         <button @click=${() => update({ isLoading: true })}>
 *           Загрузить
 *         </button>
 *       </div>
 *     `
 *   })
 * ```
 *
 * @packageDocumentation
 */

import { Context, type ContextSchema } from "./context"
import { type StatesConfig, validateNoUnconditionalCycles } from "./state"
import type { ProcessesDeclaration } from "./proc/index.t.ts"
import type { Core, FabricParams, Snapshot } from "./index.t.ts"
import type { ViewConfig } from "./view/index.t.ts"
import type { ReactionsDeclaration } from "./react/index.t.ts"
import type { ContextTypes } from "./context/types.t.ts"
import { createRef } from "./html/directives"
import { Processes } from "./proc/index.ts"
import { Reactions } from "./react/index.ts"
import { extractTemplateLiteral, extractCSSTemplateLiteral } from "./view/index.ts"

export type { Core, FabricParams, Snapshot }

export function MetaForFabric(
  constructor: <C extends ContextSchema, S extends string, I extends Core>(
    params: FabricParams<C, S, I>
  ) => CustomElementConstructor
) {
  /**
   * MetaFor — фабрика для создания web-компонента-актора конечного автомата
   * @param name - имя актора (участвует в формировании хеша, но не является итоговым тегом)
   * @returns chain API: context() -> states() -> core() -> processes() -> reactions() -> view()
   * 
   * **Важно:** Итоговый тег компонента формируется автоматически как `meta-<hash>`, 
   * где hash — это MD5 хеш от всей конфигурации компонента.
   */
  return function MetaFor(name: string, config?: { description?: string; dev?: boolean }) {
    const description = config?.description
    return {
      /**
       * Регистрирует схему контекста для автомата.
       *
       * Контекст содержит только простые типы данных. Сложные объекты храните в core.
       *
       * @param schema Функция, принимающая types и возвращающая объект-схему контекста
       * @returns chain API для вызова .states(...)
       *
       * @example
       * ```typescript
       * .context((types) => ({
       *   userId: types.number.required(0),
       *   userName: types.string.required("Anonymous"),
       *   selectedIds: types.array.required([]),
       *   isLoading: types.boolean.required(false),
       *   theme: types.enum.required(["light", "dark"]),
       * }))
       * ```
       */
      context<C extends ContextSchema>(schema: (types: ContextTypes) => C) {
        return {
          /**
           * Регистрирует переходы автомата между состояниями.
           *
           * @param states Объект, где ключ — имя состояния, а значение — карта возможных переходов (ключ — следующее состояние, значение — условия или данные перехода).
           * Пример:
           * ```ts
           * .states({
           *   guest: { user: { name: "Пользователь" } },
           *   user: { guest: {} },
           * })
           * ```
           * @returns chain API для вызова .actions(...)
           */
          states<S extends string>(states: StatesConfig<S, C>) {
            validateNoUnconditionalCycles(states)
            return {
              /**
               * Регистрирует core объект для автомата.
               *
               * Core - это простой объект с данными, используемыми во всех состояниях.
               * Сложные объекты и структуры данных храните в core.
               * Core доступен во всех процессах и реакциях.
               *
               * @param coreBuilder - функция, принимающая ref и возвращающая core объект, или сам core объект
               * @returns chain API для вызова .processes(...)
               *
               * @example
               * ```typescript
               * // Вариант 1: Функция с ref
               * .core((ref) => ({
               *   users: [],
               *   api: ref('api'),
               *   logger: ref('logger')
               * }))
               *
               * // Вариант 2: Простой объект
               * .core({
               *   users: [],
               *   settings: { theme: 'dark' },
               *   cache: new Map()
               * })
               * ```
               */
              core<I extends Core>(coreBuilder: ((ref: typeof createRef) => I) | I = () => ({} as I)) {
                const core = typeof coreBuilder === "function" ? coreBuilder(createRef) : coreBuilder
                return {
                  /**
                   * Регистрирует процессы автомата для нужных состояний.
                   *
                   * @param process Функция, принимающая process — фабрику chain API для описания процессов.
                   * Возвращает объект, где ключ — имя состояния (только для тех, где нужны процессы), а значение — chain-объект с обработчиками.
                   *
                   * Пример:
                   * ```ts
                   * .actions(process => ({
                   *   guest: process({ title: "guest_process", description: "Процесс для гостя" })
                   *     .action(({ context }) => { ... })
                   *     .success(({ update, data }) => update({ ... }))
                   *     .error(({ update, error }) => update({ ... })),
                   *   // для других состояний можно не указывать процесс, если он не требуется
                   * }))
                   * ```
                   *
                   * @returns Объект с процессами только для нужных состояний
                   */
                  processes(process: ProcessesDeclaration<C, S, I> = () => ({})) {
                    return {
                      /**
                       * Регистрирует карту реакций для автомата.
                       *
                       * **ВАЖНО: Реакции предназначены для реагирования на события других акторов, а не на собственные изменения состояния.**
                       * Для управления собственными переходами состояний используйте процессы и их success/error обработчики.
                       * Реакции связывают разные акторы в событийной архитектуре.
                       *
                       * @param reaction Функция (filter => декларация), где декларация — массив кортежей [string[], { update, filter, title }]
                       * @returns chain API для вызова .view(...)
                       *
                       * @example
                       * ```typescript
                       * // Правильно: реакция на события другого актора
                       * .reactions(reaction => [
                       *   ["idle", "loading"], // Состояния, в которых активна реакция
                       *   {
                       *     filter: (args) => args.meta.tag === "roadmap" && args.patch.op === "replace",
                       *     update: ({ update, context, patch }) => {
                       *       update({
                       *         lastMessage: patch.value,
                       *         messageCount: context.messageCount + 1
                       *       })
                       *     },
                       *     title: "Обработка сообщений от roadmap актора"
                       *   }
                       * ])
                       *
                       * // Неправильно: реакция на собственные изменения
                       * // Вместо этого используйте процессы и их success/error обработчики
                       * ```
                       */
                      reactions(reaction: ReactionsDeclaration<C, S, I> = () => []) {
                        return {
                          /**
                           * Регистрирует представление компонента и завершает конфигурацию.
                           * 
                           * @param view Конфигурация представления с render и style функциями
                           * @returns Хеш компонента для создания элемента с тегом `meta-<hash>`
                           * 
                           * @example
                           * ```typescript
                           * const hash = MetaFor("my-component")
                           *   .context(...)
                           *   .states(...)
                           *   .core(...)
                           *   .processes(...)
                           *   .reactions(...)
                           *   .view({
                           *     render: ({ context, html }) => html`<div>${context.title}</div>`,
                           *     style: ({ css }) => css`.container { color: blue; }`
                           *   })
                           * 
                           * // Создание элемента с полученным хешем
                           * document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
                           * ```
                           */
                          view(view?: ViewConfig<C, S, I>): string {
                            const params = { name, description, schema, states, core, process, reaction, view }
                            const fingerPrint = JSON.stringify({
                              ...(params.name ? { name: params.name } : {}),
                              ...(params.description ? { desc: params.description } : {}),
                              states: params.states,
                              processes: new Processes(params.process).toSnapshot(),
                              reactions: new Reactions(params.reaction).toSnapshot(),
                              context: new Context(params.schema).schema,
                              ...(params.view?.render ? { view: extractTemplateLiteral(params.view.render) } : {}),
                              ...(params.view?.style ? { style: extractCSSTemplateLiteral(params.view.style) } : {}),
                            })
                            const actor = constructor(params)
                            const hash = (actor as any).hash(fingerPrint)
                            const tag: string = `meta-${hash}`
                            if (!customElements.get(tag)) customElements.define(tag, constructor(params))
                            config?.dev && console.log(`${name}: ${hash}`)
                            return hash
                          },
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
    }
  }
}
