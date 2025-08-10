/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */
import type { ContextSchema } from "./context"
import type { ContextSnapshot, ContextTypes } from "./context/index.t"
import type { ProcessesDeclaration } from "./proc/index.t"
import type { SnapshotProcesses } from "./proc/parser.t"
import type { ReactionsDeclaration, SnapshotReactions } from "./react/index.t"
import type { StatesConfig } from "./state"
import type { ViewDeclaration } from "./view/index.t"
import type { Store } from "./store/index.t"

declare global {
  var DEV: boolean
}
export {}

export interface FingerPrint<C extends ContextSchema, S extends string> {
  /** Название компонента */
  name: string
  /** Описание компонента */
  description?: string
  /** Карта состояний и переходов */
  states: StatesConfig<S, C>
  /** Снимок процессов */
  processes?: SnapshotProcesses
  /** Снимок реакций */
  reactions?: SnapshotReactions
  /** Снимок контекста */
  context: ContextSnapshot<C>
  /** Сериализованный view как строка template literal */
  render?: string
  /** Стили компонента */
  style?: string
}

/**
 * Интерфейс снимка состояния компонента
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends ContextSchema, S extends string> extends FingerPrint<C, S> {
  /** Текущее состояние */
  state: S
  /** Индикатор выполнения процесса в текущем состоянии */
  process: boolean
}

/**
 *  Ядро компонента
 */
export type Core = Record<string, any>

/**
 * @internal
 * @description
 * Тип параметров для создания web-компонента-актора конечного автомата (Actor)
 */
export type FabricParams = {
  store: Store
  // /** Название компонента */
  // name: string
  // /** Описание компонента */
  // description: string | undefined
  // /** Схема контекста */
  // schema: (types: ContextTypes) => C
  // /** Конфигурация состояний */
  // states: StatesConfig<S, C>
  // /** Ядро компонента */
  // core: I
  // /** Процессы */
  // process: ProcessesDeclaration<C, S, I>
  // /** Реакции */
  // reaction: ReactionsDeclaration<C, S, I>
  // /** Конфигурация view */
  // view: ViewConfig<C, S, I> | undefined
  // /** Восстановление из последнего сохраненного состояния (snapshot) */
  // persist: boolean
}
/**
 * Конфигурация компонента MetaFor
 */
export type MetaForConfig = {
  /** Описание компонента */
  description?: string
  /** Режим разработки */
  dev?: boolean
  /**
   * Восстановление из последнего сохраненного состояния (snapshot)
   *
   * @default false
   */
  persist?: boolean
}
export interface ActorInternal extends HTMLElement {
  __updCore: (value: Partial<unknown>) => void
  __path: string[]
  update: (value: Partial<unknown>) => void
}
/**
 * MetaFor — фабрика для создания web-компонента-актора конечного автомата
 * @param name - имя актора (участвует в формировании хеша, но не является итоговым тегом)
 * @returns chain API: context() -> states() -> core() -> processes() -> reactions() -> view()
 *
 * **Важно:** Итоговый тег компонента формируется автоматически как `meta-<hash>`,
 * где hash — это MD5 хеш от всей конфигурации компонента.
 */

export type MetaForType = (
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
   *   theme: types.enum.required(["light", "dark"]),
   * }))
   * ```
   */
  context<C extends ContextSchema>(
    schema: (types: ContextTypes) => C
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
        coreBuilder?: (() => I) | I
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
        processes(process?: ProcessesDeclaration<C, S, I>): {
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
           *     filter: (args) => args.meta.tag === "roadmap" && args.patches[0]?.op === "replace",
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
          reactions(reaction?: ReactionsDeclaration<C, S, I>): {
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
            view(view?: ViewDeclaration<C, S, I>): string
          }
        }
      }
    }
  }
}
