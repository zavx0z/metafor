/**
 * Тесты для validateData.
 */
import { test, expect, describe } from "bun:test"
import { validateData } from "./validate"
import { FieldType, type Data } from "./index.t"

describe("validateData — валидация входных данных", () => {
  test("должен принимать валидные данные", () => {
    const data: Data = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        params: [[0, 100]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null]],
      }],
    }
    expect(() => validateData(data)).not.toThrow()
  })

  test("должен бросать ошибку для пустых fields", () => {
    const data = {
      fields: [],
      branes: [{
        params: [],
        state: 0,
        collapses: [[null]],
      }],
    } as Data
    expect(() => validateData(data)).toThrow("fields array cannot be empty")
  })

  test("должен бросать ошибку для пустых branes", () => {
    const data = {
      fields: [{ type: FieldType.F32 }],
      branes: [],
    } as Data
    expect(() => validateData(data)).toThrow("branes array cannot be empty")
  })

  test("должен бросать ошибку для невалидного типа поля", () => {
    const data = {
      fields: [{ type: 999 }],
      branes: [{
        params: [],
        state: 0,
        collapses: [[null]],
      }],
    } as Data
    expect(() => validateData(data)).toThrow("invalid type")
  })

  test("должен бросать ошибку для ARRAY_PTR без elementType", () => {
    const data = {
      fields: [{ type: FieldType.ARRAY_PTR }],
      branes: [{
        params: [],
        state: 0,
        collapses: [[null]],
      }],
    } as Data
    expect(() => validateData(data)).toThrow("ARRAY_PTR requires elementType")
  })

  test("должен бросать ошибку для out of range field index", () => {
    const data: Data = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        params: [[999, 100]],
        state: 0,
        collapses: [[null]],
      }],
    }
    expect(() => validateData(data)).toThrow("field index")
  })

  test("должен бросать ошибку для невалидного enum значения", () => {
    const data: Data = {
      fields: [{ type: FieldType.U32, enum: ["A", "B"] }],
      branes: [{
        params: [[0, "INVALID"]],
        state: 0,
        collapses: [[null]],
      }],
    }
    expect(() => validateData(data)).toThrow("not in enum")
  })

  test("должен принимать валидное enum значение", () => {
    const data: Data = {
      fields: [{ type: FieldType.U32, enum: ["A", "B"] }],
      branes: [{
        params: [[0, "A"]],
        state: 0,
        collapses: [[null]],
      }],
    }
    expect(() => validateData(data)).not.toThrow()
  })

  test("должен бросать ошибку для невалидного target state", () => {
    const data: Data = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        params: [],
        state: 0,
        collapses: [[[-1, {}]]], // отрицательный target state
      }],
    }
    expect(() => validateData(data)).toThrow("invalid target state")
  })

  test("должен бросать ошибку для target state out of range", () => {
    const data: Data = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        params: [],
        state: 0,
        collapses: [[[999, {}]]], // target state за пределами диапазона
      }],
    }
    expect(() => validateData(data)).toThrow("target state")
  })
})
