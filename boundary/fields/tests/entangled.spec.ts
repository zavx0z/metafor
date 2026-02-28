/**
 * Тесты для модуля entangled — анализ запутанных групп бран.
 */
import { test, expect, describe } from "bun:test"
import { findEntangledGroups, buildBraneMapping } from "../entangled"
import type { EntangledGroup } from "../entangled.t"

describe("findEntangledGroups — поиск запутанных групп", () => {
  test("должен найти entangled группу для идентичных бран", () => {
    const params: [number, unknown][][] = [
      [[0, 100], [1, true]], // брана 0
      [[0, 100], [1, true]], // брана 1 (идентична)
    ]
    const result = findEntangledGroups(params)

    // Оба поля используются обеими бранами
    expect(result.fieldUsage.get(0)).toEqual(new Set([0, 1]))
    expect(result.fieldUsage.get(1)).toEqual(new Set([0, 1]))

    // Должна быть 1 entangled группа
    expect(result.entangledGroups.size).toBe(1)
    const group = result.entangledGroups.get("0,1")
    expect(group).toBeDefined()
    expect(group!.braneIndices).toEqual(new Set([0, 1]))
    expect(group!.fieldIndices).toEqual(new Set([0, 1]))
  })

  test("не должен создавать entangled для разных значений", () => {
    const params: [number, unknown][][] = [
      [[0, 100], [1, true]],
      [[0, 50], [1, false]],
    ]
    const result = findEntangledGroups(params)

    // Нет entangled групп так как все значения разные
    expect(result.entangledGroups.size).toBe(0)
  })

  test("должен создать entangled только для одинаковых полей", () => {
    const params: [number, unknown][][] = [
      [[0, 100], [1, true]], // брана 0
      [[0, 100], [1, false]], // брана 1 (hp одинаковый, isAlive разный)
    ]
    const result = findEntangledGroups(params)

    // Только поле 0 (hp) должно быть в entangled
    expect(result.entangledGroups.size).toBe(1)
    const group = result.entangledGroups.get("0,1")
    expect(group).toBeDefined()
    expect(group!.fieldIndices).toEqual(new Set([0]))
  })

  test("должен обработать 3 браны с частичным совпадением", () => {
    const params: [number, unknown][][] = [
      [[0, 100], [1, true]], // брана 0
      [[0, 100], [1, true]], // брана 1 (идентична 0)
      [[0, 50], [1, false]], // брана 2 (другие значения)
    ]
    const result = findEntangledGroups(params)

    // Нет entangled так как брана 2 имеет другие значения
    expect(result.entangledGroups.size).toBe(0)
  })

  test("должен обработать пустой вход", () => {
    const params: [number, unknown][][] = []
    const result = findEntangledGroups(params)

    expect(result.fieldUsage.size).toBe(0)
    expect(result.entangledGroups.size).toBe(0)
  })
})

describe("buildBraneMapping — построение маппинга бран", () => {
  test("должен создать правильный маппинг для identical бран", () => {
    const params: [number, unknown][][] = [
      [[0, 100], [1, true]],
      [[0, 100], [1, true]],
    ]
    const analysis = findEntangledGroups(params)
    const entangledBraneIds = new Map<string, number>([["0,1", 0]])
    const result = buildBraneMapping(params, entangledBraneIds, analysis)

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
    const params: [number, unknown][][] = [
      [[0, 100], [1, 50]], // брана 0
      [[0, 100], [1, 10]], // брана 1 (hp одинаковый, mana разный)
    ]
    const analysis = findEntangledGroups(params)
    const entangledBraneIds = new Map<string, number>([["0,1", 0]])
    const result = buildBraneMapping(params, entangledBraneIds, analysis)

    // Только hp в entangled
    expect(result.entangledFields.get("0,1")).toEqual([[0, 100]])

    // mana локальное для каждой браны
    expect(result.localFields[0]).toEqual([[1, 50]])
    expect(result.localFields[1]).toEqual([[1, 10]])

    // Обе браны ссылаются на entangled блок 0
    expect(result.braneEntangledMap[0]).toEqual([0])
    expect(result.braneEntangledMap[1]).toEqual([0])
  })

  test("должен обработать брану без entangled", () => {
    const params: [number, unknown][][] = [
      [[0, 100]],
      [[0, 50]],
    ]
    const analysis = findEntangledGroups(params)
    const entangledBraneIds = new Map<string, number>()
    const result = buildBraneMapping(params, entangledBraneIds, analysis)

    // Нет entangled
    expect(result.entangledFields.size).toBe(0)

    // Все поля локальные
    expect(result.localFields[0]).toEqual([[0, 100]])
    expect(result.localFields[1]).toEqual([[0, 50]])

    // Нет entangled ссылок
    expect(result.braneEntangledMap[0]).toEqual([])
    expect(result.braneEntangledMap[1]).toEqual([])
  })
})
