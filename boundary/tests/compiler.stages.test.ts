import { test, expect, describe } from "bun:test"
import { RulesCompiler } from "../src/compiler/RulesCompiler"
import { OP } from "../src/opcodes"
import { FieldType } from "../src/index"

describe("Компилятор — Строгая типизация", () => {
  describe("Регистрация полей", () => {
    test("должен компилировать superposition с полем array<number>", () => {
      const compiler = new RulesCompiler()
      const fields = { vals: { type: FieldType.ARRAY_PTR, options: { elementType: "number" } } }
      const config = { S1: null }

      const result = compiler.compile(config, fields)

      // Проверяем, что байткод сгенерирован
      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)
    })

    test("должен компилировать superposition с полем array<string>", () => {
      const compiler = new RulesCompiler()
      const fields = { ids: { type: FieldType.ARRAY_PTR, options: { elementType: "string" } } }
      const config = { S1: null }

      const result = compiler.compile(config, fields)

      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)
    })

    test("должен компилировать superposition с полем enum<string>", () => {
      const compiler = new RulesCompiler()
      const fields = { role: { type: FieldType.U32, options: { enumValues: ["A", "B"] } } }
      const config = { S1: null }

      const result = compiler.compile(config, fields)
      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)
    })
  })

  describe("Кодирование значений в байт-коде", () => {
    test("оператор 'in' должен кодировать ENUM как индексы", () => {
      const compiler = new RulesCompiler()
      const fields = { role: { type: FieldType.U32, options: { enumValues: ["IDLE", "WALK", "RUN"] } } }
      const config = {
        IDLE: {
          MOVING: { role: { in: ["WALK", "RUN"] } }, // WALK->1, RUN->2
        },
        MOVING: null,
      }

      const result = compiler.compile(config, fields)
      const bc = Array.from(result.bytecode)

      // Ищем IN (6)
      let instructionIdx = -1
      for (let i = 0; i < bc.length - 3; i++) {
        if (bc[i + 2] === OP.IN) {
          instructionIdx = i
          break
        }
      }
      expect(instructionIdx).not.toBe(-1)

      const heapPtr = bc[instructionIdx + 3]!
      const absHeapPtr = instructionIdx + heapPtr
      const listLength = bc[absHeapPtr]!
      const item1 = bc[absHeapPtr + 1]!
      const item2 = bc[absHeapPtr + 2]!

      expect(listLength).toBe(2)
      expect(item1).toBe(1) // "WALK" index
      expect(item2).toBe(2) // "RUN" index

    })

    test("оператор 'in' должен кодировать number через bitcast float→u32", () => {
      const compiler = new RulesCompiler()
      const fields = { temp: { type: FieldType.F32 } }
      const vals = [36.6, 40.0]
      const config = {
        S1: {
          S2: { temp: { in: vals } },
        },
        S2: null,
      }

      const result = compiler.compile(config, fields)
      const bc = Array.from(result.bytecode)

      // Ищем IN
      let heapPtr: number | undefined
      let instructionIdx = -1
      for (let i = 0; i < bc.length - 3; i++) {
        if (bc[i + 2] === OP.IN) {
          heapPtr = bc[i + 3]
          instructionIdx = i
          break
        }
      }
      expect(heapPtr).toBeDefined()
      expect(instructionIdx).toBeGreaterThanOrEqual(0)

      const absHeapPtr = instructionIdx + heapPtr!
      const val1Raw = bc[absHeapPtr + 1]!
      const floatView = new Float32Array(new Uint32Array([val1Raw]).buffer)
      expect(floatView[0]).toBeCloseTo(36.6)
    })

    test("оператор 'include' должен кодировать значение элемента массива", () => {
      const compiler = new RulesCompiler()
      // Инвентарь с числовыми предметами
      const fields = { items: { type: FieldType.ARRAY_PTR, options: { elementType: "number" } } }
      const config = {
        IDLE: {
          EQUIP: { items: { include: 555 } },
        },
        EQUIP: null,
      }

      const result = compiler.compile(config, fields)
      const bc = Array.from(result.bytecode)

      // Ищем [ARRAY_TYPE, IDX, OP.INCLUDE, VAL]
      // Для array<number> значение 555 кодируется через bitcast float→u32
      const expected555 = new Uint32Array(new Float32Array([555]).buffer)[0]!
      let found = false
      for (let i = 0; i < bc.length - 3; i++) {
        if (bc[i + 2] === OP.INCLUDE) {
          expect(bc[i + 3]).toBe(expected555)
          found = true
          break
        }
      }
      expect(found).toBe(true)
    })

    test("оператор 'isEmpty' должен кодировать boolean как 0/1", () => {
      const compiler = new RulesCompiler()
      const fields = { tags: { type: FieldType.ARRAY_PTR, options: { elementType: "string" } } }
      const config = {
        S1: { S2: { tags: { isEmpty: true } } },
        S2: null,
      }

      const result = compiler.compile(config, fields)
      const bc = Array.from(result.bytecode)

      let found = false
      for (let i = 0; i < bc.length - 3; i++) {
        if (bc[i + 2] === OP.IS_EMPTY) {
          expect(bc[i + 3]).toBe(1) // true -> 1
          found = true
          break
        }
      }
      expect(found).toBe(true)
    })
  })
})
