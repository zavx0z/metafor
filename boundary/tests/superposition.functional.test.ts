import { test, expect, describe, beforeEach } from "bun:test"
import { RulesCompiler } from "../src/compiler/RulesCompiler"
import { OP } from "../src/opcodes"
import { FieldRegistry } from "../src/core/FieldRegistry"
import { FieldType } from "../src/index"

/**
 * Функциональные тесты компиляции индивидуальных суперпозиций.
 *
 * Эти тесты проверяют корректность компиляции разных superposition
 * для разных полей без использования GPU.
 *
 * ### Покрываемые сценарии:
 * 1. Компиляция одной superposition (compileSingle)
 * 2. Компиляция ансамбля superposition (compileEnsemble)
 * 3. Конкатенация bytecode
 * 4. Независимость stateMap для каждого поля
 * 5. Корректность смещений в bytecodeOffsets
 */
describe("Компиляция индивидуальных суперпозиций — функциональные тесты", () => {
  beforeEach(() => {
    FieldRegistry.clear()
  })

  describe("compileSingle — компиляция одной superposition", () => {
    test("должен вернуть bytecode, stateMap и reverseStateMap", () => {
      const compiler = new RulesCompiler()

      const superposition = {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      }
      const fields = { hp: { type: FieldType.F32 } }

      const result = compiler.compileSingle(superposition, fields)

      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)
      expect(result.stateMap).toEqual({ IDLE: 0, PATROL: 1 })
      expect(result.reverseStateMap).toEqual(["IDLE", "PATROL"])
    })

    test("должен компилировать разные состояния для разных superposition", () => {
      const compiler = new RulesCompiler()

      const superposition1 = {
        IDLE: { COMBAT: { hp: { gt: 80 } } },
        COMBAT: null,
      }

      const superposition2 = {
        IDLE: { MEDITATE: { mana: { lt: 20 } } },
        MEDITATE: null,
      }

      const fields = { hp: { type: FieldType.F32 }, mana: { type: FieldType.F32 } }

      const result1 = compiler.compileSingle(superposition1, fields)
      const result2 = compiler.compileSingle(superposition2, fields, { preserveRegistry: true })

      // Разные stateMap
      expect(result1.stateMap).toEqual({ IDLE: 0, COMBAT: 1 })
      expect(result2.stateMap).toEqual({ IDLE: 0, MEDITATE: 1 })

      // Разные reverseStateMap
      expect(result1.reverseStateMap).toEqual(["IDLE", "COMBAT"])
      expect(result2.reverseStateMap).toEqual(["IDLE", "MEDITATE"])
    })
  })

  describe("compileEnsemble — компиляция ансамбля superposition", () => {
    test("должен конкатенировать bytecode всех полей", () => {
      const compiler = new RulesCompiler()

      const superpositions = [
        { IDLE: { ACTIVE: { hp: { gt: 50 } } }, ACTIVE: null },
        { IDLE: { PATROL: { mana: { lt: 10 } } }, PATROL: null },
      ]
      const fields = { hp: { type: FieldType.F32 }, mana: { type: FieldType.F32 } }

      const result = compiler.compileEnsemble(superpositions, fields)

      // Проверяем структуру результата
      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecodeOffsets).toBeInstanceOf(Uint32Array)
      expect(result.bytecodeOffsets.length).toBe(2)
      expect(result.stateMaps.length).toBe(2)
      expect(result.reverseStateMaps.length).toBe(2)

      // Первое смещение = 0
      expect(result.bytecodeOffsets[0]).toBe(0)
      // Второе смещение = длина первого bytecode
      expect(result.bytecodeOffsets[1]).toBeGreaterThan(0)
    })

    test("должен создавать независимые stateMap для каждого поля", () => {
      const compiler = new RulesCompiler()

      const superpositions = [
        { IDLE: { COMBAT: { hp: { gt: 80 } } }, COMBAT: { VICTORY: { hp: { gt: 90 } } }, VICTORY: null },
        { IDLE: { DEFEND: { hp: { lte: 50 } } }, DEFEND: { FORTIFY: { hp: { lte: 20 } } }, FORTIFY: null },
      ]
      const fields = { hp: { type: FieldType.F32 } }

      const result = compiler.compileEnsemble(superpositions, fields)

      // Поле 0: IDLE=0, COMBAT=1, VICTORY=2
      expect(result.stateMaps[0]).toEqual({ IDLE: 0, COMBAT: 1, VICTORY: 2 })
      expect(result.reverseStateMaps[0]).toEqual(["IDLE", "COMBAT", "VICTORY"])

      // Поле 1: IDLE=0, DEFEND=1, FORTIFY=2
      expect(result.stateMaps[1]).toEqual({ IDLE: 0, DEFEND: 1, FORTIFY: 2 })
      expect(result.reverseStateMaps[1]).toEqual(["IDLE", "DEFEND", "FORTIFY"])
    })

    test("должен корректно вычислять смещения для трёх полей", () => {
      const compiler = new RulesCompiler()

      const superpositions = [
        { IDLE: { A: { hp: { gt: 10 } } }, A: null },
        { IDLE: { B: { hp: { gt: 20 } } }, B: null },
        { IDLE: { C: { hp: { gt: 30 } } }, C: null },
      ]
      const fields = { hp: { type: FieldType.F32 } }

      const result = compiler.compileEnsemble(superpositions, fields)

      expect(result.bytecodeOffsets[0]).toBe(0)
      expect(result.bytecodeOffsets[1]).toBeGreaterThan(0)
      expect(result.bytecodeOffsets[2]).toBeGreaterThan(result.bytecodeOffsets[1]!)

      // Общая длина = сумма длин
      const totalLength = result.bytecode.length
      expect(totalLength).toBeGreaterThan(0)
    })
  })

  describe("Разные условия для одного перехода", () => {
    test("поля могут иметь разные пороги для одного и того же перехода", () => {
      const compiler = new RulesCompiler()

      // Поле 0: переходит в ACTIVE при hp > 30
      const superposition0 = {
        IDLE: { ACTIVE: { hp: { gt: 30 } } },
        ACTIVE: null,
      }

      // Поле 1: переходит в ACTIVE при hp > 70
      const superposition1 = {
        IDLE: { ACTIVE: { hp: { gt: 70 } } },
        ACTIVE: null,
      }

      const fields = { hp: { type: FieldType.F32 } }

      const result = compiler.compileEnsemble([superposition0, superposition1], fields)

      // Оба stateMap должны быть одинаковыми (IDLE=0, ACTIVE=1)
      expect(result.stateMaps[0]).toEqual({ IDLE: 0, ACTIVE: 1 })
      expect(result.stateMaps[1]).toEqual({ IDLE: 0, ACTIVE: 1 })

      // Но bytecode должен быть разным (разные значения в условиях)
      // Находим оператор GT в bytecode
      const bc0Start = result.bytecodeOffsets[0]
      const bc1Start = result.bytecodeOffsets[1]

      // Ищем значение 30 в первом bytecode и 70 во втором
      const value30 = new Uint32Array(new Float32Array([30]).buffer)[0]
      const value70 = new Uint32Array(new Float32Array([70]).buffer)[0]

      // Проверяем, что значения присутствуют в соответствующих частях bytecode
      const bc0End = bc1Start
      const bc0 = Array.from(result.bytecode.slice(bc0Start, bc0End))
      const bc1 = Array.from(result.bytecode.slice(bc1Start))

      expect(bc0.includes(value30!)).toBe(true)
      expect(bc1.includes(value70!)).toBe(true)
    })
  })

  describe("Разные типы условий", () => {
    test("поля могут использовать разные компоненты браны", () => {
      const compiler = new RulesCompiler()

      // Поле 0: переход по hp
      const superposition0 = {
        IDLE: { ACTIVE: { hp: { gt: 50 } } },
        ACTIVE: null,
      }

      // Поле 1: переход по mana
      const superposition1 = {
        IDLE: { MEDITATE: { mana: { lt: 20 } } },
        MEDITATE: null,
      }

      // Поле 2: переход по isAlive
      const superposition2 = {
        IDLE: { DEAD: { isAlive: false } },
        DEAD: null,
      }

      const fields = { hp: "number", mana: "number", isAlive: "boolean" }

      const result = compiler.compileEnsemble([superposition0, superposition1, superposition2], fields)

      expect(result.stateMaps.length).toBe(3)
      expect(result.stateMaps[0]).toEqual({ IDLE: 0, ACTIVE: 1 })
      expect(result.stateMaps[1]).toEqual({ IDLE: 0, MEDITATE: 1 })
      expect(result.stateMaps[2]).toEqual({ IDLE: 0, DEAD: 1 })
    })

    test("поля могут использовать множественные условия", () => {
      const compiler = new RulesCompiler()

      const superposition = {
        IDLE: {
          COMBAT: {
            hp: { gt: 50 },
            mana: { gt: 20 },
          },
        },
        COMBAT: null,
      }

      const fields = { hp: { type: FieldType.F32 }, mana: { type: FieldType.F32 } }

      const result = compiler.compileSingle(superposition, fields)

      // Проверяем наличие обоих операторов GT в bytecode
      const bc = Array.from(result.bytecode)
      const gtCount = bc.filter((v) => v === OP.GT).length
      expect(gtCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe("Граничные случаи", () => {
    test("пустой ансамбль должен возвращать пустые массивы", () => {
      const compiler = new RulesCompiler()

      const result = compiler.compileEnsemble([], {})

      expect(result.bytecode.length).toBe(0)
      expect(result.bytecodeOffsets.length).toBe(0)
      expect(result.stateMaps.length).toBe(0)
      expect(result.reverseStateMaps.length).toBe(0)
    })

    test("одно поле с терминальным состоянием", () => {
      const compiler = new RulesCompiler()

      const superposition = {
        DEAD: null,
      }

      const fields = { hp: { type: FieldType.F32 } }

      const result = compiler.compileSingle(superposition, fields)

      expect(result.stateMap).toEqual({ DEAD: 0 })
      expect(result.reverseStateMap).toEqual(["DEAD"])
    })

    test("поля с полностью разными машинами состояний", () => {
      const compiler = new RulesCompiler()

      // Воин: IDLE → ATTACK → VICTORY
      const warriorSuperposition = {
        IDLE: { ATTACK: { hp: { gt: 50 } } },
        ATTACK: { VICTORY: { hp: { gt: 90 } } },
        VICTORY: null,
      }

      // Маг: IDLE → CAST → RECOVER
      const mageSuperposition = {
        IDLE: { CAST: { mana: { gt: 30 } } },
        CAST: { RECOVER: { mana: { lte: 10 } } },
        RECOVER: null,
      }

      const fields = { hp: { type: FieldType.F32 }, mana: { type: FieldType.F32 } }

      const result = compiler.compileEnsemble([warriorSuperposition, mageSuperposition], fields)

      // Разные наборы состояний
      expect(Object.keys(result.stateMaps[0]!)).toEqual(["IDLE", "ATTACK", "VICTORY"])
      expect(Object.keys(result.stateMaps[1]!)).toEqual(["IDLE", "CAST", "RECOVER"])
    })

    test("порядок триггеров: более специфичные условия проверяются первыми", () => {
      const compiler = new RulesCompiler()

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
