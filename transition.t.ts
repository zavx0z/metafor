/**
 * Типы для условий переходов между состояниями
 * @packageDocumentation
 * 
 * # Состояния (States)
 * 
 * Состояния определяют возможные переходы автомата с условиями.
 * Каждое состояние может переходить в другие состояния при выполнении определенных условий.
 * 
 * ## Основные принципы:
 * - **Явное перечисление**: Всегда перечисляйте все состояния в массивах реакций
 * - **Условия переходов**: Определяйте условия для каждого перехода
 * - **Типобезопасность**: TypeScript проверяет корректность условий
 * 
 * ## Структура состояний:
 * ```typescript
 * .states({
 *   stateName: {
 *     nextState: conditions,
 *     anotherState: conditions,
 *   }
 * })
 * ```
 * 
 * @example
 * ```typescript
 * .states({
 *   guest: {
 *     // Переход в user при выполнении условий
 *     user: {
 *       name: { length: { min: 2 } },
 *       email: { pattern: /@/ }
 *     }
 *   },
 *   user: {
 *     // Переход в admin при isAdmin: true
 *     admin: { isAdmin: true },
 *     // Переход в guest при logout: true
 *     guest: { logout: true }
 *   },
 *   admin: {
 *     user: { isAdmin: false }
 *   }
 * })
 * ```
 */

import type {
      ContextSchema,
      ExtractValues,
      RequiredArrayDefinition,
      RequiredBooleanDefinition,
      RequiredEnumDefinition,
      RequiredNumberDefinition,
      RequiredStringDefinition,
} from "./context/index.t.ts"

/** 
 * # Условия для булевых значений (required)
  
   Позволяет определять условия для обязательных булевых значений в контексте.
   Не поддерживает проверку на null, так как required поля всегда имеют значение.
  
   ## Параметры:
   | Параметр   | Тип     | Описание                           |
   | ---------- | ------- | ---------------------------------- |
   | eq         | boolean | Равно указанному булеву значению   |
   | notEq      | boolean | Не равно указанному булеву значению|
   | logicalEq  | boolean | Логическое равенство               |
   
   @example
   ```typescript
   // Простое условие
   isActive: true
   
   // Сложное условие
   isAdmin: { eq: true }
   isVerified: { notEq: false }
   ```
   */
export type CondBooleanRequired =
  | boolean
  | {
      /** Равно указанному булеву значению */
      eq?: boolean
      /** Не равно указанному булеву значению */
      notEq?: boolean
      /** Логическое равенство */
      logicalEq?: boolean
    }

/** 
 * # Условия для булевых значений (optional)
  
   Позволяет определять условия для опциональных булевых значений в контексте.
   Поддерживает проверку на null.
  
   ## Параметры:
   | Параметр   | Тип     | Описание                           |
   | ---------- | ------- | ---------------------------------- |
   | null       | boolean | Является ли значение null          |
   | eq         | boolean | Равно указанному булеву значению   |
   | notEq      | boolean | Не равно указанному булеву значению|
   | logicalEq  | boolean | Логическое равенство               |
   
   @example
   ```typescript
   // Проверка на null
   isPremium: null
   
   // Проверка значения
   isVerified: { eq: true }
   isBlocked: { notEq: false }
   ```
   */
export type CondBooleanOptional =
  | boolean
  | null
  | {
      /** Является ли значение null */
      null?: boolean
      /** Равно указанному булеву значению */
      eq?: boolean
      /** Не равно указанному булеву значению */
      notEq?: boolean
      /** Логическое равенство */
      logicalEq?: boolean
    }

/** 
 * # Условия для enum (required)
  
   Позволяет определять условия для обязательных enum значений в контексте.
   Не поддерживает проверку на null.
  
   ## Параметры:
   | Параметр  | Тип         | Описание                       |
   | --------- | ----------- | ------------------------------ |
   | eq        | E[number]   | Равно указанному значению      |
   | notEq     | E[number]   | Не равно указанному значению   |
   | oneOf     | E[number][] | Одно из указанных значений     |
   | notOneOf  | E[number][] | Не одно из указанных значений  |
  
   @template E - Тип значений enum
   
   @example
   ```typescript
   // Простое условие
   status: "active"
   
   // Сложные условия
   role: { eq: "admin" }
   status: { oneOf: ["pending", "active"] }
   role: { notOneOf: ["banned", "suspended"] }
   ```
   */
export type CondEnumRequired<E extends readonly (string | number)[]> =
  | E[number]
  | {
      /** Равно указанному значению */
      eq?: E[number]
      /** Не равно указанному значению */
      notEq?: E[number]
      /** Одно из указанных значений */
      oneOf?: E[number][]
      /** Не одно из указанных значений */
      notOneOf?: E[number][]
    }

/** 
 * # Условия для enum (optional)
  
   Позволяет определять условия для опциональных enum значений в контексте.
   Поддерживает проверку на null.
  
   ## Параметры:
   | Параметр  | Тип         | Описание                       |
   | --------- | ----------- | ------------------------------ |
   | null      | boolean     | Является ли значение null      |
   | eq        | E[number]   | Равно указанному значению      |
   | notEq     | E[number]   | Не равно указанному значению   |
   | oneOf     | E[number][] | Одно из указанных значений     |
   | notOneOf  | E[number][] | Не одно из указанных значений  |
   
   @template E - Тип значений enum
   
   @example
   ```typescript
   // Проверка на null
   theme: null
   
   // Проверка значения
   language: { eq: "ru" }
   category: { oneOf: ["tech", "design"] }
   ```
   */
export type CondEnumOptional<E extends readonly (string | number)[]> =
  | E[number]
  | null
  | {
      /** Является ли значение null */
      null?: boolean
      /** Равно указанному значению */
      eq?: E[number]
      /** Не равно указанному значению */
      notEq?: E[number]
      /** Одно из указанных значений */
      oneOf?: E[number][]
      /** Не одно из указанных значений */
      notOneOf?: E[number][]
    }

/** 
 * # Условия для строк (required)
  
   Позволяет определять условия для обязательных строковых значений в контексте.
   Поддерживает различные проверки: равенство, регулярные выражения, длина и т.д.
  
   ## Параметры:
   | Параметр      | Тип     | Описание                           |
   | ------------- | ------- | ---------------------------------- |
   | eq            | string  | Равно указанной строке             |
   | notEq         | string  | Не равно указанной строке          |
   | startsWith    | string  | Начинается с указанной строки      |
   | endsWith      | string  | Заканчивается на указанную строку  |
   | include       | string  | Содержит указанную подстроку       |
   | notInclude    | string  | Не содержит указанную подстроку    |
   | pattern       | RegExp  | Соответствует регулярному выражению|
   | length        | number  | Длина строки                       |
   | between       | [string, string] | Между двумя строками        |
   
   @example
   ```typescript
   // Простые условия
   name: "admin"
   email: /@/
   
   // Сложные условия
   name: { 
     length: { min: 2, max: 20 },
     startsWith: "user"
   }
   email: { 
     pattern: /^[^@]+@[^@]+\.[^@]+$/,
     notInclude: "spam"
   }
   ```
   */
export type CondStringRequired =
  | string
  | RegExp
  | {
      /** Начинается ли с указанной строки */
      startsWith?: string
      /** Заканчивается ли на указанную строку */
      endsWith?: string
      /** Включает ли указанную подстроку */
      include?: string
      /** Шаблон регулярного выражения */
      pattern?: RegExp
      /** Равно указанной строке */
      eq?: string
      /** Не равно указанной строке */
      notEq?: string
      /** Не включает указанную подстроку */
      notInclude?: string
      /** Не начинается с указанной строки */
        notStartsWith?: string
      /** Не заканчивается на указанную строку */
      notEndsWith?: string
      /** Длина строки */
      length?: number | { min?: number; max?: number }
      /** Должно быть между двумя строками */
      between?: [string, string]
    }

/** 
 * # Условия для строк (optional)
  
   Позволяет определять условия для опциональных строковых значений в контексте.
   Поддерживает проверку на null и все условия для required строк.
  
   ## Параметры:
   | Параметр      | Тип     | Описание                           |
   | ------------- | ------- | ---------------------------------- |
   | null          | boolean | Является ли значение null          |
   | eq            | string  | Равно указанной строке             |
   | notEq         | string  | Не равно указанной строке          |
   | startsWith    | string  | Начинается с указанной строки      |
   | endsWith      | string  | Заканчивается на указанную строку  |
   | include       | string  | Содержит указанную подстроку       |
   | notInclude    | string  | Не содержит указанную подстроку    |
   | pattern       | RegExp  | Соответствует регулярному выражению|
   | length        | number  | Длина строки                       |
   | between       | [string, string] | Между двумя строками        |
   
   @example
   ```typescript
   // Проверка на null
   description: null
   
   // Проверка значения
   avatar: { 
     pattern: /\.(jpg|png|gif)$/,
     notInclude: "default"
   }
   ```
   */
export type CondStringOptional =
  | string
  | RegExp
  | null
  | {
      /** Является ли значение null */
      null?: boolean
      /** Начинается ли с указанной строки */
      startsWith?: string
      /** Заканчивается ли на указанную строку */
      endsWith?: string
      /** Включает ли указанную подстроку */
      include?: string
      /** Шаблон регулярного выражения */
      pattern?: RegExp
      /** Равно указанной строке */
      eq?: string
      /** Не равно указанной строке */
      notEq?: string
      /** Не включает указанную подстроку */
      notInclude?: string
      /** Не начинается с указанной строки */
      notStartsWith?: string
      /** Не заканчивается на указанную строку */
      notEndsWith?: string
      /** Длина строки */
      length?: number | { min?: number; max?: number }
      /** Должно быть между двумя строками */
      between?: [string, string]
    }

/** 
 * # Условия для чисел (required)
  
   Позволяет определять условия для обязательных числовых значений в контексте.
   Поддерживает сравнения, диапазоны и равенство.
  
   ## Параметры:
   | Параметр | Тип     | Описание                           |
   | -------- | ------- | ---------------------------------- |
   | eq       | number  | Равно указанному числу             |
   | gt       | number  | Больше указанного числа            |
   | gte      | number  | Больше или равно указанному числу  |
   | lt       | number  | Меньше указанного числа            |
   | lte      | number  | Меньше или равно указанному числу  |
   | notEq    | number  | Не равно указанному числу          |
   | between  | [number, number] | Между двумя числами        |
   
   @example
   ```typescript
   // Простые условия
   age: 18
   count: { gt: 0 }
   
   // Сложные условия
   age: { 
     gte: 18,
     lte: 65
   }
   rating: { 
     between: [1, 5],
     notEq: 0
   }
   ```
   */
export type CondNumberRequired =
  | number
  | {
      /** Равно указанному числу */
      eq?: number
      /** Больше указанного числа */
      gt?: number
      /** Больше или равно указанному числу */
      gte?: number
      /** Меньше указанного числа */
      lt?: number
      /** Меньше или равно указанному числу */
      lte?: number
      /** Не равно указанному числу */
      notEq?: number
      /** Не больше указанного числа */
      notGt?: number
      /** Не больше или равно указанному числу */
      notGte?: number
      /** Не меньше указанного числа */
      notLt?: number
      /** Не меньше или равно указанному числу */
      notLte?: number
      /** Должно быть между двумя числами */
      between?: [number, number]
    }

/** 
 * # Условия для чисел (optional)
  
   Позволяет определять условия для опциональных числовых значений в контексте.
   Поддерживает проверку на null и все условия для required чисел.
  
   ## Параметры:
   | Параметр | Тип     | Описание                           |
   | -------- | ------- | ---------------------------------- |
   | null     | boolean | Является ли значение null          |
   | eq       | number  | Равно указанному числу             |
   | gt       | number  | Больше указанного числа            |
   | gte      | number  | Больше или равно указанному числу  |
   | lt       | number  | Меньше указанного числа            |
   | lte      | number  | Меньше или равно указанному числу  |
   | notEq    | number  | Не равно указанному числу          |
   | between  | [number, number] | Между двумя числами        |
   
   @example
   ```typescript
   // Проверка на null
   rating: null
   
   // Проверка значения
   priority: { 
     gte: 1,
     lte: 10
   }
   ```
   */
export type CondNumberOptional =
  | number
  | null
  | {
      /** Является ли значение null */
      null?: boolean
      /** Равно указанному числу */
      eq?: number
      /** Больше указанного числа */
      gt?: number
      /** Больше или равно указанному числу */
      gte?: number
      /** Меньше указанного числа */
      lt?: number
      /** Меньше или равно указанному числу */
      lte?: number
      /** Не равно указанному числу */
      notEq?: number
      /** Не больше указанного числа */
      notGt?: number
      /** Не больше или равно указанному числу */
      notGte?: number
      /** Не меньше указанного числа */
      notLt?: number
      /** Не меньше или равно указанному числу */
      notLte?: number
      /** Должно быть между двумя числами */
      between?: [number, number]
    }

/** 
 * # Условия для массивов (required)
  
   Позволяет определять условия для обязательных массивов в контексте.
   Поддерживает проверки длины, содержимого и элементов.
  
   ## Параметры:
   | Параметр   | Тип     | Описание                           |
   | ---------- | ------- | ---------------------------------- |
   | length     | number  | Длина массива                      |
   | includes   | T       | Содержит указанный элемент         |
   | notIncludes| T       | Не содержит указанный элемент      |
   | isEmpty    | boolean | Является ли массив пустым          |
   | every      | object  | Все элементы удовлетворяют условию |
   | some       | object  | Хотя бы один элемент удовлетворяет |
   
   @template T - Тип элементов массива
   
   @example
   ```typescript
   // Простые условия
   userIds: []
   tags: { length: { min: 1 } }
   
   // Сложные условия
   userIds: { 
     length: { min: 1, max: 100 },
     includes: 1
   }
   tags: { 
     every: { include: "valid" },
     notIncludes: "spam"
   }
   ```
   */
export type CondArrayRequired<T = any> =
  | T[]
  | {
      /** Длина массива */
      length?: number | { min?: number; max?: number }
      /** Содержит ли массив указанный элемент */
      includes?: T
      /** Не содержит ли массив указанный элемент */
      notIncludes?: T
      /** Все элементы удовлетворяют условию */
      every?: T extends number
        ? { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number }
        : T extends string
        ? { include?: string; startsWith?: string; endsWith?: string; pattern?: RegExp }
        : never
      /** Хотя бы один элемент удовлетворяет условию */
      some?: T extends number
        ? { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number }
        : T extends string
        ? { include?: string; startsWith?: string; endsWith?: string; pattern?: RegExp }
        : never
      /** Является ли массив пустым */
      isEmpty?: boolean
    }

/** 
 * # Условия для массивов (optional)
  
   Позволяет определять условия для опциональных массивов в контексте.
   Поддерживает проверку на null и все условия для required массивов.
  
   ## Параметры:
   | Параметр   | Тип     | Описание                           |
   | ---------- | ------- | ---------------------------------- |
   | null       | boolean | Является ли значение null          |
   | length     | number  | Длина массива                      |
   | includes   | T       | Содержит указанный элемент         |
   | notIncludes| T       | Не содержит указанный элемент      |
   | isEmpty    | boolean | Является ли массив пустым          |
   | every      | object  | Все элементы удовлетворяют условию |
   | some       | object  | Хотя бы один элемент удовлетворяет |
   
   @template T - Тип элементов массива
   
   @example
   ```typescript
   // Проверка на null
   categories: null
   
   // Проверка значения
   tags: { 
     length: { min: 1 },
     notIncludes: "invalid"
   }
   ```
   */
export type CondArrayOptional<T = any> =
  | T[]
  | null
  | {
      /** Является ли значение null */
      null?: boolean
      /** Длина массива */
      length?: number | { min?: number; max?: number }
      /** Содержит ли массив указанный элемент */
      includes?: T
      /** Не содержит ли массив указанный элемент */
      notIncludes?: T
      /** Все элементы удовлетворяют условию */
      every?: T extends number
        ? { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number }
        : T extends string
        ? { include?: string; startsWith?: string; endsWith?: string; pattern?: RegExp }
        : never
      /** Хотя бы один элемент удовлетворяет условию */
      some?: T extends number
        ? { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number }
        : T extends string
        ? { include?: string; startsWith?: string; endsWith?: string; pattern?: RegExp }
        : never
      /** Является ли массив пустым */
      isEmpty?: boolean
    }

/**
 * Автоматически определяет тип условий на основе типа значения
 * @template T - Тип значения для которого определяются условия
 */
export type Condition<T> = T extends boolean
  ? CondBooleanRequired
  : T extends string
  ? CondStringRequired
  : T extends number
  ? CondNumberRequired
  : T extends (infer U)[]
  ? CondArrayRequired<U>
  : T extends readonly (infer U)[]
  ? CondArrayRequired<U>
  : T extends null
  ? null
  : never

/**
 * Автоматически определяет тип условий для опциональных значений
 * @template T - Тип значения для которого определяются условия
 */
export type ConditionOptional<T> = T extends boolean
  ? CondBooleanOptional
  : T extends string
  ? CondStringOptional
  : T extends number
  ? CondNumberOptional
  : T extends (infer U)[]
  ? CondArrayOptional<U>
  : T extends readonly (infer U)[]
  ? CondArrayOptional<U>
  : T extends null
  ? null
  : never

/**
 * Условия переходов для всех полей контекста
 * Автоматически определяет правильный тип условий для каждого поля
 * @template T - Схема контекста
 * 
 * @example
 * ```typescript
 * const conditions: TransitionConditions<MyContext> = {
 *   name: { length: { min: 2 } },           // string
 *   age: { gte: 18 },                       // number
 *   isActive: true,                         // boolean
 *   userIds: { length: { min: 1 } },        // array
 *   status: "active"                        // enum
 * }
 * ```
 */
export type TransitionConditions<T extends ContextSchema> = {
  [K in keyof T]?: T[K] extends
    | RequiredStringDefinition
    | RequiredNumberDefinition
    | RequiredBooleanDefinition
    | RequiredArrayDefinition<any>
    | RequiredEnumDefinition<any>
    ? Condition<ExtractValues<T>[K]>
    : ConditionOptional<ExtractValues<T>[K]>
}

/**
 * Переходы из одного состояния в другие
 * @template T - Строковые ключи состояний
 * @template C - Схема контекста
 * 
 * @example
 * ```typescript
 * const transitions: StateTransitions<"idle" | "loading", MyContext> = {
 *   idle: {
 *     loading: { isLoading: true }
 *   },
 *   loading: {
 *     success: { count: { gt: 0 } },
 *     error: { isLoading: false }
 *   }
 * }
 * ```
 */
export type StateTransitions<T extends string, C extends ContextSchema> = {
      [K in T]?: TransitionConditions<C>
}

/**
 * Определение одного состояния с его переходами
 * @template T - Строковые ключи состояний
 * @template C - Схема контекста
 */
export type StateDefinition<T extends string, C extends ContextSchema> = StateTransitions<T, C>

/**
 * Конфигурация всех состояний автомата
 * @template S - Строковые ключи состояний
 * @template C - Схема контекста
 * 
 * @example
 * ```typescript
 * const statesConfig: StatesConfig<"idle" | "loading" | "success" | "error", MyContext> = {
 *   idle: {
 *     loading: { isLoading: true }
 *   },
 *   loading: {
 *     success: { count: { gt: 0 } },
 *     error: { isLoading: false }
 *   },
 *   success: {
 *     idle: {}
 *   },
 *   error: {
 *     idle: {}
 *   }
 * }
 * ```
 */
export type StatesConfig<S extends string, C extends ContextSchema> = Record<S, StateDefinition<S, C>>