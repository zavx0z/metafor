import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"

describe("Boundary - тип BOOLEAN (логический) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  describe("Прямое значение true", () => {
    test("должен выполнить переход, когда значение равно true", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: true } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.BOOL }]],
        branes: [
          { state: "IDLE", params: [[0, true]], superposition },
          { state: "IDLE", params: [[0, false]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Прямое значение false", () => {
    test("должен выполнить переход, когда значение равно false", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { DEAD: { 0: false } },
        DEAD: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.BOOL }]],
        branes: [
          { state: "IDLE", params: [[0, false]], superposition },
          { state: "IDLE", params: [[0, true]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно true", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { eq: true } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.BOOL }]],
        branes: [
          { state: "IDLE", params: [[0, true]], superposition },
          { state: "IDLE", params: [[0, false]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })

    test("должен выполнить переход, когда значение равно false", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { DEAD: { 0: { eq: false } } },
        DEAD: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.BOOL }]],
        branes: [
          { state: "IDLE", params: [[0, false]], superposition },
          { state: "IDLE", params: [[0, true]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно true", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { DEAD: { 0: { neq: true } } },
        DEAD: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.BOOL }]],
        branes: [
          { state: "IDLE", params: [[0, true]], superposition },
          { state: "IDLE", params: [[0, false]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("DEAD")
    })

    test("должен выполнить переход, когда значение не равно false", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { neq: false } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.BOOL }]],
        branes: [
          { state: "IDLE", params: [[0, false]], superposition },
          { state: "IDLE", params: [[0, true]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
    })
  })

  describe("Множественные логические условия", () => {
    test("должен выполнить переход, когда все условия выполнены (И)", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: true, 1: true } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { fieldId: 0, type: FieldType.BOOL }],
          [1, { fieldId: 1, type: FieldType.BOOL }],
        ],
        branes: [
          { state: "IDLE", params: [[0, true], [1, true]], superposition },
          { state: "IDLE", params: [[0, true], [1, false]], superposition },
          { state: "IDLE", params: [[0, false], [1, true]], superposition },
          { state: "IDLE", params: [[0, false], [1, false]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })

    test("должен выполнить переход с разными комбинациями логических значений", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: true, 1: false } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { fieldId: 0, type: FieldType.BOOL }],
          [1, { fieldId: 1, type: FieldType.BOOL }],
        ],
        branes: [
          { state: "IDLE", params: [[0, true], [1, false]], superposition },
          { state: "IDLE", params: [[0, true], [1, true]], superposition },
          { state: "IDLE", params: [[0, false], [1, false]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Обновление логических значений", () => {
    test("должен выполнить переход после обновления значения на true", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: true } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.BOOL }]],
        branes: [{ state: "IDLE", params: [[0, false]], superposition }],
      })

      boundary.updateBraneField(0, 0, true)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })

    test("должен выполнить переход после обновления значения на false", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { DEAD: { 0: false } },
        DEAD: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.BOOL }]],
        branes: [{ state: "IDLE", params: [[0, true]], superposition }],
      })

      boundary.updateBraneField(0, 0, false)
      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("DEAD")
    })
  })

  describe("Смешанные условия (логическое + число)", () => {
    test("должен выполнить переход, когда оба условия разных типов выполнены", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { COMBAT: { 0: true, 1: { gt: 50 } } },
        COMBAT: null,
      }

      await boundary.write({
        fields: [
          [0, { fieldId: 0, type: FieldType.BOOL }],
          [1, { fieldId: 1, type: FieldType.F32 }],
        ],
        branes: [
          { state: "IDLE", params: [[0, true], [1, 100]], superposition },
          { state: "IDLE", params: [[0, true], [1, 30]], superposition },
          { state: "IDLE", params: [[0, false], [1, 100]], superposition },
          { state: "IDLE", params: [[0, false], [1, 30]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("COMBAT")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })
  })
})
