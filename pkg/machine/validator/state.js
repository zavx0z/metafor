/**
 * Проверяет корректность состояний атома
 * @param {Object} params Параметры валидации
 * @param {string} params.id Идентификатор атома
 * @param {string[]} params.states Массив состояний
 * @throws {Error} Если найдены некорректные состояния
 */
export function validateStates({id, states}) {
  if (!Array.isArray(states)) {
    throw new Error("Состояния должны быть массивом строк")
  }

  states.forEach((state, index) => {
    if (!state || typeof state !== "string" || state.trim() === "") {
      throw new Error(`Состояние с индексом ${index} имеет пустое имя. Все состояния должны иметь непустые строковые имена`)
    }
  })
}
