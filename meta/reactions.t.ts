import type { Schema, Update, Values } from "@zavx0z/context"
import type { JsonPatch } from "../atom/em.t"
import type { Core } from "../atom/gravity.t"
import type { ReactionFilterConditions } from "../atom/src/condition.t"
import type { ReactionParams } from "../atom/src/reactions.t"
import type { Self } from "../atom/atom"

/**
 * Конфигурация одной реакции
 *
 * Содержит название, описание, функцию фильтрации и функцию обновления.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Core - тип core объекта
 *
 * @example
 * ```typescript
 * const reaction: Reaction<MyContext, "idle" | "loading"> = {
 *   label: "Обработка сообщений",
 *   desc: "Обрабатывает входящие сообщения от пользователей",
 *   filter: ({ meta, patch }) => {
 *     return meta === "user" && patch.op === "replace"
 *   },
 *   update: ({ update, context, patch }) => {
 *     update({
 *       lastMessage: patch.value,
 *       messageCount: context.messageCount + 1
 *     })
 *   }
 * }
 * ```
 */
export type Reaction<C extends Schema, S extends string, I extends Core> = {
  /** Название реакции для документации */
  label: string
  /** Описание реакции для документации */
  desc?: string
  /** Функция фильтрации событий */
  filter: (args: ReactionParams) => boolean
  /** Функция обработки события */
  update: ReactionAction<C, S, I>
}

/**
 * Цепочка для создания массива реакций
 *
 * Позволяет создавать массив реакций с группировкой по состояниям.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Core - тип core объекта
 *
 * @example
 * ```typescript
 * const reactions: ReactionsChain<MyContext, "idle" | "loading"> = (reaction) => [
 *   [
 *     ["idle", "loading"], // Состояния
 *     reaction({ label: "Обработка сообщений" })
 *       .filter(({ self }) => ({ meta: "user", atom: self.atom.split("/")[1] }))
 *       .equal(({ update, patch }) => {
 *         update({ lastMessage: patch.value })
 *       })
 *   ]
 * ]
 * ```
 */

export type ReactionsDeclaration<C extends Schema, S extends string, I extends Core> = (
  reaction: (config?: {
    /** Название реакции */
    label?: string
    /** Описание реакции */
    desc?: string
  }) => {
    /**
     * Добавляет декларативные фильтры для реакции
     *
     * Принимает функцию, которая на основе текущего контекста и идентификатора актора
     * возвращает объект с условиями фильтрации. Условия могут включать проверки по:
     * - `meta` - название компонента-отправителя из MetaFor("label") (строка, регулярное выражение, объект с условиями)
     * - `atom` - идентификатор актора-отправителя
     * - `path` - путь к изменяемому полю ("/context", "/state", "/")
     * - `op` - операция патча ("add", "remove", "replace")
     * - `value` - значение патча (с поддержкой расширенных условий для строк, чисел, булевых, массивов)
     * - `timestamp` - временная метка события
     *
     * Функция фильтра получает доступ к `self` (идентификатор актора) и `context` (текущий контекст),
     * что позволяет создавать динамические условия на основе состояния системы.
     *
     * @param filter - Функция, принимающая `{ self, context }` и возвращающая объект условий фильтрации
     * @returns Объект с методом `equal` для завершения цепочки создания реакции
     *
     * @example
     * ```typescript
     * reaction({ label: "Обработка сообщений" })
     *   .filter(({ self, context }) => ({
     *     meta: "user",
     *     path: "/context",
     *     value: { gt: 0 }
     *   }))
     *   .equal(({ update, patch }) => update({ lastMessage: patch.value }))
     * ```
     */
    filter: (filter: (params: { self: Self; context: Values<C> }) => ReactionFilterConditions) => {
      /**
       * Добавляет функцию обработки события реакции
       *
       * Функция вызывается автоматически, когда все условия фильтра выполнены.
       * Получает полный доступ к параметрам события:
       * - `update` - функция для обновления контекста
       * - `context` - текущий контекст
       * - `core` - core объект для хранения состояния
       * - `meta` - название компонента-отправителя из MetaFor("label")
       * - `atom` - идентификатор актора-отправителя
       * - `timestamp` - временная метка события
       * - `patch` - JSON Patch с данными изменения
       * - `state` - текущее состояние
       * - `self` - полный идентификатор актора
       *
       * Функция может использовать `update()` для изменения контекста, обращаться к `core`
       * для работы с внешним состоянием, анализировать `patch` для получения данных события.
       *
       * @param reaction - Функция обработки события, вызываемая при срабатывании реакции
       * @returns Объект реакции с методом `registerStates` для регистрации состояний
       *
       * @example
       * ```typescript
       * .equal(({ update, context, patch, core }) => {
       *   // Обновление контекста
       *   update({
       *     lastMessage: patch.value,
       *     messageCount: context.messageCount + 1
       *   })
       *   // Работа с core объектом
       *   core.log.push({ message: patch.value, time: Date.now() })
       * })
       * ```
       */
      equal: (reaction: ReactionAction<C, S, I>) => Reaction<C, S, I> & {
        /**
         * Внутренний метод для регистрации состояний реакции в схеме
         *
         * Автоматически вызывается при построении схемы реакций для связывания реакций
         * с состояниями, в которых они должны быть активны. Метод добавляет ID реакции
         * в объект состояний схемы, создавая обратную связь: для каждого состояния
         * хранится список ID реакций, которые должны выполняться в этом состоянии.
         *
         * Метод не предназначен для прямого вызова пользователем. Он используется
         * автоматически при обработке результата цепочки `ReactionsDeclaration`, где
         * каждая реакция возвращается в виде кортежа `[состояния[], реакция]`.
         *
         * @param states - Массив состояний, в которых реакция должна быть активна
         *
         * @internal
         */
        registerStates: (states: S[]) => void
      }
    }
  }
) => ReactionsChainResult<C, S, I>

/** Схема реакций */
export type ReactionsSchema = {
  reactions: Record<
    string,
    {
      label: string
      desc?: string
      cond: string
      read?: string[]
      write?: string[]
      src: string
    }
  >
  states: Record<string, string[]>
}
/**
 * Функция обновления контекста
 *
 * Вызывается когда реакция срабатывает и фильтр прошел успешно.
 * Получает все необходимые данные для обработки события.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Core - тип core объекта
 *
 * @includeExample ./react/test/reactions.basic.spec.ts
 * @includeExample ./react/test/reactions.execution.spec.ts
 *
 * @example
 * ```typescript
 * const updateFn: ReactionUpdate<MyContext, "idle" | "loading"> = ({
 *   update,    // Функция для обновления контекста
 *   context,   // Текущий контекст
 *   core,      // Ядро
 *   meta,      // имя meta
 *   atom,      // ID атома
 *   timestamp, // Временная метка
 *   patch,     // Патч данных
 *   state,     // Текущее состояние
 *   self       // Полный идентификатор атома
 * }) => {
 *   // Обработка события
 *   update({
 *     lastMessage: patch.value,
 *     messageCount: context.messageCount + 1
 *   })
 * }
 * ```
 */

export type ReactionAction<C extends Schema, S extends string, I extends Core> = (args: {
  /** Функция для обновления контекста */
  update: Update<C>
  /** Текущий контекст */
  context: Values<C>
  /** Ядро */
  core: I
  /** Название компонента-отправителя из MetaFor("label") */
  meta: string
  /** Информация об акторе */
  atom: string
  /** Временная метка */
  timestamp: number
  /** Патч для применения к актору */
  patch: JsonPatch
  /** Текущее состояние */
  state: S
  /** Идентификатор актора */
  self: Self
}) => void /** Результат цепочки реакций */

export type ReactionsChainResult<C extends Schema, S extends string, I extends Core> = [
  S[],
  Reaction<C, S, I> & {
    /**
     * Внутренний метод для регистрации состояний реакции в схеме
     *
     * Автоматически вызывается при построении схемы реакций для связывания реакций
     * с состояниями, в которых они должны быть активны. Метод добавляет ID реакции
     * в объект состояний схемы, создавая обратную связь: для каждого состояния
     * хранится список ID реакций, которые должны выполняться в этом состоянии.
     *
     * Метод не предназначен для прямого вызова пользователем. Он используется
     * автоматически при обработке результата цепочки `ReactionsDeclaration`, где
     * каждая реакция возвращается в виде кортежа `[состояния[], реакция]`.
     *
     * @param states - Массив состояний, в которых реакция должна быть активна
     *
     * @internal
     */
    registerStates: (states: S[]) => void
  }
][]
