interface CdpTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

const [action, portInput, targetId, origin] = Bun.argv.slice(2)
const port = Number(portInput)

if (action !== "prepare" || !Number.isInteger(port) || !targetId || !origin) {
  console.error("usage: bun chrome-target.ts prepare <port> <target-id> <origin>")
  process.exit(1)
}

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json() as Promise<CdpTarget[]>,
)
const page = targets.find((target) => target.id === targetId)
if (!page?.webSocketDebuggerUrl) throw new Error(`CDP target is missing: ${targetId}`)

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
    if (message.error) request.reject(new Error(message.error.message ?? "CDP command failed"))
    else request.resolve(message.result)
  })

  const send = (method: string, params: unknown = {}) => new Promise<unknown>((resolve, reject) => {
    const id = ++sequence
    pending.set(id, {resolve, reject})
    socket.send(JSON.stringify({id, method, params}))
  })

  try {
    return await operation(send)
  } finally {
    socket.close()
  }
}
