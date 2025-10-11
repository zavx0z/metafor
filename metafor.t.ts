import type { Schema, Types, Update, Values } from "@zavx0z/context"
import type { Core } from "./actor.t"
import type { ProcessesDeclaration, ProcessesSchema } from "./schema/process.t"
import type { Node as ParseNode } from "@zavx0z/template"
import type { ReactionsSchema } from "./schema/reactions.t"
import type { StatesConfig } from "./schema/states"
import type { ReactionsDeclaration } from "./schema/reactions"

/**
 * MetaFor — фабрика для создания web-компонента-актора конечного автомата
 * @param name - имя актора (используется для создания тега `meta-${name}`)
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
  config?: MetaForConfig
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
    schema: (types: Types) => C
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
      states: StatesConfig<S, C>
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
        core?: I
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
           * **ВАЖНО: Реакции предназначены для реагирования на события других акторов, а не на собственные изменения состояния.**
           * Для управления собственными переходами состояний используйте процессы и их success/error обработчики.
           * Реакции связывают разные акторы в событийной архитектуре.
           *
           * @param reaction Функция (filter => декларация), где декларация — массив кортежей [string[], { update, filter, label }]
           * @returns chain API для вызова .view(...)
           *
           * @example
           * ```typescript
           * // Правильно: реакция на события другого актора
           * .reactions(reaction => [
           *   ["idle", "loading"], // Состояния, в которых активна реакция
           *   {
           *     filter: (args) => args.meta.tag === "roadmap" && args.patches[0]?.op === "replace",
           *     update: ({ update, context, patch }) => {
           *       update({
           *         lastMessage: patch.value,
           *         messageCount: context.messageCount + 1
           *       })
           *     },
           *     label: "Обработка сообщений от roadmap актора"
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
 * Параметры функции рендеринга представления актора.
 *
 * В функцию render компонента MetaFor передаётся объект с полезными утилитами и данными для построения UI.
 *
 * @example
 * ```ts
 * render({ context, update, state, html, ref, repeat, when, map, style }) {
 *   const inputRef = ref();
 *   return html`
 *     <div ${style({ color: state === 'error' ? 'red' : 'black' })}>
 *       <h2>${context.label}</h2>
 *       <input ${ref(inputRef)} value=${context.value} @input=${e => update({ value: e.target.value })} />
 *       <ul>
 *         ${repeat(context.items, (item, i) => html`<li>${i}: ${item}</li>`)}
 *       </ul>
 *       ${when(context.items.length > 0, () => html`<span>Есть элементы</span>`, () => html`<span>Пусто</span>`)}
 *       <ol>
 *         ${map(context.items, (item, i) => html`<li>${item}</li>`)}
 *       </ol>
 *     </div>
 *   `;
 * }
 * ```
 */
export type ViewDefinitionParams<C extends Schema = Schema, I extends Core = Core, S extends string = string> = {
  /**
   * Функция для обновления контекста.
   * Вызывается с частичным объектом контекста для изменения состояния.
   * @example
   * ```ts
   * update({ value: 42 })
   * ```
   */
  update: Update<C>
  /**
   * Текущее состояние контекста.
   * Содержит все поля, определённые в .context(...)
   * @example
   * ```ts
   * html`<div>${context.value}</div>`
   * ```
   */
  context: Values<C>
  core: I
  /**
   * Текущее состояние автомата/актора.
   * Обычно строка, определённая в .states(...)
   * @example
   * ```ts
   * html`<span>${state === 'error' ? 'Ошибка' : 'Ок'}</span>`
   * ```
   */
  state: S
  /**
   * Функция шаблонизации (аналог lit-html).
   * Используется для создания HTML-шаблонов с интерполяцией.
   * @example
   * ```ts
   * html`<div>${context.value}</div>`
   * ```
   */
  html: (strings: TemplateStringsArray, ...values: any[]) => void
}

/**
 * Конфигурация для представления компонента.
 *
 * Поддерживает передачу контекста между компонентами через атрибут `context`.
 * При первой отрисовке контекст устанавливается без дополнительных сообщений,
 * при обновлении контекста родителя автоматически обновляется контекст ребенка.
 */
export interface ViewDeclaration<C extends Schema, I extends Core, S extends string> {
  /**
   * Функция рендеринга компонента.
   * Получает параметры с контекстом, состоянием и утилитами для построения UI.
   *
   * Поддерживает передачу контекста дочерним компонентам через атрибут `context`:
   * ```ts
   * render: ({ context, html }) => html`
   *   <div>
   *     <h1>Родитель: ${context.parentMessage}</h1>
   *     <meta-child
   *       context=${{
   *         message: context.parentMessage,
   *         count: context.parentCount,
   *       }}></meta-child>
   *   </div>
   * `
   * ```
   */
  render?: (params: ViewDefinitionParams<C, I, S>) => void
  /**
   * Функция, вызываемая после монтирования компонента в DOM.
   * Используется для инициализации после рендера.
   */
  onMount?: ({ core }: { core: I }) => void
  /**
   * Функция, вызываемая при уничтожении компонента.
   * Используется для очистки ресурсов.
   */
  onDestroy?: ({ core }: { core: I }) => void
  /**
   * Функция для определения CSS-стилей компонента.
   * Получает функцию css для создания инкапсулированных стилей.
   */
  style?: ({ css }: { css: (strings: TemplateStringsArray, ...values: any[]) => void }) => void
}

/**
 * Схема компонента MetaFor
 *
 * Определяет полную структуру компонента включая контекст, состояния,
 * процессы, реакции и представление. Используется для создания акторов.
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
  states: StatesConfig<S, C>
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
  core: I
}
/**
 * Базовая информация об акторе в системе MetaFor
 *
 * Содержит основную информацию о местоположении актора в иерархии.
 * Используется в фильтрах реакций, где не требуется доступ к методу destroy.
 *
 * @example
 * ```typescript
 * const selfInfo: SelfInfo = {
 *   meta: "user-profile",
 *   actor: "user-123",
 *   path: "0/1/2"
 * }
 * ```
 */
export type SelfInfo = {
  meta: string
  actor: string
  path: string
}

/**
 * Полный идентификатор актора в системе MetaFor
 *
 * Наследует базовую информацию от SelfInfo и добавляет метод destroy.
 * Используется в процессах и обработчиках реакций (equal) для доступа к методу уничтожения актора.
 * В фильтрах реакций (filter) используется только SelfInfo без метода destroy.
 *
 * @example
 * ```typescript
 * const self: Self = {
 *   meta: "user-profile",
 *   actor: "user-123",
 *   path: "0/1/2",
 *   destroy: () => actor.destroy()
 * }
 * ```
 */
export type Self = SelfInfo & {
  destroy: () => void
}
