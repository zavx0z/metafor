/**
 * Тесты для GPU debug-утилит Matrix.
 */

import { describe, it, expect } from "bun:test"
import {
  dumpHeap,
  dumpBytecode,
  dumpStringTable,
  getHeapStats,
  visualizeBytecode,
  dumpMatrix,
} from "./debug"
import { packMeta } from "./layout-heap"
import { TYPE, OP } from "../constants"

describe("gpu/debug — утилиты отладки", () => {
  describe("dumpHeap()", () => {
    it("должен дампувать блок с 2 полями", () => {
      const heap = new Uint32Array([2, 0, 0, packMeta(TYPE.FLOAT, 1, 4), 1, packMeta(TYPE.BOOL, 1, 5), 0x42c80000, 1])
      const dump = dumpHeap(heap, 0)

      expect(dump.blockPtr).toBe(0)
      expect(dump.localCount).toBe(2)
      expect(dump.entangledCount).toBe(0)
      expect(dump.fields).toHaveLength(2)
      expect(dump.fields[0]).toEqual({ fieldId: 0, type: TYPE.FLOAT, typeName: "FLOAT", size: 1, offset: 4 })
      expect(dump.fields[1]).toEqual({ fieldId: 1, type: TYPE.BOOL, typeName: "BOOL", size: 1, offset: 5 })
      expect(dump.entangledPointers).toEqual([])
    })

    it("должен дампувать блок с entangled указателями", () => {
      const heap = new Uint32Array([1, 2, 0, packMeta(TYPE.UINT, 1, 3), 10, 20, 42])
      const dump = dumpHeap(heap, 0)

      expect(dump.localCount).toBe(1)
      expect(dump.entangledCount).toBe(2)
      expect(dump.entangledPointers).toEqual([10, 20])
    })
  })

  describe("dumpBytecode()", () => {
    it("должен дампувать bytecode с 2 состояниями", () => {
      const bytecode = new Uint32Array([2, 0, 1, 1, 5, 1, TYPE.FLOAT, 0, OP.GT, 0x42480000])
      const dump = dumpBytecode(bytecode, 0)

      expect(dump.offset).toBe(0)
      expect(dump.stateTableSize).toBe(2)
      expect(dump.states).toHaveLength(2)
      expect(dump.states[0]?.statePtr).toBe(2)
      expect(dump.states[0]?.transitions[0]?.conditions[0]?.valDecoded).toBe(50)
      expect(dump.states[1]?.isTerminal).toBe(true)
    })
  })

  describe("dumpStringTable()", () => {
    it("должен дампувать string table", () => {
      const dump = dumpStringTable(["", "hero", "mage"])
      expect(dump.count).toBe(3)
      expect(dump.strings[1]?.value).toBe("hero")
    })
  })

  describe("visualizeBytecode()", () => {
    it("должен строить текстовую визуализацию", () => {
      const bytecode = new Uint32Array([2, 0, 1, 1, 5, 1, TYPE.FLOAT, 0, OP.GT, 0x42480000])
      const viz = visualizeBytecode(bytecode, 0)
      expect(viz).toContain("State 0")
      expect(viz).toContain("GT")
    })
  })

  describe("getHeapStats()", () => {
    it("должен считать статистику heap", () => {
      const heap = new Uint32Array([1, 0, 0, packMeta(TYPE.UINT, 1, 3), 42, 0])
      const stats = getHeapStats(heap, [0])
      expect(stats.totalSize).toBe(heap.length)
      expect(stats.usedSize).toBeGreaterThan(0)
    })
  })

  describe("dumpMatrix()", () => {
    it("должен собирать полный дамп", async () => {
      const heap = new Uint32Array([1, 0, 0, packMeta(TYPE.UINT, 1, 3), 42, 0])
      const bytecode = new Uint32Array([1])
      const bytecodeOffsets = new Uint32Array([0])
      const dump = await dumpMatrix(heap, bytecode, bytecodeOffsets, [0], ["", "hero"])

      expect(dump.braneCount).toBe(1)
      expect(dump.heapBlocks).toHaveLength(1)
      expect(dump.bytecodeDumps).toHaveLength(1)
      expect(dump.stringAtlas?.count).toBe(2)
    })
  })
})
