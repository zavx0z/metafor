import shaderSource from "./evolution.wgsl" with { type: "text" }
import { getStringAtlas } from "./typeBridge"

/**
 * Параметры инициализации GPU-бэкенда.
 * @internal
 */
interface BackendInitParams {
  braneCount: number
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
  states: Uint32Array
  /** Формат: `[block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...]` */
  braneDescriptors: Uint32Array
  heap: Uint32Array
}

/**
 * Драйвер WebGPU. Управляет ресурсами видеопамяти (VRAM).
 *
 * **Ответственность:**
 * * Аллокация и инициализация `GPUBuffer` (Storage/Uniform).
 * * Создание `ComputePipeline` и `BindGroup`.
 * * Диспетчеризация команд `dispatchWorkgroups`.
 * * Синхронизация данных VRAM <-> RAM (Readback).
 *
 * ### Формат braneDescriptors (v2.x):
 * ```
 * braneDescriptors: [block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...]
 * ```
 * Каждое поле имеет два значения:
 * - `block_ptr` — указатель на блок браны в куче
 * - `bytecode_offset` — смещение начала bytecode в буфере bytecode
 *
 * @internal Используется только внутри `Boundary`.
 */
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
  async init(params: BackendInitParams, enableDebug = false) {
    if (enableDebug) {
      console.log('[GPUBackend] Creating shader module and compute pipeline')
    }
    const module = this.device.createShaderModule({ code: shaderSource })
    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    })

    if (enableDebug) {
      console.log('[GPUBackend] Creating storage buffers...')
    }
    // Создание буферов для архитектуры кучи
    this.buffers.braneDescriptors = this.createStorageBuffer(params.braneDescriptors)
    this.buffers.heap = this.createStorageBuffer(params.heap)
    this.buffers.states = this.createStorageBuffer(params.states, true) // источник/назначение

    this.buffers.newStates = this.createStorageBuffer(new Uint32Array(params.braneCount), true)
    this.buffers.bytecode = this.createStorageBuffer(params.bytecode)
    this.buffers.bytecodeOffsets = this.createStorageBuffer(params.bytecodeOffsets)

    // uniforms: [braneCount, reserved, reserved, reserved]
    const uniforms = new Uint32Array([params.braneCount, 0, 0, 0])
    this.buffers.uniforms = this.createBuffer(uniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

    // StringAtlas buffers for string interning
    const atlas = getStringAtlas()
    const atlasExport = atlas.export()
    // Минимальный размер буфера - 1 элемент (WebGPU не позволяет пустые буферы)
    const registryData = atlasExport.registry.length > 0 ? atlasExport.registry : new Uint32Array(1)
    const heapData = atlasExport.heap.length > 0 ? atlasExport.heap : new Uint32Array(1)
    this.buffers.stringRegistry = this.createStorageBuffer(registryData)
    this.buffers.stringHeap = this.createStorageBuffer(heapData)

    if (enableDebug) {
      console.log('[GPUBackend] Creating staging buffer for readback:', params.states.byteLength, 'bytes')
    }
    this.stagingBuffer = this.device.createBuffer({
      size: params.states.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    if (enableDebug) {
      console.log('[GPUBackend] Creating BindGroup with', 9, 'entries')
    }
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.braneDescriptors } },
        { binding: 1, resource: { buffer: this.buffers.heap } },
        { binding: 2, resource: { buffer: this.buffers.states } },
        { binding: 3, resource: { buffer: this.buffers.newStates } },
        { binding: 4, resource: { buffer: this.buffers.bytecode } },
        { binding: 5, resource: { buffer: this.buffers.uniforms } },
        { binding: 6, resource: { buffer: this.buffers.bytecodeOffsets } },
        { binding: 7, resource: { buffer: this.buffers.stringRegistry } },
        { binding: 8, resource: { buffer: this.buffers.stringHeap } },
      ],
    })

    if (enableDebug) {
      console.log('[GPUBackend] Initialization complete')
      console.log('[GPUBackend] Buffer summary:', {
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
   * 1. Диспетчеризует задачи (Workgroups).
   * 2. Меняет буферы состояний местами (Ping-Pong: new -> old).
   */
  run() {
    if (!this.pipeline || !this.bindGroup) return
    if (!this.buffers.newStates || !this.buffers.states) {
      console.error("Buffers are not initialized")
      return
    }

    const cmd = this.device.createCommandEncoder()
    const pass = cmd.beginComputePass()
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)

    // Количество полей определяется размером буфера newStates.
    // Используем размер рабочей группы 64.
    const count = this.buffers.newStates.size / 4
    pass.dispatchWorkgroups(Math.ceil(count / 64))
    pass.end()

    // Логика свопа: копируем новые -> старые
    cmd.copyBufferToBuffer(this.buffers.newStates, 0, this.buffers.states, 0, this.buffers.newStates.size)
    this.device.queue.submit([cmd.finish()])
  }

  /**
   * Асинхронно читает массив состояний из GPU.
   *
   * **Внимание:** Требует синхронизации с CPU (медленно).
   *
   * @returns Массив числовых ID состояний (по индексу браны).
   */
  async read(): Promise<Uint32Array> {
    if (!this.buffers.states || !this.stagingBuffer) {
      throw new Error("Buffers are not initialized")
    }
    const cmd = this.device.createCommandEncoder()
    cmd.copyBufferToBuffer(this.buffers.states, 0, this.stagingBuffer, 0, this.buffers.states.size)
    this.device.queue.submit([cmd.finish()])

    await this.stagingBuffer.mapAsync(GPUMapMode.READ)
    const copy = new Uint32Array(this.stagingBuffer.getMappedRange().slice(0))
    this.stagingBuffer.unmap()
    return copy
  }

  /**
   * Обновляет heap-буфер на GPU.
   *
   * @param heap - Новые данные кучи (должны соответствовать размеру буфера).
   */
  updateHeap(heap: Uint32Array) {
    if (!this.buffers.heap) {
      throw new Error("Buffers are not initialized")
    }
    this.device.queue.writeBuffer(this.buffers.heap, 0, heap as Uint32Array<ArrayBuffer>)
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
}
