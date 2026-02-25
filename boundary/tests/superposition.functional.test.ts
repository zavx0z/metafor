import { test, expect, describe, beforeEach } from "bun:test"
import { RulesCompiler } from "../src/compiler/RulesCompiler"
import { OP } from "../src/opcodes"
import { FieldType } from "../src/index"
import type { FieldTuple } from "../src/index.t"
import { toNumericSuperposition } from "./numeric.helper"

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

      const superpositions = [
        toNumericSuperposition({ IDLE: { ACTIVE: { 0: { gt: 50 } } }, ACTIVE: null }),
        toNumericSuperposition({ IDLE: { PATROL: { 1: { lt: 10 } } }, PATROL: null }),
      ]
      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
      ]

      const result = compiler.compileEnsemble(superpositions, fields)

      // bytecode — конкатенация всех bytecode
      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)

      // bytecodeOffsets — смещения для каждого поля
      expect(result.bytecodeOffsets.length).toBe(2)
      expect(result.bytecodeOffsets[0]).toBe(0)
      expect(result.bytecodeOffsets[1]).toBeGreaterThan(0)

      // stateMaps — независимые для каждого поля
      expect(result.stateMaps.length).toBe(2)
      expect(result.stateMaps[0]).toEqual({ IDLE: 0, ACTIVE: 1 })
      expect(result.stateMaps[1]).toEqual({ IDLE: 0, PATROL: 1 })
    })

    test("должен создавать независимые stateMap для каждого поля", () => {
      const compiler = new RulesCompiler()

      const superpositions = [
        toNumericSuperposition({ IDLE: { COMBAT: { 0: { gt: 80 } } }, COMBAT: null }),
        toNumericSuperposition({ IDLE: { MEDITATE: { 1: { lt: 20 } } }, MEDITATE: null }),
      ]
      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
      ]

      const result = compiler.compileEnsemble(superpositions, fields)

      // Разные stateMap
      expect(result.stateMaps[0]).toEqual({ IDLE: 0, COMBAT: 1 })
      expect(result.stateMaps[1]).toEqual({ IDLE: 0, MEDITATE: 1 })

      // Разные reverseStateMaps
      expect(result.reverseStateMaps[0]).toEqual(["IDLE", "COMBAT"])
      expect(result.reverseStateMaps[1]).toEqual(["IDLE", "MEDITATE"])
    })

    test("должен корректно вычислять смещения для трёх полей", () => {
      const compiler = new RulesCompiler()

      const superpositions = [
        toNumericSuperposition({ A: { B: { 0: { gt: 10 } } }, B: null }),
        toNumericSuperposition({ X: { Y: { 1: { lt: 5 } } }, Y: null }),
        toNumericSuperposition({ P: { Q: { 2: { eq: 0 } } }, Q: null }),
      ]
      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
        [2, { type: FieldType.F32 }],
      ]

      const result = compiler.compileEnsemble(superpositions, fields)

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

      // Поле 0: переходит в ACTIVE при hp > 30
      const superposition0 = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 30 } } },
        ACTIVE: null,
      })

      // Поле 1: переходит в ACTIVE при hp > 70
      const superposition1 = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 70 } } },
        ACTIVE: null,
      })

      const fields: FieldTuple[] = [[0, { type: FieldType.F32 }]]

      const result = compiler.compileEnsemble([superposition0, superposition1], fields)

      // Оба stateMap должны быть одинаковыми (IDLE=0, ACTIVE=1)
      expect(result.stateMaps[0]).toEqual({ IDLE: 0, ACTIVE: 1 })
      expect(result.stateMaps[1]).toEqual({ IDLE: 0, ACTIVE: 1 })

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

      // Поле 0: переход по hp
      const superposition0 = toNumericSuperposition({
        IDLE: { ACTIVE: { 0: { gt: 50 } } },
        ACTIVE: null,
      })

      // Поле 1: переход по mana
      const superposition1 = toNumericSuperposition({
        IDLE: { MEDITATE: { 1: { lt: 20 } } },
        MEDITATE: null,
      })

      // Поле 2: переход по isAlive
      const superposition2 = toNumericSuperposition({
        IDLE: { DEAD: { 2: false } },
        DEAD: null,
      })

      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
        [2, { type: FieldType.BOOL }],
      ]

      const result = compiler.compileEnsemble([superposition0, superposition1, superposition2], fields)

      expect(result.stateMaps.length).toBe(3)
      expect(result.stateMaps[0]).toEqual({ IDLE: 0, ACTIVE: 1 })
      expect(result.stateMaps[1]).toEqual({ IDLE: 0, MEDITATE: 1 })
      expect(result.stateMaps[2]).toEqual({ IDLE: 0, DEAD: 1 })
    })

    test("поля могут использовать множественные условия", () => {
      const compiler = new RulesCompiler()

      const superposition = toNumericSuperposition({
        IDLE: {
          COMBAT: {
            0: { gt: 50 },
            1: { gt: 20 },
          },
        },
        COMBAT: null,
      })

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

      const superposition = toNumericSuperposition({
        DEAD: null,
      })

      const fields: FieldTuple[] = [[0, { type: FieldType.F32 }]]

      const result = compiler.compileEnsemble([superposition], fields)

      expect(result.stateMaps[0]).toEqual({ DEAD: 0 })
      expect(result.reverseStateMaps[0]).toEqual(["DEAD"])
    })

    test("поля с полностью разными машинами состояний", () => {
      const compiler = new RulesCompiler()

      // Воин: IDLE → ATTACK → VICTORY
      const warriorSuperposition = toNumericSuperposition({
        IDLE: { ATTACK: { 0: { gt: 50 } } },
        ATTACK: { VICTORY: { 0: { gt: 90 } } },
        VICTORY: null,
      })

      // Маг: IDLE → CAST → RECOVER
      const mageSuperposition = toNumericSuperposition({
        IDLE: { CAST: { 1: { gt: 30 } } },
        CAST: { RECOVER: { 1: { lte: 10 } } },
        RECOVER: null,
      })

      const fields: FieldTuple[] = [
        [0, { type: FieldType.F32 }],
        [1, { type: FieldType.F32 }],
      ]

      const result = compiler.compileEnsemble([warriorSuperposition, mageSuperposition], fields)

      // Разные наборы состояний
      expect(Object.keys(result.stateMaps[0]!)).toEqual(["IDLE", "ATTACK", "VICTORY"])
      expect(Object.keys(result.stateMaps[1]!)).toEqual(["IDLE", "CAST", "RECOVER"])
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
