import type { Schema, Types, Update, Values } from "@zavx0z/context"
import type { Core } from "../atom/gravity.t"
import type { ProcessesDeclaration, ProcessesSchema } from "./process.t"
import type { Node as ParseNode } from "@zavx0z/template"
import type { ReactionsSchema } from "./reactions.t"
import type { Superposition } from "./states"
import type { ReactionsDeclaration } from "./reactions"

/**
 * MetaFor — фабрика для создания web-компонента-атома конечного автомата
 * @param name - имя атома (используется для создания тега `meta-${name}`)
 * @returns chain API: context() -> states() -> core() -> processes() -> reactions() -> view()
 *
 * **Важно:** Итоговый тег компонента формируется как `meta-${name}`,
 * где name — это имя компонента, переданное в конструктор.
 */
/**
 * Основной API MetaFor для создания компонентов
 *
 * Предоставляет цепочку методов для настройки компонента:
 * - `context()` - определение типизированного контекста
 * - `states()` - определение состояний и переходов
 * - `core()` - настройка ядра для сложных данных
 * - `processes()` - определение процессов (действий)
 * - `reactions()` - определение реакций на события
 * - `view()` - определение представления компонента
 *
 * @example
 * ```typescript
 * const component = MetaFor("my-component")
 *   .context((types) => ({ name: types.string.required("") }))
 *   .states({ idle: { loading: {} } })
 *   .core({ users: [] })
 *   .processes((process) => ({ load: process().action(...) }))
 *   .reactions((reaction) => [...])
 *   .view({ render: ({ context }) => html`<div>${context.name}</div>` })
 * ```
 */
export type MetaFor = (
  name: string,
  config?: MetaForConfig,
) => {
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
   *   theme: types.enum("light", "dark").required("dark"),
   * }))
   * ```
   */
  context<C extends Schema>(
    schema: (types: Types) => C,
  ): {
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
     * @returns chain API для вызова .core(...)
     */
    states<S extends string>(
      states: Superposition<S, C>,
    ): {
      /**
       * Регистрирует core объект для автомата.
       *
       * Core - это простой объект с данными, используемыми во всех состояниях.
       * Сложные объекты и структуры данных храните в core.
       * Core доступен во всех процессах и реакциях.
       *
       * @param coreBuilder - функция, возвращающая core объект, или сам core объект
       * @returns chain API для вызова .processes(...)
       *
       * @example
       * ```typescript
       * // Вариант 1: Функция
       * .core(() => ({
       *   users: [],
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
      core<I extends Core>(
        core?: I,
      ): {
        /**
         * Регистрирует процессы автомата для нужных состояний.
         *
         * @param process Функция, принимающая process — фабрику chain API для описания процессов.
         * Возвращает объект, где ключ — имя состояния (только для тех, где нужны процессы), а значение — chain-объект с обработчиками.
         *
         * Пример:
         * ```ts
         * .processes(process => ({
         *   guest: process({ label: "guest_process", desc: "Процесс для гостя" })
         *     .action(({ context }) => { ... })
         *     .success(({ update, data }) => update({ ... }))
         *     .error(({ update, error }) => update({ ... })),
         *   // для других состояний можно не указывать процесс, если он не требуется
         * }))
         * ```
         *
         * @returns Объект с процессами только для нужных состояний
         */
        processes(process?: ProcessesDeclaration<C, S, I>): {
          /**
           * Регистрирует карту реакций для автомата.
           *
           * **ВАЖНО: Реакции предназначены для реагирования на события других атомов, а не на собственные изменения состояния.**
           * Для управления собственными переходами состояний используйте процессы и их success/error обработчики.
           * Реакции связывают разные атомы в событийной архитектуре.
           *
           * @param reaction Функция (filter => декларация), где декларация — массив кортежей [string[], { update, filter, label }]
           * @returns chain API для вызова .view(...)
           *
           * @example
           * ```typescript
           * // Правильно: реакция на события другого атома
           * .reactions(reaction => [
           *   ["idle", "loading"], // Состояния, в которых активна реакция
           *   {
           *     filter: (args) => args.meta.tag === "roadmap" && args.impulses[0]?.op === "replace",
           *     update: ({ update, context, patch }) => {
           *       update({
           *         lastMessage: patch.value,
           *         messageCount: context.messageCount + 1
           *       })
           *     },
           *     label: "Обработка сообщений от roadmap атома"
           *   }
           * ])
           *
           * // Неправильно: реакция на собственные изменения
           * // Вместо этого используйте процессы и их success/error обработчики
           * ```
           */
          reactions(reaction?: ReactionsDeclaration<C, S, I>): {
            /**
             * Регистрирует представление компонента и завершает конфигурацию.
             *
             * @param view Конфигурация представления с render и style функциями
             * @returns Компонент для создания элемента с тегом `meta-${name}`
             *
             * @example
             * ```typescript
             * const component = MetaFor("my-component")
             *   .context(...)
             *   .states(...)
             *   .core(...)
             *   .processes(...)
             *   .reactions(...)
             *   .view({
             *     render: ({ context, html }) => html`<div>${context.label}</div>`,
             *     style: ({ css }) => css`.container { color: blue; }`
             *   })
             *
             * // Создание элемента с именем компонента
             * document.body.innerHTML = `<meta-my-component></meta-my-component>`
             * ```
             */
            view(view?: ViewDeclaration<C, I, S>): Meta<C, S, I>
          }
        }
      }
    }
  }
}

declare global {
  var DEV: boolean
  interface Window {
    //@ts-ignore
    MetaFor: MetaFor
  }
  //@ts-ignore
  /**
   * MetaFor — фабрика для создания web-компонента-атома конечного автомата
   * @param name - имя атома (используется для создания тега `meta-${name}`)
   * @returns chain API: context() -> states() -> core() -> processes() -> reactions() -> view()
   *
   * **Важно:** Итоговый тег компонента формируется как `meta-${name}`,
   * где name — это имя компонента, переданное в конструктор.
   */
  /**
   * Основной API MetaFor для создания компонентов
   *
   * Предоставляет цепочку методов для настройки компонента:
   * - `context()` - определение типизированного контекста
   * - `states()` - определение состояний и переходов
   * - `core()` - настройка ядра для сложных данных
   * - `processes()` - определение процессов (действий)
   * - `reactions()` - определение реакций на события
   * - `view()` - определение представления компонента
   *
   * @example
   * ```typescript
   * const component = MetaFor("my-component")
   *   .context((types) => ({ name: types.string.required("") }))
   *   .states({ idle: { loading: {} } })
   *   .core({ users: [] })
   *   .processes((process) => ({ load: process().action(...) }))
   *   .reactions((reaction) => [...])
   *   .view({ render: ({ context }) => html`<div>${context.name}</div>` })
   * ```
   */
  var MetaFor: MetaFor
}
export {}

/**
 * Конфигурация компонента MetaFor
 *
 * Опциональные параметры для настройки поведения компонента.
 *
 * @example
 * ```typescript
 * const config: MetaForConfig = {
 *   desc: "Компонент профиля пользователя",
 *   dev: true
 * }
 * ```
 */
export type MetaForConfig = {
  /** Описание компонента */
  desc?: string
  /** Режим разработки */
  dev?: boolean
}

/**
 * Параметры функции рендеринга представления атома.
 *
 * Предназначены для декларирования иерархии акторов через `<meta-for>`.
 *
 * ## API
 * - `state` — текущее состояние для условий рендеринга
 * - `html` — шаблонизация для `<meta-for>` элементов
 * - `context` — данные атома для передачи дочерним акторам
 * - `update` — функция обновления контекста
 * - `core` — ядро для сложных данных
 *
 * @example
 * ```ts
 * // Иерархия акторов на основе состояния
 * render: ({ state, html }) => html`
 *   ${state === "коммит" && html`<meta-for src="meta/status.js" context=${{ message: "В процессе..." }}></meta-for>`}
 *   ${state === "завершено" && html`<meta-for src="meta/success.js" context=${{ message: "Готово!" }}></meta-for>`}
 *   ${state === "ошибка" && html`<meta-for src="meta/error.js" context=${{ error: "Ошибка" }}></meta-for>`}
 * `
 *
 * // Передача контекста дочернему актору
 * render: ({ context, html }) => html`
 *   <meta-for src="meta/child.js" context=${{ data: context.value }}></meta-for>
 * `
 *
 * // Несколько акторов в иерархии
 * render: ({ html }) => html`
 *   <meta-for src="meta/header.js"></meta-for>
 *   <meta-for src="meta/content.js"></meta-for>
 *   <meta-for src="meta/footer.js"></meta-for>
 * `
 * ```
 */
export type ViewDefinitionParams<C extends Schema = Schema, I extends Core = Core, S extends string = string> = {
  /**
   * Функция для обновления контекста атома.
   * Используется в обработчиках событий для изменения состояния.
   * @example
   * ```ts
   * render: ({ html, update }) => html`
   *   <button onclick=${() => update({ isLoading: true })}>Начать</button>
   * `
   */
  update: Update<C>
  /**
   * Текущий контекст атома.
   * Содержит все поля, определённые в `.context(...)`.
   * Используется для передачи данных дочерним акторам.
   * @example
   * ```ts
   * render: ({ context, html }) => html`
   *   <meta-for src="meta/child.js" context=${{ value: context.data }}></meta-for>
   * `
   */
  context: Values<C>
  /**
   * Ядро атома для сложных данных.
   * Содержит объекты, массивы и структуры, которые не помещаются в контекст.
   */
  core: I
  /**
   * Текущее состояние автомата.
   * Строка из `.states(...)`, используется для условного рендеринга акторов.
   * @example
   * ```ts
   * render: ({ state, html }) => html`
   *   ${state === "loading" && html`<meta-for src="meta/spinner.js"></meta-for>`}
   * `
   */
  state: S
  /**
   * Функция шаблонизации для создания HTML.
   * Используется для декларирования иерархии акторов через `<meta-for>`.
   * @example
   * ```ts
   * render: ({ html }) => html`
   *   <meta-for src="meta/header.js"></meta-for>
   *   <meta-for src="meta/content.js"></meta-for>
   * `
   */
  html: (strings: TemplateStringsArray, ...values: any[]) => void
}

/**
 * Конфигурация для представления компонента.
 *
 * Определяет иерархию акторов через `<meta-for>` и стили компонента.
 * Поддерживает передачу контекста дочерним акторам через атрибут `context`.
 */
export interface ViewDeclaration<C extends Schema, I extends Core, S extends string> {
  /**
   * Функция рендеринга иерархии акторов.
   * Декларирует вложенные акторы через `<meta-for src="..." context={...}>`.
   *
   * @example
   * ```ts
   * // Условный рендеринг по состоянию
   * render: ({ state, html }) => html`
   *   ${state === "loading" && html`<meta-for src="meta/spinner.js"></meta-for>`}
   *   ${state === "ready" && html`<meta-for src="meta/content.js"></meta-for>`}
   * `
   *
   * // Передача контекста
   * render: ({ context, html }) => html`
   *   <meta-for src="meta/child.js" context=${{ data: context.value }}></meta-for>
   * `
   *
   * // Статическая иерархия
   * render: ({ html }) => html`
   *   <meta-for src="meta/header.js"></meta-for>
   *   <meta-for src="meta/main.js"></meta-for>
   *   <meta-for src="meta/footer.js"></meta-for>
   * `
   */
  render?: (params: ViewDefinitionParams<C, I, S>) => void
  /**
   * Функция для определения CSS-стилей компонента.
   * Возвращает CSS строку через функцию css.
   *
   * @example
   * ```ts
   * style: ({ css }) => css`
   *   .container {
   *     padding: 16px;
   *     border: 1px solid #ccc;
   *   }
   * `
   */
  style?: ({ css }: { css: (strings: TemplateStringsArray, ...values: any[]) => void }) => void
}

/**
 * Схема компонента MetaFor
 *
 * Определяет полную структуру компонента включая контекст, состояния,
 * процессы, реакции и представление. Используется для создания атомов.
 *
 * @template C - Тип контекста (схема контекста)
 * @template S - Тип состояний (строковые литералы)
 * @template I - Тип ядра (объект для сложных данных)
 *
 * @example
 * ```typescript
 * const schema: Meta = {
 *   name: "user-profile",
 *   context: { name: types.string.required("") },
 *   states: { idle: { loading: {} } },
 *   core: { users: [] }
 * }
 * ```
 */
export interface Meta<C extends Schema = Schema, S extends string = string, I extends Core = {}> {
  /** Название компонента */
  name: string
  /** Описание компонента */
  desc?: string
  /** Карта состояний и переходов */
  states: Superposition<S, C>
  /** Снимок процессов */
  processes?: ProcessesSchema
  /** Снимок реакций */
  reactions?: ReactionsSchema
  /** Схема контекста */
  context: C
  /** Сериализованный view как ParseNode[] из @zavx0z/template */
  render?: ParseNode[]
  /** Стили компонента */
  style?: string
  /** Ядро */
  core?: I
}
