import {
  BULK_VIEWPORT_CAPTURE_VERSION,
  type BulkViewportCaptureControlRequest,
  type BulkViewportCaptureBrowserFailure,
  type BulkViewportCaptureBrowserResult,
} from "@metafor/types/bulk/capture"

export type BulkViewportCaptureSnapshot = {
  observerId: string
  throughTs: number | null
  rootSrc: string
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

/**
 * Reads the already-presented browser canvas. It neither requests a frame nor
 * changes camera, projection, HUD, renderer, or the viewport render loop.
 */
export const captureBulkViewportCanvas = async (
  canvas: CapturableCanvas,
  request: BulkViewportCaptureControlRequest,
  snapshot: BulkViewportCaptureSnapshot,
  options: {
    devicePixelRatio?: number
    now?: () => Date
  } = {},
): Promise<BulkViewportCaptureBrowserResult> => {
  if (typeof canvas.toBlob !== "function") {
    return failure("capture_unavailable", "Browser canvas PNG capture is unavailable")
  }

  const rect = canvas.getBoundingClientRect()
  const cssWidth = rect.width
  const cssHeight = rect.height
  const pixelWidth = canvas.width
  const pixelHeight = canvas.height
  const devicePixelRatio = options.devicePixelRatio ?? window.devicePixelRatio ?? 1
  const capturedAt = (options.now?.() ?? new Date()).toISOString()
  const frozen = {
    observerId: snapshot.observerId,
    throughTs: snapshot.throughTs,
    rootSrc: snapshot.rootSrc,
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
    png = await canvasPng(canvas)
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
      projection: {throughTs: frozen.throughTs, rootSrc: frozen.rootSrc},
      viewport: {
        cssWidth,
        cssHeight,
        pixelWidth,
        pixelHeight,
        devicePixelRatio,
      },
      sequence: request.sequence,
      capturedAt,
      mimeType: "image/png",
      pngBytes: png.size,
      pngBase64,
    },
  }
}
