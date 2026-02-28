/**
 * Тесты для write() с возвратом начальных состояний.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { write, update } from "@boundary/fields"
import { resetMatrix } from "@boundary/matrix"
import { GPU } from "@boundary/matrix"
import { FieldType, type Collapse } from "@boundary/fields"
import { resetStringAtlas } from "@boundary/atlas"

describe("write() — возврат начальных состояний", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  test("должен вернуть состояния после инициализации с переходом", async () => {
    const collapses: Collapse[][] = [
      [[1, { 0: { gt: 50 } }]],  // IDLE → PATROL при hp > 50
      [null],
    ]
    
    // hp=100 > 50 → переход в state=1 после write()
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{ state: 0, params: [[0, 100]], collapses }],
    })
    
    expect(initialStates).toContainEqual([0, 1])  // Брана 0 перешла в state 1
  })

  test("должен вернуть пустой массив если переходов не было", async () => {
    const collapses: Collapse[][] = [
      [[1, { 0: { gt: 50 } }]],  // IDLE → PATROL при hp > 50
      [null],
    ]
    
    // hp=0 ≤ 50 → НЕ переходит после write()
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{ state: 0, params: [[0, 0]], collapses }],
    })
    
    expect(initialStates).toEqual([])  // Нет изменений
  })

  test("должен вернуть состояния для нескольких бран", async () => {
    const collapses: Collapse[][] = [
      [[1, { 0: { gt: 50 } }]],
      [null],
    ]
    
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { state: 0, params: [[0, 100]], collapses },  // 100 > 50 → state 1
        { state: 0, params: [[0, 30]], collapses },   // 30 ≤ 50 → state 0
        { state: 0, params: [[0, 60]], collapses },   // 60 > 50 → state 1
      ],
    })
    
    expect(initialStates).toContainEqual([0, 1])  // Брана 0: 100 > 50
    expect(initialStates).toContainEqual([2, 1])  // Брана 2: 60 > 50
    expect(initialStates).not.toContainEqual([1, expect.anything()])  // Брана 1: 30 ≤ 50
  })

  test("должен вернуть состояния для ARRAY полей", async () => {
    const collapses: Collapse[][] = [
      [[1, { 0: { length: 3 } }]],  // Переход при длине массива = 3
      [null],
    ]
    
    // Массив [1, 2, 3] имеет длину 3 → переход в state=1
    const initialStates = await write({
      fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
      branes: [{ state: 0, params: [[0, [1, 2, 3]]], collapses }],
    })
    
    expect(initialStates).toContainEqual([0, 1])
  })

  test("должен вернуть состояния для STRING полей", async () => {
    const collapses: Collapse[][] = [
      [[1, { 0: { eq: "hero" } }]],
      [null],
    ]
    
    // "hero" === "hero" → переход в state=1
    const initialStates = await write({
      fields: [{ type: FieldType.STRING_PTR }],
      branes: [{ state: 0, params: [[0, "hero"]], collapses }],
    })
    
    expect(initialStates).toContainEqual([0, 1])
  })

  test("должен вернуть состояния для BOOL полей", async () => {
    const collapses: Collapse[][] = [
      [[1, { 0: true }]],
      [null],
    ]
    
    // true === true → переход в state=1
    const initialStates = await write({
      fields: [{ type: FieldType.BOOL }],
      branes: [{ state: 0, params: [[0, true]], collapses }],
    })
    
    expect(initialStates).toContainEqual([0, 1])
  })

  test("должен вернуть состояния для enum полей", async () => {
    const collapses: Collapse[][] = [
      [[1, { 0: "MAGE" }]],
      [null],
    ]
    
    // "MAGE" === "MAGE" → переход в state=1
    const initialStates = await write({
      fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
      branes: [{ state: 0, params: [[0, "MAGE"]], collapses }],
    })
    
    expect(initialStates).toContainEqual([0, 1])
  })

  test("должен работать с несколькими переходами в одной суперпозиции", async () => {
    const collapses: Collapse[][] = [
      [[1, { 0: { gt: 50 } }]],  // IDLE → PATROL
      [[2, { 0: { lte: 0 } }]],  // PATROL → DEAD
      [null],
    ]
    
    // hp=100 > 50 → переход в state=1 (PATROL)
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{ state: 0, params: [[0, 100]], collapses }],
    })
    
    expect(initialStates).toContainEqual([0, 1])
    
    // update с hp=0 → переход в state=2 (DEAD)
    const nextStates = await update([[0, [{ fieldIndex: 0, value: 0 }]]])
    expect(nextStates).toContainEqual([0, 2])
  })

  test("должен возвращать только изменённые состояния", async () => {
    const collapses: Collapse[][] = [
      [[1, { 0: { gt: 50 } }]],
      [null],
    ]
    
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { state: 0, params: [[0, 100]], collapses },  // → state 1
        { state: 0, params: [[0, 30]], collapses },   // → state 0 (без изменений)
      ],
    })
    
    // Возвращаются только изменённые
    expect(initialStates).toContainEqual([0, 1])
    expect(initialStates).not.toContainEqual([1, expect.anything()])
  })
})
