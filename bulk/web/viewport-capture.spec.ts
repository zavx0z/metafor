import {describe, expect, test} from "bun:test"
import {
  BULK_VIEWPORT_CAPTURE_VERSION,
  type BulkViewportCaptureControlRequest,
} from "@metafor/types/bulk/capture"
import type {BulkReadySceneSnapshot} from "@metafor/types/bulk/initial"
import {captureBulkViewportCanvas} from "./viewport-capture.ts"

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const PNG_BYTES = Uint8Array.from(atob(PNG_BASE64), (value) => value.charCodeAt(0))
const snapshot = (
  throughTs: number | null = null,
  rootSrc = "root",
): BulkReadySceneSnapshot => ({
  kind: "bulk-ready-scene-snapshot",
  version: 1,
  throughTs,
  rootSrc,
  visual: {
    layoutSlug: "centered-nested",
    sourceStats: {
      rootSrc,
      darkParticleCount: 0,
      fieldParticleCount: 0,
      orbitalParticleCount: 0,
      transitionChannelCount: 0,
    },
    transitionBatchFingerprints: [],
    relationBatchFingerprints: [],
  },
})
const source = (
  observerId = "owner",
  observerSnapshot: BulkReadySceneSnapshot | null = snapshot(),
) => ({observerId, snapshot: observerSnapshot})

const request = (limits: Partial<BulkViewportCaptureControlRequest["limits"]> = {}): BulkViewportCaptureControlRequest => ({
  control: "bulk.viewport.capture.request",
  version: BULK_VIEWPORT_CAPTURE_VERSION,
  id: "capture-1",
  sequence: 7,
  limits: {
    maxCssWidth: 4_096,
    maxCssHeight: 4_096,
    maxPixelWidth: 8_192,
    maxPixelHeight: 8_192,
    maxPixels: 33_554_432,
    maxPngBytes: 16 * 1_024 * 1_024,
    maxSnapshotBytes: 8 * 1_024 * 1_024,
    ...limits,
  },
})

describe("Bulk browser viewport PNG capture", () => {
  test("captures the presented canvas and freezes DPR, dimensions, cut, root, sequence, and wall time", async () => {
    let complete!: (blob: Blob | null) => void
    let toBlobCalls = 0
    const canvas = {
      width: 1_600,
      height: 900,
      getBoundingClientRect: () => ({width: 800.5, height: 450.25}),
      toBlob(callback: (blob: Blob | null) => void, type?: string) {
        expect(type).toBe("image/png")
        toBlobCalls += 1
        complete = callback
      },
    } as unknown as HTMLCanvasElement
    const observerSnapshot = snapshot(1_700_000_000_123, "world/selected")

    const pending = captureBulkViewportCanvas(canvas, request(), source("owner-viewport", observerSnapshot), {
      devicePixelRatio: 2,
      now: () => new Date("2026-07-28T11:12:13.456Z"),
    })
    observerSnapshot.throughTs = 1_700_000_000_999
    observerSnapshot.rootSrc = "world/changed-after-request"
    canvas.width = 10
    canvas.height = 10
    complete(new Blob([PNG_BYTES], {type: "image/png"}))

    expect(toBlobCalls).toBe(1)
    expect(await pending).toEqual({
      ok: true,
      capture: {
        version: BULK_VIEWPORT_CAPTURE_VERSION,
        observer: {domain: "bulk", id: "owner-viewport"},
        projection: {throughTs: 1_700_000_000_123, rootSrc: "world/selected"},
        viewport: {
          cssWidth: 800.5,
          cssHeight: 450.25,
          pixelWidth: 1_600,
          pixelHeight: 900,
          devicePixelRatio: 2,
        },
        sequence: 7,
        capturedAt: "2026-07-28T11:12:13.456Z",
        snapshot: snapshot(1_700_000_000_123, "world/selected"),
        mimeType: "image/png",
        pngBytes: PNG_BYTES.byteLength,
        pngBase64: PNG_BASE64,
      },
    })
  })

  test("does not request an animation frame or otherwise wake the on-demand render loop", async () => {
    let animationFrames = 0
    const previous = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame")
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      value: () => {
        animationFrames += 1
        return 1
      },
    })
    try {
      const canvas = {
        width: 2,
        height: 2,
        getBoundingClientRect: () => ({width: 2, height: 2}),
        toBlob: (callback: (blob: Blob | null) => void) =>
          callback(new Blob([PNG_BYTES], {type: "image/png"})),
      } as unknown as HTMLCanvasElement

      expect((await captureBulkViewportCanvas(
        canvas,
        request(),
        source(),
        {devicePixelRatio: 1},
      )).ok).toBe(true)
      expect(animationFrames).toBe(0)
    } finally {
      if (previous) Object.defineProperty(globalThis, "requestAnimationFrame", previous)
      else Reflect.deleteProperty(globalThis, "requestAnimationFrame")
    }
  })

  test("uses the preserved WebGPU frame instead of reading the swapchain canvas", async () => {
    let toBlobCalls = 0
    let readbackCalls = 0
    const canvas = {
      width: 2,
      height: 2,
      getBoundingClientRect: () => ({width: 2, height: 2}),
      toBlob: (callback: (blob: Blob | null) => void) => {
        toBlobCalls += 1
        callback(null)
      },
    } as unknown as HTMLCanvasElement

    expect((await captureBulkViewportCanvas(
      canvas,
      request(),
      source(),
      {
        devicePixelRatio: 1,
        readPng: async () => {
          readbackCalls += 1
          return new Blob([PNG_BYTES], {type: "image/png"})
        },
      },
    )).ok).toBe(true)
    expect(readbackCalls).toBe(1)
    expect(toBlobCalls).toBe(0)
  })

  test("fails gracefully when canvas PNG export is unsupported", async () => {
    const canvas = {
      width: 2,
      height: 2,
      getBoundingClientRect: () => ({width: 2, height: 2}),
      toBlob: undefined,
    } as unknown as HTMLCanvasElement

    expect(await captureBulkViewportCanvas(
      canvas,
      request(),
      source(),
      {devicePixelRatio: 1},
    )).toMatchObject({ok: false, error: {code: "capture_unavailable"}})
  })

  test("requires a presented ready-scene cut and bounds it before PNG export", async () => {
    let toBlobCalls = 0
    const canvas = {
      width: 2,
      height: 2,
      getBoundingClientRect: () => ({width: 2, height: 2}),
      toBlob: (callback: (blob: Blob | null) => void) => {
        toBlobCalls += 1
        callback(new Blob([PNG_BYTES], {type: "image/png"}))
      },
    } as unknown as HTMLCanvasElement

    expect(await captureBulkViewportCanvas(
      canvas,
      request(),
      source("owner", null),
      {devicePixelRatio: 1},
    )).toMatchObject({ok: false, error: {code: "capture_unavailable"}})

    const oversized = snapshot()
    oversized.visual.relationBatchFingerprints.push("x".repeat(2_000))
    expect(await captureBulkViewportCanvas(
      canvas,
      request({maxSnapshotBytes: 256}),
      source("owner", oversized),
      {devicePixelRatio: 1},
    )).toMatchObject({ok: false, error: {code: "payload_too_large"}})
    expect(toBlobCalls).toBe(0)
  })

  test("rejects viewport and PNG sizes at the browser boundary", async () => {
    let toBlobCalls = 0
    const canvas = {
      width: 2_001,
      height: 2,
      getBoundingClientRect: () => ({width: 1_001, height: 2}),
      toBlob: (callback: (blob: Blob | null) => void) => {
        toBlobCalls += 1
        callback(new Blob([PNG_BYTES], {type: "image/png"}))
      },
    } as unknown as HTMLCanvasElement

    expect(await captureBulkViewportCanvas(
      canvas,
      request({maxCssWidth: 1_000, maxPixelWidth: 2_000}),
      source(),
      {devicePixelRatio: 2},
    )).toMatchObject({ok: false, error: {code: "viewport_too_large"}})
    expect(toBlobCalls).toBe(0)

    canvas.width = 2
    expect(await captureBulkViewportCanvas(
      canvas,
      request({maxCssWidth: 2_000, maxPixelWidth: 2_000, maxPngBytes: PNG_BYTES.byteLength - 1}),
      source(),
      {devicePixelRatio: 1},
    )).toMatchObject({ok: false, error: {code: "payload_too_large"}})
    expect(toBlobCalls).toBe(1)
  })
})
