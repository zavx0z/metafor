import type {UiSurfaceRect} from "@ui/elements"

export function parseStoredPaneRect(raw: string | null): UiSurfaceRect | null {
  if (raw === null) return null
  try {
    return normalizeStoredPaneRect(JSON.parse(raw))
  } catch {
    return null
  }
}

export function normalizeStoredPaneRect(value: unknown): UiSurfaceRect | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const x = finiteStoredNumber(record.x)
  const y = finiteStoredNumber(record.y)
  const w = finiteStoredNumber(record.w)
  const h = finiteStoredNumber(record.h)
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  }
}

function finiteStoredNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
