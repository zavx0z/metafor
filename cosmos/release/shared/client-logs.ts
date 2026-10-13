import type {ClientLog, ClientLogs, ClientSafeValue} from "@metafor/types/cosmos/client"

const LEVELS = ["log", "debug", "info", "warn", "error"] as const
const MAX_ENTRIES = 256
const MAX_BYTES = 512 * 1024

/** Копирует ограниченные собственные data properties, не вызывая accessors и toJSON. */
function snapshot(value: unknown, budget: {left: number}, seen = new WeakSet<object>(), depth = 0): ClientSafeValue {
  if (budget.left <= 0) return "[truncated]"
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value)
  if (typeof value === "string") {
    const text = value.slice(0, Math.min(8192, budget.left))
    budget.left -= text.length
    return text
  }
  if (typeof value !== "object") return `[${typeof value}]`
  if (seen.has(value)) return "[circular]"
  if (depth >= 3) return "[object]"
  seen.add(value)
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const result: {[key: string]: ClientSafeValue} = Object.create(null)
    for (const key of Object.keys(descriptors).slice(0, 24)) {
      if (budget.left <= 0) break
      const descriptor = descriptors[key]!
      const name = key.slice(0, 128)
      budget.left -= name.length
      result[name] = /password|authorization|cookie|token|secret/iu.test(name) ? "[redacted]"
        : "value" in descriptor ? snapshot(descriptor.value, budget, seen, depth + 1) : "[accessor]"
    }
    return result
  } catch {return "[unavailable object]"}
}

/**
Наблюдение console текущего execution realm начинается после установки release entrypoint.
Ограниченный ring сохраняет копии аргументов, включая собственные message/stack
у Error; обычные console calls продолжаются. DevTools warnings и чужие Worker
contexts сюда не входят. Window передаёт events явно; Worker получает ошибки
через первоначальные startup listeners и наблюдает только console. Страница ограничена количеством и encoded bytes; cursor
продвигается только по возвращённым данным. Проверки: [browser-clients.spec.ts](../spec/browser-clients.spec.ts).
*/
export function createClientLogRecorder(input: {from?: ClientLogs["from"]; owner?: ClientLogs["owner"]; eventPrefix?: "window" | "service"; console: Console; events?: Pick<EventTarget, "addEventListener" | "removeEventListener">; now?: () => number}) {
  let sequence = 0
  let dropped = 0
  let bytes = 0
  let disposed = false
  const entries: {entry: ClientLog; bytes: number}[] = []
  const restorers: (() => void)[] = []
  const record = (level: ClientLog["level"], values: readonly unknown[]) => {
    if (disposed) return
    const budget = {left: 8192}
    const safe = values.slice(0, 16).map(value => snapshot(value, budget))
    const message = safe.map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" ")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`).slice(0, 8192)
    const entry: ClientLog = {sequence: ++sequence, level, message, values: safe, timestamp: (input.now ?? Date.now)()}
    const size = new TextEncoder().encode(JSON.stringify(entry)).byteLength
    entries.push({entry, bytes: size})
    bytes += size
    while (entries.length > MAX_ENTRIES || bytes > MAX_BYTES) {
      bytes -= entries.shift()!.bytes
      dropped++
    }
    return entry
  }
  for (const level of LEVELS) {
    const original = input.console[level]
    const wrapper = (...values: unknown[]) => {
      try {record(level, values)} catch {}
      return Reflect.apply(original, input.console, values)
    }
    input.console[level] = wrapper
    restorers.push(() => {if (input.console[level] === wrapper) input.console[level] = original})
  }
  const error = (event: Event) => {
    const value = event as ErrorEvent
    record("error", [`${input.eventPrefix ?? "window"}.error`, value.error ?? value.message])
  }
  const rejected = (event: Event) => {record("error", [`${input.eventPrefix ?? "window"}.unhandledrejection`, (event as PromiseRejectionEvent).reason])}
  input.events?.addEventListener("error", error)
  input.events?.addEventListener("unhandledrejection", rejected)
  return {
    record,
    read(afterSequence = 0, limit = 64): ClientLogs {
      if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 128) throw new Error("Invalid client log cursor or limit")
      const selected: ClientLog[] = []
      let size = 0
      for (const item of entries) {
        if (item.entry.sequence <= afterSequence) continue
        if (selected.length >= limit || size + item.bytes > 128 * 1024) break
        selected.push(structuredClone(item.entry))
        size += item.bytes
      }
      return {schema: "cosmos/client-logs/v1", version: 1, entries: selected,
        cursor: selected.at(-1)?.sequence ?? Math.min(afterSequence, sequence), dropped, from: input.from ?? "release-main", ...(input.owner ? {owner: {...input.owner}} : {})}
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const restore of restorers) restore()
      input.events?.removeEventListener("error", error)
      input.events?.removeEventListener("unhandledrejection", rejected)
    },
  }
}
