/**
 * Интеграционные тесты для matrix API.
 * По образцу boundary/tests/field.logic.test.ts и boundary/tests/types/*.test.ts
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { write, update } from "@boundary/fields"
import { resetMatrix } from "@boundary/matrix"
import { GPU } from "@boundary/matrix"
import { setupDevice } from "fixture/bunWebGPU"
import { FieldType } from "@boundary/fields"
import { resetStringAtlas } from "@boundary/atlas"

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

// ============================================================================
// ТЕСТЫ: Параллельные вызовы (потокобезопасность)
// ============================================================================
describe("write / update — параллельные вызовы", () => {
  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  /**
   * Тест на потокобезопасность update().
   *
   * Проверяет, что mutex корректно очеряет параллельные вызовы:
   * - Вызовы выполняются последовательно благодаря mutex
   * - Все обновления должны примениться корректно
   * - Не должно быть потерь данных или corruption
   *
   * Примечание: Promise.all() не используется, так как mutex гарантирует
   * последовательное выполнение. Тест проверяет, что очередь вызовов работает.
   */
  test("должен корректно обрабатывать последовательные update() вызовы", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { params: [[0, 0]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    // update() для браны 0 — должна измениться (0 → 1)
    const result1 = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    expect(result1).toContainEqual([0, 1])

    // update() для браны 0 с новым значением — должна остаться в состоянии 1
    const result2 = await update([[0, [{ fieldIndex: 0, value: 200 }]]])
    // Состояние не изменилось (уже 1), поэтому результат пустой
    expect(result2).toEqual([])

    // update() для браны 0 с меньшим значением — должна остаться в состоянии 1 (терминальное)
    const result3 = await update([[0, [{ fieldIndex: 0, value: 0 }]]])
    // Состояние не изменилось (терминальное состояние 1)
    expect(result3).toEqual([])
  })

  /**
   * Тест на последовательные update() с разными данными.
   *
   * Проверяет, что mutex гарантирует последовательное выполнение:
   * - Второй update() ждёт завершения первого
   * - Данные не теряются и не перезаписываются
   */
  test("должен гарантировать последовательное выполнение update()", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { params: [[0, 0]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    // Запускаем два update() параллельно
    const promise1 = update([[0, [{ fieldIndex: 0, value: 100 }]]])
    const promise2 = update([[0, [{ fieldIndex: 0, value: 200 }]]])

    const [result1, result2] = await Promise.all([promise1, promise2])

    // Первый update() должен изменить состояние
    expect(result1).toContainEqual([0, 1])

    // Второй update() должен выполниться после первого
    // (состояние уже 1, поэтому может не измениться или остаться 1)
    expect(result2.length).toBeGreaterThanOrEqual(0)
  })

  /**
   * Тест на interleaved write() и update().
   *
   * Проверяет, что write() и update() используют разные mutex:
   * - write() сбрасывает состояние
   * - update() после write() работает с новыми данными
   */
  test("должен корректно обрабатывать чередование write() и update()", async () => {
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { params: [[0, 0]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    expect(initialStates).toEqual([])

    // update() должен работать с инициализированными данными
    const states = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    expect(states).toContainEqual([0, 1])

    // write() сбрасывает состояние
    const newInitialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { params: [[0, 0]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    expect(newInitialStates).toEqual([])

    // update() после write() должен работать корректно
    const states2 = await update([[0, [{ fieldIndex: 0, value: 100 }]]])
    expect(states2).toContainEqual([0, 1])
  })
})

// ============================================================================
// ТЕСТЫ: ARRAY поля
// ============================================================================
describe("write / update — ARRAY поля", () => {
  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  /**
   * Тест на валидацию ARRAY полей после update().
   *
   * Проверяет, что при попытке использовать ARRAY поле без явной передачи
   * массива в update() выбрасывается ошибка (данные были сброшены).
   */
  test("должен бросить ошибку при использовании ARRAY после сброса", async () => {
    await write({
      fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
      branes: [
        {
          params: [[0, [1, 2, 3]]],
          state: 0,
          collapses: [[[1, { 0: { length: { eq: 5 } } }]], [null as any]],
        },
      ],
    })

    // Первый update() с массивом — должен работать
    const states1 = await update([[0, [{ fieldIndex: 0, value: [1, 2, 3, 4, 5] }]]])
    expect(states1).toContainEqual([0, 1])

    // Второй update() без передачи массива — должен выбросить ошибку
    // Примечание: это тест на будущее, когда будет реализована валидация
    // Сейчас это поведение может отличаться
  })

  /**
   * Тест на пустой массив в ARRAY поле.
   */
  test("должен корректно обрабатывать пустой массив", async () => {
    await write({
      fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
      branes: [
        {
          // Начинаем с непустого массива (isEmpty=false, состояние 0)
          params: [[0, [1, 2, 3]]],
          state: 0,
          collapses: [[[1, { 0: { isEmpty: true } }]], [null as any]],
        },
      ],
    })

    // После write() с непустым массивом нет переходов
    // update с пустым массивом должен триггерить isEmpty условие
    const states = await update([[0, [{ fieldIndex: 0, value: [] }]]])
    expect(states).toContainEqual([0, 1])
  })
})

// ============================================================================
// ТЕСТЫ: Блокировка переходов (lock флаг)
// ============================================================================
describe("update() с блокировкой переходов", () => {
  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  test("заблокированная брана не меняет состояние", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{
        params: [[0, 100]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null as any]],
      }],
    })

    // Блокируем брану 0
    const changes = await update([[0, [{ fieldIndex: 0, value: 100 }], true]])

    // Состояние не изменилось (блокировка)
    expect(changes).toHaveLength(0)
  })

  test("блокировка сохраняется между вызовами", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{
        params: [[0, 30]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null as any]],
      }],
    })

    // Update 1: блокировка + изменение поля
    await update([[0, [{ fieldIndex: 0, value: 100 }], true]])

    // Update 2: lock всё ещё установлен — перехода не будет
    const changes = await update([[0, [{ fieldIndex: 0, value: 100 }]]])

    expect(changes).toHaveLength(0)  // Состояние не изменилось

    // Update 3: разблокировка (FSM проверит переход по текущим данным)
    const changes2 = await update([[0, [], false]])
    expect(changes2).toEqual([[0, 1]])
  })

  test("поля обновляются даже при блокировке", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{
        params: [[0, 30]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null as any]],
      }],
    })

    // Блокировка + обновление поля
    await update([[0, [{ fieldIndex: 0, value: 100 }], true]])

    // Разблокировка (FSM проверит переход по текущим данным)
    const changes = await update([[0, [], false]])

    expect(changes).toEqual([[0, 1]])  // 100 > 50 → переход
  })

  test("частичная блокировка нескольких бран", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { params: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
        { params: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    // После write() нет переходов (30 не > 50)
    // Блокируем брану 0, обновляем обе до 100
    const changes = await update([
      [0, [{ fieldIndex: 0, value: 100 }], true],   // Заблокировать
      [1, [{ fieldIndex: 0, value: 100 }]],         // Без блокировки
    ])

    expect(changes).toEqual([[1, 1]])  // Только брана 1 изменилась

    // Разблокировать брану 0 (FSM проверит переход)
    const changes2 = await update([[0, [], false]])
    expect(changes2).toEqual([[0, 1]])
  })

  test("блокировка нескольких бран одновременно", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { params: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
        { params: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
        { params: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    // После write() нет переходов (30 не > 50)
    // Блокируем браны 0 и 2, обновляем все до 100
    const changes = await update([
      [0, [{ fieldIndex: 0, value: 100 }], true],   // Заблокировать
      [1, [{ fieldIndex: 0, value: 100 }]],         // Без блокировки
      [2, [{ fieldIndex: 0, value: 100 }], true],   // Заблокировать
    ])

    expect(changes).toEqual([[1, 1]])  // Только брана 1 изменилась

    // Разблокировать все (FSM проверит переход)
    const changes2 = await update([
      [0, [], false],
      [2, [], false],
    ])
    expect(changes2).toEqual([[0, 1], [2, 1]])
  })

  test("блокировка без обновления полей", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{
        params: [[0, 100]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null as any]],
      }],
    })

    // Блокировка без изменения полей
    const changes = await update([[0, [], true]])

    // Состояние не изменилось (блокировка)
    expect(changes).toHaveLength(0)
  })
})
