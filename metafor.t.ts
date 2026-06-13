import type { Fields, Field, Update, Values } from "./fields.t.ts"
import type { ProcessesDeclaration, ProcessesSchema } from "./process.t.ts"
import type { MatterDeclaration, MatterSchema } from "./matter.t.ts"
import type { ReactionsSchema } from "./reactions.t.ts"
import type { Superposition, SuperpositionInputCheck, SuperpositionStateKeys } from "./superposition.t.ts"
import type { ReactionsDeclaration } from "./reactions.t.ts"
import type { ParticleOperation } from "./store/index.ts"

export type SRC = string
export type FieldKey = string
export type FieldDefinition = Fields[string]
export type FieldsSchema = Record<FieldKey, FieldDefinition>
export interface BulkSchema {
  view: string
}

/**
 * Часть MetaDSL, подготовленная для создания WIMP в Store.
 *
 * @prop name — имя WIMP-декларации.
 * @prop desc — описание WIMP-декларации.
 * @prop bulk — bulk/view-настройки декларации.
 * @prop mass — mass-данные декларации.
 * @prop fields — поля декларации с ключами, уже разложенные из object-map.
 * @prop states — состояния декларации с именами, уже разложенные из object-map.
 * @prop processes — процессы декларации с ключами, уже разложенные из object-map.
 * @prop reactions — реакции декларации с ключами и привязкой к состояниям.
 */
export type MetaCreateDSL<m extends Mass = {}> = {
  name?: string | null | undefined
  desc?: string | null | undefined
  bulk?: BulkSchema | null | undefined
  mass?: m
  fields?: readonly (FieldDefinition & {key: FieldKey})[] | undefined
  states?: readonly {name: string; transitions?: unknown}[] | undefined
  processes?: readonly {key: string; declaration: ProcessesSchema[string]}[] | undefined
  reactions?: readonly {
    key: string
    label: string
    desc?: string | null | undefined
    cond: string
    src: string
    read?: readonly string[] | undefined
    write?: readonly string[] | undefined
    states?: readonly string[] | undefined
  }[] | undefined
}

export type ReactionPart = {
  from?: string
  op: ParticleOperation
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
 *   .processes((process) => [process("loading").action(...)])
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
   * @param fields Функция, принимающая field и возвращающая объект-схему полей
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
  fields<ɸ extends Fields>(
    fields: (field: Field) => ɸ,
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
    superposition<const ψ extends Record<string, unknown>>(
      superposition: ψ,
      ..._check: SuperpositionInputCheck<ɸ, ψ>
    ): {
      /**
       * Регистрирует mass объект для автомата.
       *
       * Mass — это мера взаимодействия со средой исполнения.
       * Масса накапливается в процессе исполнения и определяет локализацию процесса.
       * Mass доступен во всех процессах и реакциях.
       *
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
       * @param mass
       */
      mass<m extends Mass>(
        mass?: m,
      ): {
        /**
         * Регистрирует процессы автомата для нужных состояний.
         *
         * @param process Функция, принимающая process — фабрику chain API для описания процессов.
         * Возвращает массив процессов или destroy-хуков, где superposition привязывается прямо в `process(state, ...)` / `destroy(state, ...)`.
         *
         * Пример:
         * ```ts
         * .processes(process => [
         *   process("guest", { label: "guest_process", desc: "Процесс для гостя" })
         *     .action(({ value }) => { ... })
         *     .success(({ update, data }) => update({ ... }))
         *     .error(({ update, error }) => update({ ... })),
         *   // для других суперпозиций можно не указывать процесс, если он не требуется
         * ])
         * ```
         *
         * @returns Массив процессов и destroy-хуков только для нужных суперпозиций
         */
        processes(process?: ProcessesDeclaration<ɸ, SuperpositionStateKeys<ψ>, m, ψ>): {
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
           *     update: ({ update, field, part }) => {
           *       update({
           *         lastMessage: part.value,
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
          reactions(reaction?: ReactionsDeclaration<ɸ, SuperpositionStateKeys<ψ>, m>): {
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
            matter(matter?: MatterDeclaration<ɸ, m, SuperpositionStateKeys<ψ>>): {
              /**
               * Регистрирует bulk-view конфигурацию компонента и завершает конфигурацию.
               *
               * @param bulk Конфигурация bulk-view
               * @returns Компонент для создания элемента с тегом `meta-${name}`
               */
              bulk(bulk?: BulkDeclaration): MetaDSL<ɸ, SuperpositionStateKeys<ψ>, m>
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
    MetaFor: MetaForFn
  }
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
   *   .processes((process) => [process("loading").action(...)])
   *   .reactions((reaction) => [...])
   *   .matter(({ value, html }) => html`
   *     ${value.mode === "summary"
   *       ? html`<meta-for src="demo/summary" />`
   *       : html`<meta-for src="demo/details" />`}
   *   `)
   *   .bulk()
   * ```
   */
  var MetaFor: MetaForFn
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
 * @template ɸ - Тип полей (схема полей)
 * @template 𝛴 - Тип состояний (строковые литералы)
 * @template m - Тип массы (объект для сложных данных и зависимостей от среды)
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
export interface MetaDSL<ɸ extends Fields = Fields, 𝛴 extends string = string, m extends Mass = {}> {
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
  matter?: MatterSchema
  /** Канонический bulk-слой */
  bulk?: BulkSchema
  /** Масса */
  mass?: m
  /** Подготовленная SQL-create часть DSL */
  create: MetaCreateDSL<m>
}

export type MetaSchema<ɸ extends Fields = Fields, 𝛴 extends string = string, m extends Mass = {}> = MetaDSL<ɸ, 𝛴, m>
