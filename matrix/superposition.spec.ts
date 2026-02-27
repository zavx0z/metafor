import { test, expect, describe, beforeEach } from "bun:test"
import { compileSuperposition, compileConditions, compileEnsemble } from "./superposition"
import { OP } from "./opcodes"
import { FieldType, type Collapse } from "./index.t"
import { resetStringAtlas } from "./StringAtlas"

describe("compileConditions — компиляция условий", () => {
  beforeEach(() => {
    resetStringAtlas()
  })

  test("должен компилировать простое условие gt", () => {
    const fields = [{ type: FieldType.F32 }]
    const result = compileConditions({ 0: { gt: 50 } }, fields)

    expect(result).toHaveLength(1)
    expect(result[0]!).toMatchObject({
      fieldType: 0, // TYPE.FLOAT
      fieldIndex: 0,
      op: OP.GT,
    })
  })

  test("должен компилировать множественные условия", () => {
    const fields = [{ type: FieldType.F32 }]
    const result = compileConditions({ 0: { gt: 50, lte: 100 } }, fields)

    expect(result).toHaveLength(2)
    expect(result[0]!.op).toBe(OP.GT)
    expect(result[1]!.op).toBe(OP.LTE)
  })

  test("должен кодировать значения через encodeValue", () => {
    const fields = [{ type: FieldType.F32 }]
    const result = compileConditions({ 0: { eq: 3.14 } }, fields)

    // Проверяем что float закодирован через bitcast
    expect(result[0]!.valEncoded).not.toBe(3.14) // не прямое значение
    expect(result[0]!.valEncoded).toBeGreaterThan(0)
  })
})

describe("compileSuperposition — компиляция суперпозиции", () => {
  beforeEach(() => {
    resetStringAtlas()
  })

  test("должен компилировать суперпозицию с 2 состояниями", () => {
    const fields = [{ type: FieldType.F32 }]
    const collapses: Collapse[][] = [
      [[1, { 0: { gt: 50 } }]], // из состояния 0
      [null], // состояние 1 терминальное
    ]

    const result = compileSuperposition(collapses, fields)

    expect(result.bytecode).toBeInstanceOf(Uint32Array)
    expect(result.bytecode.length).toBeGreaterThan(0)
    expect(result.bytecodeOffset).toBe(0)
  })

  test("должен создавать корректную структуру bytecode", () => {
    const fields = [{ type: FieldType.F32 }]
    const collapses: Collapse[][] = [
      [
        [1, { 0: { gt: 50 } }],
        [0, { 0: { lte: 50 } }],
      ],
      [null],
    ]

    const result = compileSuperposition(collapses, fields)

    // Первая часть bytecode — указатели на состояния
    const statePtrs = result.bytecode.slice(0, 2)
    expect(statePtrs[0]).toBeLessThan(statePtrs[1]!) // ptr0 < ptr1
  })
})

describe("compileEnsemble — компиляция ансамбля", () => {
  test("должен компилировать несколько бран", () => {
    const fields = [{ type: FieldType.F32 }]
    const branes: Array<{ collapses: Collapse[][] }> = [
      { collapses: [[[1, { 0: { gt: 50 } }]], [null]] },
      { collapses: [[[0, { 0: { lt: 10 } }]], [null]] },
    ]

    const result = compileEnsemble(branes, fields)

    expect(result.bytecode).toBeInstanceOf(Uint32Array)
    expect(result.bytecodeOffsets).toHaveLength(2)
    expect(result.bytecodeOffsets[0]).toBe(0)
    expect(result.bytecodeOffsets[1]).toBeGreaterThan(0)
  })
})
