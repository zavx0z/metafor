import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"

export type ImpulseLogDirection = "<-" | "->"
export type ImpulseLogMode = "off" | "compact" | "full"

const SECRET_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key)/i
const DEFAULT_COMPACT_LIMIT = 240

type RuntimeGlobals = typeof globalThis & {
  Bun?: {env?: Record<string, string | undefined>}
  process?: {env?: Record<string, string | undefined>}
}

const env = (name: string): string | undefined => {
  const runtime = globalThis as RuntimeGlobals
  return runtime.Bun?.env?.[name] ?? runtime.process?.env?.[name]
}

const isBrowserRuntime = (): boolean =>
  typeof document !== "undefined" && typeof window !== "undefined"

const parseMode = (): ImpulseLogMode => {
  const value = env("METAFOR_LOG_IMPULSES")?.trim().toLowerCase()
  if (value === "0" || value === "off" || value === "false" || value === "none") return "off"
  if (value === "full" || value === "json") return "full"
  if (value === "1" || value === "on" || value === "true" || value === "compact") return "compact"
  return isBrowserRuntime() ? "off" : "compact"
}

const parseFilter = (name: string): Set<string> | null => {
  const value = env(name)?.trim()
  if (!value) return null
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? new Set(items) : null
}

const safeSerialize = (value: unknown, limit?: number, pretty = false): string => {
  const seen = new WeakSet<object>()
  let result: string | undefined

  try {
    result = JSON.stringify(value, (key, current: unknown) => {
      if (key && SECRET_KEY.test(key)) return "[redacted]"
      if (typeof current === "bigint") return `${current}n`
      if (current instanceof Error) {
        return {name: current.name, message: current.message}
      }
      if (typeof ArrayBuffer !== "undefined" && current instanceof ArrayBuffer) {
        return `[ArrayBuffer ${current.byteLength} bytes]`
      }
      if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(current)) {
        return `[${current.constructor.name} ${current.byteLength} bytes]`
      }
      if (typeof Blob !== "undefined" && current instanceof Blob) {
        return `[Blob ${current.size} bytes ${current.type || "application/octet-stream"}]`
      }
      if (typeof current === "object" && current !== null) {
        if (seen.has(current)) return "[circular]"
        seen.add(current)
      }
      return current
    }, pretty ? 2 : undefined)
  } catch (error) {
    result = JSON.stringify({serializationError: error instanceof Error ? error.message : String(error)})
  }

  const text = result ?? String(value)
  if (limit === undefined || text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 1))}…`
}

const formatPath = (path: Particle["path"] | Particle["from"]): string =>
  path === undefined ? "-" : typeof path === "string" ? JSON.stringify(path) : String(path)

const matchesFilters = (domain: string, particle: Particle): boolean => {
  const domains = parseFilter("METAFOR_LOG_DOMAINS")
  if (domains && !domains.has(domain)) return false
  const parts = parseFilter("METAFOR_LOG_PARTS")
  return !parts || parts.has(particle.part)
}

export const formatImpulseLog = (
  domain: string,
  direction: ImpulseLogDirection,
  message: ForceMessage,
  options: {
    mode?: ImpulseLogMode
    now?: Date
  } = {},
): string | null => {
  const particle = message.parts[0]
  if (!particle || !matchesFilters(domain, particle)) return null

  const mode = options.mode ?? parseMode()
  if (mode === "off") return null

  const now = options.now ?? new Date()
  const prefix = `[${now.toISOString()}] ${domain} ${direction}`

  if (mode === "full") {
    return `${prefix}\n${safeSerialize(message, undefined, true)}`
  }

  const fields = [
    particle.part,
    particle.op,
    `path=${formatPath(particle.path)}`,
    `by=${particle.by}`,
    `ts=${particle.ts}`,
  ]
  if (particle.from !== undefined) fields.push(`from=${formatPath(particle.from)}`)
  if (particle.value !== undefined) fields.push(`value=${safeSerialize(particle.value, DEFAULT_COMPACT_LIMIT)}`)
  return `${prefix} ${fields.join(" ")}`
}

export const logImpulse = (
  domain: string,
  direction: ImpulseLogDirection,
  message: ForceMessage,
): void => {
  const line = formatImpulseLog(domain, direction, message)
  if (line !== null) console.log(line)
}
