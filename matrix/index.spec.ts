/**
 * Интеграционные тесты для matrix API.
 * По образцу boundary/tests/field.logic.test.ts и boundary/tests/types/*.test.ts
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { write, update, resetMatrix } from "./index"
import { GPU } from "./gpu/device"
import { setupDevice } from "fixture/bunWebGPU"
import { FieldType } from "./index.t"
import { resetStringAtlas } from "./StringAtlas"

// ============================================================================
// SETUP: GPU один раз перед всеми тестами
// ============================================================================
beforeAll(async () => {
  GPU._device = await setupDevice()
})

// ============================================================================
// ТЕСТЫ: Базовые переходы состояний
// ============================================================================
describe("write / update — базовые переходы", () => {
  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  test("должен перейти из IDLE в PATROL при hp > 50", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          params: [[0, 100]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 50 } }]], // IDLE → PATROL
            [null as any], // PATROL — терминальное
          ],
        },
        {
          params: [[0, 50]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 50 } }]],
            [null],
          ],
        },
      ],
    })

    const states = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    // Брана 0: hp=100 > 50 → состояние 1
    // Брана 1: hp=50 не > 50 → состояние 0
    expect(states[0]).toEqual([0, 1])
    expect(states[1]).toEqual([1, 0])
  })

  test("должен перейти из IDLE в DEAD при hp <= 0", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          params: [[0, 100]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 50 } }]], // → PATROL
            [[2, { 0: { lte: 0 } }]], // → DEAD
            [null as any],
          ],
        },
      ],
    })

    const states1 = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    expect(states1[0]?.[1]).toBe(1) // PATROL

    const states2 = await update([[0, [{ fieldIndex: 0, value: 0 }]]])
    expect(states2[0]?.[1]).toBe(2) // DEAD
  })

  test("должен работать с gte (больше или равно)", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          params: [[0, 50]],
          state: 0,
          collapses: [
            [[1, { 0: { gte: 50 } }]],
            [null],
          ],
        },
        {
          params: [[0, 49]],
          state: 0,
          collapses: [
            [[1, { 0: { gte: 50 } }]],
            [null],
          ],
        },
      ],
    })

    const states = await update([[0, [{ fieldIndex: 0, value: 50 }]]])
    expect(states[0]?.[1]).toBe(1) // 50 >= 50 → переход
    expect(states[1]?.[1]).toBe(0) // 49 не >= 50 → нет перехода
  })
})

// ============================================================================
// ТЕСТЫ: Логические условия (BOOL)
// ============================================================================
describe("write / update — логические условия", () => {
  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  test("должен перейти при isAlive === true", async () => {
    await write({
      fields: [{ type: FieldType.BOOL }],
      branes: [
        {
          params: [[0, true]],
          state: 0,
          collapses: [
            [[1, { 0: true }]],
            [null],
          ],
        },
        {
          params: [[0, false]],
          state: 0,
          collapses: [
            [[1, { 0: true }]],
            [null],
          ],
        },
      ],
    })

    const states = await update([[0, [{ fieldIndex: 0, value: true }]]])
    expect(states[0]?.[1]).toBe(1) // true → переход
    expect(states[1]?.[1]).toBe(0) // false → нет перехода
  })

  test("должен перейти при isAlive === false", async () => {
    await write({
      fields: [{ type: FieldType.BOOL }],
      branes: [
        {
          params: [[0, false]],
          state: 0,
          collapses: [
            [[1, { 0: false }]],
            [null],
          ],
        },
      ],
    })

    const states = await update([[0, [{ fieldIndex: 0, value: false }]]])
    expect(states[0]?.[1]).toBe(1)
  })
})

// ============================================================================
// ТЕСТЫ: Множественные условия
// ============================================================================
describe("write / update — множественные условия", () => {
  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  test("должен перейти при выполнении обоих условий (hp > 50 И mana > 20)", async () => {
    await write({
      fields: [{ type: FieldType.F32 }, { type: FieldType.F32 }],
      branes: [
        {
          params: [
            [0, 100],
            [1, 50],
          ],
          state: 0,
          collapses: [
            [
              [
                1,
                {
                  0: { gt: 50 },
                  1: { gt: 20 },
                },
              ],
            ],
            [null],
          ],
        },
        {
          params: [
            [0, 100],
            [1, 10],
          ],
          state: 0,
          collapses: [
            [
              [
                1,
                {
                  0: { gt: 50 },
                  1: { gt: 20 },
                },
              ],
            ],
            [null],
          ],
        },
      ],
    })

    const states = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    expect(states[0]?.[1]).toBe(1) // hp=100>50 И mana=50>20 → переход
    expect(states[1]?.[1]).toBe(0) // hp=100>50 НО mana=10 не >20 → нет перехода
  })
})

// ============================================================================
// ТЕСТЫ: Entangled группы (shared блоки)
// ============================================================================
describe("write / update — entangled группы", () => {
  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  test("должен создать entangled блок для одинаковых значений", async () => {
    await write({
      fields: [
        { type: FieldType.F32 }, // hp (разные)
        { type: FieldType.BOOL }, // isAlive (одинаковые)
      ],
      branes: [
        {
          params: [
            [0, 100],
            [1, true],
          ],
          state: 0,
          collapses: [[null as any]],
        },
        {
          params: [
            [0, 50],
            [1, true],
          ],
          state: 0,
          collapses: [[null as any]],
        },
      ],
    })

    // Просто проверяем что write() проходит без ошибок
    const states = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    expect(states).toHaveLength(2)
  })

  test("должен работать с mixed: local + entangled поля", async () => {
    await write({
      fields: [
        { type: FieldType.F32 }, // hp (shared)
        { type: FieldType.F32 }, // mana (local)
        { type: FieldType.BOOL }, // isAlive (shared)
      ],
      branes: [
        {
          params: [
            [0, 100],
            [1, 10],  // mana=10 < 30 → должен перейти
            [2, true],
          ],
          state: 0,
          collapses: [
            [[1, { 1: { lt: 30 } }]], // mana < 30 → переход
            [null],
          ],
        },
        {
          params: [
            [0, 100],
            [1, 50],  // mana=50 не < 30 → не должен перейти
            [2, true],
          ],
          state: 0,
          collapses: [
            [[1, { 1: { lt: 30 } }]],
            [null],
          ],
        },
      ],
    })

    // Обновляем брану 1: mana=50 → mana=20 (< 30, теперь должен перейти)
    const states = await update([[1, [{ fieldIndex: 1, value: 20 }]]])
    expect(states[0]?.[1]).toBe(1) // брана 0: mana=10 < 30 → переход
    expect(states[1]?.[1]).toBe(1) // брана 1: mana=20 < 30 → переход
  })
})

// ============================================================================
// ТЕСТЫ: Многошаговая эволюция
// ============================================================================
describe("write / update — многошаговая эволюция", () => {
  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  test("должен пройти через несколько состояний", async () => {
    await write({
      fields: [
        { type: FieldType.F32 },
        { type: FieldType.F32 },
      ],
      branes: [
        {
          params: [
            [0, 100],
            [1, 5],
          ],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 50 } }]], // IDLE → PATROL
            [[2, { 1: { lt: 10 } }]], // PATROL → COMBAT
            [null],
          ],
        },
      ],
    })

    // Шаг 1: IDLE → PATROL (hp=100>50)
    const states1 = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    expect(states1[0]?.[1]).toBe(1)

    // Шаг 2: PATROL → COMBAT (mana=5<10)
    const states2 = await update([[0, [{ fieldIndex: 1, value: 5 }]]])
    expect(states2[0]?.[1]).toBe(2)
  })
})

// ============================================================================
// ТЕСТЫ: Ошибки
// ============================================================================
describe("write / update — ошибки", () => {
  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  test("должен бросить ошибку при update() до write()", async () => {
    await expect(update([[0, [{ fieldIndex: 0, value: 100 }]]])).rejects.toThrow("Matrix not initialized")
  })

  test("должен бросить ошибку при неверном индексе браны", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{ params: [[0, 100]], state: 0, collapses: [[null as any]] }],
    })

    await expect(update([[999, [{ fieldIndex: 0, value: 100 }]]])).rejects.toThrow("Brane index out of range")
  })
})
