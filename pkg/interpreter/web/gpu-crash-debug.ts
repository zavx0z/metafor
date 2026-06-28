import type {WebGpuDiagnosticsHook} from "@metafor/engine"

type GpuDebugMode = "default" | "low" | "high"

type GpuDebugSession = {
  sessionId: string
  active: boolean
  clean: boolean
  startedAt: string
  lastHeartbeatAt: string
  mode: GpuDebugMode
  url: string
  userAgent: string
  adapter: GpuAdapterSummary | null
}

type GpuAdapterSummary = {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
  subgroupMinSize?: number
  subgroupMaxSize?: number
  features?: string[]
  limits?: Record<string, number>
}

type GpuBreadcrumb = {
  seq: number
  timestamp: string
  sessionId: string
  mode: GpuDebugMode
  adapter: GpuAdapterSummary | null
  operation: string
  label: string
  detail: Record<string, unknown>
  stack?: string[]
}

type GpuCrashDump = {
  reason: string
  generatedAt: string
  session: GpuDebugSession
  previousSession: GpuDebugSession | null
  previousWasUnclean: boolean
  events: GpuBreadcrumb[]
  lastEvent: GpuBreadcrumb | null
  userAgent: string
  url: string
  storageKeys: {session: string; legacyEvents: string; eventIndex: string; eventSlotPrefix: string; mode: string}
}

type GpuEventsIndex = {
  version: 2
  latestSeq: number
  slotCount: number
  updatedAt: string
}

export type GpuCrashDebugGlobal = typeof globalThis & {
  __gpuCrashDebug?: {
    dump(reason?: string): GpuCrashDump
    clear(): void
    setMode(mode: GpuDebugMode): void
  }
}

const STORAGE_PREFIX = "metafor.interpreter.gpuCrashDebug"
const SESSION_KEY = `${STORAGE_PREFIX}.session:v1`
const EVENTS_KEY = `${STORAGE_PREFIX}.events:v1`
const EVENTS_INDEX_KEY = `${STORAGE_PREFIX}.events.index:v2`
const EVENT_SLOT_PREFIX = `${STORAGE_PREFIX}.event:v2:`
const MODE_KEY = `${STORAGE_PREFIX}.mode:v1`
const RING_LIMIT = 350
const UPLOAD_THROTTLE_MS = 30_000

export function createInterpreterGpuCrashDebug(): WebGpuDiagnosticsHook {
  return new InterpreterGpuCrashDebug()
}

class InterpreterGpuCrashDebug implements WebGpuDiagnosticsHook {
  readonly #session: GpuDebugSession
  readonly #previousSession: GpuDebugSession | null
  readonly #previousWasUnclean: boolean
  #events: GpuBreadcrumb[]
  #seq = 0
  #adapter: GpuAdapterSummary | null = null
  #lastUploadAt = 0
  #uploadTimer: number | null = null
  #heartbeatTimer: number | null = null

  constructor() {
    this.#previousSession = readJson<GpuDebugSession>(SESSION_KEY)
    this.#previousWasUnclean = this.#previousSession?.active === true && this.#previousSession.clean !== true
    this.#events = readStoredEvents()
    this.#seq = this.#events.reduce((max, item) => Math.max(max, item.seq), 0)
    this.#session = {
      sessionId: crypto.randomUUID(),
      active: true,
      clean: false,
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      mode: readGpuMode(),
      url: location.href,
      userAgent: navigator.userAgent,
      adapter: null,
    }
    writeJson(SESSION_KEY, this.#session)
    this.#installGlobalApi()
    this.#installLifecycleHandlers()
    if (this.#previousWasUnclean) this.#reportPreviousUncleanSession()
  }

  requestAdapterOptions(): GPURequestAdapterOptions | undefined {
    if (this.#session.mode === "low") return {powerPreference: "low-power"}
    if (this.#session.mode === "high") return {powerPreference: "high-performance"}
    return undefined
  }

  onAdapter(adapter: GPUAdapter): void {
    this.#adapter = adapterSummary(adapter)
    this.#session.adapter = this.#adapter
    writeJson(SESSION_KEY, this.#session)
    this.breadcrumb("adapter.selected", this.#adapter.description ?? this.#adapter.device ?? this.#session.mode, {
      adapter: this.#adapter,
      mode: this.#session.mode,
      features: this.#adapter.features ?? [],
      limits: this.#adapter.limits ?? {},
      userAgent: navigator.userAgent,
      url: location.href,
    })
    console.info("[gpu-crash-debug] adapter", this.#adapter)
  }

  onDevice(_adapter: GPUAdapter, device: GPUDevice, descriptor: GPUDeviceDescriptor): void {
    this.breadcrumb("device.created", "GPUDevice", {
      requestedFeatures: [...(descriptor.requiredFeatures ?? [])].map(String),
      requestedLimits: descriptor.requiredLimits ?? {},
    })
    console.info("[gpu-crash-debug] device", {
      requestedFeatures: [...(descriptor.requiredFeatures ?? [])].map(String),
      requestedLimits: descriptor.requiredLimits ?? {},
      deviceFeatures: [...device.features].map(String).sort(),
      deviceLimits: supportedLimits(device.limits),
    })
    this.#scheduleUpload("device-created", true)
  }

  onDeviceLost(info: {reason?: string; message?: string}): void {
    this.#upload("device-lost", true)
    console.error("[gpu-crash-debug] device lost", info, this.dump("device-lost"))
  }

  onUncapturedError(error: {type: string; message: string}): void {
    this.#scheduleUpload(`uncaptured-${error.type}`, true)
    console.error("[gpu-crash-debug] uncaptured WebGPU error", error)
  }

  breadcrumb(operation: string, label: string, detail: Record<string, unknown> = {}): void {
    const stack = shouldCaptureStack(operation) ? shortStack() : undefined
    const event: GpuBreadcrumb = {
      seq: ++this.#seq,
      timestamp: new Date().toISOString(),
      sessionId: this.#session.sessionId,
      mode: this.#session.mode,
      adapter: breadcrumbAdapterSummary(this.#adapter),
      operation,
      label,
      detail: compactDetail(detail),
      ...(stack === undefined ? {} : {stack}),
    }
    this.#events.push(event)
    if (this.#events.length > RING_LIMIT) this.#events = this.#events.slice(-RING_LIMIT)
    writeEventSlot(event)
    this.#heartbeat(false)
    if (operation === "queue.submit" || operation === "device.lost" || operation === "device.uncapturederror") this.#scheduleUpload(operation, operation !== "queue.submit")
  }

  dump(reason = "manual"): GpuCrashDump {
    return {
      reason,
      generatedAt: new Date().toISOString(),
      session: this.#session,
      previousSession: this.#previousSession,
      previousWasUnclean: this.#previousWasUnclean,
      events: this.#events,
      lastEvent: this.#events.at(-1) ?? null,
      userAgent: navigator.userAgent,
      url: location.href,
      storageKeys: {
        session: SESSION_KEY,
        legacyEvents: EVENTS_KEY,
        eventIndex: EVENTS_INDEX_KEY,
        eventSlotPrefix: EVENT_SLOT_PREFIX,
        mode: MODE_KEY,
      },
    }
  }

  clear(): void {
    localStorage.removeItem(EVENTS_KEY)
    localStorage.removeItem(EVENTS_INDEX_KEY)
    for (let slot = 0; slot < RING_LIMIT; slot++) localStorage.removeItem(eventSlotKey(slot))
    localStorage.removeItem(SESSION_KEY)
    this.#events = []
    this.#seq = 0
    writeJson(SESSION_KEY, this.#session)
    console.info("[gpu-crash-debug] cleared")
  }

  setMode(mode: GpuDebugMode): void {
    if (!isGpuMode(mode)) throw new Error(`Unsupported GPU debug mode: ${String(mode)}`)
    localStorage.setItem(MODE_KEY, mode)
    this.#session.mode = mode
    writeJson(SESSION_KEY, this.#session)
    console.info(`[gpu-crash-debug] mode=${mode}; reload interpreter page to apply adapter selection`)
  }

  #installGlobalApi(): void {
    ;(globalThis as GpuCrashDebugGlobal).__gpuCrashDebug = {
      dump: (reason?: string) => {
        const dump = this.dump(reason ?? "manual")
        console.info("[gpu-crash-debug] dump", dump)
        this.#scheduleUpload(dump.reason, true)
        return dump
      },
      clear: () => this.clear(),
      setMode: (mode: GpuDebugMode) => this.setMode(mode),
    }
  }

  #installLifecycleHandlers(): void {
    this.#heartbeatTimer = window.setInterval(() => this.#heartbeat(true), 1_000)
    const clean = (): void => {
      this.#session.active = false
      this.#session.clean = true
      this.#session.lastHeartbeatAt = new Date().toISOString()
      writeJson(SESSION_KEY, this.#session)
      this.#upload("clean-shutdown", false)
      if (this.#heartbeatTimer !== null) window.clearInterval(this.#heartbeatTimer)
    }
    window.addEventListener("pagehide", clean, {once: true})
    window.addEventListener("beforeunload", clean, {once: true})
  }

  #heartbeat(persist: boolean): void {
    this.#session.active = true
    this.#session.clean = false
    this.#session.lastHeartbeatAt = new Date().toISOString()
    if (persist) writeJson(SESSION_KEY, this.#session)
  }

  #reportPreviousUncleanSession(): void {
    const dump = this.dump("previous-unclean-session")
    console.error("[gpu-crash-debug] previous WebGPU session was not cleanly closed", dump)
    this.#upload("previous-unclean-session", true)
  }

  #scheduleUpload(reason: string, immediate = false): void {
    const now = Date.now()
    if (immediate || now - this.#lastUploadAt > UPLOAD_THROTTLE_MS) {
      this.#upload(reason, immediate)
      return
    }
    if (this.#uploadTimer !== null) return
    this.#uploadTimer = window.setTimeout(() => {
      this.#uploadTimer = null
      this.#upload(reason, false)
    }, UPLOAD_THROTTLE_MS)
  }

  #upload(reason: string, preferBeacon: boolean): void {
    this.#lastUploadAt = Date.now()
    const body = JSON.stringify(this.dump(reason))
    const url = interpreterHttpPath("/gpu-crash-dumps")
    if (preferBeacon && navigator.sendBeacon !== undefined) {
      try {
        const ok = navigator.sendBeacon(url, new Blob([body], {type: "application/json"}))
        if (ok) return
      } catch {
        // Fall through to fetch.
      }
    }
    void fetch(url, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body,
      keepalive: body.length < 60_000,
    }).catch(() => undefined)
  }
}

function readGpuMode(): GpuDebugMode {
  const queryMode = new URLSearchParams(location.search).get("gpu")
  if (isGpuMode(queryMode)) {
    localStorage.setItem(MODE_KEY, queryMode)
    return queryMode
  }
  const stored = localStorage.getItem(MODE_KEY)
  return isGpuMode(stored) ? stored : "default"
}

function isGpuMode(value: unknown): value is GpuDebugMode {
  return value === "default" || value === "low" || value === "high"
}

function adapterSummary(adapter: GPUAdapter): GpuAdapterSummary {
  const info = adapter.info as GPUAdapterInfo | undefined
  return {
    ...(info?.vendor ? {vendor: info.vendor} : {}),
    ...(info?.architecture ? {architecture: info.architecture} : {}),
    ...(info?.device ? {device: info.device} : {}),
    ...(info?.description ? {description: info.description} : {}),
    ...(typeof info?.subgroupMinSize === "number" ? {subgroupMinSize: info.subgroupMinSize} : {}),
    ...(typeof info?.subgroupMaxSize === "number" ? {subgroupMaxSize: info.subgroupMaxSize} : {}),
    features: [...adapter.features].map(String).sort(),
    limits: supportedLimits(adapter.limits),
  }
}

function breadcrumbAdapterSummary(adapter: GpuAdapterSummary | null): GpuAdapterSummary | null {
  if (adapter === null) return null
  return {
    ...(adapter.vendor ? {vendor: adapter.vendor} : {}),
    ...(adapter.architecture ? {architecture: adapter.architecture} : {}),
    ...(adapter.device ? {device: adapter.device} : {}),
    ...(adapter.description ? {description: adapter.description} : {}),
    ...(typeof adapter.subgroupMinSize === "number" ? {subgroupMinSize: adapter.subgroupMinSize} : {}),
    ...(typeof adapter.subgroupMaxSize === "number" ? {subgroupMaxSize: adapter.subgroupMaxSize} : {}),
  }
}

function supportedLimits(limits: GPUSupportedLimits): Record<string, number> {
  const keys = ["maxTextureDimension1D", "maxTextureDimension2D", "maxTextureDimension3D", "maxTextureArrayLayers", "maxBindGroups", "maxBindingsPerBindGroup", "maxBufferSize", "maxStorageBufferBindingSize", "maxUniformBufferBindingSize", "maxVertexBuffers", "maxVertexAttributes", "maxComputeWorkgroupStorageSize", "maxComputeInvocationsPerWorkgroup"] as const
  const record = limits as unknown as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value
  }
  return out
}

function compactDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(detail).slice(0, 32)) out[key] = compactValue(value)
  return out
}

function compactValue(value: unknown): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value
  if (Array.isArray(value)) return value.slice(0, 24).map(compactValue)
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value).slice(0, 24)) out[key] = compactValue(nested)
    return out
  }
  return value === undefined ? null : String(value)
}

function shortStack(): string[] | undefined {
  const stack = new Error().stack
  if (typeof stack !== "string") return undefined
  return stack.split("\n").slice(3, 10).map((line) => line.trim())
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn("[gpu-crash-debug] localStorage write failed", key, error)
  }
}

function readStoredEvents(): GpuBreadcrumb[] {
  const slotEvents: GpuBreadcrumb[] = []
  for (let slot = 0; slot < RING_LIMIT; slot++) {
    const event = readJson<GpuBreadcrumb>(eventSlotKey(slot))
    if (event !== null && typeof event.seq === "number") slotEvents.push(event)
  }
  if (slotEvents.length > 0) return sortAndLimitEvents(slotEvents)

  const legacyEvents = readJson<GpuBreadcrumb[]>(EVENTS_KEY)
  return Array.isArray(legacyEvents) ? sortAndLimitEvents(legacyEvents) : []
}

function writeEventSlot(event: GpuBreadcrumb): void {
  const slot = event.seq % RING_LIMIT
  writeJson(eventSlotKey(slot), event)
  writeJson(EVENTS_INDEX_KEY, {
    version: 2,
    latestSeq: event.seq,
    slotCount: RING_LIMIT,
    updatedAt: event.timestamp,
  } satisfies GpuEventsIndex)
}

function eventSlotKey(slot: number): string {
  return `${EVENT_SLOT_PREFIX}${slot}`
}

function sortAndLimitEvents(events: GpuBreadcrumb[]): GpuBreadcrumb[] {
  return events
    .filter((event) => typeof event.seq === "number")
    .sort((left, right) => left.seq - right.seq)
    .slice(-RING_LIMIT)
}

function shouldCaptureStack(operation: string): boolean {
  return operation.startsWith("create")
    || operation.includes("Pipeline")
    || operation === "adapter.selected"
    || operation === "device.created"
    || operation.startsWith("device.")
}

function interpreterHttpPath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  const prefix = currentEmbeddedInterpreterPathPrefix()
  return prefix === null ? suffix : `${prefix}${suffix}`
}

function currentEmbeddedInterpreterPathPrefix(): string | null {
  const path = window.location.pathname
  if (path === "/hud/interpreter" || path.startsWith("/hud/interpreter/")) return "/hud/interpreter"
  if (path === "/interp" || path.startsWith("/interp/")) return "/interp"
  return null
}
