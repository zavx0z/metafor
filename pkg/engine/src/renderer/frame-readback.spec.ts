import {describe, expect, test} from "bun:test"
import {
  alignedGpuFrameBytesPerRow,
  isCapturableGpuFrameFormat,
  unpackGpuFrameRgba,
} from "./frame-readback"

describe("WebGPU frame readback", () => {
  test("aligns copy rows to 256 bytes", () => {
    expect(alignedGpuFrameBytesPerRow(1)).toBe(256)
    expect(alignedGpuFrameBytesPerRow(64)).toBe(256)
    expect(alignedGpuFrameBytesPerRow(65)).toBe(512)
    expect(() => alignedGpuFrameBytesPerRow(0)).toThrow()
  })

  test("removes row padding and converts the preferred BGRA canvas format to RGBA", () => {
    const bytesPerRow = alignedGpuFrameBytesPerRow(2)
    const bytes = new Uint8Array(bytesPerRow * 2)
    bytes.set([30, 20, 10, 40, 70, 60, 50, 80], 0)
    bytes.set([110, 100, 90, 120, 150, 140, 130, 160], bytesPerRow)

    expect([...unpackGpuFrameRgba({
      bytes,
      bytesPerRow,
      format: "bgra8unorm",
      width: 2,
      height: 2,
    })]).toEqual([
      10, 20, 30, 40,
      50, 60, 70, 80,
      90, 100, 110, 120,
      130, 140, 150, 160,
    ])
  })

  test("preserves RGBA ordering and accepts only four-byte canvas formats", () => {
    const bytesPerRow = alignedGpuFrameBytesPerRow(1)
    const bytes = new Uint8Array(bytesPerRow)
    bytes.set([1, 2, 3, 4])
    expect([...unpackGpuFrameRgba({
      bytes,
      bytesPerRow,
      format: "rgba8unorm-srgb",
      width: 1,
      height: 1,
    })]).toEqual([1, 2, 3, 4])
    expect(isCapturableGpuFrameFormat("bgra8unorm")).toBe(true)
    expect(isCapturableGpuFrameFormat("rgba16float")).toBe(false)
  })
})
