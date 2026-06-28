export type WebGpuDiagnosticsHook = {
  requestAdapterOptions?(): GPURequestAdapterOptions | undefined
  breadcrumb(operation: string, label: string, detail?: Record<string, unknown>): void
  onAdapter?(adapter: GPUAdapter, options: GPURequestAdapterOptions | undefined): void
  onDevice?(adapter: GPUAdapter, device: GPUDevice, descriptor: GPUDeviceDescriptor): void
  onDeviceLost?(info: {reason?: string; message?: string}): void
  onUncapturedError?(error: {type: string; message: string}): void
}

const installedDevices = new WeakSet<GPUDevice>()
let fallbackLabelSeq = 0

export function installWebGpuDeviceDiagnostics(device: GPUDevice, diagnostics: WebGpuDiagnosticsHook | undefined): void {
  if (diagnostics === undefined || installedDevices.has(device)) return
  installedDevices.add(device)
  installDeviceErrorDiagnostics(device, diagnostics)
  patchDeviceMethod(device, diagnostics, "createShaderModule", "createShaderModule", shaderModuleDetail)
  patchDeviceMethod(device, diagnostics, "createRenderPipeline", "createRenderPipeline", renderPipelineDetail)
  patchDeviceMethod(device, diagnostics, "createRenderPipelineAsync", "createRenderPipelineAsync", renderPipelineDetail)
  patchDeviceMethod(device, diagnostics, "createComputePipeline", "createComputePipeline", computePipelineDetail)
  patchDeviceMethod(device, diagnostics, "createComputePipelineAsync", "createComputePipelineAsync", computePipelineDetail)
  patchDeviceMethod(device, diagnostics, "createTexture", "createTexture", textureDetail)
  patchDeviceMethod(device, diagnostics, "createBuffer", "createBuffer", bufferDetail)
  patchDeviceMethod(device, diagnostics, "createCommandEncoder", "createCommandEncoder", commandEncoderDetail)
  patchDeviceMethod(device, diagnostics, "pushErrorScope", "pushErrorScope", errorScopeDetail)
  patchDeviceMethod(device, diagnostics, "popErrorScope", "popErrorScope", () => ({}))
  patchQueueMethod(device.queue, diagnostics, "writeBuffer", "queue.writeBuffer", writeBufferDetail)
  patchQueueMethod(device.queue, diagnostics, "writeTexture", "queue.writeTexture", writeTextureDetail)
  patchQueueMethod(device.queue, diagnostics, "copyExternalImageToTexture", "queue.copyExternalImageToTexture", copyExternalImageDetail)
  patchQueueMethod(device.queue, diagnostics, "submit", "queue.submit", submitDetail)
}

function installDeviceErrorDiagnostics(device: GPUDevice, diagnostics: WebGpuDiagnosticsHook): void {
  try {
    device.addEventListener("uncapturederror", (event: Event) => {
      const error = (event as Event & {error?: unknown}).error
      const type = gpuErrorType(error)
      const message = error instanceof Error ? error.message : String(error ?? "uncaptured WebGPU error")
      diagnostics.breadcrumb("device.uncapturederror", type, {message})
      diagnostics.onUncapturedError?.({type, message})
    })
  } catch (error) {
    diagnostics.breadcrumb("device.uncapturederror-listener-failed", "GPUDevice", {message: errorMessage(error)})
  }
  void device.lost.then((info) => {
    const detail = {reason: String(info.reason ?? "unknown"), message: info.message}
    diagnostics.breadcrumb("device.lost", detail.reason, detail)
    diagnostics.onDeviceLost?.(detail)
  }).catch((error) => {
    diagnostics.breadcrumb("device.lost-listener-failed", "GPUDevice", {message: errorMessage(error)})
  })
}

function patchDeviceMethod(
  device: GPUDevice,
  diagnostics: WebGpuDiagnosticsHook,
  method: keyof GPUDevice,
  operation: string,
  detail: (args: unknown[], label: string) => Record<string, unknown>,
): void {
  const target = device as unknown as Record<string, unknown>
  const original = target[method as string]
  if (typeof original !== "function") return
  target[method as string] = function patchedDeviceMethod(this: GPUDevice, ...args: unknown[]) {
    const label = ensureDescriptorLabel(args[0], operation)
    diagnostics.breadcrumb(operation, label, detail(args, label))
    const result = Reflect.apply(original, device, args)
    if (operation === "createCommandEncoder" && result !== null && typeof result === "object") {
      patchCommandEncoder(result as GPUCommandEncoder, diagnostics, label)
    }
    return result
  }
}

function patchQueueMethod(
  queue: GPUQueue,
  diagnostics: WebGpuDiagnosticsHook,
  method: keyof GPUQueue,
  operation: string,
  detail: (args: unknown[], label: string) => Record<string, unknown>,
): void {
  const target = queue as unknown as Record<string, unknown>
  const original = target[method as string]
  if (typeof original !== "function") return
  target[method as string] = function patchedQueueMethod(this: GPUQueue, ...args: unknown[]) {
    const label = queueOperationLabel(operation, args)
    diagnostics.breadcrumb(operation, label, detail(args, label))
    return Reflect.apply(original, queue, args)
  }
}

function patchCommandEncoder(encoder: GPUCommandEncoder, diagnostics: WebGpuDiagnosticsHook, encoderLabel: string): void {
  patchEncoderPassMethod(encoder, diagnostics, "beginRenderPass", "renderPass", encoderLabel, renderPassDetail)
  patchEncoderPassMethod(encoder, diagnostics, "beginComputePass", "computePass", encoderLabel, computePassDetail)
  const target = encoder as unknown as Record<string, unknown>
  const originalFinish = target["finish"]
  if (typeof originalFinish === "function") {
    target["finish"] = function patchedFinish(this: GPUCommandEncoder, ...args: unknown[]) {
      const descriptor = args[0]
      const label = ensureDescriptorLabel(descriptor, "commandEncoder.finish")
      diagnostics.breadcrumb("commandEncoder.finish", label, {encoderLabel})
      return Reflect.apply(originalFinish, encoder, args)
    }
  }
}

function patchEncoderPassMethod(
  encoder: GPUCommandEncoder,
  diagnostics: WebGpuDiagnosticsHook,
  method: "beginRenderPass" | "beginComputePass",
  passKind: "renderPass" | "computePass",
  encoderLabel: string,
  detail: (args: unknown[], label: string) => Record<string, unknown>,
): void {
  const target = encoder as unknown as Record<string, unknown>
  const original = target[method]
  if (typeof original !== "function") return
  target[method] = function patchedBeginPass(this: GPUCommandEncoder, ...args: unknown[]) {
    const label = ensureDescriptorLabel(args[0], `${passKind}.begin`)
    diagnostics.breadcrumb(`${passKind}.begin`, label, {encoderLabel, ...detail(args, label)})
    const pass = Reflect.apply(original, encoder, args)
    patchPassEnd(pass as GPURenderPassEncoder | GPUComputePassEncoder, diagnostics, passKind, label)
    return pass
  }
}

function patchPassEnd(pass: GPURenderPassEncoder | GPUComputePassEncoder, diagnostics: WebGpuDiagnosticsHook, passKind: string, label: string): void {
  const target = pass as unknown as Record<string, unknown>
  const original = target["end"]
  if (typeof original !== "function") return
  target["end"] = function patchedPassEnd(this: GPURenderPassEncoder | GPUComputePassEncoder, ...args: unknown[]) {
    diagnostics.breadcrumb(`${passKind}.end`, label)
    return Reflect.apply(original, pass, args)
  }
}

function ensureDescriptorLabel(value: unknown, operation: string): string {
  const record = objectRecord(value)
  const current = typeof record?.["label"] === "string" && record["label"].length > 0 ? record["label"] : null
  if (current !== null) return current
  const label = `metafor.${operation}.${++fallbackLabelSeq}`
  if (record !== null) {
    try {
      record["label"] = label
    } catch {
      // Native descriptors should be mutable, but diagnostics must not break rendering.
    }
  }
  return label
}

function queueOperationLabel(operation: string, args: unknown[]): string {
  const first = objectRecord(args[0])
  const texture = objectRecord(first?.["texture"])
  const buffer = objectRecord(args[0])
  return stringValue(texture?.["label"]) ?? stringValue(buffer?.["label"]) ?? operation
}

function shaderModuleDetail(args: unknown[], label: string): Record<string, unknown> {
  const descriptor = objectRecord(args[0])
  const code = stringValue(descriptor?.["code"])
  return {label, codeLength: code?.length ?? null, codeHash: code === null ? null : hashString(code)}
}

function renderPipelineDetail(args: unknown[], label: string): Record<string, unknown> {
  const descriptor = objectRecord(args[0])
  const vertex = objectRecord(descriptor?.["vertex"])
  const fragment = objectRecord(descriptor?.["fragment"])
  const primitive = objectRecord(descriptor?.["primitive"])
  const targets = Array.isArray(fragment?.["targets"]) ? fragment?.["targets"] as unknown[] : []
  return {
    label,
    vertexEntry: stringValue(vertex?.["entryPoint"]),
    vertexModule: labelOf(vertex?.["module"]),
    fragmentEntry: stringValue(fragment?.["entryPoint"]),
    fragmentModule: labelOf(fragment?.["module"]),
    targetFormats: targets.map((target) => stringValue(objectRecord(target)?.["format"])).filter((item): item is string => item !== null),
    topology: stringValue(primitive?.["topology"]),
    cullMode: stringValue(primitive?.["cullMode"]),
    depthFormat: stringValue(objectRecord(descriptor?.["depthStencil"])?.["format"]),
    sampleCount: numberValue(objectRecord(descriptor?.["multisample"])?.["count"]),
  }
}

function computePipelineDetail(args: unknown[], label: string): Record<string, unknown> {
  const compute = objectRecord(objectRecord(args[0])?.["compute"])
  return {
    label,
    entryPoint: stringValue(compute?.["entryPoint"]),
    module: labelOf(compute?.["module"]),
  }
}

function textureDetail(args: unknown[], label: string): Record<string, unknown> {
  const descriptor = objectRecord(args[0])
  return {
    label,
    size: summarizeSize(descriptor?.["size"]),
    format: stringValue(descriptor?.["format"]),
    usage: numberValue(descriptor?.["usage"]),
    dimension: stringValue(descriptor?.["dimension"]),
    sampleCount: numberValue(descriptor?.["sampleCount"]),
    mipLevelCount: numberValue(descriptor?.["mipLevelCount"]),
  }
}

function bufferDetail(args: unknown[], label: string): Record<string, unknown> {
  const descriptor = objectRecord(args[0])
  return {
    label,
    size: numberValue(descriptor?.["size"]),
    usage: numberValue(descriptor?.["usage"]),
    mappedAtCreation: descriptor?.["mappedAtCreation"] === true,
  }
}

function commandEncoderDetail(_args: unknown[], label: string): Record<string, unknown> {
  return {label}
}

function errorScopeDetail(args: unknown[]): Record<string, unknown> {
  return {filter: typeof args[0] === "string" ? args[0] : String(args[0])}
}

function writeBufferDetail(args: unknown[]): Record<string, unknown> {
  return {
    buffer: labelOf(args[0]),
    bufferOffset: numberValue(args[1]),
    dataBytes: bufferSourceBytes(args[2]),
    dataOffset: numberValue(args[3]),
    size: numberValue(args[4]),
  }
}

function writeTextureDetail(args: unknown[]): Record<string, unknown> {
  const destination = objectRecord(args[0])
  return {
    texture: labelOf(destination?.["texture"]),
    dataBytes: bufferSourceBytes(args[1]),
    layout: summarizeLayout(args[2]),
    size: summarizeSize(args[3]),
  }
}

function copyExternalImageDetail(args: unknown[]): Record<string, unknown> {
  const destination = objectRecord(args[1])
  return {
    source: externalSourceLabel(objectRecord(args[0])?.["source"]),
    texture: labelOf(destination?.["texture"]),
    size: summarizeSize(args[2]),
  }
}

function submitDetail(args: unknown[]): Record<string, unknown> {
  return {commandBufferCount: Array.isArray(args[0]) ? args[0].length : null}
}

function renderPassDetail(args: unknown[]): Record<string, unknown> {
  const descriptor = objectRecord(args[0])
  const colors = Array.isArray(descriptor?.["colorAttachments"]) ? descriptor?.["colorAttachments"] as unknown[] : []
  return {
    colorAttachmentCount: colors.length,
    depth: objectRecord(descriptor?.["depthStencilAttachment"]) !== null,
  }
}

function computePassDetail(): Record<string, unknown> {
  return {}
}

function summarizeLayout(value: unknown): Record<string, unknown> | null {
  const record = objectRecord(value)
  if (record === null) return null
  return {
    offset: numberValue(record["offset"]),
    bytesPerRow: numberValue(record["bytesPerRow"]),
    rowsPerImage: numberValue(record["rowsPerImage"]),
  }
}

function summarizeSize(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 3).map((item) => numberValue(item))
  const record = objectRecord(value)
  if (record === null) return value === undefined ? null : String(value)
  return {
    width: numberValue(record["width"]),
    height: numberValue(record["height"]),
    depthOrArrayLayers: numberValue(record["depthOrArrayLayers"]),
  }
}

function bufferSourceBytes(value: unknown): number | null {
  if (value instanceof ArrayBuffer) return value.byteLength
  if (ArrayBuffer.isView(value)) return value.byteLength
  return null
}

function externalSourceLabel(value: unknown): string | null {
  if (typeof HTMLVideoElement !== "undefined" && value instanceof HTMLVideoElement) return `video:${value.videoWidth}x${value.videoHeight}`
  if (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) return `bitmap:${value.width}x${value.height}`
  if (typeof VideoFrame !== "undefined" && value instanceof VideoFrame) return `video-frame:${value.displayWidth}x${value.displayHeight}`
  return value === undefined || value === null ? null : String(value)
}

function labelOf(value: unknown): string | null {
  return stringValue(objectRecord(value)?.["label"])
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function gpuErrorType(error: unknown): string {
  if (isInstanceOfGlobal(error, "GPUValidationError")) return "validation"
  if (isInstanceOfGlobal(error, "GPUOutOfMemoryError")) return "out-of-memory"
  if (isInstanceOfGlobal(error, "GPUInternalError")) return "internal"
  return "unknown"
}

function isInstanceOfGlobal(value: unknown, name: string): boolean {
  const ctor = (globalThis as Record<string, unknown>)[name]
  return typeof ctor === "function" && value instanceof ctor
}
