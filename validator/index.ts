// Валидация конфигурации состояний конечного автомата на наличие циклов безусловных переходов
import type { ContextSchema } from "../context"
import type { StatesConfig } from "../transition.t.ts"

/**
 * Проверяет, что в конфигурации состояний нет циклов безусловных переходов.
 * Если цикл найден — выбрасывает ошибку с пояснением.
 */
export function validateNoUnconditionalCycles<S extends string, C extends ContextSchema>(states: StatesConfig<S, C>) {
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
