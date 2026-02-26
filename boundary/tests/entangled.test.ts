import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../src/index"

describe("Boundary — Entangled Branes (shared блоки)", () => {
  let boundary: Boundary

  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    boundary?.clear()
  })

  describe("Автоматическое создание shared блоков", () => {
    test("должен создать shared блок для одинаковых значений полей", async () => {
      boundary = new Boundary({ debug: { branes: true } })
      // Две браны с одинаковым isAlive=true
      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],  // hp (разные значения)
          [1, { type: FieldType.BOOL }], // isAlive (одинаковое значение)
        ],
        branes: [
          { state: 0, params: [[0, 100], [1, true]], superposition: { transitions: [[null]] } },
          { state: 0, params: [[0, 50], [1, true]], superposition: { transitions: [[null]] } },
        ],
      })

      const entangledStats = boundary.getEntangledStats()
      
      // Проверяем что создан 1 shared блок для isAlive=true
      expect(entangledStats.count).toBe(1)
    })

    test("не должен создавать shared блок для разных значений", async () => {
      boundary = new Boundary()
      // Две браны с разными значениями всех полей
      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: 0, params: [[0, 100], [1, true]], superposition: { transitions: [[null]] } },
          { state: 0, params: [[0, 50], [1, false]], superposition: { transitions: [[null]] } },
        ],
      })

      const entangledStats = boundary.getEntangledStats()
      
      // Нет shared блоков так как все значения разные
      expect(entangledStats.count).toBe(0)
    })

    test("должен создать shared блок для идентичных бран", async () => {
      boundary = new Boundary({ debug: { branes: true } })
      // Две идентичные браны (все поля одинаковые)
      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: 0, params: [[0, 100], [1, true]], superposition: { transitions: [[null]] } },
          { state: 0, params: [[0, 100], [1, true]], superposition: { transitions: [[null]] } },
        ],
      })

      const entangledStats = boundary.getEntangledStats()
      
      // Создаётся 1 entangled блок с обоими полями (hp и isAlive)
      expect(entangledStats.count).toBe(1)
    })
  })

  describe("Корректность работы с shared блоками", () => {
    test("должен корректно читать значения из shared блока", async () => {
      boundary = new Boundary()
      const superposition = {
        transitions: [
          [{ to: 1, conditions: { 1: true } }], // Переход если isAlive === true
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.BOOL }],
        ],
        branes: [
          { state: 0, params: [[0, 100], [1, true]], superposition },
          { state: 0, params: [[0, 50], [1, true]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      // Обе браны должны перейти в состояние 1 (isAlive === true)
      expect(states[0]).toBe(1)
      expect(states[1]).toBe(1)
    })

    test("должен работать с mixed: local + shared поля", async () => {
      boundary = new Boundary({ debug: { branes: true } })
      // Брана 0: hp=100 (shared), mana=50 (local)
      // Брана 1: hp=100 (shared), mana=10 (local)
      // isAlive=true (shared) для создания entangled блока
      const superposition = {
        transitions: [
          [
            { to: 1, conditions: { 1: { lt: 30 } } }, // mana < 30
          ],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }], // hp (shared)
          [1, { type: FieldType.F32 }], // mana (local, разные значения)
          [2, { type: FieldType.BOOL }], // isAlive (shared, для entangled)
        ],
        branes: [
          { state: 0, params: [[0, 100], [1, 50], [2, true]], superposition }, // mana=50 не < 30 → остаётся в 0
          { state: 0, params: [[0, 100], [1, 10], [2, true]], superposition }, // mana=10 < 30 → переходит в 1
        ],
      })

      // Проверяем что создан entangled блок для hp и isAlive (но не mana)
      const entangledStats = boundary.getEntangledStats()
      expect(entangledStats.count).toBeGreaterThan(0)

      boundary.step()
      const states = await boundary.getStates()

      // mana=50 не < 30 → брана 0 остаётся в 0
      // mana=10 < 30 → брана 1 переходит в 1
      expect(states[0]).toBe(0) // Не перешёл (mana=50)
      expect(states[1]).toBe(1) // Перешёл (mana=10)
    })
  })

  describe("Оптимизация памяти", () => {
    test("должен экономить память при множестве identical бран", async () => {
      boundary = new Boundary()
      // 10 идентичных бран
      const branes = Array(10).fill({
        state: 0,
        params: [[0, 100], [1, true], [2, "warrior"]] as any,
        superposition: { transitions: [[null]] },
      })

      await boundary.write({
        fields: [
          [0, { type: FieldType.F32 }],
          [1, { type: FieldType.BOOL }],
          [2, { type: FieldType.STRING_PTR }],
        ],
        branes,
      })

      const entangledStats = boundary.getEntangledStats()
      
      // Должны быть shared блоки для оптимизации
      expect(entangledStats.count).toBeGreaterThan(0)
      
      // Проверяем что все браны работают корректно
      boundary.step()
      const states = await boundary.getStates()
      expect(states.length).toBe(10)
      expect(states.every((s) => s === 0)).toBe(true)
    })
  })
})
