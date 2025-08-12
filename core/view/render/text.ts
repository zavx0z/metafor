import type { ContextSchema, ExtractValues } from "../../context"
import type { Core } from "../../index.t"
import type { TextSchema } from "../parser"
import type { ArrayRenderContext } from "./index.t"
import { evaluateInterpolation } from "./utils"

/**
 * Рендерит текстовый узел
 */
export function renderText<C extends ContextSchema, S extends string, I extends Core>(
  state: S,
  text: TextSchema,
  context: ExtractValues<C>,
  core: I,
  parentElement: HTMLElement | DocumentFragment,
  arrayContext?: ArrayRenderContext
): void {
  let valueToRender = ""

  // 1) Статический текст
  if (typeof text.value === "string") {
    valueToRender = text.value
  } else if (Array.isArray((text.value as any).src)) {
    // 2) Источник задан составным путем (src: string[])
    // Внутри массива учитываем наличие key: если есть — берем свойство из текущего элемента
    if (arrayContext) {
      const keyMaybe = (text.value as any).key as string | string[] | undefined
      if (keyMaybe) {
        const path: string[] = Array.isArray(keyMaybe) ? keyMaybe : [String(keyMaybe)]

        let current: unknown = arrayContext.item as Record<string, unknown>
        for (const segment of path) {
          if (current == null) break
          current = (current as Record<string, unknown>)[segment]
        }
        valueToRender = String(current ?? "")
      } else {
        // Без key: текущий элемент массива как есть (примитив)
        valueToRender = String((arrayContext.item as any) ?? "")
      }
    } else {
      // Вне массива — вычисляем по глобальному пути
      const srcPath = (text.value as { src: string[] }).src
      const [root, ...rest] = srcPath

      const rootObject =
        root === "context"
          ? (context as unknown as Record<string, unknown>)
          : root === "core"
            ? (core as unknown as Record<string, unknown>)
            : root === "state"
              ? (state as unknown as Record<string, unknown>)
              : undefined

      if (rootObject) {
        let current: unknown = rootObject
        for (const segment of rest) {
          if (current == null) break
          current = (current as Record<string, unknown>)[segment]
        }
        valueToRender = String(current ?? "")
      } else {
        valueToRender = ""
      }
    }
  } else {
    // 3/4) Прямая интерполяция по ключу ИЛИ смешанный вариант с result
    const { src, key } = text.value as { src: string; key?: string | string[]; result?: string }

    // Определяем корневой объект по источнику
    const rootObject =
      src === "context"
        ? (context as unknown as Record<string, unknown>)
        : src === "core"
          ? (core as unknown as Record<string, unknown>)
          : src === "state"
            ? (state as unknown as Record<string, unknown>)
            : src === "item" && arrayContext
              ? (arrayContext.item as unknown as Record<string, unknown>)
              : undefined

    // 4) Если указан result — вычисляем шаблон напрямую
    if ("result" in text.value && text.value.result) {
      valueToRender = evaluateInterpolation(text.value.result, state, context, core, arrayContext)
    } else if (rootObject && key) {
      // 3) Прямая интерполяция по ключу
      const path: string[] = Array.isArray(key) ? key : [String(key)]

      let current: unknown = rootObject
      for (const segment of path) {
        if (current == null) break
        current = (current as Record<string, unknown>)[segment]
      }
      valueToRender = String(current ?? "")
    } else {
      // Специальный случай: ${state} без ключа → вставляем текущее значение состояния
      if (src === "state") {
        valueToRender = String(state ?? "")
      } else {
        valueToRender = ""
      }
    }
  }

  // Создаем текстовый узел, только если есть что отрисовать
  if (valueToRender !== "") {
    parentElement.appendChild(document.createTextNode(valueToRender))
  }
}
