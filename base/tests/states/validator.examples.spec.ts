import { test, expect } from "bun:test"
import { validateNoUnconditionalCycles } from "../../../schema/states.ts"
import type { StatesConfig } from "../../../schema/states.t.ts"

test("Валидация корректной конфигурации состояний", () => {
  const validStates: StatesConfig = {
    anonymous: { loading: {} },
    loading: {}, // Конечное состояние без переходов
  }

  expect(
    () => validateNoUnconditionalCycles(validStates),
    "Не должно быть ошибки для корректной конфигурации"
  ).not.toThrow()
})

test("Валидация конфигурации с условными переходами", () => {
  const conditionalStates: StatesConfig = {
    anonymous: {
      loading: { userAction: null }, // Условный переход
    },
    loading: {
      authenticated: { authSuccess: true }, // Условный переход
    },
    authenticated: {},
  }

  expect(
    () => validateNoUnconditionalCycles(conditionalStates),
    "Не должно быть ошибки для условных переходов"
  ).not.toThrow()
})

test("Валидация конфигурации с циклом безусловных переходов", () => {
  const cyclicStates: StatesConfig = {
    anonymous: { loading: {} }, // Безусловный переход
    loading: { anonymous: {} }, // Безусловный переход обратно
  }

  expect(
    () => validateNoUnconditionalCycles(cyclicStates),
    "Должна быть выброшена ошибка о цикле безусловных переходов"
  ).toThrow()
})

test("Валидация сложной конфигурации с циклом", () => {
  const complexCyclicStates: StatesConfig = {
    state1: { state2: {} },
    state2: { state3: {} },
    state3: { state1: {} }, // Замыкает цикл
    state4: { state5: {} },
    state5: {},
  }

  expect(
    () => validateNoUnconditionalCycles(complexCyclicStates),
    "Должна быть выброшена ошибка о сложном цикле безусловных переходов"
  ).toThrow()
})

test("Валидация конфигурации с пустыми условиями", () => {
  const emptyConditionsStates: StatesConfig = {
    state1: { state2: { field: {} } }, // Пустое условие считается безусловным
    state2: { state3: { field: null } }, // null условие считается безусловным
    state3: {},
  }

  expect(
    () => validateNoUnconditionalCycles(emptyConditionsStates),
    "Не должно быть ошибки для пустых условий без циклов"
  ).not.toThrow()
})

test("Валидация конфигурации с условными и безусловными переходами", () => {
  const mixedStates: StatesConfig = {
    start: {
      processing: { action: true }, // Условный переход
      error: {}, // Безусловный переход
    },
    processing: {
      success: { result: true }, // Условный переход
      error: {}, // Безусловный переход
    },
    success: {},
    error: { start: {} }, // Безусловный переход обратно
  }

  expect(
    () => validateNoUnconditionalCycles(mixedStates),
    "Должна быть выброшена ошибка о цикле с условными и безусловными переходами"
  ).toThrow()
})
