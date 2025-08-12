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

  const value: any = text.value as any

  // 1) Статический текст
  if (typeof value === "string") {
    valueToRender = value
  }
  // 2) Источник задан составным путем (src: string[])
  else if (Array.isArray(value.src)) {
    if (arrayContext) {
      const keyMaybe = value.key as string | string[] | undefined
      if (keyMaybe) {
        const path: string[] = Array.isArray(keyMaybe) ? keyMaybe : [String(keyMaybe)]
        let current: unknown = arrayContext.item as Record<string, unknown>
        for (const segment of path) {
          if (current == null) break
          current = (current as Record<string, unknown>)[segment]
        }
        valueToRender = String(current ?? "")
      } else {
        valueToRender = String((arrayContext.item as any) ?? "")
      }
    } else {
      const srcPath = value.src as string[]
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
  }
  // 3) Унифицированный шаблонный формат: { template, items }
  else if (value && typeof value === "object" && "template" in value && Array.isArray(value.items)) {
    const template: string = value.template
    const items: Array<{ src: string | string[]; key?: string | string[] } | { src: "state" }> = value.items

    const values: string[] = items.map((it) => {
      // ${state}
      if ((it as any).src === "state") return String(state ?? "")

      // src: string[] как глобальный путь ["context", ...] | ["core", ...] | ["state", ...]
      if (Array.isArray(it.src)) {
        const [root, ...rest] = it.src
        let rootObj: any =
          root === "context" ? context : root === "core" ? core : root === "state" ? (state as any) : undefined
        let current: any = rootObj
        for (const seg of rest) {
          if (current == null) break
          current = current[seg as any]
        }
        return String(current ?? "")
      }

      // src: "context" | "core" с key
      if (typeof it.src === "string" && it.src !== "state") {
        const source: any = it.src === "context" ? context : it.src === "core" ? core : undefined
        if ("key" in it && it.key) {
          const path = Array.isArray(it.key) ? it.key : [it.key]
          let current: any = source
          for (const seg of path) {
            if (current == null) break
            current = current[seg as any]
          }
          return String(current ?? "")
        }
      }

      return ""
    })

    valueToRender = template.replace(/\$\{(\d+)\}/g, (_m, idx) => values[Number(idx)] ?? "")
  }
  // 4) Прямая интерполяция по ключу (старый формат)
  else if (value && typeof value === "object" && "src" in value) {
    const src: string = value.src
    const key: string | string[] | undefined = value.key

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

    if (rootObject && key) {
      const path: string[] = Array.isArray(key) ? key : [String(key)]
      let current: unknown = rootObject
      for (const segment of path) {
        if (current == null) break
        current = (current as Record<string, unknown>)[segment]
      }
      valueToRender = String(current ?? "")
    } else if (src === "state") {
      valueToRender = String(state ?? "")
    } else {
      valueToRender = ""
    }
  }

  if (valueToRender !== "") {
    parentElement.appendChild(document.createTextNode(valueToRender))
  }
}
