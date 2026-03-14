import type { Schema, Update, Values } from "@zavx0z/context"
import type { Condition, ConditionOptional, CondNumberRequired, CondStringRequired } from "./states"
import type { JsonPatch, Mass, Self } from "./metafor"

export type ReactionParams = {
  meta: string
  atom: string
  timestamp: number
  patch: JsonPatch
  self: Self
}

/**
 * Декларативные условия фильтрации реакций
 *
 * Плоская структура с расширенными возможностями для meta и patch.
 * Позволяет фильтровать события по различным критериям.
 *
 * @example
 * ```typescript
 * const conditions: ReactionFilterConditions = {
 *   meta: "user",                   // Фильтр по мете атома
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
   # Фильтрация по мете атома

   1. Прямое сравнение строки с условием
    - meta: "test" - мета должна быть равна "test"
    - meta: /test/ - мета должна соответствовать регулярному выражению /test/ (без кавычек)

   2. Сравнение с условием
    - meta: { eq: "test" } - мета должна быть равна "test"
    - meta: { pattern: /test/ } - мета должна соответствовать регулярному выражению /test/

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
   | in             | string[]                             | Входит ли в указанный массив строк     |
   | notIn          | string[]                             | Не входит ли в указанный массив строк  |

   @example
   ```typescript
   // Простые фильтры
   meta: "user"
   meta: /^user_/

   // Сложные фильтры
   meta: {
     startsWith: "user",
     notInclude: "admin"
   }
   meta: {
     pattern: /^[a-z]+_[0-9]+$/,
     length: { min: 3, max: 20 }
   }
   meta: {
     in: ["user", "admin", "guest"]
   }
   ```
  */
  meta?: CondStringRequired
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
  atom?: CondStringRequired
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
   | /context       | Путь к контексту атома               |
   | /state         | Путь к состоянию атома               |
   | /              | Корневой путь (полный объект атома)  |

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
   | in       | number[]        | Входит ли в указанный массив чисел    |
   | notIn    | number[]        | Не входит ли в указанный массив чисел |

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
   value: {
     in: [1, 2, 3, 5, 8]
   }
   value: {
     notIn: [0, 4, 6, 7]
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
 * @template ɸ - схема полей
 * @template 𝛴 - строковые ключи состояний
 * @template m - тип mass объекта
 *
 * @example
 * ```typescript
 * const reaction: Reaction<MyFields, "idle" | "loading"> = {
 *   label: "Обработка сообщений",
 *   desc: "Обрабатывает входящие сообщения от пользователей",
 *   filter: ({ meta, patch }) => {
 *     return meta === "user" && patch.op === "replace"
 *   },
 *   update: ({ update, value, patch }) => {
 *     update({
 *       lastMessage: patch.value,
 *       messageCount: value.messageCount + 1
 *     })
 *   }
 * }
 * ```
 */
export type Reaction<ɸ extends Schema, 𝛴 extends string, m extends Mass> = {
  /** Название реакции для документации */
  label: string
  /** Описание реакции для документации */
  desc?: string
  /** Функция фильтрации событий */
  filter: (args: ReactionParams) => boolean
  /** Функция обработки события */
  update: ReactionAction<ɸ, 𝛴, m>
}

/**
 * Цепочка для создания массива реакций
 *
 * Позволяет создавать массив реакций с группировкой по суперпозициям.
 *
 * @template ɸ - схема полей
 * @template 𝛴 - строковые ключи состояний
 * @template m - тип mass объекта
 *
 * @example
 * ```typescript
 * const reactions: ReactionsChain<MyFields, "idle" | "loading"> = (reaction) => [
 *   [
 *     ["idle", "loading"], // Суперпозиции
 *     reaction({ label: "Обработка сообщений" })
 *       .filter(({ self }) => ({ meta: "user", atom: self.atom.split("/")[1] }))
 *       .equal(({ update, patch }) => {
 *         update({ lastMessage: patch.value })
 *       })
 *   ]
 * ]
 * ```
 */

export type ReactionsDeclaration<ɸ extends Schema, 𝛴 extends string, m extends Mass> = (
  reaction: (config?: {
    /** Название реакции */
    label?: string
    /** Описание реакции */
    desc?: string
  }) => {
    /**
     * Добавляет декларативные фильтры для реакции
     *
     * Принимает функцию, которая на основе текущих полей и идентификатора актора
     * возвращает объект с условиями фильтрации. Условия могут включать проверки по:
     * - `meta` - название компонента-отправителя из MetaFor("label") (строка, регулярное выражение, объект с условиями)
     * - `atom` - идентификатор актора-отправителя
     * - `path` - путь к изменяемому полю ("/fields", "/state", "/")
     * - `op` - операция патча ("add", "remove", "replace")
     * - `value` - значение патча (с поддержкой расширенных условий для строк, чисел, булевых, массивов)
     * - `timestamp` - временная метка события
     *
     * Функция фильтра получает доступ к `self` (идентификатор актора) и `value` (текущие значения полей),
     * что позволяет создавать динамические условия на основе состояния системы.
     *
     * @param filter - Функция, принимающая `{ self, value }` и возвращающая объект условий фильтрации
     * @returns Объект с методом `equal` для завершения цепочки создания реакции
     *
     * @example
     * ```typescript
     * reaction({ label: "Обработка сообщений" })
     *   .filter(({ self, value }) => ({
     *     meta: "user",
     *     path: "/fields",
     *     value: { gt: 0 }
     *   }))
     *   .equal(({ update, patch }) => update({ lastMessage: patch.value }))
     * ```
     */
    filter: (filter: (params: { self: Self; value: Values<ɸ> }) => ReactionFilterConditions) => {
      /**
       * Добавляет функцию обработки события реакции
       *
       * Функция вызывается автоматически, когда все условия фильтра выполнены.
       * Получает полный доступ к параметрам события:
       * - `update` - функция для обновления полей
       * - `value` - текущие значения полей
       * - `mass` - mass объект для хранения состояния
       * - `meta` - название компонента-отправителя из MetaFor("label")
       * - `atom` - идентификатор актора-отправителя
       * - `timestamp` - временная метка события
       * - `patch` - JSON Patch с данными изменения
       * - `state` - текущее состояние
       * - `self` - полный идентификатор актора
       *
       * Функция может использовать `update()` для изменения полей, обращаться к `mass`
       * для работы с внешним состоянием, анализировать `patch` для получения данных события.
       *
       * @param reaction - Функция обработки события, вызываемая при срабатывании реакции
       * @returns Объект реакции с методом `registerStates` для регистрации состояний
       *
       * @example
       * ```typescript
       * .equal(({ update, value, patch, mass }) => {
       *   // Обновление контекста
       *   update({
       *     lastMessage: patch.value,
       *     messageCount: value.messageCount + 1
       *   })
       *   // Работа с mass объектом
       *   mass.log.push({ message: patch.value, time: Date.now() })
       * })
       * ```
       */
      equal: (reaction: ReactionAction<ɸ, 𝛴, m>) => Reaction<ɸ, 𝛴, m> & {
        /**
         * Внутренний метод для регистрации состояний реакции в схеме
         *
         * Автоматически вызывается при построении схемы реакций для связывания реакций
         * с состояниями, в которых они должны быть активны. Метод добавляет ID реакции
         * в объект суперпозиций схемы, создавая обратную связь: для каждой суперпозиции
         * хранится список ID реакций, которые должны выполняться в этой суперпозиции.
         *
         * Метод не предназначен для прямого вызова пользователем. Он используется
         * автоматически при обработке результата цепочки `ReactionsDeclaration`, где
         * каждая реакция возвращается в виде кортежа `[суперпозиции[], реакция]`.
         *
         * @param superposition - Массив суперпозиций, в которых реакция должна быть активна
         *
         * @internal
         */
        registerStates: (superposition: 𝛴[]) => void
      }
    }
  },
) => ReactionsChainResult<ɸ, 𝛴, m>

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
  superposition: Record<string, string[]>
}
/**
 * Функция обновления контекста
 *
 * Вызывается когда реакция срабатывает и фильтр прошел успешно.
 * Получает все необходимые данные для обработки события.
 *
 * @template C - схема контекста
 * @template S - строковые ключи состояний
 * @template Mass - тип mass объекта
 *
 * @includeExample ./react/test/reactions.basic.spec.ts
 * @includeExample ./react/test/reactions.execution.spec.ts
 *
 * @example
 * ```typescript
 * const updateFn: ReactionUpdate<MyContext, "idle" | "loading"> = ({
 *   update,    // Функция для обновления контекста
 *   value,   // Текущие значения полей
 *   mass,      // Масса
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
 *     messageCount: value.messageCount + 1
 *   })
 * }
 * ```
 */

export type ReactionAction<ɸ extends Schema, 𝛴 extends string, m extends Mass> = (args: {
  /** Функция для обновления полей */
  update: Update<ɸ>
  /** Текущие значения полей */
  value: Values<ɸ>
  /** Масса */
  mass: m
  /** Название компонента-отправителя из MetaFor("label") */
  meta: string
  /** Информация об акторе */
  atom: string
  /** Временная метка */
  timestamp: number
  /** Патч для применения к актору */
  patch: JsonPatch
  /** Текущее состояние */
  state: 𝛴
  /** Идентификатор актора */
  self: Self
}) => void /** Результат цепочки реакций */

export type ReactionsChainResult<ɸ extends Schema, 𝛴 extends string, m extends Mass> = [
  𝛴[],
  Reaction<ɸ, 𝛴, m> & {
    /**
     * Внутренний метод для регистрации суперпозиций реакции в схеме
     *
     * Автоматически вызывается при построении схемы реакций для связывания реакций
     * с суперпозициями, в которых они должны быть активны. Метод добавляет ID реакции
     * в объект суперпозиций схемы, создавая обратную связь: для каждой суперпозиции
     * хранится список ID реакций, которые должны выполняться в этой суперпозиции.
     *
     * Метод не предназначен для прямого вызова пользователем. Он используется
     * автоматически при обработке результата цепочки `ReactionsDeclaration`, где
     * каждая реакция возвращается в виде кортежа `[суперпозиции[], реакция]`.
     *
     * @param superposition - Массив суперпозиций, в которых реакция должна быть активна
     *
     * @internal
     */
    registerStates: (superposition: 𝛴[]) => void
  },
][]
