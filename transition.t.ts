/**
 * Типы для условий переходов между состояниями
 * @packageDocumentation
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

/** # Условия для булевых значений (required)
  
   Позволяет определять условия для обязательных булевых значений в контексте.
   Не поддерживает проверку на null, так как required поля всегда имеют значение.
  
   | Параметр   | Тип     | Описание                           |
   | ---------- | ------- | ---------------------------------- |
   | eq         | boolean | Равно указанному булеву значению   |
   | notEq      | boolean | Не равно указанному булеву значению|
   | logicalEq  | boolean | Логическое равенство               |
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

/** # Условия для булевых значений (optional)
  
   Позволяет определять условия для опциональных булевых значений в контексте.
   Поддерживает проверку на null.
  
   | Параметр   | Тип     | Описание                           |
   | ---------- | ------- | ---------------------------------- |
   | null       | boolean | Является ли значение null          |
   | eq         | boolean | Равно указанному булеву значению   |
   | notEq      | boolean | Не равно указанному булеву значению|
   | logicalEq  | boolean | Логическое равенство               |
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

/** # Условия для enum (required)
  
   Позволяет определять условия для обязательных enum значений в контексте.
   Не поддерживает проверку на null.
  
   | Параметр  | Тип         | Описание                       |
   | --------- | ----------- | ------------------------------ |
   | eq        | E[number]   | Равно указанному значению      |
   | notEq     | E[number]   | Не равно указанному значению   |
   | oneOf     | E[number][] | Одно из указанных значений     |
   | notOneOf  | E[number][] | Не одно из указанных значений  |
  
   @template E - Тип значений enum
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

/** # Условия для enum (optional)
  
   Позволяет определять условия для опциональных enum значений в контексте.
   Поддерживает проверку на null.
  
   | Параметр  | Тип         | Описание                       |
   | --------- | ----------- | ------------------------------ |
   | null      | boolean     | Является ли значение null      |
   | eq        | E[number]   | Равно указанному значению      |
   | notEq     | E[number]   | Не равно указанному значению   |
   | oneOf     | E[number][] | Одно из указанных значений     |
   | notOneOf  | E[number][] | Не одно из указанных значений  |
  
   @template E - Тип значений enum
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

/** # Условия для строк (required)
  
   Позволяет определять условия для обязательных строковых значений в контексте.
   Не поддерживает проверку на null.
  
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

/** # Условия для строк (optional)
  
   Позволяет определять условия для опциональных строковых значений в контексте.
   Поддерживает проверку на null.
  
   | Параметр       | Тип                                  | Описание                              |
   | -------------- | ------------------------------------ | ------------------------------------- |
   | null           | boolean                              | Является ли значение null             |
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

/** # Условия для чисел (required)
  
   Позволяет определять условия для обязательных числовых значений в контексте.
   Не поддерживает проверку на null.
  
   | Параметр | Тип              | Описание                              |
   | -------- | ---------------- | ------------------------------------- |
   | eq       | number           | Равно указанному числу                |
   | gt       | number           | Больше указанного числа               |
   | gte      | number           | Больше или равно указанному числу     |
   | lt       | number           | Меньше указанного числа               |
   | lte      | number           | Меньше или равно указанному числу     |
   | notEq    | number           | Не равно указанному числу             |
   | notGt    | number           | Не больше указанного числа            |
   | notGte   | number           | Не больше или равно указанному числу  |
   | notLt    | number           | Не меньше указанного числа            |
   | notLte   | number           | Не меньше или равно указанному числу  |
   | between  | [number, number] | Должно быть между двумя числами       |
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

/** # Условия для чисел (optional)
  
   Позволяет определять условия для опциональных числовых значений в контексте.
   Поддерживает проверку на null.
  
   | Параметр | Тип              | Описание                              |
   | -------- | ---------------- | ------------------------------------- |
   | null     | boolean          | Является ли значение null             |
   | eq       | number           | Равно указанному числу                |
   | gt       | number           | Больше указанного числа               |
   | gte      | number           | Больше или равно указанному числу     |
   | lt       | number           | Меньше указанного числа               |
   | lte      | number           | Меньше или равно указанному числу     |
   | notEq    | number           | Не равно указанному числу             |
   | notGt    | number           | Не больше указанного числа            |
   | notGte   | number           | Не больше или равно указанному числу  |
   | notLt    | number           | Не меньше указанного числа            |
   | notLte   | number           | Не меньше или равно указанному числу  |
   | between  | [number, number] | Должно быть между двумя числами       |
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

/** # Условия для массивов (required)

   Позволяет определять условия для обязательных массивов в контексте.
   Не поддерживает проверку на null.

   | Параметр    | Тип              | Описание                              |
   | ----------- | ---------------- | ------------------------------------- |
   | length      | number \| { min?: number; max?: number } | Длина массива                    |
   | includes    | any              | Содержит ли массив указанный элемент  |
   | notIncludes | any              | Не содержит ли массив указанный элемент|
   | every       | { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number; include?: string } | Все элементы удовлетворяют условию |
   | some        | { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number; include?: string } | Хотя бы один элемент удовлетворяет условию |
   | isEmpty     | boolean          | Является ли массив пустым             |
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

/** # Условия для массивов (optional)

   Позволяет определять условия для опциональных массивов в контексте.
   Поддерживает проверку на null.

   | Параметр    | Тип              | Описание                              |
   | ----------- | ---------------- | ------------------------------------- |
   | null        | boolean          | Является ли значение null             |
   | length      | number \| { min?: number; max?: number } | Длина массива                    |
   | includes    | any              | Содержит ли массив указанный элемент  |
   | notIncludes | any              | Не содержит ли массив указанный элемент|
   | every       | { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number; include?: string } | Все элементы удовлетворяют условию |
   | some        | { gt?: number; gte?: number; lt?: number; lte?: number; eq?: number; include?: string } | Хотя бы один элемент удовлетворяет условию |
   | isEmpty     | boolean          | Является ли массив пустым             |
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

/** # Универсальный тип условий
  
   Определяет условия для любого типа значения в контексте.
   Автоматически выбирает подходящий тип условий на основе типа поля.
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

/** # Универсальный тип условий для optional полей
  
   Определяет условия для опциональных полей в контексте.
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

/** # Условия перехода
  
   Определяет условия для перехода к конкретному состоянию.
   Ключи - это имена полей контекста, значения - условия для этих полей.
   Правильно различает required и optional поля.
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
 * Тип StateTransitions — переходы только к ключам из T с условиями
 */
export type StateTransitions<T extends string, C extends ContextSchema> = {
      [K in T]?: TransitionConditions<C>
}
/**
 * Конфигурация одного состояния — теперь это просто карта переходов
 */
export type StateDefinition<T extends string, C extends ContextSchema> = StateTransitions<T, C>
/**
 * Конфигурация всех состояний — карта переходов для каждого состояния
 */
export type StatesConfig<S extends string, C extends ContextSchema> = Record<S, StateDefinition<S, C>>