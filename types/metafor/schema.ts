import type { Fields, Field, Update, Values } from "./fields.ts"
import type { ProcessesDeclaration, ProcessesSchema } from "./process.ts"
import type { MatterDeclaration, MatterSchema } from "./matter.ts"
import type { ReactionsSchema } from "./reactions.ts"
import type { SuperpositionInputCheck, SuperpositionStateKeys } from "./superposition.ts"
import type { ReactionsDeclaration } from "./reactions.ts"
import type { ParticleOperation } from "shared/protocol/force/particle"

export interface BulkSchema {
  view: string
}

/**
 * Подготовленное поле DSL с ключом, встроенным в значение.
 *
 * @prop key — ключ поля внутри декларации WIMP.
 */
export type MetaFieldDSL = Fields[string] & {key: string}

/**
 * Подготовленное состояние DSL с именем, встроенным в значение.
 *
 * @prop name — имя состояния внутри декларации WIMP.
 * @prop transitions — описание переходов из этого состояния.
 */
export interface MetaSuperpositionDSL {
  name: string
  transitions?: unknown
}

/**
 * Подготовленный процесс DSL с ключом, встроенным в значение.
 *
 * @prop key — ключ процесса внутри декларации WIMP.
 * @prop declaration — распарсенная декларация процесса.
 */
export interface MetaProcessDSL {
  key: string
  declaration: ProcessesSchema[string]
}

/**
 * Подготовленная реакция DSL с ключом и состояниями, встроенными в значение.
 *
 * @prop key — ключ реакции внутри декларации WIMP.
 * @prop label — человекочитаемое имя реакции.
 * @prop desc — опциональное описание реакции.
 * @prop cond — исходник условия реакции.
 * @prop src — исходник update-функции реакции.
 * @prop read — ключи полей, которые реакция читает.
 * @prop write — ключи полей, которые реакция пишет.
 * @prop states — имена состояний, в которых реакция активна.
 */
export interface MetaReactionDSL {
  key: string
  label: string
  desc?: string | null | undefined
  cond: string
  src: string
  read?: readonly string[] | undefined
  write?: readonly string[] | undefined
  states?: readonly string[] | undefined
}

export interface ReactionPart {
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
 * Mass — сериализуемый изменяемый рабочий материал исполнения.
 *
 * Process читает и изменяет Mass, получая из неё промежуточные данные,
 * накопленные результаты и материализуемые артефакты. Живые runtime-сущности
 * среды (WebSocket, BroadcastChannel и подобные ресурсы) принадлежат Energy.
 *
 * Масса не сериализуется в Boundary — она проявляется только в Volume.
 *
 * @example
 * ```typescript
 * const mass: Mass = { profiles: {}, attempts: 0 }
 * ```
 */
export interface Mass {
  [key: string]: any
}

type ExecutableValue = (...args: any[]) => any

type IsAny<T> = 0 extends (1 & T) ? true : false

type SerializableMassResult<T> = IsAny<T> extends true
  ? false
  : T extends null | string | number | boolean
    ? true
    : T extends readonly (infer Item)[]
      ? IsSerializableMassValue<Item>
      : T extends ExecutableValue
        ? false
        : T extends object
          ? Extract<keyof T, symbol> extends never
            ? Extract<T[keyof T], ExecutableValue> extends never
              ? false extends {
                  [K in keyof T]-?: IsSerializableMassValue<T[K]>
                }[keyof T]
                ? false
                : true
              : false
            : false
          : false

type IsSerializableMassValue<T> = IsAny<T> extends true
  ? false
  : false extends (T extends unknown ? SerializableMassResult<T> : never)
    ? false
    : true

export type MassDeclaration<m extends Mass> = {
  [K in keyof m]: IsSerializableMassValue<m[K]> extends true ? m[K] : never
}

/**
 * Energy — постоянно типизированный набор живых runtime-сущностей Process.
 *
 * DSL объявляет только типы этих сущностей. Реальные значения создаются
 * action-модулями и освобождаются destroy-процессом; функции не являются
 * допустимыми значениями верхнего уровня Energy declaration.
 */
export interface Energy {
  [key: string]: any
}

export type EnergyDeclaration<e extends Energy> = {
  [K in keyof e]: [Extract<e[K], ExecutableValue>] extends [never] ? e[K] : never
}

export type EnergyInputCheck<e extends Energy> =
  e extends EnergyDeclaration<e> ? [] : [energy: never]

declare const MetaDSLEnergyType: unique symbol

/**
 * MetaFor — фабрика для создания web-компонента-атома конечного автомата
 * @param name - имя атома (используется для создания тега `meta-${name}`)
 * @returns chain API: fields() -> superposition() -> mass() -> energy() -> processes() -> reactions() -> matter() -> bulk()
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
 * - `mass()` - декларация изменяемого рабочего материала
 * - `energy()` - декларация типов живых runtime-сущностей
 * - `processes()` - определение процессов (действий)
 * - `reactions()` - определение реакций на события
 * - `matter()` - определение иерархии атомов компонента
 * - `bulk()` - определение bulk-view компонента
 *
 * Для `matter` dynamic `src`, зависящий от `enum`, должен писаться напрямую:
 * `<meta-for src="demo/app/${value.mode}" />`.
 * Дополнительный `value.mode && ...` для защиты от `null` не нужен.
 *
 * @example
 * ```typescript
 * const component = MetaFor("my-component")
 *   .fields((field) => ({ mode: field.enum("summary", "details").required("summary") }))
 *   .superposition({ idle: { loading: {} } })
 *   .mass({ users: [] })
 *   .energy<{socket: WebSocket}>()
 *   .processes((process) => [process("loading").action(...)])
 *   .reactions((reaction) => [...])
 *   .matter(({ value, html }) => html`
 *     ${value.mode === "summary"
 *       ? html`<meta-for src="demo/app/summary" />`
 *       : html`<meta-for src="demo/app/details" />`}
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
       * Mass — изменяемый рабочий материал Process.
       * Mass доступен в процессах, destroy, реакциях и Matter.
       *
       * @returns chain API для вызова .energy(...)
       *
       * @example
       * ```typescript
       * .mass({
       *   users: [],
       *   settings: { theme: 'dark' },
       *   cache: new Map()
       * })
       * ```
       * @param mass
       */
      mass<m extends Mass>(
        mass?: m & MassDeclaration<m>,
      ): {
        /**
         * Объявляет постоянно типизированные runtime-сущности Energy.
         *
         * Generic существует только для TypeScript и не создаёт runtime-объект,
         * placeholder, соединение или функцию. Реальные сущности создаются во
         * внешних action-модулях и освобождаются через destroy.
         *
         * @example
         * ```typescript
         * .energy<{
         *   channel: BroadcastChannel
         *   socket: WebSocket
         * }>()
         * ```
         */
        energy<e extends Energy = {}>(
          ..._check: EnergyInputCheck<e>
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
        processes(process?: ProcessesDeclaration<ɸ, SuperpositionStateKeys<ψ>, m, ψ, e>): {
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
             * @param matter Функция matter для иерархии атомов
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
             *   .matter(({ state, html }) => html`${state === "idle" && html`<meta-for src="demo/app/panel" />`}`)
             *   .bulk({
             *     view: ({ css }) => css`.container { color: blue; }`
             *   })
             *
             * // Создание элемента с именем компонента
             * document.body.innerHTML = `<meta-my-component></meta-my-component>`
             * ```
             */
            matter(matter?: MatterDeclaration<ɸ, m, SuperpositionStateKeys<ψ>, e>): {
              /**
               * Регистрирует bulk-view конфигурацию компонента и завершает конфигурацию.
               *
               * @param bulk Конфигурация bulk-view
               * @returns Компонент для создания элемента с тегом `meta-${name}`
               */
              bulk(bulk?: BulkDeclaration): MetaDSL<ɸ, SuperpositionStateKeys<ψ>, m, e>
            }
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
   * @returns chain API: fields() -> superposition() -> mass() -> energy() -> processes() -> reactions() -> matter() -> bulk()
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
   * - `mass()` - декларация типа изменяемого рабочего материала
   * - `energy()` - декларация типов живых runtime-сущностей
   * - `processes()` - определение процессов (действий)
   * - `reactions()` - определение реакций на события
 * - `matter()` - определение иерархии атомов компонента
   * - `bulk()` - определение bulk-view компонента
   *
   * @example
   * ```typescript
   * const component = MetaFor("my-component")
   *   .fields((field) => ({ mode: field.enum("summary", "details").required("summary") }))
   *   .superposition({ idle: { loading: {} } })
   *   .mass({ users: [] })
   *   .energy<{socket: WebSocket}>()
   *   .processes((process) => [process("loading").action(...)])
   *   .reactions((reaction) => [...])
   *   .matter(({ value, html }) => html`
   *     ${value.mode === "summary"
   *       ? html`<meta-for src="demo/app/summary" />`
   *       : html`<meta-for src="demo/app/details" />`}
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
export interface MetaForConfig {
  /** Описание компонента */
  desc?: string
  /** Режим разработки */
  dev?: boolean
}

/**
 * Параметры функции matter атома.
 *
 * Предназначены для декларирования иерархии атомов через `<meta-for>`.
 *
 * ## API
 * - `state` — текущее состояние для условий matter
 * - `html` — шаблонизация для `<meta-for>` элементов
 * - `value` — данные атома для передачи дочерним атомам
 * - `update` — функция обновления контекста
 * - `mass` — изменяемый рабочий материал
 *
 * Matter описывает только иерархию атомов.
 * Выбор topology в matter допускается только по `state`, `enum` и `array`.
 * Обычные HTML-элементы и текст должны жить вне matter.
 *
 * @example
 * ```ts
 * // Иерархия атомов на основе состояния
 * matter: ({ state, html }) => html`
 *   ${state === "коммит" && html`<meta-for src="demo/app/status" fields=${{ message: "В процессе..." }} />`}
 *   ${state === "завершено" && html`<meta-for src="demo/app/success" fields=${{ message: "Готово!" }} />`}
 *   ${state === "ошибка" && html`<meta-for src="demo/app/error" fields=${{ message: "Ошибка" }} />`}
 * `
 *
 * // Передача данных дочернему атому
 * matter: ({ value, html }) => html`
 *   <meta-for src="demo/app/child" fields=${{ data: value.data }} />
 * `
 *
 * // Несколько атомов в иерархии
 * matter: ({ html }) => html`
 *   <meta-for src="demo/app/header" />
 *   <meta-for src="demo/app/content" />
 *   <meta-for src="demo/app/footer" />
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
 * процессы, реакции, Mass и Energy declaration. Используется для создания атомов.
 *
 * @template ɸ - Тип полей (схема полей)
 * @template 𝛴 - Тип состояний (строковые литералы)
 * @template m - Тип изменяемого рабочего материала Mass
 * @template e - Тип runtime-сущностей Energy
 *
 * @example
 * ```typescript
 * const schema: MetaDSL = {
 *   name: "user-profile",
 *   fields: [{ key: "name", type: "string", required: true, default: "" }],
 *   superposition: [{ name: "idle", transitions: { loading: {} } }],
 *   mass: { users: [] },
 *   // Energy declaration не является runtime-полем MetaDSL.
 * }
 * ```
 */
export interface MetaDSL<
  ɸ extends Fields = Fields,
  𝛴 extends string = string,
  m extends Mass = {},
  e extends Energy = {},
> {
  /** Название компонента */
  name: string
  /** Описание компонента */
  desc?: string
  /** Суперпозиция состояний и переходов */
  superposition: readonly MetaSuperpositionDSL[]
  /** Снимок процессов */
  processes?: readonly MetaProcessDSL[]
  /** Снимок реакций */
  reactions?: readonly MetaReactionDSL[]
  /** Схема полей */
  fields: readonly MetaFieldDSL[]
  /** Нормализованная matter-проекция, готовая для записи WIMP-декларации */
  matter?: MatterSchema
  /** Канонический bulk-слой */
  bulk?: BulkSchema
  /** Масса */
  mass?: m
  /** Phantom-type Energy declaration; runtime-поля и сериализации не создаёт. */
  readonly [MetaDSLEnergyType]?: e
}
