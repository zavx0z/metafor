import type { Fields } from "./fields.t"
import type { Superposition } from "./superposition.t"

/**
 * Проверяет, что в конфигурации superposition нет циклов безусловных переходов.
 * Если цикл найден — выбрасывает ошибку с пояснением.
 *
 * @example
 * ```typescript
 * // Корректная конфигурация без циклов
 * const validSuperposition = {
 *   anonymous: { loading: {} },
 *   loading: {}
 * }
 * validateNoUnconditionalCycles(validSuperposition)
 * // => не выбрасывает ошибку
 *
 * // Конфигурация с циклом
 * const cyclicSuperposition = {
 *   anonymous: { loading: {} },
 *   loading: { anonymous: {} }
 * }
 * validateNoUnconditionalCycles(cyclicSuperposition)
 * // => Error: Обнаружен цикл безусловных переходов
 * ```
 */

export function validateNoUnconditionalCycles<𝛴 extends string, ɸ extends Fields>(superposition: Superposition<𝛴, ɸ>) {
  // Строим граф только по безусловным переходам (условия: {}, null, undefined)
  const graph: Record<string, string[]> = {}
  for (const [from, transitions] of Object.entries(superposition)) {
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
        `В конфигурации superposition обнаружен цикл безусловных переходов (например, "${node}"). Добавьте условия для выхода из цикла.`
      )
    }
  }
}
