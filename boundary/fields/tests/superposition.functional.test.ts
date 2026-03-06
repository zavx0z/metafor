/**
 * Функциональные тесты компиляции суперпозиций.
 */
import { test, expect, describe } from "bun:test"
import { compileEnsemble } from "../superposition"
import { OP } from "../opcodes"
import { FieldType } from "../index.t"

describe("Компиляция индивидуальных суперпозиций — функциональные тесты", () => {
  describe("compileEnsemble", () => {
    test("должен конкатенировать bytecode всех полей", () => {
      const result = compileEnsemble([
        { collapses: [[[1, { 0: { gt: 50 } }]], [null]] },
        { collapses: [[[1, { 1: { lt: 10 } }]], [null]] },
      ], [{ type: FieldType.F32 }, { type: FieldType.F32 }])

      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)
      expect(result.bytecodeOffsets.length).toBe(2)
    })

    test("должен корректно вычислять смещения для трёх полей", () => {
      const result = compileEnsemble([
        { collapses: [[[1, { 0: { gt: 10 } }]], [null]] },
        { collapses: [[[1, { 0: { gt: 20 } }]], [null]] },
        { collapses: [[[1, { 0: { gt: 30 } }]], [null]] },
      ], [{ type: FieldType.F32 }, { type: FieldType.F32 }, { type: FieldType.F32 }])

      expect(result.bytecodeOffsets.length).toBe(3)
      expect(result.bytecodeOffsets[0]).toBe(0)
      expect(result.bytecodeOffsets[1]).toBeGreaterThan(0)
    })
  })

  describe("Разные условия", () => {
    test("поля могут иметь разные пороги", () => {
      const result = compileEnsemble([
        { collapses: [[[1, { 0: { gt: 30 } }]], [null]] },
        { collapses: [[[1, { 0: { gt: 70 } }]], [null]] },
      ], [{ type: FieldType.F32 }])

      expect(result.bytecodeOffsets.length).toBe(2)
    })

    test("поля могут использовать множественные условия", () => {
      const result = compileEnsemble([
        { collapses: [[[1, { 0: { gt: 50 }, 1: { gt: 20 } }]], [null]] },
      ], [{ type: FieldType.F32 }, { type: FieldType.F32 }])

      const bc = Array.from(result.bytecode)
      const gtCount = bc.filter((v) => v === OP.GT).length
      expect(gtCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe("Граничные случаи", () => {
    test("пустой ансамбль должен возвращать пустые массивы", () => {
      const result = compileEnsemble([], [])
      expect(result.bytecode.length).toBe(0)
      expect(result.bytecodeOffsets.length).toBe(0)
    })

    test("одно поле с терминальным состоянием", () => {
      const result = compileEnsemble([{ collapses: [[null]] }], [{ type: FieldType.F32 }])
      expect(result.bytecode.length).toBeGreaterThan(0)
    })
  })
})
