import {validateContextDefinition as validateContextDefinitionNotWrapped} from "./context.js"
import {validateCore as validateCoreNotWrapped} from "./core.js"
import {validateCycles} from "./transitions.js"
import {validateTriggers} from "./trigger.js"
import {validateAtomOptions as validateAtomOptionsNotWrapped} from "./create.js"
import {validateStates as validateStatesNotWrapped} from "./state.js"

const channel = new BroadcastChannel("validator")

/**
 * Отправляет сообщение об ошибке
 * @param {string} id Идентификатор атома
 * @param {string} message Сообщение об ошибке
 */
function sendError(id, message) {
  channel.postMessage({ id, message, type: "error" })
}

/**
 * Отправляет предупреждение
 * @param {string} id Идентификатор атома
 * @param {string} message Сообщение предупреждения
 */
function sendWarning(id, message) {
  channel.postMessage({ id, message, type: "warning" })
}

// @ts-expect-error
export function validateContextDefinition({tag, context}) {
  try {
    validateContextDefinitionNotWrapped(context)
  } catch (error) {
    const {message} = /**@type {Error}*/ (error)
    channel.postMessage({id: tag, message})
  }
}

/**
 * Валидация переходов
 * @param {Object} params Параметры валидации
 * @param {string} params.tag Имя атома
 * @param {import('../types/index.ts').Transitions<any, any>} params.transitions Массив переходов
 * @param {import('../types/context.ts').ContextDefinition} params.contextDefinition Определение контекста
 */
export function validateTransitions({tag, transitions: transitionsList, contextDefinition}) {
  if (!Array.isArray(transitionsList)) {
    sendError(tag, `Transitions должен быть массивом, получено: ${typeof transitionsList}`)
    return
  }

  if (transitionsList.length === 0) {
    sendWarning(tag, "Transitions пуст. Атом не будет менять состояние.")
    return
  }

  // Проверка наличия обязательных полей
  transitionsList.forEach((transition, index) => {
    if (!transition.from) {
      sendError(tag, `Отсутствует обязательное поле 'from' в transitions[${index}]`)
    }

    if (!transition.to) {
      sendError(tag, `Отсутствует обязательное поле 'to' в transitions[${index}]`)
    } else if (!Array.isArray(transition.to)) {
      sendError(tag, `Поле 'to' должно быть массивом в transitions[${index}]`)
    } else {
      transition.to.forEach((to, toIndex) => {
        if (!to.state) {
          sendError(tag, `Отсутствует обязательное поле 'state' в transitions[${index}].to[${toIndex}]`)
        }
        if (!to.trigger) {
          sendError(tag, `Отсутствует обязательное поле 'trigger' в transitions[${index}].to[${toIndex}]`)
        }
      })
    }
  })

  // Проверка на циклы
  validateCycles({transitions: transitionsList})

  // Валидация триггеров
  validateTriggers({tag, transitions: transitionsList, contextDefinition})
}

/**
 * Проверяет корректность конфигурации ядра
 * @param {Object} params Параметры валидации
 * @param {string} params.tag Идентификатор атома
 * @param {any} params.core Конфигурация ядра
 * @throws {Error} Если найдены ошибки в конфигурации ядра
 */
export function validateCore({tag, core}) {
  try {
    validateCoreNotWrapped(core)
  } catch (error) {
    const {message} = /**@type {Error}*/ (error)
    channel.postMessage({id: tag, message})
  }
}

/**
 * Проверяет корректность конфигурации атома
 * @param {Object} params Параметры валидации
 * @param {string} params.tag Идентификатор атома
 * @param {any} params.options Конфигурация атома
 * @param {any} params.states Состояния атома
 * @throws {Error} Если найдены ошибки в конфигурации атома
 */
export function validateAtomOptions({tag, options, states}) {
  try {
    validateAtomOptionsNotWrapped({options, states})
  } catch (error) {
    const {message} = /**@type {Error}*/ (error)
    channel.postMessage({id: tag, message})
  }
}

/**
 * Проверяет корректность состояний атома
 * @param {Object} params Параметры валидации
 * @param {string} params.tag Идентификатор атома
 * @param {string[]} params.states Массив состояний
 */
export function validateStates({tag, states}) {
  try {
    validateStatesNotWrapped({id: tag, states})
  } catch (error) {
    const {message} = /**@type {Error}*/ (error)
    channel.postMessage({id: tag, message})
  }
}
