export type TextureStatus = "loading" | "ready" | "failed"

export interface TextureEntry {
  src: string
  status: TextureStatus
  width: number
  height: number
  texture: GPUTexture | null
  error: unknown
  device?: GPUDevice
  pendingBitmap?: ImageBitmap | undefined
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
    if (existing) {
      existing.device = device
      if (existing.pendingBitmap !== undefined) {
        void replaceTextureFromBitmap(device, existing, existing.pendingBitmap)
      }
      return existing
    }

    const entry: TextureEntry = {
      src,
      status: "loading",
      width: 1,
      height: 1,
      texture: null,
      error: null,
      device,
    }
    cache.set(src, entry)

    void loadTexture(device, entry)
    return entry
  }

  static replaceBitmap(src: string, bitmap: ImageBitmap): void {
    let entry = cache.get(src)
    if (entry === undefined) {
      entry = {
        src,
        status: "loading",
        width: bitmap.width || 1,
        height: bitmap.height || 1,
        texture: null,
        error: null,
        pendingBitmap: bitmap,
      }
      cache.set(src, entry)
      notify(src)
      return
    }

    entry.pendingBitmap?.close?.()
    entry.pendingBitmap = bitmap
    const device = entry.device
    if (device === undefined || entry.status === "loading") {
      entry.status = "loading"
      notify(src)
      return
    }
    void replaceTextureFromBitmap(device, entry, bitmap)
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
    const pending = entry.pendingBitmap
    if (pending !== undefined) {
      await replaceTextureFromBitmap(device, entry, pending)
      return
    }
    const response = await fetch(entry.src)
    if (!response.ok) throw new Error(`HTTP ${response.status} while loading ${entry.src}`)
    await replaceTextureFromBitmap(device, entry, await decodeBitmap(await response.blob()))
  } catch (err) {
    entry.status = "failed"
    entry.error = err
    console.warn("[TextureLoader] failed to load texture:", entry.src, err)
  } finally {
    notify(entry.src)
  }
}

async function replaceTextureFromBitmap(device: GPUDevice, entry: TextureEntry, bitmap: ImageBitmap): Promise<void> {
  entry.status = "loading"
  entry.device = device
  try {
    const width = Math.max(1, bitmap.width)
    const height = Math.max(1, bitmap.height)
    let texture = entry.texture
    if (texture === null || entry.width !== width || entry.height !== height) {
      texture?.destroy()
      texture = device.createTexture({
        label: `TextureLoader:${entry.src}`,
        size: {width, height},
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      })
      entry.texture = texture
    }
    device.queue.copyExternalImageToTexture(
      {source: bitmap},
      {texture},
      {width, height},
    )
    entry.width = width
    entry.height = height
    delete entry.pendingBitmap
    entry.error = null
    entry.status = "ready"
  } catch (err) {
    entry.status = "failed"
    entry.error = err
    throw err
  } finally {
    bitmap.close?.()
    if (entry.pendingBitmap === bitmap) delete entry.pendingBitmap
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
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (width > 0 && height > 0) {
        return await createImageBitmap(image, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: "high",
        })
      }
      return await createImageBitmap(image)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }
}

async function normaliseSvgBlob(blob: Blob): Promise<Blob> {
  if (!blob.type.includes("svg")) return blob
  const text = await blob.text()
  const patched = normaliseSvgRootDimensions(text)
  if (patched === null) return blob
  return new Blob([patched], { type: "image/svg+xml" })
}

export function normaliseSvgRootDimensions(text: string): string | null {
  const svgTagMatch = text.match(/<svg\b[^>]*>/i)
  if (!svgTagMatch) return null

  const svgTag = svgTagMatch[0]
  const hasWidth = /\swidth\s*=/.test(svgTag)
  const hasHeight = /\sheight\s*=/.test(svgTag)
  if (hasWidth && hasHeight) return text

  const viewBox = svgTag.match(/\sviewBox\s*=\s*["']\s*([-+.\deE]+)[\s,]+([-+.\deE]+)[\s,]+([-+.\deE]+)[\s,]+([-+.\deE]+)\s*["']/i)
  if (!viewBox) return null
  const width = Number(viewBox[3])
  const height = Number(viewBox[4])
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null

  const attrs: string[] = []
  if (!hasWidth) attrs.push(`width="${width}"`)
  if (!hasHeight) attrs.push(`height="${height}"`)
  const patchedTag = svgTag.replace(/<svg\b/i, `<svg ${attrs.join(" ")}`)
  const start = svgTagMatch.index ?? 0
  return text.slice(0, start) + patchedTag + text.slice(start + svgTag.length)
}

function notify(src: string): void {
  const set = callbacks.get(src)
  if (!set) return
  for (const cb of set) cb()
}
