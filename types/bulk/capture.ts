import type {BulkObserverSnapshot} from "./initial.ts"

export const BULK_VIEWPORT_CAPTURE_METHOD = "bulk.observer.captureViewport" as const
export const BULK_VIEWPORT_CAPTURE_VERSION = 1 as const

export type BulkViewportCaptureRequest = {
  version: typeof BULK_VIEWPORT_CAPTURE_VERSION
  /**
   * The selected live observer's consumed one-use session capability. The first
   * valid use binds that observer to the authenticated Monad caller identity.
   */
  grant: string
  /** May be omitted only while exactly one Bulk observer is connected. */
  observerId?: string
}

export type BulkViewportCaptureFailureCode =
  | "invalid_request"
  | "permission_denied"
  | "observer_not_found"
  | "observer_ambiguous"
  | "capture_in_flight"
  | "rate_limited"
  | "capture_timeout"
  | "observer_disconnected"
  | "viewport_too_large"
  | "payload_too_large"
  | "capture_unavailable"
  | "invalid_response"

export type BulkViewportCaptureFailure = {
  ok: false
  error: {
    code: BulkViewportCaptureFailureCode
    message: string
    retryAfterMs?: number
  }
}

export type BulkViewportCaptureImage = {
  version: typeof BULK_VIEWPORT_CAPTURE_VERSION
  observer: {
    domain: "bulk"
    id: string
  }
  projection: {
    throughTs: number | null
    rootSrc: string
  }
  viewport: {
    cssWidth: number
    cssHeight: number
    pixelWidth: number
    pixelHeight: number
    devicePixelRatio: number
  }
  sequence: number
  /** Wall-clock capture time. This is deliberately not a simulation tick. */
  capturedAt: string
  /**
   * The existing structural snapshot shape, latched at the same presented
   * observer cut as the PNG. Existing projection consumers can hydrate it
   * unchanged.
   */
  snapshot: BulkObserverSnapshot
  mimeType: "image/png"
  pngBytes: number
  pngBase64: string
}

export type BulkViewportCaptureSuccess = {
  ok: true
  capture: BulkViewportCaptureImage
}

export type BulkViewportCaptureResult =
  | BulkViewportCaptureSuccess
  | BulkViewportCaptureFailure

export type BulkViewportCaptureBrowserFailure = {
  ok: false
  error: {
    code: Extract<
      BulkViewportCaptureFailureCode,
      "viewport_too_large" | "payload_too_large" | "capture_unavailable"
    >
    message: string
  }
}

export type BulkViewportCaptureBrowserResult =
  | BulkViewportCaptureSuccess
  | BulkViewportCaptureBrowserFailure

export type BulkViewportCaptureLimits = {
  maxCssWidth: number
  maxCssHeight: number
  maxPixelWidth: number
  maxPixelHeight: number
  maxPixels: number
  maxPngBytes: number
  maxSnapshotBytes: number
}

export type BulkViewportCaptureControlRequest = {
  control: "bulk.viewport.capture.request"
  version: typeof BULK_VIEWPORT_CAPTURE_VERSION
  id: string
  sequence: number
  limits: BulkViewportCaptureLimits
}

export type BulkViewportCaptureControlResponse = {
  control: "bulk.viewport.capture.response"
  version: typeof BULK_VIEWPORT_CAPTURE_VERSION
  id: string
  result: BulkViewportCaptureBrowserResult
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0

const isBulkViewportCaptureLimits = (value: unknown): value is BulkViewportCaptureLimits =>
  isRecord(value) &&
  isPositiveSafeInteger(value.maxCssWidth) &&
  isPositiveSafeInteger(value.maxCssHeight) &&
  isPositiveSafeInteger(value.maxPixelWidth) &&
  isPositiveSafeInteger(value.maxPixelHeight) &&
  isPositiveSafeInteger(value.maxPixels) &&
  isPositiveSafeInteger(value.maxPngBytes) &&
  isPositiveSafeInteger(value.maxSnapshotBytes)

export const isBulkViewportCaptureControlRequest = (
  value: unknown,
): value is BulkViewportCaptureControlRequest =>
  isRecord(value) &&
  value.control === "bulk.viewport.capture.request" &&
  value.version === BULK_VIEWPORT_CAPTURE_VERSION &&
  typeof value.id === "string" &&
  value.id.length > 0 &&
  value.id.length <= 256 &&
  isPositiveSafeInteger(value.sequence) &&
  isBulkViewportCaptureLimits(value.limits)

export const isBulkViewportCaptureControlResponse = (
  value: unknown,
): value is BulkViewportCaptureControlResponse =>
  isRecord(value) &&
  value.control === "bulk.viewport.capture.response" &&
  value.version === BULK_VIEWPORT_CAPTURE_VERSION &&
  typeof value.id === "string" &&
  value.id.length > 0 &&
  value.id.length <= 256 &&
  isRecord(value.result) &&
  typeof value.result.ok === "boolean"
