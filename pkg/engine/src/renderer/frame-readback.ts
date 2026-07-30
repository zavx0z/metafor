export type CapturableGpuFrameFormat =
  | "bgra8unorm"
  | "bgra8unorm-srgb"
  | "rgba8unorm"
  | "rgba8unorm-srgb"

const GPU_COPY_BYTES_PER_ROW_ALIGNMENT = 256
const RGBA_BYTES_PER_PIXEL = 4

export const isCapturableGpuFrameFormat = (
  format: GPUTextureFormat,
): format is CapturableGpuFrameFormat =>
  format === "bgra8unorm" ||
  format === "bgra8unorm-srgb" ||
  format === "rgba8unorm" ||
  format === "rgba8unorm-srgb"

export const alignedGpuFrameBytesPerRow = (width: number): number => {
  if (!Number.isSafeInteger(width) || width <= 0) {
    throw new Error("GPU frame width must be a positive safe integer")
  }
  const packed = width * RGBA_BYTES_PER_PIXEL
  return Math.ceil(packed / GPU_COPY_BYTES_PER_ROW_ALIGNMENT) * GPU_COPY_BYTES_PER_ROW_ALIGNMENT
}

export const unpackGpuFrameRgba = (input: {
  bytes: Uint8Array
  bytesPerRow: number
  format: CapturableGpuFrameFormat
  height: number
  width: number
}): Uint8ClampedArray => {
  const {bytes, bytesPerRow, format, height, width} = input
  const packedBytesPerRow = width * RGBA_BYTES_PER_PIXEL
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isSafeInteger(bytesPerRow) ||
    bytesPerRow < packedBytesPerRow ||
    bytes.byteLength < bytesPerRow * height
  ) {
    throw new Error("GPU frame readback dimensions are invalid")
  }

  const rgba = new Uint8ClampedArray(packedBytesPerRow * height)
  const bgra = format === "bgra8unorm" || format === "bgra8unorm-srgb"
  for (let y = 0; y < height; y += 1) {
    const sourceRow = y * bytesPerRow
    const targetRow = y * packedBytesPerRow
    for (let x = 0; x < width; x += 1) {
      const source = sourceRow + x * RGBA_BYTES_PER_PIXEL
      const target = targetRow + x * RGBA_BYTES_PER_PIXEL
      rgba[target] = bytes[source + (bgra ? 2 : 0)]!
      rgba[target + 1] = bytes[source + 1]!
      rgba[target + 2] = bytes[source + (bgra ? 0 : 2)]!
      rgba[target + 3] = bytes[source + 3]!
    }
  }
  return rgba
}

export const encodeRgbaFramePng = async (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob | null> => {
  const imageBytes = new Uint8ClampedArray(rgba.byteLength)
  imageBytes.set(rgba)
  const image = new ImageData(imageBytes, width, height)
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext("2d")
    if (context === null) return null
    context.putImageData(image, 0, 0)
    return await canvas.convertToBlob({type: "image/png"})
  }
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (context === null) return null
  context.putImageData(image, 0, 0)
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
}
