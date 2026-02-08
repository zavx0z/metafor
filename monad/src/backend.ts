import shaderSource from "./classify.wgsl" with {type: "text"}

/**
 * Драйвер WebGPU. Управляет ресурсами видеопамяти (VRAM).
 * 
 * **Ответственность:**
 * * Аллокация и инициализация `GPUBuffer` (Storage/Uniform).
 * * Создание `ComputePipeline` и `BindGroup`.
 * * Диспетчеризация команд `dispatchWorkgroups`.
 * * Синхронизация данных VRAM <-> RAM (Readback).
 * 
 * @internal Используется только внутри `MonadSystem`.
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
   * * `states`: Исходные состояния монад.
   * * `bytecode`: Скомпилированные правила.
   * * `contextMap`: Таблица адресации глобальных переменных.
   */
  async init(params: {
    monadCount: number
    floatFieldCount: number
    uintFieldCount: number
    bytecode: Uint32Array
    states: Uint32Array
    contextDataFloats: Float32Array
    contextDataUints: Uint32Array
    tableOffset: number
  }) {
    const module = this.device.createShaderModule({ code: shaderSource })
    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    })

    // Создание буферов контекста агентов (блоковая модель)
    // ВАЖНО: Избегаем буферов нулевого размера (вызывает неопределённое поведение в WebGPU)
    const safeFloats = params.contextDataFloats.byteLength > 0 
      ? params.contextDataFloats 
      : new Float32Array([0.0])
    const safeUints = params.contextDataUints.byteLength > 0 
      ? params.contextDataUints 
      : new Uint32Array([0])
    
    this.buffers.floats = this.createStorageBuffer(safeFloats)
    this.buffers.uints = this.createStorageBuffer(safeUints)
    this.buffers.states = this.createStorageBuffer(params.states, true) // источник/назначение

    this.buffers.newStates = this.createStorageBuffer(new Uint32Array(params.monadCount), true)
    this.buffers.bytecode = this.createStorageBuffer(params.bytecode)

    const uniforms = new Uint32Array([
      params.monadCount,
      params.floatFieldCount,
      params.uintFieldCount,
      params.tableOffset
    ])
    this.buffers.uniforms = this.createBuffer(uniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

    this.stagingBuffer = this.device.createBuffer({
      size: params.states.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.floats } },
        { binding: 1, resource: { buffer: this.buffers.uints } },
        { binding: 2, resource: { buffer: this.buffers.states } },
        { binding: 3, resource: { buffer: this.buffers.newStates } },
        // binding 4 (contextMap) удален - не используется в блочной модели
        { binding: 5, resource: { buffer: this.buffers.bytecode } },
        { binding: 6, resource: { buffer: this.buffers.uniforms } },
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
      console.error('Buffers are not initialized')
      return
    }

    const cmd = this.device.createCommandEncoder()
    const pass = cmd.beginComputePass()
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)

    // Читать кол-во монад из размера uniforms буфера или хранить его?
    // Полагаем, что сохранили или можем вывести. Для простоты передаем аргументом или храним в классе.
    // Используем хардкод размера рабочей группы 64.
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
      throw new Error('Buffers are not initialized')
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
   * Обновляет значение поля контекста для конкретного агента.
   * @param bufferIndex - абсолютный индекс в буфере (уже включает agentId * fieldCountOfType + field.index)
   * @param value - новое значение поля (число)
   * @param isFloat - если true, значение записывается в буфер floats, иначе в uints
   */
  writeContextValue(bufferIndex: number, value: number, isFloat: boolean) {
    const buffer = isFloat ? this.buffers.floats : this.buffers.uints;
    if (!buffer) {
      console.warn('Buffer not found');
      return;
    }
    const wordSize = 4; // 4 байта на u32/f32 слово
    // Блочная модель: все поля одного типа хранятся последовательно
    // FLOAT: [агент0_поле0, агент0_поле1, ..., агент1_поле0, ...]
    // UINT: аналогично отдельно в своем буфере
    const offset = bufferIndex * wordSize;
    const data = isFloat ? new Float32Array([value]) : new Uint32Array([value]);
    this.device.queue.writeBuffer(buffer, offset, data);
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
