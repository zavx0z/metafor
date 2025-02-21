/**
 * Проверяет параметры создания атома
 * @param {Object} params Параметры валидации
 * @param {Object} params.options Опции создания атома
 * @param {string} params.options.state Начальное состояние
 * @param {Object} [params.options.context] Начальный контекст
 * @param {Object} [params.options.debug] Опции отладки
 * @param {Object} [params.options.graph] Опции графа
 * @param {string[]} params.states Список допустимых состояний
 * @throws {Error} Если параметры некорректны
 */
export function validateAtomOptions({options, states}) {
  if (!options || typeof options !== "object") throw new Error("Не указаны опции создания атома")
  const {state, context, debug, graph} = options
  if (!state || typeof state !== "string") throw new Error("Начальное состояние должно быть непустой строкой")
  if (!states.includes(state)) throw new Error(`Недопустимое начальное состояние "${state}". Допустимые состояния: [${states.join(", ")}]`)
  if (context !== undefined && (context === null || typeof context !== "object")) throw new Error("Начальный контекст должен быть объектом")
  if (debug !== undefined && (debug === null || typeof debug !== "object")) throw new Error("Опции отладки должны быть объектом")
  if (graph !== undefined && typeof graph !== "boolean" && typeof graph !== "object") throw new Error("Опции графа должны быть булевым значением или объектом")
}
