/**
 * Статический HTML
 * @module HTML
 */
import { html as coreHtml, svg as coreSvg, mathml as coreMathml } from "./html"
import type { StaticValue } from "./static.t"
import type { TemplateResult } from "./html.t"

/**
 * Символ-бренд для защиты от подделки статических значений.
 * Используется для быстрой проверки и совместимости между разными версиями.
 */
const brand = Symbol.for("")

/**
 * Безопасно извлекает строковое значение из StaticValue.
 * Возвращает undefined, если объект не является корректным StaticValue.
 */
const unwrapStaticValue = (value: unknown): string | undefined => {
  if ((value as Partial<StaticValue>)?.r !== brand) {
    return undefined
  }
  return (value as Partial<StaticValue>)?.["_$htmlStatic$"]
}

/**
 * Оборачивает строку так, чтобы она воспринималась как часть статических строк шаблона,
 * а не как динамическое значение. Используйте только для доверенных данных!
 *
 * ВНИМАНИЕ: не используйте с пользовательским вводом без дополнительной фильтрации.
 */
export const unsafeStatic = (value: string): StaticValue => ({
  ["_$htmlStatic$"]: value,
  r: brand,
})

/**
 * Вспомогательная функция для получения строки из StaticValue.
 * Бросает ошибку, если передан невалидный объект.
 */
const textFromStatic = (value: StaticValue) => {
  if (value["_$htmlStatic$"] !== undefined) {
    return value["_$htmlStatic$"]
  } else {
    throw new Error(
      `Значение, переданное в функцию 'literal', должно быть результатом 'literal'. Используйте 'unsafeStatic' для передачи нестатических значений, но обязательно проверьте безопасность страницы.`
    )
  }
}

/**
 * Тег-функция для шаблонных литералов, позволяющая вставлять статические значения
 * в шаблон как часть статических строк, а не как динамические выражения.
 *
 * В выражениях допускаются только другие результаты literal или unsafeStatic.
 *
 * ВНИМАНИЕ: следите за корректностью HTML, иначе шаблон может "сломаться".
 */
export const literal = (strings: TemplateStringsArray, ...values: unknown[]): StaticValue => ({
  ["_$htmlStatic$"]: values.reduce(
    (acc, v, idx) => acc + textFromStatic(v as StaticValue) + strings[idx + 1],
    strings[0]
  ) as string,
  r: brand,
})

const stringsCache = new Map<string, TemplateStringsArray>()

/**
 * Обёртка для html тегов (html, svg, mathml), добавляющая поддержку статических значений.
 * Позволяет смешивать статические и динамические части в шаблоне.
 */
export const withStatic =
  (coreTag: typeof coreHtml | typeof coreSvg | typeof coreMathml) =>
  (strings: TemplateStringsArray, ...values: unknown[]): TemplateResult => {
    const l = values.length
    let staticValue: string | undefined
    let dynamicValue: unknown
    const staticStrings: Array<string> = []
    const dynamicValues: Array<unknown> = []
    let i = 0
    let hasStatics = false
    let s: string

    while (i < l) {
      s = strings[i]!
      // Собираем все unsafeStatic значения и следующие за ними строки шаблона,
      // чтобы рассматривать их как одну статическую строку.
      while (i < l && ((dynamicValue = values[i]), (staticValue = unwrapStaticValue(dynamicValue))) !== undefined) {
        s += staticValue + strings[++i]
        hasStatics = true
      }
      // Если последнее значение статическое, не нужно его пушить.
      if (i !== l) {
        dynamicValues.push(dynamicValue)
      }
      staticStrings.push(s)
      i++
    }
    // Если последнее значение не статическое, добавляем последнюю строку.
    if (i === l) {
      staticStrings.push(strings[l]!)
    }

    if (hasStatics) {
      const key = staticStrings.join("$$lit$$")
      strings = stringsCache.get(key)!
      if (strings === undefined) {
        // ВНИМАНИЕ: в общем случае этот паттерн небезопасен, но здесь допустим.
        ;(staticStrings as any).raw = staticStrings
        stringsCache.set(key, (strings = staticStrings as unknown as TemplateStringsArray))
      }
      values = dynamicValues
    }
    return coreTag(strings, ...values)
  }

/**
 * Интерпретирует шаблонный литерал как HTML-шаблон с поддержкой статических значений.
 */
export const html = withStatic(coreHtml)

/**
 * Интерпретирует шаблонный литерал как SVG-шаблон с поддержкой статических значений.
 */
export const svg = withStatic(coreSvg)

/**
 * Интерпретирует шаблонный литерал как MathML-шаблон с поддержкой статических значений.
 */
export const mathml = withStatic(coreMathml)
