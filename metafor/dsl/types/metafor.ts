import type { Schema, Types, Update, Values } from "@zavx0z/context"
import type { ProcessesDeclaration, ProcessesSchema } from "./process"
import type { NodeType } from "@metafor/template"
import type { ReactionsSchema } from "./reactions"
import type { Superposition } from "./states"
import type { ReactionsDeclaration } from "./reactions"

export type SRC = string

export type JsonPatch = {
  from?: string
  op: "add" | "remove" | "replace" | "move" | "test"
  path: string
  value?: any
}
export enum Initiator {
  Transition = "t",
  Process = "p",
  Success = "s",
  Error = "e",
  Reaction = "r",
  Nothing = "",
}
/**
 * Базовая информация об атоме в системе MetaFor
 *
 * Содержит основную информацию о местоположении атома в иерархии.
 * Используется в фильтрах реакций, где не требуется доступ к методу destroy.
 *
 * @example
 * ```typescript
 * const selfInfo: SelfInfo = {
 *   meta: "user-profile",
 *   atom: "user-123",
 *   path: "0/1/2"
 * }
 * ```
 */
export interface Self {
  atom: string
  meta: string
  path: string
}
/**
 * Масса атома — мера взаимодействия со средой исполнения
 *
 * Масса накапливается в процессе исполнения и определяет локализацию процесса:
 * - Зависимости от среды (WebSocket, DOM, Database API)
 * - Временные структуры данных для вычислений
 * - Кэши, актуальные только в runtime
 * - Общие ресурсы в иерархии акторов
 *
 * Масса не сериализуется в Boundary — она проявляется только в Volume.
 *
 * @example
 * ```typescript
 * const mass: Mass = {
 *   socket: null as WebSocket | null,
 *   cache: new Map(),
 * }
 * ```
 */
export type Mass = Record<string, any>

/**
 * MetaFor — фабрика для создания web-компонента-атома конечного автомата
 * @param name - имя атома (используется для создания тега `meta-${name}`)
 * @returns chain API: fields() -> superposition() -> mass() -> processes() -> reactions() -> matter() -> bulk()
 *
 * **Важно:** Итоговый тег компонента формируется как `meta-${name}`,
 * где name — это имя компонента, переданное в конструктор.
 */
/**
 * Основной API MetaFor для создания компонентов
 *
 * Предоставляет цепочку методов для настройки компонента:
 * - `fields()` - определение типизированных полей
 * - `superposition()` - определение суперпозиции состояний
 * - `mass()` - настройка массы для сложных данных и зависимостей от среды
 * - `processes()` - определение процессов (действий)
 * - `reactions()` - определение реакций на события
 * - `matter()` - определение иерархии акторов компонента
 * - `bulk()` - определение bulk-view компонента
 *
 * Для `matter` dynamic `src`, зависящий от `enum`, должен писаться напрямую:
 * `<meta-for src="demo/${value.mode}" />`.
 * Дополнительный `value.mode && ...` для защиты от `null` не нужен.
 *
 * @example
 * ```typescript
 * const component = MetaFor("my-component")
 *   .fields((field) => ({ mode: field.enum("summary", "details").required("summary") }))
 *   .superposition({ idle: { loading: {} } })
 *   .mass({ users: [] })
 *   .processes((process) => ({ load: process().action(...) }))
 *   .reactions((reaction) => [...])
 *   .matter(({ value, html }) => html`
 *     ${value.mode === "summary"
 *       ? html`<meta-for src="demo/summary" />`
 *       : html`<meta-for src="demo/details" />`}
 *   `)
 *   .bulk()
 * ```
 */
export type MetaForFn = (
  name: string,
  config?: MetaForConfig,
) => {
  /**
   * Регистрирует схему полей для автомата.
   *
   * Поля содержат только простые типы данных. Сложные объекты храните в mass.
   *
   * @param schema Функция, принимающая field и возвращающая объект-схему полей
   * @returns chain API для вызова .superposition(...)
   *
   * @example
   * ```typescript
   * .fields((field) => ({
   *   userId: field.number.required(0),
   *   userName: field.string.required("Anonymous"),
   *   selectedIds: field.array.required([]),
   *   isLoading: field.boolean.required(false),
   *   theme: field.enum("light", "dark").required("dark"),
   * }))
   * ```
   */
  fields<ɸ extends Schema>(
    schema: (field: Types) => ɸ,
  ): {
    /**
     * Регистрирует суперпозицию переходов автомата между состояниями.
     *
     * @param superposition Объект, где ключ — имя состояния, а значение — карта возможных переходов (ключ — следующее состояние, значение — условия или данные перехода).
     * Пример:
     * ```ts
     * .superposition({
     *   guest: { user: { name: "Пользователь" } },
     *   user: { guest: {} },
     * })
     * ```
     * @returns chain API для вызова .mass(...)
     */
    superposition<𝛴 extends string>(
      superposition: Superposition<𝛴, ɸ>,
    ): {
      /**
       * Регистрирует mass объект для автомата.
       *
       * Mass — это мера взаимодействия со средой исполнения.
       * Масса накапливается в процессе исполнения и определяет локализацию процесса.
       * Mass доступен во всех процессах и реакциях.
       *
       * @param massBuilder - функция, возвращающая mass объект, или сам mass объект
       * @returns chain API для вызова .processes(...)
       *
       * @example
       * ```typescript
       * // Вариант 1: Функция
       * .mass(() => ({
       *   users: [],
       * }))
       *
       * // Вариант 2: Простой объект
       * .mass({
       *   users: [],
       *   settings: { theme: 'dark' },
       *   cache: new Map()
       * })
       * ```
       */
      mass<m extends Mass>(
        mass?: m,
      ): {
        /**
         * Регистрирует процессы автомата для нужных состояний.
         *
         * @param process Функция, принимающая process — фабрику chain API для описания процессов.
         * Возвращает объект, где ключ — имя суперпозиции (только для тех, где нужны процессы), а значение — chain-объект с обработчиками.
         *
         * Пример:
         * ```ts
         * .processes(process => ({
         *   guest: process({ label: "guest_process", desc: "Процесс для гостя" })
         *     .action(({ value }) => { ... })
         *     .success(({ update, data }) => update({ ... }))
         *     .error(({ update, error }) => update({ ... })),
         *   // для других суперпозиций можно не указывать процесс, если он не требуется
         * }))
         * ```
         *
         * @returns Объект с процессами только для нужных суперпозиций
         */
        processes(process?: ProcessesDeclaration<ɸ, 𝛴, m>): {
          /**
           * Регистрирует карту реакций для автомата.
           *
           * **ВАЖНО: Реакции предназначены для реагирования на события других атомов, а не на собственные изменения состояния.**
           * Для управления собственными переходами состояний используйте процессы и их success/error обработчики.
           * Реакции связывают разные атомы в событийной архитектуре.
           *
           * @param reaction Функция (filter => декларация), где декларация — массив кортежей [string[], { update, filter, label }]
           * @returns chain API для вызова .matter(...)
           *
           * @example
           * ```typescript
           * // Правильно: реакция на события другого атома
           * .reactions(reaction => [
           *   ["idle", "loading"], // Состояния, в которых активна реакция
           *   {
           *     filter: (args) => args.meta.tag === "roadmap" && args.impulses[0]?.op === "replace",
           *     update: ({ update, field, patch }) => {
           *       update({
           *         lastMessage: patch.value,
           *         messageCount: field.messageCount + 1
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
          reactions(reaction?: ReactionsDeclaration<ɸ, 𝛴, m>): {
            /**
             * Регистрирует matter-функцию компонента и возвращает финальный bulk-этап.
             *
             * @param matter Функция matter для иерархии акторов
             * @returns chain API для вызова .bulk(...)
             *
             * @example
             * ```typescript
             * const component = MetaFor("my-component")
             *   .fields(...)
             *   .superposition(...)
             *   .mass(...)
             *   .processes(...)
             *   .reactions(...)
             *   .matter(({ state, html }) => html`${state === "idle" && html`<meta-for src="demo/panel" />`}`)
             *   .bulk({
             *     view: ({ css }) => css`.container { color: blue; }`
             *   })
             *
             * // Создание элемента с именем компонента
             * document.body.innerHTML = `<meta-my-component></meta-my-component>`
             * ```
             */
            matter(matter?: MatterDeclaration<ɸ, m, 𝛴>): {
              /**
               * Регистрирует bulk-view конфигурацию компонента и завершает конфигурацию.
               *
               * @param bulk Конфигурация bulk-view
               * @returns Компонент для создания элемента с тегом `meta-${name}`
               */
              bulk(bulk?: BulkDeclaration): MetaDSL<ɸ, 𝛴, m>
            }
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
   * @returns chain API: fields() -> superposition() -> mass() -> processes() -> reactions() -> matter() -> bulk()
   *
   * **Важно:** Итоговый тег компонента формируется как `meta-${name}`,
   * где name — это имя компонента, переданное в конструктор.
   */

  /**
   * Основной API MetaFor для создания компонентов
   *
   * Предоставляет цепочку методов для настройки компонента:
   * - `fields()` - определение типизированных полей
   * - `superposition()` - определение суперпозиции состояний
   * - `mass()` - настройка массы для сложных данных и зависимостей от среды
   * - `processes()` - определение процессов (действий)
   * - `reactions()` - определение реакций на события
 * - `matter()` - определение иерархии акторов компонента
   * - `bulk()` - определение bulk-view компонента
   *
   * @example
   * ```typescript
   * const component = MetaFor("my-component")
   *   .fields((field) => ({ mode: field.enum("summary", "details").required("summary") }))
   *   .superposition({ idle: { loading: {} } })
   *   .mass({ users: [] })
   *   .processes((process) => ({ load: process().action(...) }))
   *   .reactions((reaction) => [...])
   *   .matter(({ value, html }) => html`
   *     ${value.mode === "summary"
   *       ? html`<meta-for src="demo/summary" />`
   *       : html`<meta-for src="demo/details" />`}
   *   `)
   *   .bulk()
   * ```
   */ // @ts-ignore
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
 * Параметры функции matter атома.
 *
 * Предназначены для декларирования иерархии акторов через `<meta-for>`.
 *
 * ## API
 * - `state` — текущее состояние для условий matter
 * - `html` — шаблонизация для `<meta-for>` элементов
 * - `value` — данные атома для передачи дочерним акторам
 * - `update` — функция обновления контекста
 * - `mass` — масса для сложных данных и зависимостей от среды
 *
 * Matter описывает только иерархию акторов.
 * Выбор topology в matter допускается только по `state`, `enum` и `array`.
 * Обычные HTML-элементы и текст должны жить вне matter.
 *
 * @example
 * ```ts
 * // Иерархия акторов на основе состояния
 * matter: ({ state, html }) => html`
 *   ${state === "коммит" && html`<meta-for src="demo/status" fields=${{ message: "В процессе..." }} />`}
 *   ${state === "завершено" && html`<meta-for src="demo/success" fields=${{ message: "Готово!" }} />`}
 *   ${state === "ошибка" && html`<meta-for src="demo/error" fields=${{ message: "Ошибка" }} />`}
 * `
 *
 * // Передача данных дочернему актору
 * matter: ({ value, html }) => html`
 *   <meta-for src="demo/child" fields=${{ data: value.data }} />
 * `
 *
 * // Несколько акторов в иерархии
 * matter: ({ html }) => html`
 *   <meta-for src="demo/header" />
 *   <meta-for src="demo/content" />
 *   <meta-for src="demo/footer" />
 * `
 * ```
 */
export type MatterDefinitionParams<ɸ extends Schema = Schema, m extends Mass = Mass, 𝛴 extends string = string> = {
  /**
   * Функция для обновления контекста атома.
   * Используется в обработчиках событий для изменения состояния.
  update: Update<ɸ>
  /**
   * Текущие значения полей.
   * Содержит все значения полей, определённых в `.fields(...)`.
   * Используется для передачи данных дочерним акторам.
   * @example
   * ```ts
   * matter: ({ value, html }) => html`
   *   <meta-for src="demo/child" fields=${{ value: value.data }} />
   * `
   */
  value: Values<ɸ>
  /**
   * Масса атома для сложных данных и зависимостей от среды.
   * Содержит объекты, массивы и структуры, которые не помещаются в контекст.
   * Масса определяет локализацию процесса и не сериализуется в Boundary.
   */
  mass: m
  /**
   * Текущее состояние автомата.
   * Строка из `.superposition(...)`, используется для условий matter.
   * @example
   * ```ts
   * matter: ({ state, html }) => html`
   *   ${state === "loading" && html`<meta-for src="demo/spinner" />`}
   * `
   */
  state: 𝛴
  /**
   * Функция шаблонизации для создания HTML.
   * Используется для декларирования иерархии акторов через `<meta-for>`.
   *
   * @example
   * ```ts
   * matter: ({ html }) => html`
   *   <meta-for src="demo/header" />
   *   <meta-for src="demo/content" />
   * `
   * ```
   *
   * @remarks
   * Атрибут `src` задаёт hub-адрес вида `owner/path` — канонический идентификатор meta-сущности,
   * который loader резолвит в `owner/path/meta.json`.
   */
  html: (strings: TemplateStringsArray, ...values: any[]) => void
}

/**
 * Тип matter-декларации для иерархии акторов.
 */
export type MatterDeclaration<ɸ extends Schema, m extends Mass, 𝛴 extends string> = (
  params: MatterDefinitionParams<ɸ, m, 𝛴>,
) => void

/**
 * Конфигурация для bulk-компонента.
 *
 * Определяет только bulk-view стили компонента.
 */
export interface BulkDeclaration {
  /**
   * Функция для определения view-стилей компонента.
   * Возвращает CSS строку через функцию css.
   *
   * @example
   * ```ts
   * view: ({ css }) => css`
   *   .container {
   *     padding: 16px;
   *     border: 1px solid #ccc;
   *   }
   * `
   */
  view?: ({ css }: { css: (strings: TemplateStringsArray, ...values: any[]) => void }) => void
}

/**
 * Схема компонента MetaFor
 *
 * Определяет полную структуру компонента включая поля, суперпозицию,
 * процессы, реакции и массу. Используется для создания атомов.
 *
 * @template C - Тип полей (схема полей)
 * @template S - Тип состояний (строковые литералы)
 * @template M - Тип массы (объект для сложных данных и зависимостей от среды)
 *
 * @example
 * ```typescript
 * const schema: MetaDSL = {
 *   name: "user-profile",
 *   fields: { name: field.string.required("") },
 *   superposition: { idle: { loading: {} } },
 *   mass: { users: [] }
 * }
 * ```
 */
export interface MetaDSL<ɸ extends Schema = Schema, 𝛴 extends string = string, m extends Mass = {}> {
  /** Название компонента */
  name: string
  /** Описание компонента */
  desc?: string
  /** Суперпозиция состояний и переходов */
  superposition: Superposition<𝛴, ɸ>
  /** Снимок процессов */
  processes?: ProcessesSchema
  /** Снимок реакций */
  reactions?: ReactionsSchema
  /** Схема полей */
  fields: ɸ
  /** Сериализованная matter как ParseNode[] из @metafor/template */
  matter?: NodeType[]
  /** View-стили компонента */
  view?: string
  /** Масса */
  mass?: m
}
