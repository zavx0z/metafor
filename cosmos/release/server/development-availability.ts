type Surface<Host, Scope> = {
  fetch(request: Request, host: Host): Promise<Response>
  refreshCatalog?(): Promise<void>
  subscribe(scope: Scope, receive: (value: unknown) => void): Promise<() => void>
  close(): Promise<void>
}

/** Необязательное окружение создаётся при первом разрешённом Source access, вне Core readiness. */
export async function createOptionalDevelopment<Host extends {timeout?(request: Request, seconds: number): void}, Scope>(options: {
  initialize(): Promise<Surface<Host, Scope> | null>
  authorize(request: Request, host: Host): void
  failed?(error: unknown): void
}) {
  let surface: Surface<Host, Scope> | null = null
  let state: "uninitialized" | "unassigned" | "ready" | "unavailable" = "uninitialized"
  let closed = false, initializing: Promise<void> | undefined, refreshing: Promise<void> | undefined
  let closing: Promise<void> | undefined
  const cleanupFailures: unknown[] = []
  const unavailable = () => Response.json({error: {code: "workspace_unavailable",
    message: "Исходное окружение Cosmos недоступно. Исправьте назначение или manifests и явно обновите каталог. Настройки выпуска остаются доступны."}},
    {status: 503, headers: {"cache-control": "no-store"}})
  const initialize = () => initializing ??= (async () => {
    try {
      const prepared = await options.initialize()
      if (closed) {
        try {await prepared?.close()} catch (error) {cleanupFailures.push(error)}
        return
      }
      surface = prepared
      state = surface ? "ready" : "unassigned"
    } catch (error) {
      state = "unavailable"
      try {options.failed?.(error)} catch {}
    }
  })().finally(() => {initializing = undefined})
  const refresh = () => refreshing ??= Promise.resolve().then(() => surface?.refreshCatalog?.()).finally(() => {refreshing = undefined})
  return {
    async fetch(request: Request, host: Host): Promise<Response> {
      if (closed) return new Response(null, {status: 503})
      const url = new URL(request.url)
      try {options.authorize(request, host)} catch {return new Response(null, {status: 403})}
      if (url.search) return new Response(null, {status: 400})
      const retry = url.pathname === "/cosmos/development/retry"
      if (retry || !surface) {
        if (retry) {
          if (request.method !== "POST") return new Response(null, {status: 405})
          if (Number(request.headers.get("content-length") ?? "0") > 64) return new Response(null, {status: 413})
          const reader = request.body?.getReader(), chunks: Uint8Array[] = []
          let bytes = 0
          if (reader) try {
            while (true) {
              const part = await reader.read()
              if (part.done) break
              bytes += part.value.byteLength
              if (bytes > 64) {await reader.cancel(); return new Response(null, {status: 413})}
              chunks.push(part.value)
            }
          } finally {reader.releaseLock()}
          const body = new TextDecoder().decode(Buffer.concat(chunks))
          if (body.length > 64 || body.trim() !== "{}") return new Response(null, {status: 400})
          host.timeout?.(request, 60)
          if (state !== "ready") await initialize()
          else try {await refresh()}
            catch {return unavailable()}
          if (closed) return new Response(null, {status: 503})
          if (state === "unavailable") return unavailable()
          return Response.json({ready: state === "ready"}, {headers: {"cache-control": "no-store"}})
        }
        if (state === "uninitialized") {
          host.timeout?.(request, 60)
          await initialize()
        }
        if (closed) return new Response(null, {status: 503})
        if (state === "unavailable") return unavailable()
        if (!surface) return Response.json({error: {code: "workspace_unassigned", message: "Исходное окружение Cosmos не назначено"}}, {status: 404})
      }
      return surface.fetch(request, host)
    },
    async subscribe(scope: Scope, receive: (value: unknown) => void) {
      if (!closed && state === "uninitialized") await initialize()
      if (closed || !surface) return Promise.reject(new Error("Исходное окружение Cosmos недоступно; обновите каталог после исправления"))
      return surface.subscribe(scope, receive)
    },
    close() {
      closing ??= (async () => {
        closed = true
        await Promise.allSettled([initializing, refreshing])
        const owned = surface
        surface = null
        try {await owned?.close()} catch (error) {cleanupFailures.push(error)}
        if (cleanupFailures.length) throw new AggregateError(cleanupFailures, "Optional development resources did not close")
      })()
      return closing
    },
  }
}
