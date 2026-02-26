import { test, expect, describe } from "bun:test"
import type { ValueTuple } from "../src/index.t"
import {
  analyzeEntangledGroups,
  buildBraneMapping,
  prepareEnsembleData,
} from "../src/core/EntangledAnalyzer"

describe("EntangledAnalyzer — чистые функции", () => {
  describe("analyzeEntangledGroups", () => {
    test("должен найти entangled группу для одинаковых значений", () => {
      const params: ValueTuple[][] = [
        [
          [0, 100],
          [1, true],
        ], // брана 0
        [
          [0, 100],
          [1, true],
        ], // брана 1 (идентична)
      ]

      const { componentUsage, entangledGroups } = analyzeEntangledGroups(params)

      // Оба поля используются обеими бранами
      expect(componentUsage.get(0)).toEqual(new Set([0, 1]))
      expect(componentUsage.get(1)).toEqual(new Set([0, 1]))

      // Обе группы полей должны быть в entangled
      expect(entangledGroups.size).toBe(1)
      expect(entangledGroups.has("0,1")).toBe(true)
      expect(entangledGroups.get("0,1")).toEqual(new Set([0, 1]))
    })

    test("не должен создавать entangled для разных значений", () => {
      const params: ValueTuple[][] = [
        [
          [0, 100],
          [1, true],
        ],
        [
          [0, 50],
          [1, false],
        ],
      ]

      const { entangledGroups } = analyzeEntangledGroups(params)

      // Нет entangled групп так как все значения разные
      expect(entangledGroups.size).toBe(0)
    })

    test("должен создать entangled только для одинаковых полей", () => {
      const params: ValueTuple[][] = [
        [
          [0, 100],
          [1, true],
        ], // брана 0
        [
          [0, 100],
          [1, false],
        ], // брана 1 (hp одинаковый, isAlive разный)
      ]

      const { entangledGroups } = analyzeEntangledGroups(params)

      // Только hp (поле 0) должно быть в entangled
      expect(entangledGroups.size).toBe(1)
      expect(entangledGroups.get("0,1")).toEqual(new Set([0]))
    })

    test("должен обработать 3 браны с частичным совпадением", () => {
      const params: ValueTuple[][] = [
        [
          [0, 100],
          [1, true],
        ], // брана 0
        [
          [0, 100],
          [1, true],
        ], // брана 1 (идентична 0)
        [
          [0, 50],
          [1, false],
        ], // брана 2 (другие значения)
      ]

      const { entangledGroups } = analyzeEntangledGroups(params)

      // Нет entangled так как брана 2 имеет другие значения
      // componentUsage для поля 0: [0, 1, 2], но значения разные
      expect(entangledGroups.size).toBe(0)
    })
  })

  describe("buildBraneMapping", () => {
    test("должен создать правильный маппинг для identical бран", () => {
      const params: ValueTuple[][] = [
        [
          [0, 100],
          [1, true],
        ],
        [
          [0, 100],
          [1, true],
        ],
      ]

      const { componentUsage, entangledGroups } = analyzeEntangledGroups(params)
      const entangledBraneIds = new Map<string, number>([["0,1", 0]])

      const result = buildBraneMapping(params, entangledBraneIds, entangledGroups, componentUsage)

      // Все поля в entangled, localFields пустые
      expect(result.localFields[0]).toEqual([])
      expect(result.localFields[1]).toEqual([])

      // Обе браны ссылаются на entangled блок 0
      expect(result.braneEntangledMap[0]).toEqual([0])
      expect(result.braneEntangledMap[1]).toEqual([0])

      // Поля для entangled блока
      expect(result.entangledFields.get("0,1")).toEqual([
        [0, 100],
        [1, true],
      ])
    })

    test("должен разделить local и entangled поля", () => {
      const params: ValueTuple[][] = [
        [
          [0, 100],
          [1, 50],
        ], // брана 0
        [
          [0, 100],
          [1, 10],
        ], // брана 1 (hp одинаковый, mana разный)
      ]

      const { componentUsage, entangledGroups } = analyzeEntangledGroups(params)

      // Проверяем что только поле 0 (hp) в entangled
      expect(entangledGroups.size).toBe(1)
      expect(entangledGroups.get("0,1")).toEqual(new Set([0]))

      const entangledBraneIds = new Map<string, number>([["0,1", 0]])

      const result = buildBraneMapping(params, entangledBraneIds, entangledGroups, componentUsage)

      // Только hp в entangled
      expect(result.entangledFields.get("0,1")).toEqual([[0, 100]])

      // mana локальное для каждой браны
      expect(result.localFields[0]).toEqual([[1, 50]])
      expect(result.localFields[1]).toEqual([[1, 10]])

      // Обе браны ссылаются на entangled блок 0
      expect(result.braneEntangledMap[0]).toEqual([0])
      expect(result.braneEntangledMap[1]).toEqual([0])
    })
  })

  describe("prepareEnsembleData", () => {
    test("должен выполнить полный анализ", () => {
      const params: ValueTuple[][] = [
        [
          [0, 100],
          [1, true],
        ],
        [
          [0, 100],
          [1, true],
        ],
      ]

      const result = prepareEnsembleData(params)

      // 1 entangled группа
      expect(result.entangledBraneIds.size).toBe(1)
      expect(result.entangledFields.size).toBe(1)

      // Все поля в entangled
      expect(result.localFields[0]).toEqual([])
      expect(result.localFields[1]).toEqual([])

      // Обе браны используют entangled
      expect(result.braneEntangledMap[0]).toHaveLength(1)
      expect(result.braneEntangledMap[1]).toHaveLength(1)
    })

    test("должен обработать пустой вход", () => {
      const params: ValueTuple[][] = []

      const result = prepareEnsembleData(params)

      expect(result.entangledBraneIds.size).toBe(0)
      expect(result.entangledFields.size).toBe(0)
      expect(result.localFields).toEqual([])
      expect(result.braneEntangledMap).toEqual([])
    })

    test("должен обработать брану без entangled", () => {
      const params: ValueTuple[][] = [
        [[0, 100]],
        [[0, 50]],
      ]

      const result = prepareEnsembleData(params)

      // Нет entangled
      expect(result.entangledBraneIds.size).toBe(0)
      expect(result.entangledFields.size).toBe(0)

      // Все поля локальные
      expect(result.localFields[0]).toEqual([[0, 100]])
      expect(result.localFields[1]).toEqual([[0, 50]])

      // Нет entangled ссылок
      expect(result.braneEntangledMap[0]).toEqual([])
      expect(result.braneEntangledMap[1]).toEqual([])
    })
  })
})
