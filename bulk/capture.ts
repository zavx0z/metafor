import {
  BULK_VIEWPORT_CAPTURE_VERSION,
  isBulkViewportCaptureControlResponse,
  type BulkViewportCaptureControlRequest,
  type BulkViewportCaptureFailure,
  type BulkViewportCaptureFailureCode,
  type BulkViewportCaptureImage,
  type BulkViewportCaptureLimits,
  type BulkViewportCaptureRequest,
  type BulkViewportCaptureResult,
} from "@metafor/types/bulk/capture"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"

export const DEFAULT_BULK_VIEWPORT_CAPTURE_LIMITS: BulkViewportCaptureLimits = {
  maxCssWidth: 4_096,
  maxCssHeight: 4_096,
  maxPixelWidth: 8_192,
  maxPixelHeight: 8_192,
  maxPixels: 33_554_432,
  maxPngBytes: 16 * 1_024 * 1_024,
  maxSnapshotBytes: 8 * 1_024 * 1_024,
}

export const BULK_VIEWPORT_CAPTURE_MAX_CONTROL_BYTES =
  Math.ceil(DEFAULT_BULK_VIEWPORT_CAPTURE_LIMITS.maxPngBytes / 3) * 4 +
  DEFAULT_BULK_VIEWPORT_CAPTURE_LIMITS.maxSnapshotBytes +
  256 * 1_024

export type BulkViewportObserverClient = {
  readonly domain: string
  readonly id: string
  send(message: BulkViewportCaptureControlRequest): boolean
}

export type BulkViewportCaptureAuthorization = (request: {
  source: string
  capability: string
  observerId?: string
}) => boolean | Promise<boolean>

export type BulkViewportCaptureRegistryOptions = {
  authorize?: BulkViewportCaptureAuthorization
  limits?: BulkViewportCaptureLimits
  minIntervalMs?: number
  timeoutMs?: number
  now?: () => number
  randomId?: () => string
}

type Observer = {
  readonly client: BulkViewportObserverClient
  sequence: number
  lastCaptureAt: number | null
}

type PendingCapture = {
  readonly id: string
  readonly observer: Observer
  readonly resolve: (result: BulkViewportCaptureResult) => void
  readonly timer: ReturnType<typeof setTimeout>
  readonly sequence: number
}

const failure = (
  code: BulkViewportCaptureFailureCode,
  message: string,
  retryAfterMs?: number,
): BulkViewportCaptureFailure => ({
  ok: false,
  error: {
    code,
    message,
    ...(retryAfterMs === undefined ? {} : {retryAfterMs}),
  },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readRequest = (value: unknown): BulkViewportCaptureRequest | null => {
  if (
    !isRecord(value) ||
    value.version !== BULK_VIEWPORT_CAPTURE_VERSION ||
    typeof value.grant !== "string" ||
    value.grant.length === 0 ||
    value.grant.length > 512
  ) return null
  if (
    value.observerId !== undefined &&
    (
      typeof value.observerId !== "string" ||
      value.observerId.length === 0 ||
      value.observerId.length > 256
    )
  ) return null
  return {
    version: BULK_VIEWPORT_CAPTURE_VERSION,
    grant: value.grant,
    ...(value.observerId === undefined ? {} : {observerId: value.observerId}),
  }
}

const decodedBase64Bytes = (value: string): number | null => {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0
  return value.length / 4 * 3 - padding
}

const isCaptureFailure = (value: unknown): value is BulkViewportCaptureFailure => {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) return false
  return (
    value.error.code === "viewport_too_large" ||
    value.error.code === "payload_too_large" ||
    value.error.code === "capture_unavailable"
  ) && typeof value.error.message === "string" && value.error.message.length > 0
}

const jsonBytes = (value: unknown): number | null => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return null
  }
}

const isObserverSnapshot = (value: unknown): value is BulkObserverSnapshot =>
  isRecord(value) &&
  value.version === 1 &&
  (
    value.throughTs === null ||
    Number.isSafeInteger(value.throughTs)
  ) &&
  typeof value.rootSrc === "string" &&
  value.rootSrc.length > 0 &&
  isRecord(value.projection) &&
  isRecord(value.projection.runtime) &&
  Array.isArray(value.projection.declarations)

const validViewport = (
  capture: BulkViewportCaptureImage,
  limits: BulkViewportCaptureLimits,
): boolean => {
  const viewport = capture.viewport
  return (
    isRecord(viewport) &&
    typeof viewport.cssWidth === "number" &&
    Number.isFinite(viewport.cssWidth) &&
    viewport.cssWidth > 0 &&
    viewport.cssWidth <= limits.maxCssWidth &&
    typeof viewport.cssHeight === "number" &&
    Number.isFinite(viewport.cssHeight) &&
    viewport.cssHeight > 0 &&
    viewport.cssHeight <= limits.maxCssHeight &&
    Number.isSafeInteger(viewport.pixelWidth) &&
    viewport.pixelWidth > 0 &&
    viewport.pixelWidth <= limits.maxPixelWidth &&
    Number.isSafeInteger(viewport.pixelHeight) &&
    viewport.pixelHeight > 0 &&
    viewport.pixelHeight <= limits.maxPixelHeight &&
    viewport.pixelWidth * viewport.pixelHeight <= limits.maxPixels &&
    typeof viewport.devicePixelRatio === "number" &&
    Number.isFinite(viewport.devicePixelRatio) &&
    viewport.devicePixelRatio > 0 &&
    viewport.devicePixelRatio <= 16
  )
}

const validateCaptureResult = (
  value: unknown,
  observer: Observer,
  sequence: number,
  limits: BulkViewportCaptureLimits,
): BulkViewportCaptureResult => {
  if (isCaptureFailure(value)) return value
  if (!isRecord(value) || value.ok !== true || !isRecord(value.capture)) {
    return failure("invalid_response", "Bulk observer returned an invalid capture response")
  }
  const capture = value.capture as unknown as BulkViewportCaptureImage
  const snapshotBytes = jsonBytes(capture.snapshot)
  if (snapshotBytes !== null && snapshotBytes > limits.maxSnapshotBytes) {
    return failure("payload_too_large", "Bulk observer structural snapshot exceeds the capture payload limit")
  }
  if (
    Number.isSafeInteger(capture.pngBytes) &&
    capture.pngBytes > limits.maxPngBytes
  ) {
    return failure("payload_too_large", "Bulk observer PNG exceeds the capture payload limit")
  }
  if (
    isRecord(capture.viewport) &&
    (
      (typeof capture.viewport.cssWidth === "number" && capture.viewport.cssWidth > limits.maxCssWidth) ||
      (typeof capture.viewport.cssHeight === "number" && capture.viewport.cssHeight > limits.maxCssHeight) ||
      (Number.isSafeInteger(capture.viewport.pixelWidth) && capture.viewport.pixelWidth > limits.maxPixelWidth) ||
      (Number.isSafeInteger(capture.viewport.pixelHeight) && capture.viewport.pixelHeight > limits.maxPixelHeight) ||
      (
        Number.isSafeInteger(capture.viewport.pixelWidth) &&
        Number.isSafeInteger(capture.viewport.pixelHeight) &&
        capture.viewport.pixelWidth * capture.viewport.pixelHeight > limits.maxPixels
      )
    )
  ) {
    return failure("viewport_too_large", "Bulk observer viewport exceeds capture limits")
  }
  const pngBytes = typeof capture.pngBase64 === "string"
    ? decodedBase64Bytes(capture.pngBase64)
    : null
  if (
    capture.version !== BULK_VIEWPORT_CAPTURE_VERSION ||
    !isRecord(capture.observer) ||
    capture.observer.domain !== "bulk" ||
    capture.observer.id !== observer.client.id ||
    !isRecord(capture.projection) ||
    (
      capture.projection.throughTs !== null &&
      !Number.isSafeInteger(capture.projection.throughTs)
    ) ||
    typeof capture.projection.rootSrc !== "string" ||
    capture.projection.rootSrc.length === 0 ||
    capture.sequence !== sequence ||
    typeof capture.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(capture.capturedAt)) ||
    snapshotBytes === null ||
    !isObserverSnapshot(capture.snapshot) ||
    capture.snapshot.throughTs !== capture.projection.throughTs ||
    capture.snapshot.rootSrc !== capture.projection.rootSrc ||
    capture.mimeType !== "image/png" ||
    !Number.isSafeInteger(capture.pngBytes) ||
    capture.pngBytes <= 0 ||
    capture.pngBytes > limits.maxPngBytes ||
    pngBytes !== capture.pngBytes ||
    !capture.pngBase64.startsWith("iVBORw0KGgo") ||
    !validViewport(capture, limits)
  ) {
    return failure("invalid_response", "Bulk observer returned invalid capture metadata or PNG data")
  }
  return {ok: true, capture}
}

/**
 * Read-only correlation registry between Monad callers and connected browser
 * observers. A browser id selects a socket; it never authorizes the caller.
 */
export class BulkViewportCaptureRegistry {
  readonly #authorize: BulkViewportCaptureAuthorization
  readonly #limits: BulkViewportCaptureLimits
  readonly #minIntervalMs: number
  readonly #timeoutMs: number
  readonly #now: () => number
  readonly #randomId: () => string
  readonly #observers = new Set<Observer>()
  readonly #pending = new Map<string, PendingCapture>()
  readonly #pendingByObserver = new Map<Observer, PendingCapture>()
  #correlationSequence = 0

  constructor(options: BulkViewportCaptureRegistryOptions = {}) {
    this.#authorize = options.authorize ?? (() => false)
    this.#limits = {...DEFAULT_BULK_VIEWPORT_CAPTURE_LIMITS, ...options.limits}
    this.#minIntervalMs = Math.max(0, options.minIntervalMs ?? 1_000)
    this.#timeoutMs = Math.max(1, options.timeoutMs ?? 5_000)
    this.#now = options.now ?? Date.now
    this.#randomId = options.randomId ?? (() => crypto.randomUUID())
  }

  get size(): number {
    return this.#observers.size
  }

  connect(client: BulkViewportObserverClient): () => void {
    const observer: Observer = {client, sequence: 0, lastCaptureAt: null}
    this.#observers.add(observer)
    return () => this.#disconnect(observer)
  }

  async capture(
    params: unknown,
    context: {source: string},
  ): Promise<BulkViewportCaptureResult> {
    const request = readRequest(params)
    if (request === null) {
      return failure("invalid_request", "Bulk viewport capture request is invalid")
    }
    if (!await this.#authorize({
      source: context.source,
      capability: request.grant,
      ...(request.observerId === undefined ? {} : {observerId: request.observerId}),
    })) {
      return failure("permission_denied", "Bulk viewport capture grant is required")
    }

    const matches = request.observerId === undefined
      ? [...this.#observers]
      : [...this.#observers].filter((observer) => observer.client.id === request.observerId)
    if (matches.length === 0) {
      return failure("observer_not_found", "Bulk observer is not connected")
    }
    if (matches.length !== 1) {
      return failure("observer_ambiguous", "Bulk observer selection is ambiguous")
    }

    const observer = matches[0]!
    if (this.#pendingByObserver.has(observer)) {
      return failure("capture_in_flight", "Bulk observer already has a capture in flight")
    }
    const now = this.#now()
    if (observer.lastCaptureAt !== null && now - observer.lastCaptureAt < this.#minIntervalMs) {
      return failure(
        "rate_limited",
        "Bulk observer capture rate limit exceeded",
        this.#minIntervalMs - (now - observer.lastCaptureAt),
      )
    }

    observer.lastCaptureAt = now
    observer.sequence += 1
    this.#correlationSequence += 1
    const id = `${this.#randomId()}.${this.#correlationSequence}`
    const result = new Promise<BulkViewportCaptureResult>((resolve) => {
      const timer = setTimeout(() => {
        const pending = this.#pending.get(id)
        if (!pending) return
        this.#complete(pending, failure("capture_timeout", "Bulk observer capture timed out"))
      }, this.#timeoutMs)
      const pending: PendingCapture = {
        id,
        observer,
        resolve,
        timer,
        sequence: observer.sequence,
      }
      this.#pending.set(id, pending)
      this.#pendingByObserver.set(observer, pending)
    })

    const control: BulkViewportCaptureControlRequest = {
      control: "bulk.viewport.capture.request",
      version: BULK_VIEWPORT_CAPTURE_VERSION,
      id,
      sequence: observer.sequence,
      limits: this.#limits,
    }
    try {
      if (!observer.client.send(control)) {
        const pending = this.#pending.get(id)
        if (pending) this.#complete(
          pending,
          failure("observer_disconnected", "Bulk observer disconnected before capture"),
        )
      }
    } catch {
      const pending = this.#pending.get(id)
      if (pending) this.#complete(
        pending,
        failure("observer_disconnected", "Bulk observer disconnected before capture"),
      )
    }
    return await result
  }

  /**
   * Consumes every capture response control frame, including spoofed, duplicate,
   * and late responses. Only the selected socket can settle its correlation id.
   */
  receive(client: BulkViewportObserverClient, value: unknown): boolean {
    if (!isBulkViewportCaptureControlResponse(value)) return false
    const pending = this.#pending.get(value.id)
    if (!pending || pending.observer.client !== client) return true
    this.#complete(
      pending,
      validateCaptureResult(value.result, pending.observer, pending.sequence, this.#limits),
    )
    return true
  }

  close(): void {
    for (const pending of [...this.#pending.values()]) {
      this.#complete(pending, failure("observer_disconnected", "Bulk observer registry closed"))
    }
    this.#observers.clear()
  }

  #disconnect(observer: Observer): void {
    if (!this.#observers.delete(observer)) return
    const pending = this.#pendingByObserver.get(observer)
    if (pending) this.#complete(
      pending,
      failure("observer_disconnected", "Bulk observer disconnected during capture"),
    )
  }

  #complete(pending: PendingCapture, result: BulkViewportCaptureResult): void {
    if (this.#pending.get(pending.id) !== pending) return
    this.#pending.delete(pending.id)
    this.#pendingByObserver.delete(pending.observer)
    clearTimeout(pending.timer)
    pending.resolve(result)
  }
}

type ConfiguredGrant = {source: string; capability: string}

const configuredGrants = (raw: string | undefined): ConfiguredGrant[] => {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((entry): ConfiguredGrant[] => {
      if (
        !isRecord(entry) ||
        typeof entry.source !== "string" ||
        entry.source.length === 0 ||
        typeof entry.capability !== "string" ||
        entry.capability.length === 0
      ) return []
      return [{source: entry.source, capability: entry.capability}]
    })
  } catch {
    return []
  }
}

/** Invalid or absent configuration deliberately produces a deny-all policy. */
export const bulkViewportCaptureAuthorizationFromJson = (
  raw: string | undefined,
): BulkViewportCaptureAuthorization => {
  const grants = configuredGrants(raw)
  return ({source, capability}) =>
    grants.some((grant) => grant.source === source && grant.capability === capability)
}
