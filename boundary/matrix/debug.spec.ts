/**
 * Тесты для debug утилит Matrix.
 *
 * Проверяет:
 * - dumpHeap() — дамп heap блоков
 * - dumpBytecode() — дамп bytecode
 * - dumpStringAtlas() — дамп атласа строк
 * - getHeapStats() — статистика heap
 * - visualizeBytecode() — визуализация bytecode
 * - getTypeName() / getOpName() — имена типов и операций
 * - bitcastToF32() — конвертация float
 */

import { describe, it, expect } from "bun:test"
import { getStringAtlas, resetStringAtlas, type StringAtlasExport } from "@boundary/atlas"
import {
  dumpHeap,
  dumpBytecode,
  dumpStringAtlas,
  getHeapStats,
  visualizeBytecode,
  dumpMatrix,
} from "./debug"
import { StringAtlas } from "@boundary/atlas"
import { packMeta } from "@boundary/fields"
import { TYPE, OP } from "@boundary/fields"

describe("debug — утилиты отладки", () => {
  describe("dumpHeap()", () => {
    it("должен дампувать блок с 2 полями", () => {
      // Формат блока: [local_count, entangled_count, ...descriptors, ...values]
      const heap = new Uint32Array([
        2, // local_count
        0, // entangled_count
        0, // field_idx=0
        packMeta(TYPE.FLOAT, 1, 4), // meta: type=FLOAT, size=1, offset=4
        1, // field_idx=1
        packMeta(TYPE.BOOL, 1, 5), // meta: type=BOOL, size=1, offset=5
        0x42c80000, // value for field 0 (100.0f)
        1, // value for field 1 (true)
      ])

      const dump = dumpHeap(heap, 0)

      expect(dump.blockPtr).toBe(0)
      expect(dump.localCount).toBe(2)
      expect(dump.entangledCount).toBe(0)
      expect(dump.fields).toHaveLength(2)
      expect(dump.fields[0]).toEqual({
        fieldId: 0,
        type: TYPE.FLOAT,
        typeName: "FLOAT",
        size: 1,
        offset: 4,
      })
      expect(dump.fields[1]).toEqual({
        fieldId: 1,
        type: TYPE.BOOL,
        typeName: "BOOL",
        size: 1,
        offset: 5,
      })
      expect(dump.entangledPointers).toEqual([])
    })

    it("должен дампувать блок с entangled указателями", () => {
      const heap = new Uint32Array([
        1, // local_count
        2, // entangled_count
        0, // field_idx=0
        packMeta(TYPE.UINT, 1, 3), // meta
        10, // entangled_ptr[0]
        20, // entangled_ptr[1]
        42, // value
      ])

      const dump = dumpHeap(heap, 0)

      expect(dump.localCount).toBe(1)
      expect(dump.entangledCount).toBe(2)
      expect(dump.entangledPointers).toEqual([10, 20])
    })

    it("должен обрабатывать пустой блок", () => {
      const heap = new Uint32Array([0, 0])

      const dump = dumpHeap(heap, 0)

      expect(dump.localCount).toBe(0)
      expect(dump.entangledCount).toBe(0)
      expect(dump.fields).toEqual([])
    })

    it("должен обрабатывать STRING поле", () => {
      const heap = new Uint32Array([
        1, // local_count
        0, // entangled_count
        0, // field_idx
        packMeta(TYPE.STRING, 2, 2), // meta: size=2 для STRING
        42, // string_id
        0x12345678, // hash
      ])

      const dump = dumpHeap(heap, 0)

      expect(dump.fields[0]).toEqual({
        fieldId: 0,
        type: TYPE.STRING,
        typeName: "STRING",
        size: 2,
        offset: 2,
      })
    })

    it("должен обрабатывать ARRAY поле", () => {
      const heap = new Uint32Array([
        1, // local_count
        0, // entangled_count
        0, // field_idx
        packMeta(TYPE.ARRAY, 2, 2), // meta: size=2 для ARRAY
        10, // pointer
        0, // reserved
      ])

      const dump = dumpHeap(heap, 0)

      expect(dump.fields[0]).toEqual({
        fieldId: 0,
        type: TYPE.ARRAY,
        typeName: "ARRAY",
        size: 2,
        offset: 2,
      })
    })
  })

  describe("dumpBytecode()", () => {
    it("должен дампувать bytecode с 2 состояниями", () => {
      // Формат: [state_ptr_0, state_ptr_1, ...state_blocks, ...condition_blocks]
      // state_ptr указывает на абсолютное смещение в bytecode
      // state_ptr_0 = 2 (после таблицы состояний из 2 слов)
      // state_ptr_1 = 0 (терминальное)
      const bytecode = new Uint32Array([
        2, // state_ptr[0] = 2 (абсолютное смещение)
        0, // state_ptr[1] = 0 (терминальное)
        // State 0 block @ offset 2:
        1, // tr_count
        1, // target state
        5, // cond_ptr (абсолютное смещение)
        // Condition block @ 5:
        1, // cond_count
        TYPE.FLOAT, // type
        0, // field_idx
        OP.GT, // op
        0x42480000, // val (50.0f)
      ])

      const dump = dumpBytecode(bytecode, 0)

      expect(dump.offset).toBe(0)
      expect(dump.stateTableSize).toBe(2)
      expect(dump.states).toHaveLength(2)

      // State 0
      expect(dump.states[0]?.stateIdx).toBe(0)
      expect(dump.states[0]?.statePtr).toBe(2)
      expect(dump.states[0]?.isTerminal).toBe(false)
      expect(dump.states[0]?.transitionCount).toBe(1)
      expect(dump.states[0]?.transitions[0]?.target).toBe(1)
      expect(dump.states[0]?.transitions[0]?.conditions).toHaveLength(1)
      expect(dump.states[0]?.transitions[0]?.conditions[0]).toEqual({
        conditionIdx: 0,
        type: TYPE.FLOAT,
        typeName: "FLOAT",
        fieldId: 0,
        op: OP.GT,
        opName: "GT",
        valEncoded: 0x42480000,
        valDecoded: 50.0,
      })

      // State 1 (terminal)
      expect(dump.states[1]?.stateIdx).toBe(1)
      expect(dump.states[1]?.statePtr).toBe(0)
      expect(dump.states[1]?.isTerminal).toBe(true)
      expect(dump.states[1]?.transitionCount).toBe(0)
    })

    it("должен дампувать bytecode с множественными условиями", () => {
      const bytecode = new Uint32Array([
        2, // state_ptr[0]
        0, // state_ptr[1] (terminal)
        // State 0 @ 2:
        1, // tr_count
        1, // target
        5, // cond_ptr
        // Condition block @ 5:
        2, // cond_count
        TYPE.FLOAT, 0, OP.GT, 50, // cond 0: f0 > 50
        TYPE.BOOL, 1, OP.EQ, 1, // cond 1: f1 == true
      ])

      const dump = dumpBytecode(bytecode, 0)

      expect(dump.states[0]?.transitions[0]?.conditions).toHaveLength(2)
      expect(dump.states[0]?.transitions[0]?.conditions[0]?.fieldId).toBe(0)
      expect(dump.states[0]?.transitions[0]?.conditions[1]?.fieldId).toBe(1)
    })

    it("должен обрабатывать терминальное состояние", () => {
      // state_ptr = 0 означает терминальное состояние
      const bytecode = new Uint32Array([
        0, // state_ptr[0] = 0 (терминальное)
      ])

      const dump = dumpBytecode(bytecode, 0)

      // stateTableSize = 0 - 0 = 0, нет состояний для дампа
      expect(dump.stateTableSize).toBe(0)
    })

    it("должен обрабатывать оператор IN со списком", () => {
      // Простой тест: condition block без heap
      const bytecode = new Uint32Array([
        2, // state_ptr[0]
        0, // state_ptr[1]
        // State 0 @ 2:
        1, // tr_count
        1, // target
        5, // cond_ptr
        // Condition @ 5:
        1, // cond_count
        TYPE.UINT, // type
        0, // field_idx
        OP.IN, // op
        0, // val_encoded
      ])

      const dump = dumpBytecode(bytecode, 0)

      expect(dump.states[0]?.transitions[0]?.conditions).toHaveLength(1)
      expect(dump.states[0]?.transitions[0]?.conditions[0]?.op).toBe(OP.IN)
      expect(dump.states[0]?.transitions[0]?.conditions[0]?.opName).toBe("IN")
    })
  })

  describe("dumpStringAtlas()", () => {
    it("должен дампуать строки из атласа", () => {
      const atlas = new StringAtlas()
      atlas.intern("hello")
      atlas.intern("world")

      const dump = dumpStringAtlas(atlas)

      expect(dump.count).toBe(2)
      expect(dump.strings).toHaveLength(2)
      expect(dump.strings[0]?.value).toBe("hello")
      expect(dump.strings[1]?.value).toBe("world")
    })

    it("должен включать метаданные строк", () => {
      const atlas = new StringAtlas()
      const id = atlas.intern("test")
      const meta = atlas.getMeta(id)!

      const dump = dumpStringAtlas(atlas)

      expect(dump.strings[0]).toEqual({
        id: 0,
        value: "test",
        length: meta.length,
        hash: meta.hash,
        pointer: meta.pointer,
      })
    })

    it("должен обрабатывать Unicode строки", () => {
      const atlas = new StringAtlas()
      atlas.intern("привет")
      atlas.intern("👋")
      atlas.intern("世界")

      const dump = dumpStringAtlas(atlas)

      expect(dump.strings[0]?.value).toBe("привет")
      expect(dump.strings[1]?.value).toBe("👋")
      expect(dump.strings[2]?.value).toBe("世界")
    })

    it("должен обрабатывать пустой атлас", () => {
      const atlas = new StringAtlas()

      const dump = dumpStringAtlas(atlas)

      expect(dump.count).toBe(0)
      expect(dump.strings).toEqual([])
    })
  })

  describe("getHeapStats()", () => {
    it("должен считать статистику heap", () => {
      const heap = new Uint32Array([
        // Block 0
        1, // local_count
        0, // entangled_count
        0, // field_idx
        packMeta(TYPE.FLOAT, 1, 4), // meta
        0, // value
        // Array reserve (последнее слово = 0)
      ])

      const stats = getHeapStats(heap, [0])

      expect(stats.totalSize).toBe(heap.length)
      expect(stats.usedSize).toBeGreaterThan(0)
      expect(stats.utilization).toBeGreaterThan(0)
      expect(stats.utilization).toBeLessThanOrEqual(100)
    })

    it("должен считать arrayReserve", () => {
      const arrayReserve = 100
      const heap = new Uint32Array(200)
      heap[199] = arrayReserve // Последнее слово = размер резерва

      const stats = getHeapStats(heap, [])

      expect(stats.arrayReserve).toBe(arrayReserve)
    })

    it("должен обрабатывать пустой heap", () => {
      const heap = new Uint32Array([0])

      const stats = getHeapStats(heap, [])

      expect(stats.totalSize).toBe(1)
      expect(stats.usedSize).toBe(0)
      expect(stats.utilization).toBe(0)
    })

    it("должен считать freeSize", () => {
      const heap = new Uint32Array(100)
      heap[99] = 10 // arrayReserve = 10

      // Один блок размером 5 слов
      const stats = getHeapStats(heap, [0])

      expect(stats.freeSize).toBeLessThan(100)
    })
  })

  describe("visualizeBytecode()", () => {
    it("должен визуализировать bytecode в виде строки", () => {
      const bytecode = new Uint32Array([
        2, // state_ptr[0]
        0, // state_ptr[1]
        // State 0 @ 2:
        1, // tr_count
        1, // target
        5, // cond_ptr
        // Condition @ 5:
        1, // cond_count
        TYPE.FLOAT, 0, OP.GT, 0x42480000, // f0 > 50.0
      ])

      const viz = visualizeBytecode(bytecode, 0)

      expect(viz).toContain("Bytecode @ 0")
      expect(viz).toContain("states: 2")
      expect(viz).toContain("State 0")
      expect(viz).toContain("→ State 1")
      expect(viz).toContain("GT")
    })

    it("должен помечать терминальные состояния", () => {
      const bytecode = new Uint32Array([
        0, // state_ptr[0] = 0 (терминальное)
      ])

      const viz = visualizeBytecode(bytecode, 0)

      // stateTableSize = 0, поэтому состояний нет
      expect(viz).toContain("states: 0")
    })

    it("должен визуализировать множественные условия", () => {
      const bytecode = new Uint32Array([
        2, // state_ptr[0]
        0, // state_ptr[1]
        // State 0 @ 2:
        1, 1, 5,
        // Conditions @ 5:
        2,
        TYPE.FLOAT, 0, OP.GT, 0x42480000, // 50.0f
        TYPE.BOOL, 1, OP.EQ, 1,
      ])

      const viz = visualizeBytecode(bytecode, 0)

      expect(viz).toContain("GT")
      expect(viz).toContain("EQ 1")
      expect(viz).toContain("&&")
    })
  })

  describe("getTypeName()", () => {
    it("должен возвращать имена для известных типов", () => {
      // Проверяем через dumpHeap, так как getTypeName не экспортируется
      const heap = new Uint32Array([
        5, 0,
        0, packMeta(TYPE.FLOAT, 1, 5),
        1, packMeta(TYPE.UINT, 1, 6),
        2, packMeta(TYPE.BOOL, 1, 7),
        3, packMeta(TYPE.STRING, 2, 8),
        4, packMeta(TYPE.ARRAY, 2, 10),
      ])

      const dump = dumpHeap(heap, 0)

      expect(dump.fields[0]?.typeName).toBe("FLOAT")
      expect(dump.fields[1]?.typeName).toBe("UINT")
      expect(dump.fields[2]?.typeName).toBe("BOOL")
      expect(dump.fields[3]?.typeName).toBe("STRING")
      expect(dump.fields[4]?.typeName).toBe("ARRAY")
    })

    it("должен возвращать UNKNOWN для неизвестных типов", () => {
      const heap = new Uint32Array([
        1, 0,
        0, packMeta(99, 1, 2), // Неизвестный тип
      ])

      const dump = dumpHeap(heap, 0)

      expect(dump.fields[0]?.typeName).toContain("UNKNOWN")
    })
  })

  describe("getOpName()", () => {
    it("должен возвращать имена для известных операций", () => {
      // Проверяем через dumpBytecode с несколькими условиями
      const bytecode = new Uint32Array([
        2, // state_ptr[0]
        0, // state_ptr[1]
        // State 0 @ 2:
        1, 1, 5,
        // Conditions @ 5:
        3, // cond_count
        TYPE.UINT, 0, OP.EQ, 0,
        TYPE.UINT, 0, OP.GT, 0,
        TYPE.UINT, 0, OP.IN, 0,
      ])

      const dump = dumpBytecode(bytecode, 0)
      const ops = dump.states[0]?.transitions[0]?.conditions.map(c => c.opName)

      expect(ops?.[0]).toBe("EQ")
      expect(ops?.[1]).toBe("GT")
      expect(ops?.[2]).toBe("IN")
    })

    it("должен возвращать UNKNOWN для неизвестных операций", () => {
      const bytecode = new Uint32Array([
        2,
        0,
        // State 0 @ 2:
        1, 1, 5,
        // Condition @ 5:
        1,
        TYPE.UINT, 0, 99, 0, // Неизвестная операция
      ])

      const dump = dumpBytecode(bytecode, 0)

      expect(dump.states[0]?.transitions[0]?.conditions[0]?.opName).toContain("UNKNOWN")
    })
  })

  describe("bitcastToF32()", () => {
    it("должен конвертировать u32 в float32", () => {
      // 50.0f = 0x42480000
      const bytecode = new Uint32Array([
        2,
        0,
        // State 0 @ 2:
        1, 1, 5,
        // Condition @ 5:
        1,
        TYPE.FLOAT, 0, OP.EQ, 0x42480000, // 50.0f
      ])

      const dump = dumpBytecode(bytecode, 0)

      expect(dump.states[0]?.transitions[0]?.conditions[0]?.valDecoded).toBeCloseTo(50.0, 5)
    })

    it("должен конвертировать отрицательные числа", () => {
      // -50.0f = 0xC2480000
      const bytecode = new Uint32Array([
        2,
        0,
        // State 0 @ 2:
        1, 1, 5,
        // Condition @ 5:
        1,
        TYPE.FLOAT, 0, OP.EQ, 0xc2480000, // -50.0f
      ])

      const dump = dumpBytecode(bytecode, 0)

      expect(dump.states[0]?.transitions[0]?.conditions[0]?.valDecoded).toBeLessThan(0)
    })

    it("должен конвертировать ноль", () => {
      const bytecode = new Uint32Array([
        2,
        0,
        // State 0 @ 2:
        1, 1, 5,
        // Condition @ 5:
        1,
        TYPE.FLOAT, 0, OP.EQ, 0x00000000, // 0.0f
      ])

      const dump = dumpBytecode(bytecode, 0)

      expect(dump.states[0]?.transitions[0]?.conditions[0]?.valDecoded).toBe(0)
    })
  })

  describe("dumpMatrix()", () => {
    it("должен возвращать полный дамп Matrix", async () => {
      const heap = new Uint32Array([
        1, 0,
        0, packMeta(TYPE.FLOAT, 1, 2),
        0,
      ])

      const bytecode = new Uint32Array([
        1, // terminal
      ])

      const bytecodeOffsets = new Uint32Array([0])
      const braneBlockPtrs = [0]

      const dump = await dumpMatrix(heap, bytecode, bytecodeOffsets, braneBlockPtrs)

      expect(dump.braneCount).toBe(1)
      expect(dump.heapBlocks).toHaveLength(1)
      expect(dump.bytecodeDumps).toHaveLength(1)
      expect(dump.heapStats).toBeDefined()
      expect(dump.heapStats.totalSize).toBe(heap.length)
    })

    it("должен обрабатывать несколько бран", async () => {
      const heap = new Uint32Array([
        1, 0, 0, packMeta(TYPE.FLOAT, 1, 2), 0,
        1, 0, 0, packMeta(TYPE.FLOAT, 1, 2), 0,
      ])

      const bytecode = new Uint32Array([
        1, // brane 0
        1, // brane 1
      ])

      const bytecodeOffsets = new Uint32Array([0, 1])
      const braneBlockPtrs = [0, 2]

      const dump = await dumpMatrix(heap, bytecode, bytecodeOffsets, braneBlockPtrs)

      expect(dump.braneCount).toBe(2)
      expect(dump.heapBlocks).toHaveLength(2)
      expect(dump.bytecodeDumps).toHaveLength(2)
    })
  })
})
