import type {ClientCacheInventory, ClientLogs} from "@metafor/types/cosmos/client"
import {isClientResult, SERVICE_DIAGNOSTICS_SCHEMA} from "../shared/clients"

/** Читает только текущий контролирующий Worker через существующий postMessage path; old/DevTools history не синтезируется. */
export function createServiceDiagnosticsClient(workers: Pick<ServiceWorkerContainer, "controller"> | undefined = globalThis.navigator?.serviceWorker) {
  const cleanups = new Set<() => void>()
  return {
    logs(afterSequence = 0, limit = 64, producerId?: string): Promise<ClientLogs> {
      const controller = workers?.controller
      if (!controller) return Promise.reject(Object.assign(new Error("No controlling ServiceWorker"), {code: "unsupported"}))
      return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID(), channel = new MessageChannel()
        const finish = () => {clearTimeout(timer); channel.port1.close(); channel.port2.close(); cleanups.delete(cancel)}
        const cancel = () => {finish(); reject(new Error("Service diagnostics client disposed"))}
        const timer = setTimeout(() => {finish(); reject(Object.assign(new Error("Current ServiceWorker diagnostics unavailable; no captured history was returned"), {code: "unsupported"}))}, 3000)
        cleanups.add(cancel)
        channel.port1.onmessage = event => {
          const message = event.data
          if (!message || message.schema !== SERVICE_DIAGNOSTICS_SCHEMA || message.requestId !== requestId) return
          finish()
          if (workers?.controller !== controller) {reject(Object.assign(new Error("Controlling ServiceWorker changed"), {code: "disconnected"})); return}
          if (message.ok !== true || !isClientResult("logs", message.value) || message.value.from !== "release-service") {reject(new Error(typeof message.error === "string" ? message.error : "Invalid service diagnostic reply")); return}
          resolve(message.value)
        }
        try {controller.postMessage({schema: SERVICE_DIAGNOSTICS_SCHEMA, type: "logs", requestId, afterSequence, limit, ...(producerId ? {producerId} : {})}, [channel.port2])}
        catch (error) {finish(); reject(error)}
      })
    },
    dispose() {for (const cleanup of [...cleanups]) cleanup()},
  }
}

/** Stable canonical owner caches уже существуют; transaction читается только через match marker, без создания cache. */
export async function readClientCache(input: {afterIndex?: number; limit?: number; hash?: boolean}, storage: CacheStorage = globalThis.caches, origin = globalThis.location.origin): Promise<ClientCacheInventory> {
  if (!storage) throw Object.assign(new Error("CacheStorage unavailable"), {code: "unsupported"})
  const after = input.afterIndex ?? 0, limit = input.limit ?? 64
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 128) throw new Error("Invalid cache inventory cursor")
  const names = await storage.keys(), records: {cache: string; request: Request}[] = []
  let truncated = names.length > 64
  for (const name of ["release", "internal", "metafor"]) {
    if (!names.includes(name)) continue
    const cache = await storage.open(name)
    const keys = await cache.keys()
    if (keys.length > 4096) truncated = true
    for (const request of keys.slice(0, 4096)) records.push({cache: name, request})
  }
  if (names.includes("transaction")) for (const path of ["/transaction", "/transaction/failure"]) {const request = new Request(new URL(path, origin)); if (await storage.match(request, {cacheName: "transaction"})) records.push({cache: "transaction", request})}
  const entries: ClientCacheInventory["entries"] = []
  let remaining = 32 * 1024 * 1024
  for (const item of records.slice(after, after + limit)) {
    const url = new URL(item.request.url)
    const unsafe = url.origin !== origin || url.username || url.password || [...url.searchParams.keys()].some(key => key !== "env" && key !== "version")
    const shown = unsafe ? `${url.origin}${url.pathname}?[redacted]` : url.href
    const row: ClientCacheInventory["entries"][number] = {cache: item.cache, url: shown, method: item.request.method, status: null, bytes: null, sha256: null}
    entries.push(row)
    if (unsafe) {row.error = "private-or-unknown-key"; continue}
    const response = await storage.match(item.request, {cacheName: item.cache})
    if (!response) {row.error = "entry-changed-during-read"; continue}
    row.status = response.status
    if (!input.hash) continue
    if (response.type === "opaque" || response.type === "opaqueredirect") {row.error = "body-unavailable"; continue}
    const reader = response.clone().body?.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0, complete = true
    if (reader) try {for (;;) {const value = await reader.read(); if (value.done) break; bytes += value.value.byteLength; if (bytes > remaining) {complete = false; await reader.cancel(); break}; chunks.push(value.value)}} finally {reader.releaseLock()}
    remaining = Math.max(0, remaining - bytes)
    if (!complete) {row.error = "byte-budget-exceeded"; continue}
    row.bytes = bytes
    const content = new Uint8Array(bytes)
    let offset = 0; for (const chunk of chunks) {content.set(chunk, offset); offset += chunk.length}
    row.sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", content))].map(value => value.toString(16).padStart(2, "0")).join("")
  }
  return {schema: "cosmos/client-cache/v1", version: 1, from: "release-main", cacheNames: names.slice(0, 64).map(value => value.slice(0, 512)), entries,
    cursor: Math.min(records.length, after + entries.length), total: records.length, truncated: truncated || after + entries.length < records.length, transaction: names.includes("transaction") ? "marker-only" : "absent"}
}
