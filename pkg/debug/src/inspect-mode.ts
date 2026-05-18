export type InspectMode = "wait" | "brk"

const INSPECT_RE = /^--inspect(?:-(?:wait|brk))?(?:=(.*))?$/

export function applyInspectMode(command: string[], mode: InspectMode, inspectorUrl: string): string[] {
  const next = [...command]
  const wanted = mode === "brk" ? "--inspect-brk" : "--inspect-wait"

  for (let i = 0; i < next.length; i++) {
    const arg = next[i]!
    const match = INSPECT_RE.exec(arg)
    if (match === null) continue

    const value = match[1]
    const separateValue = value === undefined && isInspectEndpoint(next[i + 1])
      ? next[i + 1]
      : undefined
    next[i] = `${wanted}=${value ?? separateValue ?? inspectorUrl}`
    if (separateValue !== undefined) next.splice(i + 1, 1)
    return next
  }

  if (mode === "brk" && isBunCommand(next[0])) {
    next.splice(1, 0, `${wanted}=${inspectorUrl}`)
  }

  return next
}

function isBunCommand(value: string | undefined): boolean {
  if (value === undefined) return false
  const normalized = value.replaceAll("\\", "/")
  return normalized === "bun" || normalized.endsWith("/bun")
}

function isInspectEndpoint(value: string | undefined): value is string {
  if (value === undefined || value.startsWith("--")) return false
  return value.startsWith("ws://") || value.startsWith("wss://") || value.includes(":")
}
