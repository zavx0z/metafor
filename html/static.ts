import {html as coreHtml, mathml as coreMathml, svg as coreSvg} from "./html.js"
import type {Brand, StaticValue} from "./types/static.js"
import type {TemplateResult} from "./types/html.js"

const brand: Brand = Symbol.for("")

/** Безопасно извлекает строковую часть из StaticValue */
const unwrapStaticValue = (value: unknown): string | undefined => {
  if ((value as Partial<StaticValue>)?.r !== brand) return undefined
  return (value as Partial<StaticValue>)?.["_$atomStatic$"]
}

/**
 * Оборачивает строку так, чтобы она вела себя как часть статического шаблона,
 * а не как динамическое значение.
 *
 * Пользователи должны убедиться, что добавление статической строки в шаблон
 * приводит к корректному HTML, иначе шаблоны могут неожиданно сломаться.
 *
 * Важно: эта функция небезопасна для недоверенного контента, так как он будет
 * напрямую парситься в HTML. Не передавайте пользовательский ввод в эту функцию
 * без предварительной санитизации.
 *
 * Статические значения можно изменять, но это вызовет полный перерендер,
 * так как фактически создается новый шаблон.
 */
export const unsafeStatic = (value: string): StaticValue => ({["_$atomStatic$"]: value, r: brand})

const textFromStatic = (value: StaticValue) => {
  if (value["_$atomStatic$"] !== undefined) return value["_$atomStatic$"]
  throw new Error(
    `Значение, переданное в функцию 'literal', должно быть результатом 'literal': ${value}. 
    Используйте 'unsafeStatic' для передачи не литеральных значений, но позаботьтесь о безопасности страницы.`
  )
}

/**
 * Помечает строковый литерал так, чтобы он вел себя как часть статического
 * шаблона, а не как динамическое значение.
 *
 * В выражениях шаблона можно использовать только другие результаты
 * помеченные как `literal` или значения `unsafeStatic` (учтите, что недоверенный
 * контент никогда не должен передаваться в `unsafeStatic`).
 *
 * Пользователи должны убедиться, что добавление статической строки в шаблон
 * приводит к корректному HTML, иначе шаблоны могут неожиданно сломаться.
 *
 * Статические значения можно изменять, но это вызовет полный перерендер,
 * так как фактически создается новый шаблон.
 */
export const literal = (strings: TemplateStringsArray, ...values: unknown[]): StaticValue => ({
  ["_$atomStatic$"]: values.reduce(
    (acc, v, idx) => acc + textFromStatic(v as StaticValue) + strings[idx + 1],
    strings[0]
  ) as string,
  r: brand
})

const stringsCache = new Map<string, TemplateStringsArray>()

/** Оборачивает тег шаблона @pkg/html (`html` или `svg`) для добавления поддержки статических значений. */
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
        s = strings[i]
        // Собираем все значения unsafeStatic и следующие за ними строки шаблона,
        // чтобы обработать последовательность строк шаблона и небезопасных
        // статических значений как одну строку шаблона.
        while (i < l && ((dynamicValue = values[i]), (staticValue = unwrapStaticValue(dynamicValue))) !== undefined) {
          s += staticValue + strings[++i]
          hasStatics = true
        }
        // Если последнее значение статично, мы не должны его добавлять.
        if (i !== l) dynamicValues.push(dynamicValue)
        staticStrings.push(s)
        i++
      }
      // Если последнее значение не статично (которое бы потребило последнюю строку), то мы должны добавить последнюю строку.
      if (i === l) staticStrings.push(strings[l])

      if (hasStatics) {
        const key = staticStrings.join("$$lit$$")
        strings = stringsCache.get(key)!
        if (strings === undefined) {
          // Внимание: в целом этот паттерн небезопасен и может обойти проверки
          // безопасности @pkg/html, позволяя злоумышленнику выполнять произвольный
          // код и внедрять произвольный контент.
          ;(staticStrings as any).raw = staticStrings
          stringsCache.set(key, (strings = staticStrings as unknown as TemplateStringsArray))
        }
        values = dynamicValues
      }
      return coreTag(strings, ...values)
    }

/** Интерпретирует строковый литерал как HTML шаблон, который может эффективно рендериться и обновлять контейнер.
 * Включает поддержку статических значений из `@pkg/html/static.js`. */
export const html = withStatic(coreHtml)

/** Интерпретирует строковый литерал как SVG шаблон, который может эффективно рендериться и обновлять контейнер.
 * Включает поддержку статических значений из `@pkg/html/static.js`. */
export const svg = withStatic(coreSvg)

/** Интерпретирует строковый литерал как фрагмент MathML, который может эффективно рендериться и обновлять контейнер.
 * Включает поддержку статических значений из `@pkg/html/static.js`. */
export const mathml = withStatic(coreMathml)
