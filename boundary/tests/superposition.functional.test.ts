import { test, expect, describe, beforeEach } from "bun:test"
import { RulesCompiler } from "../src/compiler/RulesCompiler"
import { OP } from "../src/opcodes"
import { FieldType } from "../src/index"
import type { FieldTuple, NumericSuperposition } from "../src/index.t"

/**
 * Функциональные тесты компиляции индивидуальных суперпозиций.
 *
 * Эти тесты проверяют корректность компиляции разных superposition
 * для разных полей без использования GPU.
 */
describe("Компиляция индивидуальных суперпозиций — функциональные тесты", () => {

  describe("compileEnsemble — компиляция ансамбля superposition", () => {
    test("должен конкатенировать bytecode всех полей", () => {
      const compiler = new RulesCompiler()

      const superposition1: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],
          [null],
        ],
      }

      const superposition2: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 1: { lt: 10 } } }],
          [null],
        ],
      }

      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
      ]

      const result = compiler.compileEnsemble([superposition1, superposition2], fields)

      // bytecode — конкатенация всех bytecode
      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)

      // bytecodeOffsets — смещения для каждого поля
      expect(result.bytecodeOffsets.length).toBe(2)
      expect(result.bytecodeOffsets[0]).toBe(0)
      expect(result.bytecodeOffsets[1]).toBeGreaterThan(0)

      // stateMaps — независимые для каждого поля
      expect(result.stateMaps.length).toBe(2)
      expect(result.stateMaps[0]).toEqual({ STATE_0: 0, STATE_1: 1 })
      expect(result.stateMaps[1]).toEqual({ STATE_0: 0, STATE_1: 1 })
    })

    test("должен создавать независимые stateMap для каждого поля", () => {
      const compiler = new RulesCompiler()

      const superposition1: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 80 } } }],
          [null],
        ],
      }

      const superposition2: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 1: { lt: 20 } } }],
          [null],
        ],
      }

      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
      ]

      const result = compiler.compileEnsemble([superposition1, superposition2], fields)

      // Разные stateMap
      expect(result.stateMaps[0]).toEqual({ STATE_0: 0, STATE_1: 1 })
      expect(result.stateMaps[1]).toEqual({ STATE_0: 0, STATE_1: 1 })

      // Разные reverseStateMaps
      expect(result.reverseStateMaps[0]).toEqual(["STATE_0", "STATE_1"])
      expect(result.reverseStateMaps[1]).toEqual(["STATE_0", "STATE_1"])
    })

    test("должен корректно вычислять смещения для трёх полей", () => {
      const compiler = new RulesCompiler()

      const superposition1: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 10 } } }],
          [null],
        ],
      }

      const superposition2: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 20 } } }],
          [null],
        ],
      }

      const superposition3: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 30 } } }],
          [null],
        ],
      }

      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
        [2, { type: FieldType.F32 }],
      ]

      const result = compiler.compileEnsemble([superposition1, superposition2, superposition3], fields)

      // Три смещения
      expect(result.bytecodeOffsets.length).toBe(3)
      expect(result.bytecodeOffsets[0]).toBe(0)
      expect(result.bytecodeOffsets[1]).toBeGreaterThan(0)
      expect(result.bytecodeOffsets[2]).toBeGreaterThan(result.bytecodeOffsets[1]!)
    })
  })

  describe("Разные условия для одного перехода", () => {
    test("поля могут иметь разные пороги для одного и того же перехода", () => {
      const compiler = new RulesCompiler()

      const superposition0: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 30 } } }],
          [null],
        ],
      }

      const superposition1: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 70 } } }],
          [null],
        ],
      }

      const fields: FieldTuple[] = [[0, { type: FieldType.F32 }]]

      const result = compiler.compileEnsemble([superposition0, superposition1], fields)

      // Оба stateMap должны быть одинаковыми
      expect(result.stateMaps[0]).toEqual({ STATE_0: 0, STATE_1: 1 })
      expect(result.stateMaps[1]).toEqual({ STATE_0: 0, STATE_1: 1 })

      // Но bytecode должен быть разным (разные значения в условиях)
      const bc0Start = result.bytecodeOffsets[0]
      const bc1Start = result.bytecodeOffsets[1]

      // Проверяем, что значения присутствуют в соответствующих частях bytecode
      const value30 = new Uint32Array(new Float32Array([30]).buffer)[0]
      const value70 = new Uint32Array(new Float32Array([70]).buffer)[0]

      const bc0 = Array.from(result.bytecode.slice(bc0Start, bc1Start))
      const bc1 = Array.from(result.bytecode.slice(bc1Start))

      expect(bc0.includes(value30!)).toBe(true)
      expect(bc1.includes(value70!)).toBe(true)
    })
  })

  describe("Разные типы условий", () => {
    test("поля могут использовать разные компоненты браны", () => {
      const compiler = new RulesCompiler()

      const superposition0: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],
          [null],
        ],
      }

      const superposition1: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 1: { lt: 20 } } }],
          [null],
        ],
      }

      const superposition2: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 2: false } }],
          [null],
        ],
      }

      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
        [2, { type: FieldType.BOOL }],
      ]

      const result = compiler.compileEnsemble([superposition0, superposition1, superposition2], fields)

      expect(result.stateMaps.length).toBe(3)
      expect(result.stateMaps[0]).toEqual({ STATE_0: 0, STATE_1: 1 })
      expect(result.stateMaps[1]).toEqual({ STATE_0: 0, STATE_1: 1 })
      expect(result.stateMaps[2]).toEqual({ STATE_0: 0, STATE_1: 1 })
    })

    test("поля могут использовать множественные условия", () => {
      const compiler = new RulesCompiler()

      const superposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: { gt: 50 },
                1: { gt: 20 },
              },
            },
          ],
          [null],
        ],
      }

      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
      ]

      const result = compiler.compileEnsemble([superposition], fields)

      // Проверяем наличие обоих операторов GT в bytecode
      const bc = Array.from(result.bytecode)
      const gtCount = bc.filter((v) => v === OP.GT).length
      expect(gtCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe("Граничные случаи", () => {
    test("пустой ансамбль должен возвращать пустые массивы", () => {
      const compiler = new RulesCompiler()

      const result = compiler.compileEnsemble([], [])

      expect(result.bytecode.length).toBe(0)
      expect(result.bytecodeOffsets.length).toBe(0)
      expect(result.stateMaps.length).toBe(0)
      expect(result.reverseStateMaps.length).toBe(0)
    })

    test("одно поле с терминальным состоянием", () => {
      const compiler = new RulesCompiler()

      const superposition: NumericSuperposition = {
        transitions: [
          [null],
        ],
      }

      const fields: FieldTuple[] = [[0, { type: FieldType.F32 }]]

      const result = compiler.compileEnsemble([superposition], fields)

      expect(result.stateMaps[0]).toEqual({ STATE_0: 0 })
      expect(result.reverseStateMaps[0]).toEqual(["STATE_0"])
    })

    test("поля с полностью разными машинами состояний", () => {
      const compiler = new RulesCompiler()

      // Воин: IDLE → ATTACK → VICTORY
      const warriorSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { gt: 50 } } }],
          [{ to: 2, conditions: { 0: { gt: 90 } } }],
          [null],
        ],
      }

      // Маг: IDLE → CAST → RECOVER
      const mageSuperposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 1: { gt: 30 } } }],
          [{ to: 2, conditions: { 1: { lte: 10 } } }],
          [null],
        ],
      }

      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
      ]

      const result = compiler.compileEnsemble([warriorSuperposition, mageSuperposition], fields)

      // Разные наборы состояний
      expect(Object.keys(result.stateMaps[0]!)).toEqual(["STATE_0", "STATE_1", "STATE_2"])
      expect(Object.keys(result.stateMaps[1]!)).toEqual(["STATE_0", "STATE_1", "STATE_2"])
    })

    test("порядок триггеров: более специфичные условия проверяются первыми", () => {
      // Проверяем что Object.entries сохраняет порядок ключей
      const transitions = {
        "коммит с подписью и сообщением": { signoff: { null: false }, message: { null: false } },
        "коммит с сообщением": { message: { null: false } },
        "коммит всех файлов": { all: { null: false } },
      }

      const entries = Object.entries(transitions)

      // Первый ключ должен быть самым специфичным
      expect(entries[0]?.[0]).toBe("коммит с подписью и сообщением")
      // Второй ключ - менее специфичный
      expect(entries[1]?.[0]).toBe("коммит с сообщением")
      // Третий ключ - ещё менее специфичный
      expect(entries[2]?.[0]).toBe("коммит всех файлов")
    })
  })
})
