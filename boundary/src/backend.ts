import shaderSource from "./classify.wgsl" with { type: "text" }

/**
 * Параметры инициализации GPU-бэкенда.
 */
interface BackendInitParams {
  /** Количество полей в границе */
  fieldCount: number
  /** Конкатенированный bytecode всех полей */
  bytecode: Uint32Array
  /** Таблица смещений bytecode для каждого поля */
  bytecodeOffsets: Uint32Array
  /** Начальные состояния полей (числовые ID) */
  states: Uint32Array
  /** Дескрипторы полей: [block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...] */
  fieldDescriptors: Uint32Array
  /** Куча с данными бран */
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
 * ### Формат fieldDescriptors (v2.x):
 * ```
 * fieldDescriptors: [block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...]
 * ```
 * Каждое поле имеет два значения:
 * - `block_ptr` — указатель на блок браны в куче
 * - `bytecode_offset` — смещение начала bytecode в буфере bytecode
 *
 * @internal Используется только внутри `Boundary`.
 */
export class GPUBackend {
  private device: GPUDevice
  private pipeline: GPUComputePipeline | null = null
  private bindGroup: GPUBindGroup | null = null
  private buffers: Record<string, GPUBuffer> = {}
  private stagingBuffer: GPUBuffer | null = null

  constructor(device: GPUDevice) {
    this.device = device
  }

  /**
   * Инициализирует ресурсы GPU.
   * **Side Effect:** Аллоцирует буферы, компилирует шейдер, создает BindGroup.
   *
   * @param params - Данные для начальной загрузки в буферы.
   */
  async init(params: BackendInitParams) {
    const module = this.device.createShaderModule({ code: shaderSource })
    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    })

    // Создание буферов для архитектуры кучи
    this.buffers.fieldDescriptors = this.createStorageBuffer(params.fieldDescriptors)
    this.buffers.heap = this.createStorageBuffer(params.heap)
    this.buffers.states = this.createStorageBuffer(params.states, true) // источник/назначение

    this.buffers.newStates = this.createStorageBuffer(new Uint32Array(params.fieldCount), true)
    this.buffers.bytecode = this.createStorageBuffer(params.bytecode)
    this.buffers.bytecodeOffsets = this.createStorageBuffer(params.bytecodeOffsets)

    // uniforms: [fieldCount, reserved, reserved, reserved]
    const uniforms = new Uint32Array([params.fieldCount, 0, 0, 0])
    this.buffers.uniforms = this.createBuffer(uniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

    this.stagingBuffer = this.device.createBuffer({
      size: params.states.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.fieldDescriptors } },
        { binding: 1, resource: { buffer: this.buffers.heap } },
        { binding: 2, resource: { buffer: this.buffers.states } },
        { binding: 3, resource: { buffer: this.buffers.newStates } },
        { binding: 4, resource: { buffer: this.buffers.bytecode } },
        { binding: 5, resource: { buffer: this.buffers.uniforms } },
        { binding: 6, resource: { buffer: this.buffers.bytecodeOffsets } },
      ],
    })
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
   * **Внимание:** Требует синхронизации с CPU (медленно).
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
