/**
 * Тесты для чистых функций entangled analyzer.
 */
import { test, expect, describe } from "bun:test"
import { findEntangledGroups, buildBraneMapping } from "../fields/entangled"

describe("findEntangledGroups / buildBraneMapping — чистые функции", () => {
  describe("findEntangledGroups", () => {
    test("должен найти entangled группу для одинаковых значений", () => {
      const values: [number, unknown][][] = [
        [[0, 100], [1, true]],
        [[0, 100], [1, true]],
      ]
      const { fieldUsage, entangledGroups } = findEntangledGroups(values)
      expect(fieldUsage.get(0)).toEqual(new Set([0, 1]))
      expect(entangledGroups.size).toBe(1)
    })

    test("не должен создавать entangled для разных значений", () => {
      const values: [number, unknown][][] = [
        [[0, 100], [1, true]],
        [[0, 50], [1, false]],
      ]
      const { entangledGroups } = findEntangledGroups(values)
      expect(entangledGroups.size).toBe(0)
    })

    test("должен создать entangled только для одинаковых полей", () => {
      const values: [number, unknown][][] = [
        [[0, 100], [1, true]],
        [[0, 100], [1, false]],
      ]
      const { entangledGroups } = findEntangledGroups(values)
      expect(entangledGroups.size).toBe(1)
    })

    test("должен обработать 3 браны с частичным совпадением", () => {
      const values: [number, unknown][][] = [
        [[0, 100], [1, true]],
        [[0, 100], [1, true]],
        [[0, 50], [1, false]],
      ]
      const { entangledGroups } = findEntangledGroups(values)
      expect(entangledGroups.size).toBe(0)
    })
  })

  describe("buildBraneMapping", () => {
    test("должен создать правильный маппинг для identical бран", () => {
      const values: [number, unknown][][] = [
        [[0, 100], [1, true]],
        [[0, 100], [1, true]],
      ]
      const analysis = findEntangledGroups(values)
      const entangledBraneIds = new Map<string, number>([["0,1", 0]])
      const result = buildBraneMapping(values, entangledBraneIds, analysis)
      expect(result.localFields[0]).toEqual([])
      expect(result.braneEntangledMap[0]).toEqual([0])
    })

    test("должен разделить local и entangled поля", () => {
      const values: [number, unknown][][] = [
        [[0, 100], [1, 50]],
        [[0, 100], [1, 10]],
      ]
      const analysis = findEntangledGroups(values)
      const entangledBraneIds = new Map<string, number>([["0,1", 0]])
      const result = buildBraneMapping(values, entangledBraneIds, analysis)
      expect(result.entangledFields.get("0,1")).toEqual([[0, 100]])
      expect(result.localFields[0]).toEqual([[1, 50]])
    })
  })
})
