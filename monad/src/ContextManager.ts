import { ContextBuilder } from "./ContextBuilder"
import { FieldType, GlobalFieldRegistry, unpackMeta } from "./GlobalFieldRegistry"
import { HeapAllocator } from "./HeapAllocator"

interface AgentDescriptor {
  blockOffset: number
}

export class ContextManager {
  private heapView: Uint32Array
  private heapBuffer: GPUBuffer
  private descriptorsView: Uint32Array
  private descriptorsBuffer: GPUBuffer
  private allocator: HeapAllocator
  private builder: ContextBuilder
  private descriptors: AgentDescriptor[] = []

  constructor(
    private device: GPUDevice,
    heapSizeInWords: number,
    maxAgents: number,
    private registry = GlobalFieldRegistry.getInstance(),
  ) {
    this.heapView = new Uint32Array(heapSizeInWords)
    this.descriptorsView = new Uint32Array(maxAgents)
    this.heapBuffer = device.createBuffer({
      size: heapSizeInWords * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.descriptorsBuffer = device.createBuffer({
      size: maxAgents * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.allocator = new HeapAllocator(heapSizeInWords)
    this.builder = new ContextBuilder(this.registry, this.allocator, this.heapView)
  }

  getHeapBuffer() {
    return this.heapBuffer
  }

  getAgentDescriptorsBuffer() {
    return this.descriptorsBuffer
  }

  createAgent(context: Record<string, unknown>, sharedContextPtrs: number[] = []): number {
    const { blockOffset } = this.builder.build(context, { sharedContextPtrs })
    const agentId = this.descriptors.length
    this.descriptors.push({ blockOffset })
    this.descriptorsView[agentId] = blockOffset
    this.device.queue.writeBuffer(this.heapBuffer, 0, this.heapView)
    this.device.queue.writeBuffer(this.descriptorsBuffer, 0, this.descriptorsView)
    return agentId
  }

  updateAgentField(agentId: number, fieldName: string, newData: unknown) {
    const descriptor = this.descriptors[agentId]
    if (!descriptor) {
      throw new Error(`Unknown agentId: ${agentId}`)
    }
    const fieldDef = this.registry.getField(fieldName)
    if (!fieldDef) {
      throw new Error(`Unknown field: ${fieldName}`)
    }

    const blockOffset = descriptor.blockOffset
    const localFieldCount = this.heapView[blockOffset]
    const headerStart = blockOffset + 2

    let metaOffset = -1
    let meta = 0
    for (let i = 0; i < localFieldCount; i++) {
      const fieldId = this.heapView[headerStart + i * 2]
      if (fieldId === fieldDef.id) {
        metaOffset = headerStart + i * 2 + 1
        meta = this.heapView[metaOffset]
        break
      }
    }

    if (metaOffset < 0) {
      throw new Error(`Field '${fieldName}' not found in agent ${agentId}.`)
    }

    const { type, offsetInWords } = unpackMeta(meta)
    const absoluteOffset = blockOffset + offsetInWords

    if (type === FieldType.StringPtr) {
      const oldPtr = this.heapView[absoluteOffset]
      const oldLen = this.heapView[absoluteOffset + 1]
      const oldSizeInWords = Math.ceil(oldLen / 4)
      this.allocator.free(oldPtr, oldSizeInWords)

      const encoded = new TextEncoder().encode(String(newData))
      const newSizeInWords = Math.ceil(encoded.length / 4)
      const newBlock = this.allocator.alloc(newSizeInWords)

      const byteView = new Uint8Array(this.heapView.buffer)
      byteView.fill(0, newBlock.offset * 4, (newBlock.offset + newSizeInWords) * 4)
      byteView.set(encoded, newBlock.offset * 4)

      this.heapView[absoluteOffset] = newBlock.offset
      this.heapView[absoluteOffset + 1] = encoded.length
    } else if (type === FieldType.F32) {
      const view = new DataView(this.heapView.buffer)
      view.setFloat32(absoluteOffset * 4, Number(newData), true)
    } else if (type === FieldType.U32) {
      this.heapView[absoluteOffset] = Number(newData)
    } else {
      throw new Error(`Unsupported field type: ${type}`)
    }

    const byteOffset = absoluteOffset * 4
    const byteLength = type === FieldType.StringPtr ? 8 : 4
    this.device.queue.writeBuffer(this.heapBuffer, byteOffset, this.heapView.buffer, byteOffset, byteLength)
  }
}
