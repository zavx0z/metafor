import {Z, type UiSurface} from "./surface.ts"

export type DrawIconOptions = {
  opacity?: number
  z?: number
}

export function drawIcon(host: UiSurface, src: string, x: number, y: number, size: number, opts: DrawIconOptions = {}): void {
  if (src.length === 0 || size <= 0) return
  host.drawImage(src, x, y, size, size, {
    fit: "contain",
    opacity: opts.opacity ?? 1,
    z: opts.z ?? Z.TEXT,
  })
}

export function drawIconCentered(host: UiSurface, src: string, cx: number, cy: number, size: number, opts: DrawIconOptions = {}): void {
  drawIcon(host, src, cx - size / 2, cy - size / 2, size, opts)
}
