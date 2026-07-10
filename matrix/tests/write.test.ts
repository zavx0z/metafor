/**
 * Тесты для write() с возвратом начальных состояний.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture"
import {write, update, } from "../matrix"
import { GPU, weak$ } from "../weak"
import { FieldType } from "../gravity"
import type { MatrixCollapse } from "@metafor/types/matrix/data"

describe("write() — возврат начальных состояний", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    weak$.dispose()
  })

  test("должен вернуть состояния после инициализации с переходом", async () => {
    const collapses: MatrixCollapse[][] = [
      [[1, { 0: { gt: 50 } }]],  // IDLE → PATROL при hp > 50
      [null],
    ]

    // write() — TAKT 0: инициализация без перехода
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{ state: 0, values: [[0, 100]], collapses }],
    })

    // update() — TAKT 1: hp=100 > 50 → переход в state=1
    const states = await update([[0, []]])
    expect(states).toContainEqual([0, 1])  // Брана 0 перешла в state 1
  })

  test("должен вернуть пустой массив если переходов не было", async () => {
    const collapses: MatrixCollapse[][] = [
      [[1, { 0: { gt: 50 } }]],  // IDLE → PATROL при hp > 50
      [null],
    ]
    
    // hp=0 ≤ 50 → НЕ переходит после write()
    const initialStates = await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{ state: 0, values: [[0, 0]], collapses }],
    })
    
    expect(initialStates).toEqual([])  // Нет изменений
  })

  test("должен вернуть состояния для нескольких бран", async () => {
    const collapses: MatrixCollapse[][] = [
      [[1, { 0: { gt: 50 } }]],
      [null],
    ]

    // write() — TAKT 0: инициализация
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { state: 0, values: [[0, 100]], collapses },  // 100 > 50 → state 1
        { state: 0, values: [[0, 30]], collapses },   // 30 ≤ 50 → state 0
        { state: 0, values: [[0, 60]], collapses },   // 60 > 50 → state 1
      ],
    })

    // update() — TAKT 1: выполнение переходов
    const states = await update([
      [0, []],
      [1, []],
      [2, []],
    ])

    expect(states).toContainEqual([0, 1])  // Брана 0: 100 > 50
    expect(states).toContainEqual([2, 1])  // Брана 2: 60 > 50
    expect(states).not.toContainEqual([1, expect.anything()])  // Брана 1: 30 ≤ 50
  })

  test("должен вернуть состояния для ARRAY полей", async () => {
    const collapses: MatrixCollapse[][] = [
      [[1, { 0: { length: 3 } }]],  // Переход при длине массива = 3
      [null],
    ]

    // write() — TAKT 0: инициализация
    await write({
      fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
      branes: [{ state: 0, values: [[0, [1, 2, 3]]], collapses }],
    })

    // update() — TAKT 1: массив [1, 2, 3] имеет длину 3 → переход в state=1
    const states = await update([[0, []]])
    expect(states).toContainEqual([0, 1])
  })

  test("должен вернуть состояния для STRING полей", async () => {
    const collapses: MatrixCollapse[][] = [
      [[1, { 0: { eq: "hero" } }]],
      [null],
    ]

    // write() — TAKT 0: инициализация
    await write({
      fields: [{ type: FieldType.STRING_PTR }],
      branes: [{ state: 0, values: [[0, "hero"]], collapses }],
    })

    // update() — TAKT 1: "hero" === "hero" → переход в state=1
    const states = await update([[0, []]])
    expect(states).toContainEqual([0, 1])
  })

  test("должен вернуть состояния для BOOL полей", async () => {
    const collapses: MatrixCollapse[][] = [
      [[1, { 0: true }]],
      [null],
    ]

    // write() — TAKT 0: инициализация
    await write({
      fields: [{ type: FieldType.BOOL }],
      branes: [{ state: 0, values: [[0, true]], collapses }],
    })

    // update() — TAKT 1: true === true → переход в state=1
    const states = await update([[0, []]])
    expect(states).toContainEqual([0, 1])
  })

  test("должен вернуть состояния для enum полей", async () => {
    const collapses: MatrixCollapse[][] = [
      [[1, { 0: "MAGE" }]],
      [null],
    ]

    // write() — TAKT 0: инициализация
    await write({
      fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
      branes: [{ state: 0, values: [[0, "MAGE"]], collapses }],
    })

    // update() — TAKT 1: "MAGE" === "MAGE" → переход в state=1
    const states = await update([[0, []]])
    expect(states).toContainEqual([0, 1])
  })

  test("должен работать с несколькими переходами в одной суперпозиции", async () => {
    const collapses: MatrixCollapse[][] = [
      [[1, { 0: { gt: 50 } }]],  // IDLE → PATROL
      [[2, { 0: { lte: 0 } }]],  // PATROL → DEAD
      [null],
    ]

    // write() — TAKT 0: инициализация
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [{ state: 0, values: [[0, 100]], collapses }],
    })

    // update() — TAKT 1: hp=100 > 50 → переход в state=1 (PATROL)
    const states1 = await update([[0, []]])
    expect(states1).toContainEqual([0, 1])

    // update() — TAKT 2: hp=0 → переход в state=2 (DEAD)
    // Разблокируем и обновляем поле
    const nextStates = await update([[0, [[0, 0]], false]])
    expect(nextStates).toContainEqual([0, 2])
  })

  test("должен возвращать только изменённые состояния", async () => {
    const collapses: MatrixCollapse[][] = [
      [[1, { 0: { gt: 50 } }]],
      [null],
    ]

    // write() — TAKT 0: инициализация
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        { state: 0, values: [[0, 100]], collapses },  // → state 1
        { state: 0, values: [[0, 30]], collapses },   // → state 0 (без изменений)
      ],
    })

    // update() — TAKT 1: выполнение переходов
    const states = await update([
      [0, []],
      [1, []],
    ])

    // Возвращаются только изменённые
    expect(states).toContainEqual([0, 1])
    expect(states).not.toContainEqual([1, expect.anything()])
  })
})
