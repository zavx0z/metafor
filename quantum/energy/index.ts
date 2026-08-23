import type { ProcessEnv } from "@metafor/types/energy/process"

export function readEnergyEnv(value: unknown): ProcessEnv | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const kind = record.kind
  if (kind !== "server" && kind !== "browser-main" && kind !== "worker" && kind !== "service-worker" && kind !== "desktop-main" && kind !== "unknown") return null
  if (typeof record.id !== "string" || record.id.length === 0) return null
  if (record.labels !== undefined && (!Array.isArray(record.labels) || !record.labels.every((item) => typeof item === "string"))) return null
  if (record.capabilities !== undefined && (!Array.isArray(record.capabilities) || !record.capabilities.every((item) => typeof item === "string"))) return null

  const env: ProcessEnv = {kind, id: record.id}
  if (Array.isArray(record.labels)) env.labels = record.labels as string[]
  if (Array.isArray(record.capabilities)) env.capabilities = record.capabilities as string[]
  return env
}
