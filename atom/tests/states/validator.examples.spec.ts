import { test, expect } from "bun:test"
import { validateNoUnconditionalCycles } from "../../../dsl/meta/states.ts"
import type { Superposition } from "../../../dsl/meta/states.t.ts"

test("Валидация корректной конфигурации состояний", () => {
  const validStates: Superposition = {
    anonymous: { loading: {} },
    loading: {}, // Конечное состояние без переходов
  }

  expect(
    () => validateNoUnconditionalCycles(validStates),
    "Не должно быть ошибки для корректной конфигурации"
  ).not.toThrow()
})

test("Валидация конфигурации с условными переходами", () => {
  const conditionalStates: Superposition = {
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
  const cyclicStates: Superposition = {
    anonymous: { loading: {} }, // Безусловный переход
    loading: { anonymous: {} }, // Безусловный переход обратно
  }

  expect(
    () => validateNoUnconditionalCycles(cyclicStates),
    "Должна быть выброшена ошибка о цикле безусловных переходов"
  ).toThrow()
})

test("Валидация сложной конфигурации с циклом", () => {
  const complexCyclicStates: Superposition = {
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
  const emptyConditionsStates: Superposition = {
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
  const mixedStates: Superposition = {
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
