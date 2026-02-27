/**
 * Интеграционные тесты для matrix API.
 */

import { test, expect, beforeAll } from "bun:test"
import { write, update } from "./index"
import { GPU } from "./gpu/device"
import { setupDevice } from "fixture/bunWebGPU"
import { FieldType } from "./index.t"

// ============================================================================
// SETUP: GPU один раз перед всеми тестами
// ============================================================================

beforeAll(async () => (GPU._device = await setupDevice()))

// ============================================================================
// ТЕСТЫ
// ============================================================================

test("write — инициализирует 1 брану с 1 полем", async () => {
  await write({
    fields: [{ type: FieldType.F32 }],
    branes: [
      {
        params: [[0, 100]],
        state: 0,
        collapses: [
          [[1, { 0: { gt: 50 } }]], // [targetState, conditions]
          [null as any],
        ],
      },
    ],
  })

  // Пока ничего не проверяем — просто что функция есть
  expect(true).toBe(true)
})

test("update — возвращает [[braneIndex, state], ...]", async () => {
  await write({
    fields: [{ type: FieldType.F32 }],
    branes: [
      {
        params: [[0, 100]],
        state: 0,
        collapses: [[null as any]],
      },
    ],
  })

  const states = await update(0, 0, 50)

  expect(states).toBeInstanceOf(Array)
  expect(states[0]).toEqual([0, expect.any(Number)])
})
