import shaderSource from "./classify.wgsl" with { type: "text" }

/**
 * Низкоуровневый драйвер WebGPU.
 * Отвечает за управление буферами (VRAM), пайплайнами и отправку команд на исполнение.
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
    mapStride: number
    bytecode: Uint32Array
    states: Uint32Array
    contextMap: Uint32Array
    globalFloats: Float32Array
    globalUints: Uint32Array
    tableOffset: number
  }) {
    const module = this.device.createShaderModule({ code: shaderSource })
    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    })

    // Создание буферов
    this.buffers.floats = this.createStorageBuffer(params.globalFloats)
    this.buffers.uints = this.createStorageBuffer(params.globalUints)
    this.buffers.states = this.createStorageBuffer(params.states, true) // источник/назначение
    this.buffers.newStates = this.createStorageBuffer(new Uint32Array(params.monadCount), true)
    this.buffers.map = this.createStorageBuffer(params.contextMap)
    this.buffers.bytecode = this.createStorageBuffer(params.bytecode)

    const uniforms = new Uint32Array([params.monadCount, params.mapStride, params.tableOffset])
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
        { binding: 4, resource: { buffer: this.buffers.map } },
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
    const cmd = this.device.createCommandEncoder()
    cmd.copyBufferToBuffer(this.buffers.states, 0, this.stagingBuffer!, 0, this.buffers.states.size)
    this.device.queue.submit([cmd.finish()])

    await this.stagingBuffer!.mapAsync(GPUMapMode.READ)
    const copy = new Uint32Array(this.stagingBuffer!.getMappedRange().slice(0))
    this.stagingBuffer!.unmap()
    return copy
  }

  writeGlobal(offset: number, data: ArrayBufferView, type: "float" | "uint") {
    const buffer = type === "float" ? this.buffers.floats : this.buffers.uints
    this.device.queue.writeBuffer(buffer, offset, data as any)
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
