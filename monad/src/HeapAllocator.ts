export interface HeapBlock {
  offset: number
  size: number
}

/**
 * Аллокатор GPU-кучи на базе Free List (First-Fit).
 * Все размеры и смещения измеряются в 32-битных словах (u32).
 */
export class HeapAllocator {
  private freeList: HeapBlock[] = []

  constructor(totalSizeInWords: number) {
    if (totalSizeInWords <= 0) {
      throw new Error("Heap size must be positive.")
    }
    this.freeList = [{ offset: 0, size: totalSizeInWords }]
  }

  alloc(sizeInWords: number): HeapBlock {
    if (sizeInWords <= 0) {
      throw new Error("Allocation size must be positive.")
    }
    for (let i = 0; i < this.freeList.length; i++) {
      const block = this.freeList[i]
      if (block.size >= sizeInWords) {
        const allocated = { offset: block.offset, size: sizeInWords }
        if (block.size === sizeInWords) {
          this.freeList.splice(i, 1)
        } else {
          this.freeList[i] = { offset: block.offset + sizeInWords, size: block.size - sizeInWords }
        }
        return allocated
      }
    }
    throw new Error("Out of heap memory.")
  }

  free(offset: number, sizeInWords: number) {
    if (sizeInWords <= 0) {
      return
    }
    const newBlock = { offset, size: sizeInWords }
    this.freeList.push(newBlock)
    this.freeList.sort((a, b) => a.offset - b.offset)

    const merged: HeapBlock[] = []
    for (const block of this.freeList) {
      const last = merged[merged.length - 1]
      if (!last) {
        merged.push({ ...block })
        continue
      }
      if (last.offset + last.size === block.offset) {
        last.size += block.size
      } else {
        merged.push({ ...block })
      }
    }
    this.freeList = merged
  }

  getFreeList(): HeapBlock[] {
    return this.freeList.map((block) => ({ ...block }))
  }
}
