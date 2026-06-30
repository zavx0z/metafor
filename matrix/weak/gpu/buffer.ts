export function createBuffer(device: GPUDevice, data: ArrayBufferView, usage: GPUBufferUsageFlags): GPUBuffer {
  const buffer = device.createBuffer({
    size: Math.ceil(data.byteLength / 4) * 4,
    usage,
    mappedAtCreation: true,
  })
  if (data instanceof Float32Array) {
    new Float32Array(buffer.getMappedRange()).set(data)
  } else {
    new Uint32Array(buffer.getMappedRange()).set(data as Uint32Array)
  }
  buffer.unmap()
  return buffer
}

export function createStorageBuffer(device: GPUDevice, data: ArrayBufferView, extraCopy = false): GPUBuffer {
  let usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  if (extraCopy) {
    usage |= GPUBufferUsage.COPY_SRC
  }
  return createBuffer(device, data, usage)
}

export function nextCapacityWords(requiredWords: number, minimumWords = 16): number {
  let capacity = Math.max(1, minimumWords)
  while (capacity < requiredWords) {
    capacity *= 2
  }
  return capacity
}

export function createStorageBufferWithCapacity(
  device: GPUDevice,
  data: Uint32Array,
  capacityWords: number,
  extraCopy = false,
): GPUBuffer {
  const capacity = Math.max(capacityWords, data.length, 1)
  const padded = new Uint32Array(capacity)
  padded.set(data)
  return createStorageBuffer(device, padded, extraCopy)
}

export function destroyBuffers(buffers: GPUBuffer[]): void {
  for (const buffer of buffers) {
    buffer.destroy()
  }
}
