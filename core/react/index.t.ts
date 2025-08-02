/**
 * Типы для реакций
 * @packageDocumentation
 * @module Reactions
 */

import type { ContextSchema, ExtractValues } from "../context/index.t"
import type { JsonPatch, MetaDataMessage } from "../message"
import type {
  CondStringRequired,
  CondNumberRequired,
  CondBooleanRequired,
  CondArrayRequired,
  Condition,
  ConditionOptional,
} from "../state/index.t"

/**
 * Аргументы для функции фильтрации
 *
 * Содержит метаданные сообщения и патч для проверки условий фильтра.
 *
 * @includeExample ./react/test/reactions.basic.spec.ts
 * @includeExample ./react/test/reactions.execution.spec.ts
 */
export type ReactionFilterArgs = {
  /** Метаданные сообщения (тег, индекс, временная метка) */
  meta: MetaDataMessage
  /** JSON Patch с операцией, путем и значением */
  patch: JsonPatch
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
 *   core,      // Core объект
 *   meta,      // Метаданные сообщения
 *   patch,     // JSON Patch
 *   state      // Текущее состояние
 * }) => {
 *   // Обработка события
 *   update({
 *     lastMessage: patch.value,
 *     messageCount: context.messageCount + 1
 *   })
 * }
 * ```
 */
export type ReactionUpdate<C extends ContextSchema, S extends string, Core = Record<string, any>> = (args: {
  /** Функция для обновления контекста */
  update: (values: Partial<ExtractValues<C>>) => void
  /** Текущий контекст */
  context: ExtractValues<C>
  /** Core объект */
  core: Core
  /** Метаданные сообщения */
  meta: MetaDataMessage
  /** JSON Patch */
  patch: JsonPatch
  /** Текущее состояние */
  state: S
}) => void

/**
 * Декларативные условия фильтрации реакций
 *
 * Плоская структура с расширенными возможностями для meta и patch.
 * Позволяет фильтровать события по различным критериям.
 *
 * @example
 * ```typescript
 * const conditions: ReactionFilterConditions = {
 *   tag: "user",                    // Фильтр по тегу
 *   op: "replace",                  // Фильтр по операции
 *   path: "/context",               // Фильтр по пути
 *   value: { gt: 0 },               // Фильтр по значению
 *   index: { gte: 0 },              // Фильтр по индексу
 *   timestamp: { gt: Date.now() }   // Фильтр по временной метке
 * }
 * ```
 */
export type ReactionFilterConditions = {
  /** 
   # Фильтрация по тегу 
   
   1. Прямое сравнение строки с условием
    - tag: "test" - тег должен быть равен "test"
    - tag: /test/ - тег должен соответствовать регулярному выражению /test/ (без кавычек)
   
   2. Сравнение с условием
    - tag: { eq: "test" } - тег должен быть равен "test"
    - tag: { pattern: /test/ } - тег должен соответствовать регулярному выражению /test/

   Условия сравнения:
   | Параметр       | Тип                                  | Описание                              |
   | -------------- | ------------------------------------ | ------------------------------------- |
   | startsWith     | string                               | Начинается ли с указанной строки      |
   | endsWith       | string                               | Заканчивается ли на указанную строку  |
   | include        | string                               | Включает ли указанную подстроку       |
   | pattern        | RegExp                               | Шаблон регулярного выражения          |
   | eq             | string                               | Равно указанной строке                |
   | notEq          | string                               | Не равно указанной строке             |
   | notInclude     | string                               | Не включает указанную подстроку       |
   | notStartsWith  | string                               | Не начинается с указанной строки      |
   | notEndsWith    | string                               | Не заканчивается на указанную строку  |
   | length         | number \| { min?: number; max?: number } | Длина строки                      |
   | between        | [string, string]                     | Должно быть между двумя строками      |
   
   @example
   ```typescript
   // Простые фильтры
   tag: "user"
   tag: /^user_/
   
   // Сложные фильтры
   tag: { 
     startsWith: "user",
     notInclude: "admin"
   }
   tag: { 
     pattern: /^[a-z]+_[0-9]+$/,
     length: { min: 3, max: 20 }
   }
   ```
  */
  tag?: CondStringRequired
  /** 
   # Фильтрация по индексу 
   
   1. Прямое сравнение числа с условием
    - index: 5 - индекс должен быть равен 5
   
   2. Сравнение с условием
    - index: { eq: 5 } - индекс должен быть равен 5
    - index: { gt: 3 } - индекс должен быть больше 3

   Условия сравнения:
   | Параметр       | Тип                                  | Описание                              |
   | -------------- | ------------------------------------ | ------------------------------------- |
   | eq             | number                               | Равно указанному числу                |
   | notEq          | number                               | Не равно указанному числу             |
   | gt             | number                               | Больше указанного числа               |
   | gte            | number                               | Больше или равно указанному числу     |
   | lt             | number                               | Меньше указанного числа               |
   | lte            | number                               | Меньше или равно указанному числу     |
   | notGt          | number                               | Не больше указанного числа            |
   | notGte         | number                               | Не больше или равно указанному числу  |
   | notLt          | number                               | Не меньше указанного числа            |
   | notLte         | number                               | Не меньше или равно указанному числу  |
   | between        | [number, number]                     | Должно быть между двумя числами       |
   
   @example
   ```typescript
   // Простые фильтры
   index: 0
   index: { gt: 10 }
   
   // Сложные фильтры
   index: { 
     gte: 0,
     lte: 100
   }
   index: { 
     between: [1, 10],
     notEq: 5
   }
   ```
  */
  index?: CondNumberRequired
  /** 
   # Фильтрация по временной метке 
   
   1. Прямое сравнение числа с условием
    - timestamp: 1640995200000 - временная метка должна быть равна 1640995200000
   
   2. Сравнение с условием
    - timestamp: { eq: 1640995200000 } - временная метка должна быть равна 1640995200000
    - timestamp: { gt: 1640995200000 } - временная метка должна быть больше 1640995200000

   Условия сравнения:
   | Параметр       | Тип                                  | Описание                              |
   | -------------- | ------------------------------------ | ------------------------------------- |
   | eq             | number                               | Равно указанному числу                |
   | notEq          | number                               | Не равно указанному числу             |
   | gt             | number                               | Больше указанного числа               |
   | gte            | number                               | Больше или равно указанному числу     |
   | lt             | number                               | Меньше указанного числа               |
   | lte            | number                               | Меньше или равно указанному числу     |
   | notGt          | number                               | Не больше указанного числа            |
   | notGte         | number                               | Не больше или равно указанному числу  |
   | notLt          | number                               | Не меньше указанного числа            |
   | notLte         | number                               | Не меньше или равно указанному числу  |
   | between        | [number, number]                     | Должно быть между двумя числами       |
   
   @example
   ```typescript
   // Фильтры по времени
   timestamp: { gt: Date.now() - 60000 }  // Последняя минута
   timestamp: { 
     gte: Date.now() - 3600000,           // Последний час
     lte: Date.now()
   }
   ```
  */
  timestamp?: CondNumberRequired
  /** 
   # Фильтрация по операции патча 
   
   Доступные операции:
   | Операция       | Описание                              |
   | -------------- | ------------------------------------- |
   | replace        | Замена значения по указанному пути    |
   | add            | Добавление нового значения по пути     |
   | remove         | Удаление значения по указанному пути   |
   | test           | Проверка значения по указанному пути   |
   
   Примеры использования:
   - op: "replace" - операция должна быть replace
   - op: "add" - операция должна быть add
   
   @example
   ```typescript
   // Фильтры по операции
   op: "replace"  // Только замены
   op: "add"      // Только добавления
   op: "remove"   // Только удаления
   ```
  */
  op?: "replace" | "add" | "remove" | "test"
  /** 
   # Фильтрация по пути патча 
   
   Доступные пути:
   | Путь           | Описание                              |
   | -------------- | ------------------------------------- |
   | /context       | Путь к контексту актора               |
   | /state         | Путь к состоянию актора               |
   | /              | Корневой путь (полный объект актора)  |
   
   Примеры использования:
   - path: "/context" - путь должен быть /context
   - path: "/state" - путь должен быть /state
   
   @example
   ```typescript
   // Фильтры по пути
   path: "/context"  // Только изменения контекста
   path: "/state"    // Только изменения состояния
   path: "/"         // Любые изменения
   ```
  */
  path?: "/context" | "/state" | "/"
  /** 
   # Фильтрация по значению патча 
   
   Поддерживает все типы значений с расширенными условиями сравнения.
   
   ## Строковые значения
   
   1. Прямое сравнение
    - value: "active" - значение должно быть равно "active"
    - value: /test/ - значение должно соответствовать регулярному выражению
   
   2. Расширенные условия
   
   | Параметр       | Тип                                  | Описание                              |
   | -------------- | ------------------------------------ | ------------------------------------- |
   | eq             | string                               | Равно указанной строке                |
   | notEq          | string                               | Не равно указанной строке             |
   | startsWith     | string                               | Начинается ли с указанной строки      |
   | endsWith       | string                               | Заканчивается ли на указанную строку  |
   | include        | string                               | Включает ли указанную подстроку       |
   | notInclude     | string                               | Не включает указанную подстроку       |
   | notStartsWith  | string                               | Не начинается с указанной строки      |
   | notEndsWith    | string                               | Не заканчивается на указанную строку  |
   | pattern        | RegExp                               | Шаблон регулярного выражения          |
   | length         | number \| { min?: number; max?: number } | Длина строки                      |
   | between        | [string, string]                     | Должно быть между двумя строками      |
   
   ## Числовые значения
   
   1. Прямое сравнение
    - value: 42 - значение должно быть равно 42
   
   2. Расширенные условия
   
   | Параметр | Тип              | Описание                              |
   | -------- | ---------------- | ------------------------------------- |
   | eq       | number           | Равно указанному числу                |
   | notEq    | number           | Не равно указанному числу             |
   | gt       | number           | Больше указанного числа               |
   | gte      | number           | Больше или равно указанному числу     |
   | lt       | number           | Меньше указанного числа               |
   | lte      | number           | Меньше или равно указанному числу     |
   | notGt    | number           | Не больше указанного числа            |
   | notGte   | number           | Не больше или равно указанному числу  |
   | notLt    | number           | Не меньше указанного числа            |
   | notLte   | number           | Не меньше или равно указанному числу  |
   | between  | [number, number] | Должно быть между двумя числами       |
   
   ## Булевы значения
   
   1. Прямое сравнение
    - value: true - значение должно быть true
   
   2. Расширенные условия
   
   | Параметр   | Тип     | Описание                           |
   | ---------- | ------- | ---------------------------------- |
   | eq         | boolean | Равно указанному булеву значению   |
   | notEq      | boolean | Не равно указанному булеву значению|
   | logicalEq  | boolean | Логическое равенство               |
   
   ## Массивы
   
   1. Прямое сравнение
    - value: [1, 2, 3] - массив должен быть равен [1, 2, 3]
   
   2. Расширенные условия
   
   | Параметр    | Тип              | Описание                              |
   | ----------- | ---------------- | ------------------------------------- |
   | length      | number \| { min?: number; max?: number } | Длина массива                    |
   | includes    | any              | Содержит ли массив указанный элемент  |
   | notIncludes | any              | Не содержит ли массив указанный элемент|
   | every       | { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number; include?: string } | Все элементы удовлетворяют условию |
   | some        | { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number; include?: string } | Хотя бы один элемент удовлетворяет условию |
   | isEmpty     | boolean          | Является ли массив пустым             |
   
   ## Null и undefined
   
   | Параметр | Тип     | Описание                    |
   | -------- | ------- | --------------------------- |
   | null     | boolean | Является ли значение null   |
   
   ## Объекты
   
   - value: { name: "test" } - объект должен быть равен { name: "test" }
   
   ## Комбинированные условия
   
   Можно комбинировать с другими фильтрами:
   ```typescript
   filter({
     value: { gt: 10, lt: 100 },
     op: "replace",
     path: "/context"
   })
   ```
   
   @example
   ```typescript
   // Простые фильтры
   value: "active"
   value: 42
   value: true
   value: [1, 2, 3]
   
   // Сложные фильтры
   value: { 
     gt: 0,
     lt: 100
   }
   value: { 
     startsWith: "user",
     length: { min: 3 }
   }
   value: { 
     includes: "admin",
     length: { min: 1 }
   }
   ```
  */
  value?: Condition<any> | ConditionOptional<any>
}

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
 *   title: "Обработка сообщений",
 *   description: "Обрабатывает входящие сообщения от пользователей",
 *   filter: ({ meta, patch }) => {
 *     return meta.tag === "user" && patch.op === "replace"
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
export type Reaction<C extends ContextSchema, S extends string, Core = Record<string, any>> = {
  /** Название реакции для документации */
  title: string
  /** Описание реакции для документации */
  description?: string
  /** Функция фильтрации событий */
  filter: (args: ReactionFilterArgs) => boolean
  /** Функция обработки события */
  update: ReactionUpdate<C, S, Core>
}

/**
 * Chain API для создания реакции
 *
 * Позволяет удобно создавать реакции с декларативными фильтрами.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Core - тип core объекта
 *
 * @example
 * ```typescript
 * const chain = reaction({
 *   title: "Обработка сообщений",
 *   description: "Обрабатывает входящие сообщения"
 * })
 *   .filter({
 *     tag: "user",
 *     op: "replace",
 *     path: "/context"
 *   })
 *   .equal(({ update, context, patch }) => {
 *     update({
 *       lastMessage: patch.value,
 *       messageCount: context.messageCount + 1
 *     })
 *   })
 * ```
 */
export type ReactionChain<C extends ContextSchema, S extends string, Core = Record<string, any>> = (config?: {
  /** Название реакции */
  title?: string
  /** Описание реакции */
  description?: string
}) => {
  /** Добавляет декларативные фильтры */
  filter: (conditions: ReactionFilterConditions) => {
    /** Добавляет функцию обработки события */
    equal: (updateFn: ReactionUpdate<C, S, Core>) => {
      /** Функция фильтрации */
      filter: (args: ReactionFilterArgs) => boolean
      /** Функция обработки */
      update: ReactionUpdate<C, S, Core>
      /** Название реакции */
      title: string
      /** Описание реакции */
      description?: string
    }
  }
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
 *     reaction({ title: "Обработка сообщений" })
 *       .filter({ tag: "user" })
 *       .equal(({ update, patch }) => {
 *         update({ lastMessage: patch.value })
 *       })
 *   ]
 * ]
 * ```
 */
export type ReactionsChain<C extends ContextSchema, S extends string, Core = Record<string, any>> = (
  reaction: ReactionChain<C, S, Core>
) => [
  S[], // Массив состояний
  {
    /** Функция фильтрации */
    filter: (args: ReactionFilterArgs) => boolean
    /** Функция обработки */
    update: ReactionUpdate<C, S, Core>
    /** Название реакции */
    title: string
    /** Описание реакции */
    description?: string
  }
][]

/**
 * Карта реакций по состояниям
 *
 * Внутренний тип для хранения реакций, сгруппированных по состояниям.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Core - тип core объекта
 */
export type ReactionsMap<C extends ContextSchema, S extends string, Core = Record<string, any>> = Map<
  S,
  Reaction<C, S, Core>[]
>

/**
 * Функция обновления контекста
 *
 * Упрощенный тип для функции обновления контекста.
 *
 * @template C - схема контекста
 *
 * @example
 * ```typescript
 * const update: Update<MyContext> = (values) => {
 *   // Обновление контекста
 *   console.log('Обновление:', values)
 * }
 * ```
 */
export type Update<C extends ContextSchema> = (values: Partial<ExtractValues<C>>) => void

/** Снимок реакций */
export type SnapshotReactions = {
  reactions: Record<
    string,
    {
      title: string
      description?: string
      filter: ReactionFilterConditions
      equal: {
        read?: string[]
        write?: string[]
      }
    }
  >
  states: Record<string, string[]>
}
