interface CdpTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

const [action, portInput, targetId, origin] = Bun.argv.slice(2)
const port = Number(portInput)

if (
  !["prepare", "clear-site-data"].includes(action)
  || !Number.isInteger(port)
  || !targetId
  || !origin
) {
  console.error(
    "usage: bun chrome-target.ts {prepare|clear-site-data} <port> <target-id> <origin>",
  )
  process.exit(1)
}

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json() as Promise<CdpTarget[]>,
)
const page = targets.find((target) => target.id === targetId)
if (!page?.webSocketDebuggerUrl) throw new Error(`CDP target is missing: ${targetId}`)

if (action === "clear-site-data") {
  await withCdp(page.webSocketDebuggerUrl, async (send) => {
    await send("Storage.clearDataForOrigin", {origin, storageTypes: "all"})
    await send("Network.clearBrowserCache")
    await send("Page.enable")
    await send("Page.reload", {ignoreCache: true})
  })
  await waitForDocument(page.webSocketDebuggerUrl)
  await waitForServiceWorker(page.webSocketDebuggerUrl)
  const state = await waitForSiteState(page.webSocketDebuggerUrl)
  console.info(`site data: cleared ${origin}`)
  console.info(`target: reloaded ${targetId}`)
  console.info(`site state: ${JSON.stringify(state)}`)
  process.exit(0)
}

await withCdp(page.webSocketDebuggerUrl, async (send) => {
  await send("Emulation.clearDeviceMetricsOverride")
  await send("Emulation.setDeviceMetricsOverride", {
    width: 0,
    height: 0,
    deviceScaleFactor: 0,
    mobile: false,
  })
  await send("Emulation.clearDeviceMetricsOverride")
  await send("Emulation.setTouchEmulationEnabled", {enabled: false})
})
console.info(`viewport: native ${targetId}`)

const devtools = targets.filter((target) =>
  target.type === "page"
  && target.url.startsWith("devtools://")
  && target.title.includes(new URL(origin).host)
  && target.webSocketDebuggerUrl
)
for (const target of devtools) {
  const enabled = await withCdp(target.webSocketDebuggerUrl!, async (send) => {
    const response = await send("Runtime.evaluate", {
      expression: `(() => {
        const view = globalThis.Console?.ConsoleView?.instance?.()
        const setting = view?.filter?.messageLevelFiltersSetting
        if (!setting) return false
        setting.set({...setting.get(), verbose: true})
        return setting.get().verbose === true
      })()`,
      returnByValue: true,
    }) as {result?: {value?: unknown}}
    return response.result?.value === true
  })
  if (enabled) console.info(`console: verbose ${target.id}`)
}

async function withCdp<T>(
  url: string,
  operation: (send: (method: string, params?: unknown) => Promise<unknown>) => Promise<T>,
) {
  const socket = new WebSocket(url)
  const pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
    timeout: ReturnType<typeof setTimeout>
  }>()
  let sequence = 0

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP connection timed out: ${url}`)), 5000)
    socket.addEventListener("open", () => {
      clearTimeout(timeout)
      resolve()
    }, {once: true})
    socket.addEventListener("error", () => {
      clearTimeout(timeout)
      reject(new Error(`CDP connection failed: ${url}`))
    }, {once: true})
  })

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number
      result?: unknown
      error?: {message?: string}
    }
    if (message.id === undefined) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timeout)
    if (message.error) request.reject(new Error(message.error.message ?? "CDP command failed"))
    else request.resolve(message.result)
  })

  socket.addEventListener("close", () => {
    for (const [id, request] of pending) {
      clearTimeout(request.timeout)
      request.reject(new Error(`CDP connection closed before response: ${id}`))
    }
    pending.clear()
  })

  const send = (method: string, params: unknown = {}) => new Promise<unknown>((resolve, reject) => {
    const id = ++sequence
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP command timed out: ${method}`))
    }, 5000)
    pending.set(id, {resolve, reject, timeout})
    socket.send(JSON.stringify({id, method, params}))
  })

  try {
    return await operation(send)
  } finally {
    socket.close()
  }
}

async function waitForDocument(url: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const ready = await withCdp(url, async (send) => {
        const response = await send("Runtime.evaluate", {
          expression: "document.readyState === 'complete'",
          returnByValue: true,
        }) as {result?: {value?: unknown}}
        return response.result?.value === true
      })
      if (ready) return
    } catch {
      // Reload briefly destroys the Runtime context; retry against the same target.
    }
    await Bun.sleep(200)
  }
  throw new Error(`document did not become ready after site-data cleanup: ${targetId}`)
}

async function readSiteState(url: string) {
  return withCdp(url, async (send) => {
    const response = await send("Runtime.evaluate", {
      expression: `Promise.all([
        caches.keys(),
        navigator.serviceWorker.getRegistrations().then((items) =>
          items.map((item) => ({scope: item.scope, active: item.active?.scriptURL ?? null})),
        ),
        Promise.resolve(navigator.serviceWorker.controller?.scriptURL ?? null),
      ]).then(([caches, registrations, controller]) => ({
        caches,
        registrations,
        controller,
      }))`,
      awaitPromise: true,
      returnByValue: true,
    }) as {result?: {value?: unknown}}
    return response.result?.value
  })
}

async function waitForServiceWorker(url: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const active = await withCdp(url, async (send) => {
        const response = await send("Runtime.evaluate", {
          expression: `navigator.serviceWorker.getRegistrations().then((items) =>
            items.some((item) => item.active !== null),
          )`,
          awaitPromise: true,
          returnByValue: true,
        }) as {result?: {value?: unknown}}
        return response.result?.value === true
      })
      if (active) return
    } catch {
      // Startup and release may navigate the managed Window while the worker activates.
    }
    await Bun.sleep(200)
  }
  throw new Error(`service worker did not become active after site-data cleanup: ${targetId}`)
}

async function waitForSiteState(url: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const state = await readSiteState(url)
      if (state !== undefined) return state
    } catch {
      // Release activation may replace the Runtime context before the final read.
    }
    await Bun.sleep(200)
  }
  throw new Error(`site state did not settle after site-data cleanup: ${targetId}`)
}
