import { test, expect, describe } from "bun:test"
import { RulesCompiler } from "../src/compiler"
import { OP, TYPE } from "../src/common"

describe("Компилятор (Этапы 2 и 3) — Строгая типизация", () => {
  
  describe("Парсинг типов", () => {
    test("должен парсить array<float>", () => {
      const compiler = new RulesCompiler()
      const schema = { vals: { type: "array<float>" } }
      const config = { S1: null }
      
      const result = compiler.compile(config, schema)
      
      expect(result.fieldMap["vals"]).toBeDefined()
      expect(result.fieldMap["vals"]!.type).toBe(TYPE.ARRAY)
      expect(result.fieldMap["vals"]!.subType).toBe(TYPE.FLOAT)
      console.log("✅ array<float> -> ARRAY + subType:FLOAT")
    })

    test("должен парсить array<integer>", () => {
      const compiler = new RulesCompiler()
      const schema = { ids: { type: "array<integer>" } }
      const config = { S1: null }
      
      const result = compiler.compile(config, schema)
      
      expect(result.fieldMap["ids"]!.type).toBe(TYPE.ARRAY)
      expect(result.fieldMap["ids"]!.subType).toBe(TYPE.UINT)
      console.log("✅ array<integer> -> ARRAY + subType:UINT")
    })

    test("должен парсить enum с values", () => {
      const compiler = new RulesCompiler()
      const schema = { role: { type: "enum", values: ["A", "B"] } }
      const config = { S1: null }
      
      const result = compiler.compile(config, schema)
      expect(result.fieldMap["role"]!.type).toBe(TYPE.UINT)
      expect(result.fieldMap["role"]!.enumValues).toEqual(["A", "B"])
      console.log("✅ enum -> UINT + saved values")
    })
  })

  describe("Кодирование значений (Этап 3)", () => {
    test("оператор 'in' должен кодировать ENUM как индексы", () => {
      const compiler = new RulesCompiler()
      const schema = { role: { type: "enum", values: ["IDLE", "WALK", "RUN"] } }
      const config = {
        IDLE: {
          MOVING: { role: { in: ["WALK", "RUN"] } } // WALK->1, RUN->2
        },
        MOVING: null
      }

      const result = compiler.compile(config, schema)
      const bc = Array.from(result.bytecode)

      // Ищем IN (6)
      let instructionIdx = -1
      for (let i = 0; i < bc.length - 3; i++) {
        if (bc[i+2] === OP.IN) {
          instructionIdx = i
          break
        }
      }
      expect(instructionIdx).not.toBe(-1)
      
      const heapPtr = bc[instructionIdx + 3]!
      const listLength = bc[heapPtr]!
      const item1 = bc[heapPtr + 1]!
      const item2 = bc[heapPtr + 2]!

      expect(listLength).toBe(2)
      expect(item1).toBe(1) // "WALK" index
      expect(item2).toBe(2) // "RUN" index
      
      console.log(`✅ Enum значения в списке закодированы как индексы: ${item1}, ${item2}`)
    })

    test("array<float> список должен кодироваться через bitcast", () => {
      const compiler = new RulesCompiler()
      const schema = { temp: { type: "float" } }
      const vals = [36.6, 40.0]
      const config = {
        S1: {
          S2: { temp: { in: vals } }
        },
        S2: null
      }

      const result = compiler.compile(config, schema)
      const bc = Array.from(result.bytecode)

      // Ищем IN
      let heapPtr: number | undefined
      for (let i = 0; i < bc.length - 3; i++) {
        if (bc[i+2] === OP.IN) {
          heapPtr = bc[i+3]
          break
        }
      }
      expect(heapPtr).toBeDefined()
      
      const val1Raw = bc[heapPtr! + 1]!
      const floatView = new Float32Array(new Uint32Array([val1Raw]).buffer)
      expect(floatView[0]).toBeCloseTo(36.6)
      console.log(`✅ Float закодирован: ${floatView[0]}`)
    })
  })
})
