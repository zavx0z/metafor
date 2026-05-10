export type TextureStatus = "loading" | "ready" | "failed"

export interface TextureEntry {
  src: string
  status: TextureStatus
  width: number
  height: number
  texture: GPUTexture | null
  error: unknown
}

const cache = new Map<string, TextureEntry>()
const callbacks = new Map<string, Set<() => void>>()
let fallbackTexture: GPUTexture | null = null

export class TextureLoader {
  static status(src: string): TextureStatus | "idle" {
    return cache.get(src)?.status ?? "idle"
  }

  static peek(src: string): TextureEntry | undefined {
    return cache.get(src)
  }

  static load(device: GPUDevice, src: string, onChange?: () => void): TextureEntry {
    if (onChange) {
      let set = callbacks.get(src)
      if (!set) {
        set = new Set()
        callbacks.set(src, set)
      }
      set.add(onChange)
    }

    const existing = cache.get(src)
    if (existing) return existing

    const entry: TextureEntry = {
      src,
      status: "loading",
      width: 1,
      height: 1,
      texture: null,
      error: null,
    }
    cache.set(src, entry)

    void loadTexture(device, entry)
    return entry
  }

  static fallback(device: GPUDevice): GPUTexture {
    if (fallbackTexture) return fallbackTexture
    fallbackTexture = device.createTexture({
      label: "TextureLoader.fallbackTransparent",
      size: { width: 1, height: 1 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    device.queue.writeTexture(
      { texture: fallbackTexture },
      new Uint8Array([255, 255, 255, 0]),
      { bytesPerRow: 4, rowsPerImage: 1 },
      { width: 1, height: 1 },
    )
    return fallbackTexture
  }
}

async function loadTexture(device: GPUDevice, entry: TextureEntry): Promise<void> {
  try {
    const response = await fetch(entry.src)
    if (!response.ok) throw new Error(`HTTP ${response.status} while loading ${entry.src}`)
    const blob = await response.blob()
    const bitmap = await decodeBitmap(blob)
    const texture = device.createTexture({
      label: `TextureLoader:${entry.src}`,
      size: { width: bitmap.width, height: bitmap.height },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      { width: bitmap.width, height: bitmap.height },
    )
    entry.width = bitmap.width
    entry.height = bitmap.height
    entry.texture = texture
    entry.status = "ready"
    bitmap.close?.()
  } catch (err) {
    entry.status = "failed"
    entry.error = err
    console.warn("[TextureLoader] failed to load texture:", entry.src, err)
  } finally {
    notify(entry.src)
  }
}

async function decodeBitmap(blob: Blob): Promise<ImageBitmap> {
  const source = await normaliseSvgBlob(blob)
  try {
    return await createImageBitmap(source)
  } catch {
    const objectUrl = URL.createObjectURL(source)
    try {
      const image = new Image()
      image.decoding = "async"
      image.src = objectUrl
      await image.decode()
      return await createImageBitmap(image)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }
}

async function normaliseSvgBlob(blob: Blob): Promise<Blob> {
  if (!blob.type.includes("svg")) return blob
  const text = await blob.text()
  if (/\swidth=/.test(text) && /\sheight=/.test(text)) return blob
  const match = text.match(/viewBox=["']\s*[-.\d]+\s+[-.\d]+\s+([.\d]+)\s+([.\d]+)\s*["']/)
  if (!match) return blob
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height)) return blob
  const patched = text.replace("<svg ", `<svg width="${width}" height="${height}" `)
  return new Blob([patched], { type: "image/svg+xml" })
}

function notify(src: string): void {
  const set = callbacks.get(src)
  if (!set) return
  for (const cb of set) cb()
}
