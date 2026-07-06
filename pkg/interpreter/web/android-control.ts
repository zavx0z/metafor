import type {AndroidPane} from "@ui/panes"
import type {AndroidRtcCommand} from "./android-rtc.ts"

export function withAndroidFrameSize(command: AndroidRtcCommand, pane: AndroidPane | null): AndroidRtcCommand {
  if (command.type !== "tap" && command.type !== "swipe") return command
  if (command.frameW !== undefined && command.frameH !== undefined) return command
  const frame = pane?.frameSnapshot() ?? null
  if (frame === null) return command
  return {...command, frameW: frame.width, frameH: frame.height}
}

export function androidControlCommandFromParams(params: unknown): AndroidRtcCommand {
  if (typeof params !== "object" || params === null || Array.isArray(params)) throw new Error("android control command must be an object")
  const record = params as Record<string, unknown>
  const type = record.type
  if (type === "tap") {
    return withAndroidCommandFrameSize(record, {
      type,
      x: requiredFiniteNumber(record.x, "x"),
      y: requiredFiniteNumber(record.y, "y"),
    })
  }
  if (type === "swipe") {
    const command: AndroidRtcCommand = {
      type,
      x1: requiredFiniteNumber(record.x1, "x1"),
      y1: requiredFiniteNumber(record.y1, "y1"),
      x2: requiredFiniteNumber(record.x2, "x2"),
      y2: requiredFiniteNumber(record.y2, "y2"),
    }
    if (record.durationMs !== undefined) command.durationMs = requiredFiniteNumber(record.durationMs, "durationMs")
    return withAndroidCommandFrameSize(record, command)
  }
  if (type === "key") {
    const code = record.code
    if (typeof code !== "string" || code.length === 0) throw new Error("android key command requires code")
    return {type, code}
  }
  if (type === "launch") {
    const packageName = record.packageName
    if (typeof packageName !== "string" || packageName.length === 0) throw new Error("android launch command requires packageName")
    return {type, packageName}
  }
  if (type === "open-accessibility") return {type}
  throw new Error("unsupported android control command")
}

function withAndroidCommandFrameSize<T extends Extract<AndroidRtcCommand, {type: "tap" | "swipe"}>>(
  record: Record<string, unknown>,
  command: T,
): T {
  if (record.frameW === undefined && record.frameH === undefined) return command
  return {
    ...command,
    frameW: requiredFiniteNumber(record.frameW, "frameW"),
    frameH: requiredFiniteNumber(record.frameH, "frameH"),
  }
}

function requiredFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`android control command requires numeric ${name}`)
  return value
}

export function androidDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error("android frame is not a data URL"))
    })
    reader.addEventListener("error", () => reject(reader.error ?? new Error("android frame read failed")))
    reader.readAsDataURL(blob)
  })
}
