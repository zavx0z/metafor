import { test, expect } from "bun:test"
import { validateNoUnconditionalCycles } from "../index.ts"
import type { StatesConfig } from "../../transition.t.ts"

function getCyclicStates(): StatesConfig<string, any> {
  return {
    anonymous: { loading: {} },
    loading: { anonymous: {} },
  }
}

test("выбрасывает ошибку при цикле безусловных переходов", () => {
  const states = getCyclicStates()
  expect(
    () => validateNoUnconditionalCycles(states),
    "Должна быть выброшена ошибка о цикле безусловных переходов"
  ).toThrow()
})

test("не выбрасывает ошибку при отсутствии цикла", () => {
  const states: StatesConfig<string, any> = {
    anonymous: { loading: {} },
    loading: {},
  }
  expect(() => validateNoUnconditionalCycles(states), "Не должно быть ошибки, если цикла нет").not.toThrow()
})
