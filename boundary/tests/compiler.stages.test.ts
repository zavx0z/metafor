import { test, expect, describe } from "bun:test"
import { RulesCompiler } from "../src/compiler"
import { OP } from "../src/common"

describe("Компилятор (Этапы 2 и 3) — Строгая типизация", () => {
  describe("Парсинг типов", () => {
    test("array<number> должен компилироваться корректно", () => {
      const compiler = new RulesCompiler()
      const schema = { vals: { type: "array<number>" } }
      const config = { S1: null }

      const result = compiler.compile(config, schema)

      // Проверяем, что байткод сгенерирован
      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)
    })

    test("array<string> должен компилироваться корректно", () => {
      const compiler = new RulesCompiler()
      const schema = { ids: { type: "array<string>" } }
      const config = { S1: null }

      const result = compiler.compile(config, schema)

      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)
    })

    test("enum<string> должен компилироваться корректно", () => {
      const compiler = new RulesCompiler()
      const schema = { role: { type: "enum<string>", values: ["A", "B"] } }
      const config = { S1: null }

      const result = compiler.compile(config, schema)
      expect(result.bytecode).toBeInstanceOf(Uint32Array)
      expect(result.bytecode.length).toBeGreaterThan(0)
    })
  })

  describe("Кодирование значений (Этап 3)", () => {
    test("оператор 'in' должен кодировать ENUM как индексы", () => {
      const compiler = new RulesCompiler()
      const schema = { role: { type: "enum<string>", values: ["IDLE", "WALK", "RUN"] } }
      const config = {
        IDLE: {
          MOVING: { role: { in: ["WALK", "RUN"] } }, // WALK->1, RUN->2
        },
        MOVING: null,
      }

      const result = compiler.compile(config, schema)
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

    test("number список должен кодироваться через bitcast", () => {
      const compiler = new RulesCompiler()
      const schema = { temp: { type: "number" } }
      const vals = [36.6, 40.0]
      const config = {
        S1: {
          S2: { temp: { in: vals } },
        },
        S2: null,
      }

      const result = compiler.compile(config, schema)
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

    test("оператор 'include' должен генерировать OP.INCLUDE", () => {
      const compiler = new RulesCompiler()
      // Инвентарь с числовыми предметами
      const schema = { items: { type: "array<number>" } }
      const config = {
        IDLE: {
          EQUIP: { items: { include: 555 } },
        },
        EQUIP: null,
      }

      const result = compiler.compile(config, schema)
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

    test("оператор 'isEmpty' должен принимать boolean", () => {
      const compiler = new RulesCompiler()
      const schema = { tags: { type: "array<string>" } }
      const config = {
        S1: { S2: { tags: { isEmpty: true } } },
        S2: null,
      }

      const result = compiler.compile(config, schema)
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
