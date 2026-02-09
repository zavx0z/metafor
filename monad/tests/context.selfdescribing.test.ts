import { describe, expect, test } from "bun:test"
import { ContextBuilder } from "../src/ContextBuilder"
import { ContextManager } from "../src/ContextManager"
import { FieldType, GlobalFieldRegistry, packMeta, sizeInWordsForType, unpackMeta } from "../src/GlobalFieldRegistry"
import { HeapAllocator } from "../src/HeapAllocator"

class FakeQueue {
  writes: Array<{ buffer: GPUBuffer; offset: number; size: number }> = []
  writeBuffer(buffer: GPUBuffer, offset: number, data: ArrayBuffer | ArrayBufferView, dataOffset = 0, size?: number) {
    const byteLength = size ?? (data instanceof ArrayBuffer ? data.byteLength : data.byteLength - dataOffset)
    this.writes.push({ buffer, offset, size: byteLength })
  }
}

class FakeDevice {
  queue = new FakeQueue()
  createBuffer({ size, usage }: { size: number; usage: number }) {
    return { size, usage } as GPUBuffer
  }
}

const decoder = new TextDecoder()
;(globalThis as typeof globalThis & { GPUBufferUsage?: { STORAGE: number; COPY_DST: number } }).GPUBufferUsage = {
  STORAGE: 1,
  COPY_DST: 2,
}

describe("Self-describing context blocks", () => {
  const getFreshRegistry = () => {
    ;(GlobalFieldRegistry as unknown as { instance: GlobalFieldRegistry | null }).instance = null
    return GlobalFieldRegistry.getInstance()
  }

  test("GlobalFieldRegistry packs and unpacks metadata", () => {
    const registry = getFreshRegistry()
    const hp = registry.registerField("hp", FieldType.F32)
    const name = registry.registerField("name", FieldType.StringPtr)

    expect(hp.id).toBeLessThan(name.id)
    expect(sizeInWordsForType(FieldType.StringPtr)).toBe(2)

    const packed = packMeta(FieldType.StringPtr, 2, 12)
    const unpacked = unpackMeta(packed)
    expect(unpacked.type).toBe(FieldType.StringPtr)
    expect(unpacked.sizeInWords).toBe(2)
    expect(unpacked.offsetInWords).toBe(12)
  })

  test("HeapAllocator allocates and coalesces free blocks", () => {
    const allocator = new HeapAllocator(16)
    const a = allocator.alloc(4)
    const b = allocator.alloc(6)
    allocator.free(a.offset, a.size)
    allocator.free(b.offset, b.size)

    const freeList = allocator.getFreeList()
    expect(freeList.length).toBe(1)
    expect(freeList[0]?.offset).toBe(0)
    expect(freeList[0]?.size).toBe(16)
  })

  test("ContextBuilder builds a self-describing block with shared pointers and string data", () => {
    const registry = getFreshRegistry()
    const hp = registry.registerField("hp", FieldType.F32)
    const name = registry.registerField("name", FieldType.StringPtr)
    const level = registry.registerField("level", FieldType.U32)

    const heapView = new Uint32Array(128)
    const allocator = new HeapAllocator(heapView.length)
    const builder = new ContextBuilder(registry, allocator, heapView)

    const result = builder.build({ hp: 150, name: "Orc", level: 3 }, { sharedContextPtrs: [10, 20] })

    expect(result.blockOffset).toBe(0)
    expect(result.blockSizeInWords).toBeGreaterThan(0)

    const blockOffset = result.blockOffset
    expect(heapView[blockOffset]).toBe(3)
    expect(heapView[blockOffset + 1]).toBe(2)

    const headerStart = blockOffset + 2
    const ids = [hp.id, name.id, level.id]
    ids.forEach((id, index) => {
      expect(heapView[headerStart + index * 2]).toBe(id)
    })

    const findMeta = (fieldId: number) => {
      for (let i = 0; i < ids.length; i++) {
        if (heapView[headerStart + i * 2] === fieldId) {
          return unpackMeta(heapView[headerStart + i * 2 + 1])
        }
      }
      throw new Error("Field metadata not found")
    }

    const nameMeta = findMeta(name.id)
    expect(nameMeta.type).toBe(FieldType.StringPtr)

    const sharedStart = headerStart + ids.length * 2
    expect(heapView[sharedStart]).toBe(10)
    expect(heapView[sharedStart + 1]).toBe(20)

    const hpMeta = findMeta(hp.id)
    const hpOffset = blockOffset + hpMeta.offsetInWords
    const view = new DataView(heapView.buffer)
    expect(view.getFloat32(hpOffset * 4, true)).toBe(150)

    const nameOffset = blockOffset + nameMeta.offsetInWords
    const namePtr = heapView[nameOffset]
    const nameLen = heapView[nameOffset + 1]
    const bytes = new Uint8Array(heapView.buffer, namePtr * 4, nameLen)
    expect(decoder.decode(bytes)).toBe("Orc")

    const levelMeta = findMeta(level.id)
    const levelOffset = blockOffset + levelMeta.offsetInWords
    expect(heapView[levelOffset]).toBe(3)
  })

  test("ContextManager updates string fields with free + re-allocate", () => {
    const registry = getFreshRegistry()
    registry.registerField("name", FieldType.StringPtr)
    registry.registerField("hp", FieldType.F32)

    const device = new FakeDevice() as unknown as GPUDevice
    const manager = new ContextManager(device, 256, 4, registry)

    const agentId = manager.createAgent({ name: "Orc", hp: 50 })
    manager.updateAgentField(agentId, "name", "Goblin")
    manager.updateAgentField(agentId, "hp", 75)

    const heapView = (manager as any).heapView as Uint32Array
    const descriptor = (manager as any).descriptors[agentId]
    const blockOffset = descriptor.blockOffset

    const localFieldCount = heapView[blockOffset]
    const headerStart = blockOffset + 2
    let nameMetaOffset = -1
    for (let i = 0; i < localFieldCount; i++) {
      const fieldId = heapView[headerStart + i * 2]
      if (fieldId === registry.getField("name")!.id) {
        nameMetaOffset = headerStart + i * 2 + 1
        break
      }
    }
    expect(nameMetaOffset).toBeGreaterThan(0)
    const nameMeta = unpackMeta(heapView[nameMetaOffset])
    const nameOffset = blockOffset + nameMeta.offsetInWords

    const namePtr = heapView[nameOffset]
    const nameLen = heapView[nameOffset + 1]
    const bytes = new Uint8Array(heapView.buffer, namePtr * 4, nameLen)
    expect(decoder.decode(bytes)).toBe("Goblin")

    let hpMetaOffset = -1
    for (let i = 0; i < localFieldCount; i++) {
      const fieldId = heapView[headerStart + i * 2]
      if (fieldId === registry.getField("hp")!.id) {
        hpMetaOffset = headerStart + i * 2 + 1
        break
      }
    }
    expect(hpMetaOffset).toBeGreaterThan(0)
    const hpMeta = unpackMeta(heapView[hpMetaOffset])
    const hpOffset = blockOffset + hpMeta.offsetInWords
    const view = new DataView(heapView.buffer)
    expect(view.getFloat32(hpOffset * 4, true)).toBe(75)

    const writes = (device.queue as FakeQueue).writes
    expect(writes.length).toBeGreaterThan(0)
  })
})
