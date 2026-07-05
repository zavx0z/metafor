/**
 * Тесты для validateData.
 */
import { test, expect, describe } from "bun:test"
import { validateData } from "../gravity/validate"
import { FieldType } from "../gravity"
import type { MatrixInputData } from "@metafor/types/matrix"

describe("validateData — валидация входных данных", () => {
  test("должен принимать валидные данные", () => {
    const data: MatrixInputData = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [[0, 100]],
        state: 0,
        collapses: [[[1, { 0: { gt: 50 } }]], [null]],
      }],
    }
    expect(() => validateData(data)).not.toThrow()
  })

  test("должен принимать отсутствующие fields", () => {
    const data: MatrixInputData = {
      branes: [],
    }
    expect(() => validateData(data)).not.toThrow()
  })

  test("должен принимать отсутствующие branes", () => {
    const data: MatrixInputData = {
      fields: [{ type: FieldType.F32 }],
    }
    expect(() => validateData(data)).not.toThrow()
  })

  test("должен принимать пустые fields", () => {
    const data: MatrixInputData = {
      fields: [],
      branes: [],
    }
    expect(() => validateData(data)).not.toThrow()
  })

  test("должен бросать ошибку для невалидного типа поля", () => {
    const data = {
      fields: [{ type: 999 }],
      branes: [{
        values: [],
        state: 0,
        collapses: [[null]],
      }],
    } as unknown as MatrixInputData
    expect(() => validateData(data)).toThrow("invalid type")
  })

  test("должен бросать ошибку для ARRAY_PTR без elementType", () => {
    const data = {
      fields: [{ type: FieldType.ARRAY_PTR }],
      branes: [{
        values: [],
        state: 0,
        collapses: [[null]],
      }],
    } as MatrixInputData
    expect(() => validateData(data)).toThrow("ARRAY_PTR requires elementType")
  })

  test("должен бросать ошибку для out of range field index", () => {
    const data: MatrixInputData = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [[999, 100]],
        state: 0,
        collapses: [[null]],
      }],
    }
    expect(() => validateData(data)).toThrow("field index")
  })

  test("должен бросать ошибку для невалидного enum значения", () => {
    const data: MatrixInputData = {
      fields: [{ type: FieldType.U32, enum: ["A", "B"] }],
      branes: [{
        values: [[0, "INVALID"]],
        state: 0,
        collapses: [[null]],
      }],
    }
    expect(() => validateData(data)).toThrow("not in enum")
  })

  test("должен принимать валидное enum значение", () => {
    const data: MatrixInputData = {
      fields: [{ type: FieldType.U32, enum: ["A", "B"] }],
      branes: [{
        values: [[0, "A"]],
        state: 0,
        collapses: [[null]],
      }],
    }
    expect(() => validateData(data)).not.toThrow()
  })

  test("должен бросать ошибку для невалидного target state", () => {
    const data: MatrixInputData = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [],
        state: 0,
        collapses: [[[-1, {}]]], // отрицательный target state
      }],
    }
    expect(() => validateData(data)).toThrow("invalid target state")
  })

  test("должен бросать ошибку для target state out of range", () => {
    const data: MatrixInputData = {
      fields: [{ type: FieldType.F32 }],
      branes: [{
        values: [],
        state: 0,
        collapses: [[[999, {}]]], // target state за пределами диапазона
      }],
    }
    expect(() => validateData(data)).toThrow("target state")
  })
})
