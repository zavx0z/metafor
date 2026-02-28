/**
 * Тесты для модуля heap — построение кучи и поиск полей.
 */
import { test, expect, describe } from "bun:test"
import { packMeta, unpackMeta, buildHeap, findFieldOffset } from "../heap"
import { TYPE } from "../opcodes"

describe("packMeta / unpackMeta — упаковка метаданных", () => {
  test("должен упаковать и распаковать метаданные поля", () => {
    const packed = packMeta(TYPE.FLOAT, 1, 4)
    expect(packed).toBeGreaterThan(0)

    const unpacked = unpackMeta(packed)
    expect(unpacked.type).toBe(TYPE.FLOAT)
    expect(unpacked.size).toBe(1)
    expect(unpacked.offset).toBe(4)
  })

  test("должен упаковать метаданные для STRING_PTR (size=2)", () => {
    const packed = packMeta(TYPE.STRING, 2, 10)
    const unpacked = unpackMeta(packed)
    expect(unpacked.type).toBe(TYPE.STRING)
    expect(unpacked.size).toBe(2)
    expect(unpacked.offset).toBe(10)
  })

  test("должен обработать максимальное смещение (65535)", () => {
    const packed = packMeta(TYPE.UINT, 1, 65535)
    const unpacked = unpackMeta(packed)
    expect(unpacked.offset).toBe(65535)
  })
})

describe("buildHeap — построение кучи", () => {
  test("должен построить heap для 1 браны с 2 local полями", () => {
    const input = {
      localFields: [[[0, 100], [1, 1]] as [number, number][]], // брана 0: hp=100 (F32), active=true (BOOL)
      braneEntangledMap: [[]],
      entangledFields: new Map(),
      fieldMeta: new Map([
        [0, { fieldType: TYPE.FLOAT, fieldSize: 1 }],
        [1, { fieldType: TYPE.BOOL, fieldSize: 1 }],
      ]),
    }
    const result = buildHeap(input)

    expect(result.blockPtrs).toHaveLength(1)
    // blockSizes возвращается только для brane блоков (без entangled)
    expect(result.blockSizes.length).toBe(1)

    // Проверка заголовка: local_count=2, entangled_count=0
    const blockPtr = result.blockPtrs[0]!
    expect(result.heap[blockPtr]).toBe(2) // local_count
    expect(result.heap[blockPtr + 1]).toBe(0) // entangled_count
  })

  test("должен построить heap с entangled ссылками", () => {
    const entangledFields = new Map<string, [number, number][]>([
      ["0,1", [[0, 100]] as [number, number][]], // поле 0 (hp) shared для бран 0 и 1
    ])
    const input = {
      localFields: [
        [[1, 50]] as [number, number][], // брана 0: mana=50 (local)
        [[1, 10]] as [number, number][], // брана 1: mana=10 (local)
      ],
      braneEntangledMap: [[0], [0]], // обе ссылаются на entangled блок 0
      entangledFields,
      fieldMeta: new Map([
        [0, { fieldType: TYPE.FLOAT, fieldSize: 1 }],
        [1, { fieldType: TYPE.FLOAT, fieldSize: 1 }],
      ]),
    }
    const result = buildHeap(input)

    // 2 браны (entangled блоки не входят в blockPtrs)
    expect(result.blockPtrs).toHaveLength(2)
    expect(result.blockSizes).toHaveLength(2)
  })

  test("должен построить пустой heap для пустого входа", () => {
    const input = {
      localFields: [] as [number, number][][],
      braneEntangledMap: [],
      entangledFields: new Map(),
      fieldMeta: new Map(),
    }
    const result = buildHeap(input)

    // Слово 0 резервируется как null pointer
    expect(result.heap.length).toBe(1)
    expect(result.heap[0]).toBe(0)  // null pointer
    expect(result.blockPtrs).toHaveLength(0)
  })
})

describe("findFieldOffset — поиск смещения поля", () => {
  test("должен найти смещение поля в блоке", () => {
    const input = {
      localFields: [[[0, 100], [1, 1]] as [number, number][]],
      braneEntangledMap: [[]],
      entangledFields: new Map(),
      fieldMeta: new Map([
        [0, { fieldType: TYPE.FLOAT, fieldSize: 1 }],
        [1, { fieldType: TYPE.BOOL, fieldSize: 1 }],
      ]),
    }
    const result = buildHeap(input)
    const blockPtr = result.blockPtrs[0]!

    // Ищем поле 0 (hp)
    const offset0 = findFieldOffset(result.heap, blockPtr, 0)
    expect(offset0).toBeGreaterThan(0)

    // Ищем поле 1 (active)
    const offset1 = findFieldOffset(result.heap, blockPtr, 1)
    expect(offset1).toBeGreaterThan(offset0!)
  })

  test("должен вернуть null для несуществующего поля", () => {
    const input = {
      localFields: [[[0, 100]] as [number, number][]],
      braneEntangledMap: [[]],
      entangledFields: new Map(),
      fieldMeta: new Map([[0, { fieldType: TYPE.FLOAT, fieldSize: 1 }]]),
    }
    const result = buildHeap(input)
    const blockPtr = result.blockPtrs[0]!

    const offset = findFieldOffset(result.heap, blockPtr, 999)
    expect(offset).toBeNull()
  })
})
