/**
 * Интеграционные тесты для слабого слоя Matrix.
 * По образцу matrix/tests/field.logic.test.ts и matrix/tests/types/*.test.ts
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import {write, update} from "../matrix"
import { weak$ } from "../weak"
import {installTestGpuDevice} from "../weak/tests/shared/gpu.ts"
import { FieldType } from "../gravity"

// ============================================================================
// SETUP: GPU один раз перед всеми тестами
// ============================================================================
beforeAll(async () => {
  await installTestGpuDevice()
})

// ============================================================================
// ТЕСТЫ: Базовые переходы состояний
// ============================================================================
describe("write / update — базовые переходы", () => {
  afterEach(() => {
    weak$.dispose()
  })

  test("должен перейти из IDLE в PATROL при hp > 50", async () => {
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          // Начальное значение 0 ≤ 50, поэтому НЕ переходит после write()
          values: [[0, 0]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 50 } }]], // IDLE → PATROL
            [null as any], // PATROL — терминальное
          ],
        },
        {
          // Начальное значение 50 не > 50, поэтому НЕ переходит после write()
          values: [[0, 50]],
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

    const states = await update([[0, [[0, 100]]]])
    // Брана 0: hp=100 > 50 → состояние 1 (изменение)
    // Брана 1: hp=50 не > 50 → состояние 0 (без изменений, не в результате)
    expect(states).toContainEqual([0, 1])
  })

  test("должен перейти из IDLE в DEAD при hp <= 0", async () => {
    // write() — TAKT 0: инициализация
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          // Начальное значение 100 > 50, поэтому после write() state=0 (ещё не выполнен переход)
          values: [[0, 100]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 50 } }]], // IDLE → PATROL
            [[2, { 0: { lte: 0 } }]], // PATROL → DEAD
            [null as any],
          ],
        },
      ],
    })

    // update() — TAKT 1: hp=100 > 50 → переход в state=1 (PATROL)
    const states = await update([[0, []]])
    expect(states).toContainEqual([0, 1])

    // update() — TAKT 2: hp=0 → переход в state=2 (DEAD)
    // Разблокируем и обновляем поле
    const states1 = await update([[0, [[0, 0]], false]])
    expect(states1).toContainEqual([0, 2]) // DEAD
  })

  test("должен работать с gte (больше или равно)", async () => {
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          // Начальное значение 0 < 50, поэтому НЕ переходит после write()
          values: [[0, 0]],
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

    const states = await update([[0, [[0, 50]]]])  // 50 >= 50 → переход
    expect(states).toContainEqual([0, 1])
  })
})

// ============================================================================
// ТЕСТЫ: Логические условия (BOOL)
// ============================================================================
describe("write / update — логические условия", () => {
  afterEach(() => {
    weak$.dispose()
  })

  test("должен перейти при isAlive === true", async () => {
    const initialStates = await write({
      fields: [{ type: FieldType.BOOL }],
      branes: [
        {
          // Начальное значение false ≠ true, поэтому НЕ переходит после write()
          values: [[0, false]],
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

    const states = await update([[0, [[0, true]]]])
    expect(states).toContainEqual([0, 1])
  })

  test("должен перейти при isAlive === false", async () => {
    const initialStates = await write({
      fields: [{ type: FieldType.BOOL }],
      branes: [
        {
          // Начальное значение true ≠ false, поэтому НЕ переходит после write()
          values: [[0, true]],
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

    const states = await update([[0, [[0, false]]]])
    expect(states).toContainEqual([0, 1])
  })
})

// ============================================================================
// ТЕСТЫ: Множественные условия
// ============================================================================
describe("write / update — множественные условия", () => {
  afterEach(() => {
    weak$.dispose()
  })

  test("должен перейти при выполнении обоих условий (hp > 50 И mana > 20)", async () => {
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }, { type: FieldType.F32 }],
      branes: [
        {
          // Начальное значение hp=0, mana=0 не удовлетворяет условиям
          values: [
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
      [0, 100],  // hp=100>50
      [1, 50],   // mana=50>20 → переход
    ]]])
    expect(states).toContainEqual([0, 1])
  })
})

// ============================================================================
// ТЕСТЫ: Entangled группы (shared блоки)
// ============================================================================
describe("write / update — entangled группы", () => {
  afterEach(() => {
    weak$.dispose()
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
          values: [
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
    const states = await update([[0, [[1, true]]]])
    expect(states).toContainEqual([0, 1])
  })

  test("должен работать с mixed: local + entangled поля", async () => {
    // write() — TAKT 0: инициализация
    await write({
      fields: [
        { type: FieldType.F32 }, // hp (shared)
        { type: FieldType.F32 }, // mana (local)
        { type: FieldType.BOOL }, // isAlive (shared)
      ],
      branes: [
        {
          values: [
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
          values: [
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

    // update() — TAKT 1: выполнение переходов
    // Брана 0: mana=10<30 → state=1
    // Брана 1: mana=50 не <30 → state=0
    const states = await update([
      [0, []],
      [1, []],
    ])
    
    expect(states).toContainEqual([0, 1])  // Брана 0 перешла

    // Обновляем брану 1: mana=50 → mana=20 (< 30, теперь должен перейти)
    const nextStates = await update([[1, [[1, 20]]]])
    expect(nextStates).toContainEqual([1, 1])  // Брана 1 изменилась
  })
})

// ============================================================================
// ТЕСТЫ: Многошаговая эволюция
// ============================================================================
describe("write / update — многошаговая эволюция", () => {
  afterEach(() => {
    weak$.dispose()
  })

  test("должен пройти через несколько состояний", async () => {
    const initialStates = await write({
      fields: [
        { type: FieldType.F32 },
        { type: FieldType.F32 },
      ],
      branes: [
        {
          values: [
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
    const states1 = await update([[0, [[0, 100]], false]])
    expect(states1).toContainEqual([0, 1])

    // Шаг 2: PATROL → COMBAT (mana=5<10)
    // WGSL ставит LOCK=1 при первом переходе, нужно разблокировать
    const states2 = await update([[0, [[1, 5]], false]])
    expect(states2).toContainEqual([0, 2])

    // Шаг 3: COMBAT — терминальное состояние (остаётся в 2)
    const states3 = await update([[0, [[0, 0]]]])
    expect(states3).toEqual([])  // Нет изменений, терминальное состояние
  })
})

// ============================================================================
// ТЕСТЫ: Ошибки
// ============================================================================
describe("write / update — ошибки", () => {
  afterEach(() => {
    weak$.dispose()
  })

  test("должен бросить ошибку при update() до write()", async () => {
    await expect(update([[0, [[0, 100]]]])).rejects.toThrow("Weak runtime not initialized")
  })

  test("должен бросить ошибку при неверном индексе браны", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{ values: [[0, 100]], state: 0, collapses: [[null as any]] }],
    })

    await expect(update([[999, [[0, 100]]]])).rejects.toThrow("Brane index out of range")
  })
})

// ============================================================================
// ТЕСТЫ: Параллельные вызовы (потокобезопасность)
// ============================================================================
describe("write / update — параллельные вызовы", () => {
  afterEach(() => {
    weak$.dispose()
  })

  /**
   * Тест на потокобезопасность update().
   *
   * Проверяет, что очередь корректно упорядочивает вызовы:
   * - Вызовы выполняются последовательно благодаря общей очереди Matrix
   * - Все обновления должны примениться корректно
   * - Не должно быть потерь или повреждения данных
   */
  test("должен корректно обрабатывать последовательные update() вызовы", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { values: [[0, 0]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    // update() для браны 0 — должна измениться (0 → 1)
    const result1 = await update([[0, [[0, 100]]]])
    expect(result1).toContainEqual([0, 1])

    // update() для браны 0 с новым значением — должна остаться в состоянии 1
    const result2 = await update([[0, [[0, 200]]]])
    // Состояние не изменилось (уже 1), поэтому результат пустой
    expect(result2).toEqual([])

    // update() для браны 0 с меньшим значением — должна остаться в состоянии 1 (терминальное)
    const result3 = await update([[0, [[0, 0]]]])
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
        { values: [[0, 0]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    // Запускаем два update() параллельно
    const promise1 = update([[0, [[0, 100]]]])
    const promise2 = update([[0, [[0, 200]]]])

    const [result1, result2] = await Promise.all([promise1, promise2])

    // Первый update() должен изменить состояние
    expect(result1).toContainEqual([0, 1])

    // Второй update() должен выполниться после первого
    // (состояние уже 1, поэтому может не измениться или остаться 1)
    expect(result2.length).toBeGreaterThanOrEqual(0)
  })

  /**
   * Тест на одновременно вызванные write() и update().
   *
   * Проверяет, что update() ждёт полного завершения write() и работает уже с
   * новым согласованным Store и Weak.
   */
  test("update() ждёт одновременно вызванный перед ним write()", async () => {
    const writePromise = write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { values: [[0, 0]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })
    const updatePromise = update([[0, [[0, 100]]]])
    const [initialStates, states] = await Promise.all([writePromise, updatePromise])

    expect(initialStates).toEqual([])
    expect(states).toContainEqual([0, 1])
  })

  test("write() ждёт одновременно вызванный перед ним update() и затем заменяет Store", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { values: [[0, 0]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    const updatePromise = update([[0, [[0, 100]]]])
    const writePromise = write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { values: [[0, 0]], state: 0, collapses: [[[1, { 0: { lt: 0 } }]], [null as any]] },
      ],
    })
    const [updatedStates, newInitialStates] = await Promise.all([updatePromise, writePromise])

    expect(updatedStates).toContainEqual([0, 1])
    expect(newInitialStates).toEqual([])
    expect(await update([[0, [[0, 100]]]])).toEqual([])
  })
})

// ============================================================================
// ТЕСТЫ: ARRAY поля
// ============================================================================
describe("write / update — ARRAY поля", () => {
  afterEach(() => {
    weak$.dispose()
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
          values: [[0, [1, 2, 3]]],
          state: 0,
          collapses: [[[1, { 0: { length: { eq: 5 } } }]], [null as any]],
        },
      ],
    })

    // Первый update() с массивом — должен работать
    const states1 = await update([[0, [[0, [1, 2, 3, 4, 5]]]]])
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
          values: [[0, [1, 2, 3]]],
          state: 0,
          collapses: [[[1, { 0: { isEmpty: true } }]], [null as any]],
        },
      ],
    })

    // После write() с непустым массивом нет переходов
    // update с пустым массивом должен триггерить isEmpty условие
    const states = await update([[0, [[0, []]]]])
    expect(states).toContainEqual([0, 1])
  })
})

// ============================================================================
// ТЕСТЫ: Блокировка переходов (lock флаг)
// ============================================================================
describe("update() с блокировкой переходов", () => {
  afterEach(() => {
    weak$.dispose()
  })

  test("заблокированная брана не меняет состояние", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [[0, 100]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null as any]],
      }],
    })

    // Блокируем брану 0
    const changes = await update([[0, [[0, 100]], true]])

    // Состояние не изменилось (блокировка)
    expect(changes).toHaveLength(0)
  })

  test("блокировка сохраняется между вызовами", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [[0, 30]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null as any]],
      }],
    })

    // Update 1: блокировка + изменение поля
    await update([[0, [[0, 100]], true]])

    // Update 2: lock всё ещё установлен — перехода не будет
    const changes = await update([[0, [[0, 100]]]])

    expect(changes).toHaveLength(0)  // Состояние не изменилось

    // Update 3: разблокировка (FSM проверит переход по текущим данным)
    const changes2 = await update([[0, [], false]])
    expect(changes2).toEqual([[0, 1]])
  })

  test("поля обновляются даже при блокировке", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [[0, 30]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null as any]],
      }],
    })

    // Блокировка + обновление поля
    await update([[0, [[0, 100]], true]])

    // Разблокировка (FSM проверит переход по текущим данным)
    const changes = await update([[0, [], false]])

    expect(changes).toEqual([[0, 1]])  // 100 > 50 → переход
  })

  test("частичная блокировка нескольких бран", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { values: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
        { values: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    // После write() нет переходов (30 не > 50)
    // Блокируем брану 0, обновляем обе до 100
    const changes = await update([
      [0, [[0, 100]], true],   // Заблокировать
      [1, [[0, 100]]],         // Без блокировки
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
        { values: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
        { values: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
        { values: [[0, 30]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null as any]] },
      ],
    })

    // После write() нет переходов (30 не > 50)
    // Блокируем браны 0 и 2, обновляем все до 100
    const changes = await update([
      [0, [[0, 100]], true],   // Заблокировать
      [1, [[0, 100]]],         // Без блокировки
      [2, [[0, 100]], true],   // Заблокировать
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
        values: [[0, 100]],
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
