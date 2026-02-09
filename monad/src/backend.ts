import shaderSource from "./classify.wgsl" with { type: "text" }

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
    bytecode: Uint32Array
    states: Uint32Array
    agentDescriptors: Uint32Array
    heap: Uint32Array
    tableOffset: number
  }) {
    const module = this.device.createShaderModule({ code: shaderSource })
    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    })

    // Создание буферов для новой архитектуры кучи
    this.buffers.agentDescriptors = this.createStorageBuffer(params.agentDescriptors)
    this.buffers.heap = this.createStorageBuffer(params.heap)
    this.buffers.states = this.createStorageBuffer(params.states, true) // источник/назначение

    this.buffers.newStates = this.createStorageBuffer(new Uint32Array(params.monadCount), true)
    this.buffers.bytecode = this.createStorageBuffer(params.bytecode)

    const uniforms = new Uint32Array([params.monadCount, params.tableOffset])
    this.buffers.uniforms = this.createBuffer(uniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

    this.stagingBuffer = this.device.createBuffer({
      size: params.states.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.agentDescriptors } },
        { binding: 1, resource: { buffer: this.buffers.heap } },
        { binding: 2, resource: { buffer: this.buffers.states } },
        { binding: 3, resource: { buffer: this.buffers.newStates } },
        { binding: 4, resource: { buffer: this.buffers.bytecode } },
        { binding: 5, resource: { buffer: this.buffers.uniforms } },
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
