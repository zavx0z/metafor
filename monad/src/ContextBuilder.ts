import { FieldType, GlobalFieldRegistry, packMeta, sizeInWordsForType } from "./GlobalFieldRegistry"
import { HeapAllocator } from "./HeapAllocator"

export interface BuiltContextBlock {
  blockOffset: number
  blockSizeInWords: number
}

export interface ContextBuildOptions {
  sharedContextPtrs?: number[]
}

export class ContextBuilder {
  private encoder = new TextEncoder()

  constructor(
    private registry: GlobalFieldRegistry,
    private allocator: HeapAllocator,
    private heapView: Uint32Array,
  ) {}

  build(context: Record<string, unknown>, options: ContextBuildOptions = {}): BuiltContextBlock {
    const sharedContextPtrs = options.sharedContextPtrs ?? []
    const localEntries = Object.entries(context)
      .map(([name, value]) => {
        const def = this.registry.getField(name)
        if (!def) {
          throw new Error(`Unknown field: ${name}`)
        }
        return { name, def, value }
      })
      .sort((a, b) => a.def.id - b.def.id)

    const localFieldCount = localEntries.length
    const sharedCount = sharedContextPtrs.length
    const headerWords = 2 + localFieldCount * 2
    const bodyStart = headerWords

    let currentOffset = bodyStart + sharedCount
    const fieldLayouts = localEntries.map((entry) => {
      const sizeInWords = sizeInWordsForType(entry.def.type)
      const offsetInWords = currentOffset
      currentOffset += sizeInWords
      return { ...entry, sizeInWords, offsetInWords }
    })

    const totalWords = currentOffset
    const block = this.allocator.alloc(totalWords)
    const blockBuffer = new ArrayBuffer(totalWords * 4)
    const blockView = new DataView(blockBuffer)
    const blockWords = new Uint32Array(blockBuffer)

    blockWords[0] = localFieldCount
    blockWords[1] = sharedCount

    let headerIndex = 2
    for (const layout of fieldLayouts) {
      blockWords[headerIndex++] = layout.def.id
      blockWords[headerIndex++] = packMeta(layout.def.type, layout.sizeInWords, layout.offsetInWords)
    }

    for (let i = 0; i < sharedCount; i++) {
      blockWords[bodyStart + i] = sharedContextPtrs[i] ?? 0
    }

    for (const layout of fieldLayouts) {
      const offsetBytes = layout.offsetInWords * 4
      switch (layout.def.type) {
        case FieldType.F32:
          blockView.setFloat32(offsetBytes, Number(layout.value), true)
          break
        case FieldType.U32:
          blockView.setUint32(offsetBytes, Number(layout.value), true)
          break
        case FieldType.StringPtr: {
          const encoded = this.encoder.encode(String(layout.value))
          const stringWords = Math.ceil(encoded.length / 4)
          const stringBlock = this.allocator.alloc(stringWords)
          const byteView = new Uint8Array(this.heapView.buffer)
          byteView.fill(0, stringBlock.offset * 4, (stringBlock.offset + stringWords) * 4)
          byteView.set(encoded, stringBlock.offset * 4)

          blockView.setUint32(offsetBytes, stringBlock.offset, true)
          blockView.setUint32(offsetBytes + 4, encoded.length, true)
          break
        }
        default:
          throw new Error(`Unsupported field type: ${layout.def.type}`)
      }
    }

    this.heapView.set(blockWords, block.offset)

    return { blockOffset: block.offset, blockSizeInWords: block.size }
  }
}
