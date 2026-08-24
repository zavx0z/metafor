import {mkdir, rename, rm, writeFile} from "node:fs/promises"
import {basename, dirname, join, resolve} from "node:path"

export type RawCanvasProbe = Readonly<{
  width: number
  height: number
  rgba: readonly number[]
}>

/** Exact encoded-canvas acceptance shared by centralized package pages. */
export type RawCanvasSnapshot = Readonly<{
  dataUrl: string | null
  probe: RawCanvasProbe | null
}>

export type CanvasPixelEvidence = Readonly<{
  width: number
  height: number
  pixels: number
  nonBlackPixels: number
  maxRgb: number
  black: boolean
}>

type RejectedCanvasAttempt = Readonly<{
  attempt: 1 | 2
  kind: "starting-or-idle-black"
  probe: CanvasPixelEvidence
}>

export type AcceptedCanvasEvidence = Readonly<{
  kind: "exact-canvas-png"
  written: true
  path: string
  bytes: number
  attempts: 1 | 2
  rendererActivity: "same-route-navigation" | null
  rejected: readonly RejectedCanvasAttempt[]
  probe: CanvasPixelEvidence
}>

export type RejectedCanvasEvidence = Readonly<{
  kind: "starting-or-idle-black"
  written: false
  path: string
  bytes: 0
  attempts: 1 | 2
  rendererActivity: "same-route-navigation" | null
  rejected: readonly RejectedCanvasAttempt[]
  probe: CanvasPixelEvidence
}>

export type CanvasEvidence = AcceptedCanvasEvidence | RejectedCanvasEvidence

/** Typed rejection shared by browser actions without importer source-order coupling. */
export class CanvasEvidenceRejected extends Error {
  readonly evidence: CanvasEvidence

  constructor(evidence: CanvasEvidence) {
    super(evidence.kind)
    this.name = "CanvasEvidenceRejected"
    this.evidence = evidence
  }
}

export function classifyCanvasPixels(probe: RawCanvasProbe): CanvasPixelEvidence {
  const {width, height, rgba} = probe
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error(`invalid canvas probe dimensions: ${width}x${height}`)
  }
  const pixels = width * height
  if (rgba.length !== pixels * 4) {
    throw new Error(`invalid canvas probe byte count: expected ${pixels * 4}, got ${rgba.length}`)
  }

  let nonBlackPixels = 0
  let maxRgb = 0
  for (let index = 0; index < rgba.length; index += 4) {
    const red = channel(rgba[index])
    const green = channel(rgba[index + 1])
    const blue = channel(rgba[index + 2])
    const alpha = channel(rgba[index + 3])
    const pixelMax = Math.max(red, green, blue)
    if (alpha > 0 && pixelMax > 0) {
      nonBlackPixels++
      if (pixelMax > maxRgb) maxRgb = pixelMax
    }
  }

  return {width, height, pixels, nonBlackPixels, maxRgb, black: nonBlackPixels === 0}
}

export async function acceptCanvasEvidence(options: Readonly<{
  destination: string
  snapshot: () => Promise<RawCanvasSnapshot>
  retryAfterBlack?: () => Promise<void>
}>): Promise<CanvasEvidence> {
  const destination = resolve(options.destination)
  const rejected: RejectedCanvasAttempt[] = []
  let rendererActivity: "same-route-navigation" | null = null
  const maximumAttempts = options.retryAfterBlack === undefined ? 1 : 2

  for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
    const snapshot = await options.snapshot()
    if (snapshot.probe === null) throw new Error("canvas pixel probe is unavailable")
    const probe = classifyCanvasPixels(snapshot.probe)
    if (probe.black) {
      rejected.push({attempt: attempt as 1 | 2, kind: "starting-or-idle-black", probe})
      if (attempt === 1 && options.retryAfterBlack !== undefined) {
        await options.retryAfterBlack()
        rendererActivity = "same-route-navigation"
        continue
      }
      return {
        kind: "starting-or-idle-black",
        written: false,
        path: destination,
        bytes: 0,
        attempts: attempt as 1 | 2,
        rendererActivity,
        rejected,
        probe,
      }
    }

    const bytes = decodePng(snapshot.dataUrl)
    await writeAtomically(destination, bytes)
    return {
      kind: "exact-canvas-png",
      written: true,
      path: destination,
      bytes: bytes.length,
      attempts: attempt as 1 | 2,
      rendererActivity,
      rejected,
      probe,
    }
  }

  throw new Error("canvas evidence attempt bound was exceeded")
}

function channel(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`invalid canvas probe channel: ${value}`)
  }
  return value
}

function decodePng(dataUrl: string | null): Uint8Array {
  if (!dataUrl?.startsWith("data:image/png;base64,")) throw new Error("canvas PNG is unavailable")
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("decoded canvas is not PNG")
  }
  return bytes
}

async function writeAtomically(destination: string, bytes: Uint8Array): Promise<void> {
  const directory = dirname(destination)
  await mkdir(directory, {recursive: true})
  const temporary = join(directory, `.${basename(destination)}.${process.pid}.${crypto.randomUUID()}.tmp`)
  try {
    await writeFile(temporary, bytes)
    await rename(temporary, destination)
  } finally {
    await rm(temporary, {force: true})
  }
}
