import type { Schema } from "@zavx0z/context"
import type { StatesConfig } from "./states.t"
export type { StatesConfig }

/**
 * Проверяет, что в конфигурации состояний нет циклов безусловных переходов.
 * Если цикл найден — выбрасывает ошибку с пояснением.
 *
 * @example
 * ```typescript
 * // Корректная конфигурация без циклов
 * const validStates = {
 *   anonymous: { loading: {} },
 *   loading: {}
 * }
 * validateNoUnconditionalCycles(validStates)
 * // => не выбрасывает ошибку
 *
 * // Конфигурация с циклом
 * const cyclicStates = {
 *   anonymous: { loading: {} },
 *   loading: { anonymous: {} }
 * }
 * validateNoUnconditionalCycles(cyclicStates)
 * // => Error: Обнаружен цикл безусловных переходов
 * ```
 */

export function validateNoUnconditionalCycles<S extends string, C extends Schema>(states: StatesConfig<S, C>) {
  // Строим граф только по безусловным переходам (условия: {}, null, undefined)
  const graph: Record<string, string[]> = {}
  for (const [from, transitions] of Object.entries(states)) {
    graph[from] = []
    for (const [to, cond] of Object.entries(transitions || {})) {
      // Если условие отсутствует или пустое — считаем безусловным переходом
      if (cond == null || (typeof cond === "object" && Object.keys(cond).length === 0)) {
        graph[from].push(to)
      }
    }
  }

  // Поиск циклов DFS
  function hasCycle(node: string, visited: Set<string>, stack: Set<string>): boolean {
    if (!visited.has(node)) {
      visited.add(node)
      stack.add(node)
      for (const neighbor of graph[node] || []) {
        if (!visited.has(neighbor) && hasCycle(neighbor, visited, stack)) {
          return true
        } else if (stack.has(neighbor)) {
          return true
        }
      }
    }
    stack.delete(node)
    return false
  }

  const visited = new Set<string>()
  for (const node of Object.keys(graph)) {
    if (hasCycle(node, visited, new Set())) {
      throw new Error(
        `В конфигурации состояний обнаружен цикл безусловных переходов (например, "${node}"). Добавьте условия для выхода из цикла.`
      )
    }
  }
}
