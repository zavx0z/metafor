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
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          // Начальное значение 0 ≤ 50, поэтому НЕ переходит после write()
          params: [[0, 0]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 50 } }]], // IDLE → PATROL
            [null as any], // PATROL — терминальное
          ],
        },
        {
          // Начальное значение 50 не > 50, поэтому НЕ переходит после write()
          params: [[0, 50]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 50 } }]],
            [null],
          ],
        },
      ],
    })
    
    // После write() нет переходов (0 ≤ 50, 50 не > 50)
    expect(initialStates).toEqual([])

    const states = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    // Брана 0: hp=100 > 50 → состояние 1 (изменение)
    // Брана 1: hp=50 не > 50 → состояние 0 (без изменений, не в результате)
    expect(states).toContainEqual([0, 1])
  })

  test("должен перейти из IDLE в DEAD при hp <= 0", async () => {
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          // Начальное значение 100 > 50, поэтому после write() state=1 (PATROL)
          params: [[0, 100]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 50 } }]], // IDLE → PATROL
            [[2, { 0: { lte: 0 } }]], // PATROL → DEAD
            [null as any],
          ],
        },
      ],
    })
    
    // После write() state=1 (PATROL)
    expect(initialStates).toContainEqual([0, 1])

    // update с hp=0 → DEAD
    const states1 = await update([[0, [{ fieldIndex: 0, value: 0 }]]])
    expect(states1).toContainEqual([0, 2]) // DEAD
  })

  test("должен работать с gte (больше или равно)", async () => {
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          // Начальное значение 0 < 50, поэтому НЕ переходит после write()
          params: [[0, 0]],
          state: 0,
          collapses: [
            [[1, { 0: { gte: 50 } }]],
            [null],
          ],
        },
      ],
    })
    
    // После write() нет переходов
    expect(initialStates).toEqual([])

    const states = await update([[0, [{ fieldIndex: 0, value: 50 }]]])  // 50 >= 50 → переход
    expect(states).toContainEqual([0, 1])
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
    const initialStates = await write({
      fields: [{ type: FieldType.BOOL }],
      branes: [
        {
          // Начальное значение false ≠ true, поэтому НЕ переходит после write()
          params: [[0, false]],
          state: 0,
          collapses: [
            [[1, { 0: true }]],
            [null],
          ],
        },
      ],
    })
    
    // После write() нет переходов
    expect(initialStates).toEqual([])

    const states = await update([[0, [{ fieldIndex: 0, value: true }]]])
    expect(states).toContainEqual([0, 1])
  })

  test("должен перейти при isAlive === false", async () => {
    const initialStates = await write({
      fields: [{ type: FieldType.BOOL }],
      branes: [
        {
          // Начальное значение true ≠ false, поэтому НЕ переходит после write()
          params: [[0, true]],
          state: 0,
          collapses: [
            [[1, { 0: false }]],
            [null],
          ],
        },
      ],
    })
    
    // После write() нет переходов
    expect(initialStates).toEqual([])

    const states = await update([[0, [{ fieldIndex: 0, value: false }]]])
    expect(states).toContainEqual([0, 1])
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
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }, { type: FieldType.F32 }],
      branes: [
        {
          // Начальное значение hp=0, mana=0 не удовлетворяет условиям
          params: [
            [0, 0],
            [1, 0],
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
    
    // После write() нет переходов
    expect(initialStates).toEqual([])

    const states = await update([[0, [
      { fieldIndex: 0, value: 100 },  // hp=100>50
      { fieldIndex: 1, value: 50 },   // mana=50>20 → переход
    ]]])
    expect(states).toContainEqual([0, 1])
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
    const initialStates = await write({
      fields: [
        { type: FieldType.F32 }, // hp (local - разные значения)
        { type: FieldType.BOOL }, // isAlive (entangled - одинаковые значения)
      ],
      branes: [
        {
          // Начальное значение isAlive=false ≠ true, поэтому НЕ переходит после write()
          params: [
            [0, 100],
            [1, false],
          ],
          state: 0,
          collapses: [
            [[1, { 1: true }]],  // Переход при isAlive === true
            [null as any],
          ],
        },
      ],
    })
    
    // После write() нет переходов
    expect(initialStates).toEqual([])

    // update с isAlive=true → переход
    const states = await update([[0, [{ fieldIndex: 1, value: true }]]])
    expect(states).toContainEqual([0, 1])
  })

  test("должен работать с mixed: local + entangled поля", async () => {
    const initialStates = await write({
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
    
    // После write(): брана 0 mana=10<30 → state=1, брана 1 mana=50 не <30 → state=0
    expect(initialStates).toContainEqual([0, 1])  // Брана 0 перешла

    // Обновляем брану 1: mana=50 → mana=20 (< 30, теперь должен перейти)
    const states = await update([[1, [{ fieldIndex: 1, value: 20 }]]])
    expect(states).toContainEqual([1, 1])  // Брана 1 изменилась
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
    const initialStates = await write({
      fields: [
        { type: FieldType.F32 },
        { type: FieldType.F32 },
      ],
      branes: [
        {
          params: [
            [0, 0],  // hp=0 ≤ 50, поэтому НЕ переходит после write()
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
    
    // После write() state=0 (hp=0 ≤ 50)
    expect(initialStates).toEqual([])

    // Шаг 1: IDLE → PATROL (hp=100>50)
    const states1 = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    expect(states1).toContainEqual([0, 1])

    // Шаг 2: PATROL → COMBAT (mana=5<10)
    const states2 = await update([[0, [{ fieldIndex: 1, value: 5 }]]])
    expect(states2).toContainEqual([0, 2])

    // Шаг 3: COMBAT — терминальное состояние (остаётся в 2)
    const states3 = await update([[0, [{ fieldIndex: 0, value: 0 }]]])
    expect(states3).toEqual([])  // Нет изменений, терминальное состояние
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
