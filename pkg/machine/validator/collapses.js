/**
 * Проверяет возможность циклического перехода между состояниями
 * @param {Object} params Параметры проверки
 * @param {string} params.fromState Исходное состояние
 * @param {string} params.toState Целевое состояние
 * @param {Record<string, any>} params.forwardConditions Условия прямого перехода
 * @param {Record<string, any>} params.backwardConditions Условия обратного перехода
 * @throws {Error} Если найдена циклическая зависимость
 */
function canCreateCycle({fromState, toState, forwardConditions, backwardConditions}) {
  const commonFields = Object.keys(forwardConditions).filter(key => key in backwardConditions)

  for (const field of commonFields) {
    const forward = forwardConditions[field]
    const backward = backwardConditions[field]

    // Проверяем только если оба условия числовые с диапазонами
    if (typeof forward === "object" && typeof backward === "object") {
      const forwardRange = {
        min: forward.gt ?? forward.gte ?? -Infinity,
        max: forward.lt ?? forward.lte ?? Infinity
      }
      const backwardRange = {
        min: backward.gt ?? backward.gte ?? -Infinity,
        max: backward.lt ?? backward.lte ?? Infinity
      }

      // Проверяем, что диапазоны не пересекаются и образуют разрыв
      const hasGap = forwardRange.max < backwardRange.min || backwardRange.max < forwardRange.min

      // Если нет разрыва между диапазонами, значит возможен цикл
      if (!hasGap) {
        throw new Error(
          `Обнаружена потенциальная циклическая зависимость в атоме между состояниями ` +
          `${fromState} и ${toState}.\nУсловия переходов для поля "${field}":\n` +
          `${fromState} -> ${toState}: ${JSON.stringify(forward)}\n` +
          `${toState} -> ${fromState}: ${JSON.stringify(backward)}\n` +
          `Диапазоны:\n` +
          `${fromState} -> ${toState}: (${forwardRange.min}, ${forwardRange.max})\n` +
          `${toState} -> ${fromState}: (${backwardRange.min}, ${backwardRange.max})\n` +
          `Условия должны иметь непересекающиеся диапазоны значений`
        )
      }
    }
  }
}

/**
 * Проверяет циклические зависимости
 * @param {Object} params
 * @param {Array<import('../types/collapse.ts').Collapse<any, any>>} params.collapses
 */
export function validateCycles({collapses}) {
  /** @type {Map<string, Array<{state: string, conditions: Record<string, any>}>>} */
  const transitions = new Map()

  // Строим граф переходов
  collapses.forEach(collapse => {
    if (!transitions.has(collapse.from)) {
      transitions.set(collapse.from, [])
    }
    collapse.to.forEach(transition => {
      transitions.get(collapse.from)?.push({
        state: transition.state,
        conditions: transition.trigger || {}
      })
    })
  })

  /**
   * Рекурсивно проверяет циклы в графе переходов
   * @param {string} state Текущее состояние
   * @param {Set<string>} visited Множество посещенных состояний
   * @param {Array<{state: string, conditions: Record<string, any>}>} path Путь в графе
   */
  function checkCycles(state, visited = new Set(), path = []) {
    if (visited.has(state)) {
      const cycleStart = path.findIndex(p => p.state === state)
      const cycle = path.slice(cycleStart)

      for (let i = 0; i < cycle.length; i++) {
        const current = cycle[i]
        const next = cycle[(i + 1) % cycle.length]

        const forwardTransitions = transitions.get(current.state) || []
        const forwardTransition = forwardTransitions.find(t => t.state === next.state)

        const backwardTransitions = transitions.get(next.state) || []
        const backwardTransition = backwardTransitions.find(t => t.state === current.state)

        if (forwardTransition && backwardTransition) {
          canCreateCycle({
            fromState: current.state,
            toState: next.state,
            forwardConditions: forwardTransition.conditions,
            backwardConditions: backwardTransition.conditions,
          })
        }
      }
      return
    }
    visited.add(state)
    const nextTransitions = transitions.get(state) || []
    for (const transition of nextTransitions) checkCycles(transition.state, visited, [...path, {state, conditions: transition.conditions}])
    visited.delete(state)
  }
  // Проверяем циклы из каждого состояния
  for (const state of transitions.keys()) checkCycles(state)
}

