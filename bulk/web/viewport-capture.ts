import {
  BULK_VIEWPORT_CAPTURE_VERSION,
  type BulkViewportCaptureControlRequest,
  type BulkViewportCaptureBrowserFailure,
  type BulkViewportCaptureBrowserResult,
} from "@metafor/types/bulk/capture"
import type {BulkReadySceneSnapshot} from "@metafor/types/bulk/initial"

export type BulkViewportCaptureSource = {
  observerId: string
  snapshot: BulkReadySceneSnapshot | null
}

type CapturableCanvas = Pick<
  HTMLCanvasElement,
  "width" | "height" | "getBoundingClientRect" | "toBlob"
>

const failure = (
  code: BulkViewportCaptureBrowserFailure["error"]["code"],
  message: string,
): BulkViewportCaptureBrowserFailure => ({ok: false, error: {code, message}})

const exceedsViewportLimits = (
  cssWidth: number,
  cssHeight: number,
  pixelWidth: number,
  pixelHeight: number,
  limits: BulkViewportCaptureControlRequest["limits"],
): boolean =>
  cssWidth <= 0 ||
  cssHeight <= 0 ||
  pixelWidth <= 0 ||
  pixelHeight <= 0 ||
  cssWidth > limits.maxCssWidth ||
  cssHeight > limits.maxCssHeight ||
  pixelWidth > limits.maxPixelWidth ||
  pixelHeight > limits.maxPixelHeight ||
  pixelWidth * pixelHeight > limits.maxPixels

const canvasPng = async (canvas: CapturableCanvas): Promise<Blob | null> =>
  await new Promise<Blob | null>((resolve, reject) => {
    try {
      canvas.toBlob(resolve, "image/png")
    } catch (error) {
      reject(error)
    }
  })

const blobBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunkBytes = 3 * 8_192
  let encoded = ""
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkBytes))
    let binary = ""
    for (const byte of chunk) binary += String.fromCharCode(byte)
    encoded += btoa(binary)
  }
  return encoded
}

const jsonBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength

/**
 * Reads the already-presented browser canvas. It neither requests a frame nor
 * changes camera, projection, HUD, renderer state, or the viewport render loop.
 * A WebGPU observer supplies a bounded readback of the frame preserved by its
 * normal render path; toBlob remains only a non-WebGPU-compatible fallback.
 */
export const captureBulkViewportCanvas = async (
  canvas: CapturableCanvas,
  request: BulkViewportCaptureControlRequest,
  source: BulkViewportCaptureSource,
  options: {
    devicePixelRatio?: number
    now?: () => Date
    readPng?: () => Promise<Blob | null>
  } = {},
): Promise<BulkViewportCaptureBrowserResult> => {
  if (options.readPng === undefined && typeof canvas.toBlob !== "function") {
    return failure("capture_unavailable", "Browser canvas PNG capture is unavailable")
  }
  if (source.snapshot === null) {
    return failure("capture_unavailable", "Bulk observer has not presented a ready-scene snapshot")
  }

  const rect = canvas.getBoundingClientRect()
  const cssWidth = rect.width
  const cssHeight = rect.height
  const pixelWidth = canvas.width
  const pixelHeight = canvas.height
  const devicePixelRatio = options.devicePixelRatio ?? (window.devicePixelRatio || 1)
  const capturedAt = (options.now?.() ?? new Date()).toISOString()
  let frozen: {observerId: string; snapshot: BulkReadySceneSnapshot}
  try {
    frozen = {
      observerId: source.observerId,
      snapshot: structuredClone(source.snapshot),
    }
  } catch {
    return failure("capture_unavailable", "Bulk observer ready-scene snapshot is unavailable")
  }
  if (jsonBytes(frozen.snapshot) > request.limits.maxSnapshotBytes) {
    return failure("payload_too_large", "Bulk observer ready-scene snapshot exceeds the capture payload limit")
  }

  if (
    !Number.isFinite(cssWidth) ||
    !Number.isFinite(cssHeight) ||
    !Number.isSafeInteger(pixelWidth) ||
    !Number.isSafeInteger(pixelHeight) ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0 ||
    exceedsViewportLimits(cssWidth, cssHeight, pixelWidth, pixelHeight, request.limits)
  ) {
    return failure("viewport_too_large", "Bulk observer viewport exceeds capture limits")
  }

  let png: Blob | null
  try {
    png = options.readPng === undefined
      ? await canvasPng(canvas)
      : await options.readPng()
  } catch {
    return failure("capture_unavailable", "Browser canvas PNG capture failed")
  }
  if (png === null || png.type !== "image/png") {
    return failure("capture_unavailable", "Browser canvas did not produce a PNG image")
  }
  if (png.size > request.limits.maxPngBytes) {
    return failure("payload_too_large", "Bulk observer PNG exceeds the capture payload limit")
  }

  let pngBase64: string
  try {
    pngBase64 = await blobBase64(png)
  } catch {
    return failure("capture_unavailable", "Browser canvas PNG could not be encoded")
  }

  return {
    ok: true,
    capture: {
      version: BULK_VIEWPORT_CAPTURE_VERSION,
      observer: {domain: "bulk", id: frozen.observerId},
      projection: {
        throughTs: frozen.snapshot.throughTs,
        rootSrc: frozen.snapshot.rootSrc,
      },
      viewport: {
        cssWidth,
        cssHeight,
        pixelWidth,
        pixelHeight,
        devicePixelRatio,
      },
      sequence: request.sequence,
      capturedAt,
      snapshot: frozen.snapshot,
      mimeType: "image/png",
      pngBytes: png.size,
      pngBase64,
    },
  }
}
