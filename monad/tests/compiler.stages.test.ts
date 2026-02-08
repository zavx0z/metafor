import { test, expect, describe } from "bun:test"
import { RulesCompiler } from "../src/compiler"
import { OP, TYPE } from "../src/common"

describe("Компилятор (Этапы 2 и 3) — Типы и Условия", () => {
  
  describe("Этап 2: Расширенная система типов", () => {
    test("должен парсить объектную схему { type: 'array' }", () => {
      const compiler = new RulesCompiler()
      const schema = { tags: { type: "array", items: "number" } }
      const config = { START: { END: { tags: { isEmpty: true } } }, END: null }
      
      const result = compiler.compile(config, schema)
      
      expect(result.fieldMap["tags"]).toBeDefined()
      expect(result.fieldMap["tags"]!.type).toBe(TYPE.ARRAY)
      console.log("✅ Тип ARRAY распознан корректно")
    })

    test("должен парсить объектную схему { type: 'float' }", () => {
      const compiler = new RulesCompiler()
      const schema = { hp: { type: "float" } }
      const config = { START: { END: { hp: { gt: 0 } } }, END: null }
      
      const result = compiler.compile(config, schema)
      
      expect(result.fieldMap["hp"]!.type).toBe(TYPE.FLOAT)
      console.log("✅ Тип FLOAT (через объект) распознан корректно")
    })
  })

  describe("Этап 3: Операторы списков (IN, NOT_IN)", () => {
    test("оператор 'in' должен генерировать OP.IN и создавать список в куче", () => {
      const compiler = new RulesCompiler()
      const schema = { role: "int" } // Используем "int" чтобы получить TYPE.UINT и raw значения 1, 5, 9
      const config = {
        IDLE: {
          WORK: { role: { in: [1, 5, 9] } } // 1=Miner, 5=Builder
        },
        WORK: null
      }

      const result = compiler.compile(config, schema)
      const bc = Array.from(result.bytecode)

      // 1. Проверяем наличие оператора OP.IN (6)
      // Формат инструкции: [TYPE, IDX, OP, VALUE_PTR]
      let instructionIdx = -1
      for (let i = 0; i < bc.length - 3; i++) {
        if (bc[i+2] === OP.IN) {
          instructionIdx = i
          break
        }
      }
      expect(instructionIdx).not.toBe(-1)
      
      // 2. Получаем указатель на кучу
      const heapPtr = bc[instructionIdx + 3]
      if (heapPtr === undefined) {
        throw new Error(`heapPtr is undefined at instructionIdx ${instructionIdx}`)
      }
      expect(heapPtr).toBeGreaterThan(instructionIdx)
      expect(heapPtr).toBeLessThan(bc.length)

      // 3. Проверяем содержимое списка в куче
      // Формат: [LENGTH, ITEM1, ITEM2, ...]
      if (heapPtr + 3 >= bc.length) {
        throw new Error(`heapPtr (${heapPtr}) is too close to the end of bytecode (length ${bc.length})`)
      }
      const listLength = bc[heapPtr]!
      const item1 = bc[heapPtr + 1]!
      const item2 = bc[heapPtr + 2]!
      const item3 = bc[heapPtr + 3]!

      expect(listLength).toBe(3)
      expect(item1).toBe(1)
      expect(item2).toBe(5)
      expect(item3).toBe(9)
      
      console.log(`✅ OP.IN сгенерирован, список по адресу ${heapPtr}: [${item1}, ${item2}, ${item3}]`)
    })

    test("оператор 'notIn' должен генерировать OP.NOT_IN", () => {
      const compiler = new RulesCompiler()
      const schema = { status: "number" }
      const config = {
        ACTIVE: {
          AFK: { status: { notIn: [1] } } 
        },
        AFK: null
      }

      const result = compiler.compile(config, schema)
      const bc = Array.from(result.bytecode)
      
      const hasNotIn = bc.includes(OP.NOT_IN)
      expect(hasNotIn).toBe(true)
      console.log("✅ OP.NOT_IN сгенерирован")
    })

    test("список значений FLOAT должен быть корректно закодирован (bitcast)", () => {
      const compiler = new RulesCompiler()
      const schema = { temp: "float" }
      const vals = [36.6, 40.0]
      const config = {
        CHECK: {
          ALARM: { temp: { in: vals } }
        },
        ALARM: null
      }

      const result = compiler.compile(config, schema)
      const bc = Array.from(result.bytecode)

      // Ищем инструкцию IN
      let heapPtr: number | undefined = undefined
      for (let i = 0; i < bc.length - 3; i++) {
        if (bc[i+2] === OP.IN) {
          heapPtr = bc[i+3]
          break
        }
      }
      expect(heapPtr).toBeDefined()
      
      // Проверяем значения в куче
      if (heapPtr === undefined) {
        throw new Error(`heapPtr is undefined`)
      }
      if (heapPtr + 2 >= bc.length) {
        throw new Error(`Некорректный heapPtr: ${heapPtr}`)
      }
      const val1Raw = bc[heapPtr + 1]!
      const val2Raw = bc[heapPtr + 2]!

      // Декодируем обратно во float для проверки
      const floatView = new Float32Array(new Uint32Array([val1Raw, val2Raw]).buffer)
      
      expect(floatView[0]).toBeCloseTo(36.6)
      expect(floatView[1]).toBeCloseTo(40.0)
      
      console.log(`✅ Float значения в списке закодированы: ${floatView[0]}, ${floatView[1]}`)
    })
  })
})
