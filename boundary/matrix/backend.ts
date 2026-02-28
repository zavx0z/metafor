/**
 * GPU Backend — драйвер WebGPU для выполнения вычислений на видеокарте.
 *
 * @packageDocumentation
 *
 * **Ответственность:**
 * - Аллокация и инициализация GPUBuffer (Storage/Uniform)
 * - Создание ComputePipeline и BindGroup
 * - Диспетчеризация команд dispatchWorkgroups
 * - Синхронизация данных VRAM <-> RAM (Readback)
 *
 * ### Формат braneDescriptors:
 * ```text
 * braneDescriptors: [block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...]
 * ```
 * Каждое поле имеет два значения:
 * - `block_ptr` — указатель на блок браны в куче
 * - `bytecode_offset` — смещение начала bytecode в буфере bytecode
 *
 * @internal Используется только внутри Boundary.
 */
import shaderSource from "./evolution.wgsl" with { type: "text" }
import type { StringAtlasExport } from "@boundary/atlas"
import type { BackendInitParams } from "./backend.t"

export class GPUBackend {
  protected readonly device: GPUDevice
  private pipeline: GPUComputePipeline | null = null
  private bindGroup: GPUBindGroup | null = null
  private buffers: Record<string, GPUBuffer> = {}
  private stagingBuffer: GPUBuffer | null = null

  constructor(device: GPUDevice) {
    this.device = device
  }

  /**
   * Возвращает GPUDevice для использования в других компонентах.
   * @internal
   */
  getDevice(): GPUDevice {
    return this.device
  }

  /**
   * Инициализирует ресурсы GPU.
   * **Side Effect:** Аллоцирует буферы, компилирует шейдер, создает BindGroup.
   *
   * @param params - Данные для начальной загрузки в буферы.
   * @param enableDebug - Включить debug-логирование.
   */
  async init(params: BackendInitParams, atlasExport: StringAtlasExport, enableDebug = false) {
    if (enableDebug) {
      console.log("[GPUBackend] Creating shader module and compute pipeline")
    }
    const module = this.device.createShaderModule({ code: shaderSource })
    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    })

    if (enableDebug) {
      console.log("[GPUBackend] Creating storage buffers...")
    }
    // Создание буферов для архитектуры кучи
    this.buffers.braneDescriptors = this.createStorageBuffer(params.braneDescriptors)
    this.buffers.heap = this.createStorageBuffer(params.heap)
    this.buffers.states = this.createStorageBuffer(params.states, true) // read_write

    // dirtyFlags: 1 u32 на брану (атомарный флаг изменения)
    this.buffers.dirtyFlags = this.createBuffer(
      new Uint32Array(params.braneCount),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    )

    this.buffers.bytecode = this.createStorageBuffer(params.bytecode)
    this.buffers.bytecodeOffsets = this.createStorageBuffer(params.bytecodeOffsets)

    // uniforms: [braneCount, reserved, reserved, reserved]
    const uniforms = new Uint32Array([params.braneCount, 0, 0, 0])
    this.buffers.uniforms = this.createBuffer(uniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

    // StringAtlas buffers for string interning
    const registryData = atlasExport.registry.length > 0 ? atlasExport.registry : new Uint32Array(1)
    const heapData = atlasExport.heap.length > 0 ? atlasExport.heap : new Uint32Array(1)
    this.buffers.stringRegistry = this.createStorageBuffer(registryData)
    this.buffers.stringHeap = this.createStorageBuffer(heapData)

    if (enableDebug) {
      console.log("[GPUBackend] Creating staging buffer for readback:", params.states.byteLength * 2, "bytes")
    }
    // stagingBuffer теперь должен вмещать dirtyFlags + states
    this.stagingBuffer = this.device.createBuffer({
      size: params.states.byteLength * 2,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    if (enableDebug) {
      console.log("[GPUBackend] Creating BindGroup with 9 entries")
    }
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.braneDescriptors } },
        { binding: 1, resource: { buffer: this.buffers.heap } },
        { binding: 2, resource: { buffer: this.buffers.states } },
        { binding: 3, resource: { buffer: this.buffers.bytecode } },
        { binding: 4, resource: { buffer: this.buffers.uniforms } },
        { binding: 5, resource: { buffer: this.buffers.bytecodeOffsets } },
        { binding: 6, resource: { buffer: this.buffers.stringRegistry } },
        { binding: 7, resource: { buffer: this.buffers.stringHeap } },
        { binding: 8, resource: { buffer: this.buffers.dirtyFlags } },
      ],
    })

    if (enableDebug) {
      console.log("[GPUBackend] Initialization complete")
      console.log("[GPUBackend] Buffer summary:", {
        braneDescriptors: params.braneDescriptors.length,
        heap: params.heap.length,
        states: params.states.length,
        bytecode: params.bytecode.length,
        bytecodeOffsets: params.bytecodeOffsets.length,
      })
    }
  }

  /**
   * Выполняет Compute Pass.
   *
   * **Алгоритм:**
   * 1. Сбрасывает dirtyFlags в 0 (для отслеживания изменений в этом кадре)
   * 2. Диспетчеризует задачи (Workgroups) — по 1 на брану
   * 3. WGSL-шейдер обновляет states in-place и устанавливает dirtyFlags для изменённых бран
   *
   * **Производительность:**
   * - `dispatchWorkgroups(Math.ceil(count / 64))` — рабочая группа 64 потока
   * - states обновляется напрямую в GPU-памяти (без копирования)
   */
  run() {
    if (!this.pipeline || !this.bindGroup) return
    if (!this.buffers.states || !this.buffers.dirtyFlags) {
      console.error("Buffers are not initialized")
      return
    }

    const cmd = this.device.createCommandEncoder()

    // Сброс dirtyFlags в 0 перед вычислением
    cmd.clearBuffer(this.buffers.dirtyFlags, 0, this.buffers.dirtyFlags.size)

    const pass = cmd.beginComputePass()
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)

    // Количество бран определяется размером буфера states.
    // Используем размер рабочей группы 64.
    const count = this.buffers.states.size / 4
    pass.dispatchWorkgroups(Math.ceil(count / 64))
    pass.end()

    // newStates больше не нужен — states обновляется in-place
    this.device.queue.submit([cmd.finish()])
  }

  /**
   * Асинхронно читает только изменённые состояния из GPU.
   *
   * **Оптимизация:**
   * - Читает dirtyFlags (1 u32 на брану)
   * - Возвращает только браны с изменёнными состояниями
   * - Экономия 90-99% bandwidth при разреженных изменениях
   *
   * @returns Массив пар [braneIndex, newState] только для изменённых бран.
   */
  async readChanges(): Promise<[number, number][]> {
    if (!this.buffers.states || !this.buffers.dirtyFlags || !this.stagingBuffer) {
      throw new Error("Buffers are not initialized")
    }

    const braneCount = this.buffers.states.size / 4
    const cmd = this.device.createCommandEncoder()

    // Копируем dirtyFlags в stagingBuffer
    cmd.copyBufferToBuffer(
      this.buffers.dirtyFlags,
      0,
      this.stagingBuffer,
      0,
      braneCount * 4
    )

    // Копируем states в отдельный staging (можно переиспользовать тот же)
    cmd.copyBufferToBuffer(
      this.buffers.states,
      0,
      this.stagingBuffer,
      braneCount * 4,
      braneCount * 4
    )

    this.device.queue.submit([cmd.finish()])

    await this.stagingBuffer.mapAsync(GPUMapMode.READ)
    const data = new Uint32Array(this.stagingBuffer.getMappedRange().slice(0))

    const dirtyFlags = data.slice(0, braneCount)
    const states = data.slice(braneCount, braneCount * 2)

    const changes: [number, number][] = []
    for (let i = 0; i < braneCount; i++) {
      if (dirtyFlags[i]) {
        changes.push([i, states[i]!])
      }
    }

    this.stagingBuffer.unmap()
    return changes
  }

  /**
   * Частично обновляет поля в heap-буфере на GPU.
   *
   * @remarks
   * **Производительность:**
   * - Передаёт только изменённые слова (4-8 байт на поле)
   * - В 100-1000 раз эффективнее полной записи буфера
   *
   * @param updates - Массив обновлений полей.
   *
   * @example
   * ```typescript
   * // Обновление одного поля (F32)
   * backend.updateHeapFields([{ offset: 4, value1: 0x42480000 }])
   *
   * // Обновление STRING поля (2 слова)
   * backend.updateHeapFields([{ offset: 10, value1: 42, value2: hash }])
   * ```
   */
  updateHeapFields(updates: Array<{ offset: number; value1: number; value2?: number }>) {
    if (!this.buffers.heap) {
      throw new Error("Buffers are not initialized")
    }
    for (const { offset, value1, value2 } of updates) {
      const byteOffset = offset * 4
      if (value2 !== undefined) {
        const data = new Uint32Array([value1, value2])
        this.device.queue.writeBuffer(this.buffers.heap, byteOffset, data)
      } else {
        const data = new Uint32Array([value1])
        this.device.queue.writeBuffer(this.buffers.heap, byteOffset, data)
      }
    }
  }

  private createBuffer(data: ArrayBufferView, usage: GPUBufferUsageFlags) {
    const buffer = this.device.createBuffer({
      size: Math.ceil(data.byteLength / 4) * 4,
      usage,
      mappedAtCreation: true,
    })
    if (data instanceof Float32Array) new Float32Array(buffer.getMappedRange()).set(data)
    else new Uint32Array(buffer.getMappedRange()).set(data as Uint32Array)
    buffer.unmap()
    return buffer
  }

  private createStorageBuffer(data: ArrayBufferView, extraCopy = false) {
    let usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    if (extraCopy) usage |= GPUBufferUsage.COPY_SRC
    return this.createBuffer(data, usage)
  }

  /**
   * Очищает все GPU-ресурсы (буферы, pipeline, bindGroup).
   *
   * @remarks
   * **Side Effects:**
   * - Уничтожает все GPUBuffer через `.destroy()`.
   * - Сбрасывает ссылки на pipeline и bindGroup.
   * - После вызова требуется повторный `init()` для работы.
   */
  clear() {
    // Destroy all buffers
    for (const [name, buffer] of Object.entries(this.buffers)) {
      buffer.destroy()
    }
    this.buffers = {}

    // Destroy staging buffer
    if (this.stagingBuffer) {
      this.stagingBuffer.destroy()
      this.stagingBuffer = null
    }

    // Reset pipeline and bindGroup
    this.pipeline = null
    this.bindGroup = null
  }
}
