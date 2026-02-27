/**
 * Тесты логических операторов (IN, NOT_IN).
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { write, update, resetMatrix } from "../index"
import { GPU } from "../gpu/device"
import { FieldType } from "../index.t"
import { resetStringAtlas } from "../StringAtlas"

describe("matrix — Логические стадии (bun-webgpu)", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  describe("Оператор IN (Списки)", () => {
    test("должен перейти, если значение в списке", async () => {
      const collapses = [
        [[1, { 0: { in: [1, 3, 5] } }]],
        [[2, { 0: { in: [2, 4, 6] } }]],
        [null],
        [null],
      ]
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [
          { state: 0, params: [[0, 1]], collapses },
          { state: 0, params: [[0, 4]], collapses },
          { state: 0, params: [[0, 0]], collapses },
        ],
      })
      const resultStates = await update(0, 0, 1)
      expect(resultStates[0]?.[1]).toBe(1)
      expect(resultStates[1]?.[1]).toBe(2)
      expect(resultStates[2]?.[1]).toBe(0)
    })
  })
})
