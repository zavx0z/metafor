import {validateContextDefinition as validateContextDefinitionNotWrapped} from "./context.js"
import {validateCore as validateCoreNotWrapped} from "./core.js"
import {validateCycles} from "./collapses.js"
import {validateTriggers} from "./trigger.js"
import {validateAtomOptions as validateAtomOptionsNotWrapped} from "./create.js"
import {validateStates as validateStatesNotWrapped} from "./state.js"

const channel = new BroadcastChannel("validator")

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
 * Проверяет конфигурацию коллапсов на циклические зависимости и корректность типов
 * @param {Object} params Параметры валидации
 * @param {string} params.tag Идентификатор атома
 * @param {Array<import('../types/collapse.ts').Collapse<any, any>>} params.collapses Массив коллапсов
 * @param {import('../types/index.ts').ContextDefinition} params.contextDefinition Определение контекста
 * @throws {Error} Если найдена циклическая зависимость или некорректные типы
 */
export function validateCollapses({tag, collapses, contextDefinition}) {
  try {
    validateCycles({collapses})
    validateTriggers({collapses, contextDefinition})
  } catch (error) {
    const {message} = /**@type {Error}*/ (error)
    channel.postMessage({id: tag, message})
  }
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
