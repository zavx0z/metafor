import type {ArrayDefinition, BooleanDefinition, ContextDefinition, EnumDefinition, NumberDefinition, NumberEnumDefinition, StringDefinition, StringEnumDefinition} from "./context.ts"

/**
 * Условия триггера для enum
 * @interface EnumTriggerCondition
 * @template E - Тип значений enum
 * @property isNull - Является ли значение null
 * @property eq - Равно указанному значению
 * @property notEq - Не равно указанному значению
 * @property oneOf - Одно из указанных значений
 * @property notOneOf - Не одно из указанных значений
 */
export type EnumTriggerCondition<E extends readonly (string | number)[]> =
  | E[number]
  | null
  | {
      isNull?: boolean
      eq?: E[number]
      notEq?: E[number]
      oneOf?: E[number][]
      notOneOf?: E[number][]
    }
/**
 * Условия триггера для строк
 * @interface StringTriggerCondition
 * @property isNull - Является ли значение null
 * @property startsWith - Начинается ли с указанной строки
 * @property endsWith - Заканчивается ли на указанную строку
 * @property include - Включает ли указанную подстроку
 * @property pattern - Шаблон регулярного выражения
 * @property eq - Равно указанной строке
 * @property notEq - Не равно указанной строке
 * @property notInclude - Не включает указанную подстроку
 * @property notStartsWith - Не начинается с указанной строки
 * @property notEndsWith - Не заканчивается на указанную строку
 * @property length - Длина строки
 * @property between - Должна быть между двумя строками
 */
export type StringTriggerCondition =
  | string
  | RegExp
  | null
  | {
      isNull?: boolean
      startsWith?: string
      endsWith?: string
      include?: string
      pattern?: RegExp
      eq?: string
      notEq?: string
      notInclude?: string
      notStartsWith?: string
      notEndsWith?: string
      length?: number | {min?: number; max?: number}
      between?: [string, string]
    }
/**
 * Условия триггера для чисел
 * @interface NumberTriggerCondition
 * @property isNull - Является ли значение null
 * @property eq - Равно указанному числу
 * @property gt - Больше указанного числа
 * @property gte - Больше или равно указанному числу
 * @property lt - Меньше указанного числа
 * @property lte - Меньше или равно указанному числу
 * @property notEq - Не равно указанному числу
 * @property notGt - Не больше указанного числа
 * @property notGte - Не больше или равно указанному числу
 * @property notLt - Не меньше указанного числа
 * @property notLte - Не меньше или равно указанному числу
 * @property min - Минимальное значение
 * @property max - Максимальное значение
 * @property between - Должно быть между двумя числами
 */
export type NumberTriggerCondition =
  | number
  | null
  | {
      isNull?: boolean
      eq?: number
      gt?: number
      gte?: number
      lt?: number
      lte?: number
      notEq?: number
      notGt?: number
      notGte?: number
      notLt?: number
      notLte?: number
      between?: [number, number]
    }
/**
 * Условия триггера для булевых значений
 * @interface BooleanTriggerCondition
 * @property isNull - Является ли значение null
 * @property eq - Равно указанному булеву значению
 * @property notEq - Не равно указанному булеву значению
 * @property logicalEq - Логическое равенство
 * @property notNull - Не является ли значение null
 */
export type BooleanTriggerCondition =
  | boolean
  | null
  | {
      isNull?: boolean
      eq?: boolean
      notEq?: boolean
      logicalEq?: boolean
      notNull?: boolean
    }

/**
 * Тип триггера
 * @interface TriggerType
 * @template C - Тип определения контекста
 */
export type TriggerType<C extends ContextDefinition> = Partial<{
  [K in keyof C]: C[K] extends StringEnumDefinition<infer V>
    ? EnumTriggerCondition<V>
    : C[K] extends NumberEnumDefinition<infer V>
    ? EnumTriggerCondition<V>
    : C[K] extends StringDefinition
    ? StringTriggerCondition
    : C[K] extends NumberDefinition
    ? NumberTriggerCondition
    : C[K] extends BooleanDefinition
    ? BooleanTriggerCondition
    : C[K] extends ArrayDefinition
    ? any[] | { length: NumberTriggerCondition }
    : never
}>
