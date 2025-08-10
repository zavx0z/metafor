import type { ContextSchema, ExtractValues } from "../../context"
import type { Core } from "../../index.t"
import type { ArrayRenderContext } from "./index.t"
/**
 * Выполняет интерполяцию в строке через eval, как в restoreViewFunction
 */
export function evaluateInterpolation<C extends ContextSchema, S extends string, I extends Core>(
  template: string,
  state: S,
  context: ExtractValues<C>,
  core: I,
  arrayContext?: ArrayRenderContext
): string {
  try {
    // Создаем функцию через eval с доступом к context, core, item
    const functionString = `(state, context, core, item) => \`${template}\``
    const interpolateFn = eval(functionString)

    // Выполняем функцию с переданными данными
    return interpolateFn(state, context, core, arrayContext?.item || {})
  } catch (error) {
    console.warn("Ошибка интерполяции:", error)
    return template // Возвращаем как есть в случае ошибки
  }
}
