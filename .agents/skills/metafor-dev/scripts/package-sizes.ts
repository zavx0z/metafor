interface ReleasedPackage {
  name: string
  env: string
  version: string
  sha256: string
  size: number
}

interface CdpTarget {
  id: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

interface DeliverySize {
  decoded: number
  encoding: string | null
  sourceMap: DeliverySize | null
  url: string
  wire: number
}

interface BrowserState {
  bodyBytes: number
  entries: Array<{
    bytes: number
    cache: string
    env: string | null
    package: string | null
    url: string
    version: string | null
  }>
  estimate: {
    quota?: number
    usage?: number
    usageDetails?: Record<string, number>
  }
}

const [portInput, originInput] = Bun.argv.slice(2)
const port = Number(portInput)
if (!Number.isInteger(port) || !originInput) {
  console.error("usage: bun package-sizes.ts <cdp-port> <origin>")
  process.exit(1)
}

const origin = new URL(originInput).origin
const stateResponse = await fetch(new URL("/code", origin))
if (!stateResponse.ok) throw new Error(`/code returned ${stateResponse.status}`)
const state = await stateResponse.json() as {packages?: ReleasedPackage[]}
if (!Array.isArray(state.packages)) throw new Error("/code packages are missing")

const packages = [
  ...await Promise.all(["main", "service"].map(measureStartup)),
  ...await Promise.all(state.packages.map(async (entry) => ({
    ...entry,
    delivery: await measurePackage(entry),
  }))),
]
const browser = await inspectBrowser(port, origin)

console.info(`origin: ${origin}`)
console.info("packages:")
for (const entry of packages) {
  const map = entry.delivery.sourceMap
  const mapText = map
    ? ` | map ${formatBytes(map.decoded)} -> ${formatWire(map)}`
    : ""
  console.info(
    `  ${entry.name} ${entry.env}@${entry.version}`
    + ` | body ${formatBytes(entry.delivery.decoded)} -> ${formatWire(entry.delivery)}`
    + mapText,
  )
}

const deliveryTotals = packages.reduce((totals, entry) => {
  totals.bodyDecoded += entry.delivery.decoded
  totals.bodyWire += entry.delivery.wire
  totals.mapDecoded += entry.delivery.sourceMap?.decoded ?? 0
  totals.mapWire += entry.delivery.sourceMap?.wire ?? 0
  return totals
}, {bodyDecoded: 0, bodyWire: 0, mapDecoded: 0, mapWire: 0})
console.info(
  `delivery totals: body ${formatBytes(deliveryTotals.bodyDecoded)}`
  + ` -> ${formatBytes(deliveryTotals.bodyWire)}`
  + ` | maps ${formatBytes(deliveryTotals.mapDecoded)}`
  + ` -> ${formatBytes(deliveryTotals.mapWire)}`,
)

console.info("browser Cache Storage:")
for (const entry of browser.entries) {
  const identity = entry.package
    ? `${entry.package} ${entry.env}@${entry.version}`
    : new URL(entry.url).pathname
  console.info(`  ${entry.cache} | ${formatBytes(entry.bytes)} | ${identity}`)
}
console.info(`cache body total: ${formatBytes(browser.bodyBytes)}`)
const usage = browser.estimate.usage ?? 0
const cacheUsage = browser.estimate.usageDetails?.caches ?? 0
const workerUsage = browser.estimate.usageDetails?.serviceWorkerRegistrations ?? 0
console.info(
  `browser usage: ${formatBytes(usage)}`
  + ` | caches ${formatBytes(cacheUsage)}`
  + ` | service workers ${formatBytes(workerUsage)}`,
)

async function measurePackage(entry: ReleasedPackage) {
  const path = `/${entry.name}?env=${encodeURIComponent(entry.env)}`
    + `&version=${encodeURIComponent(entry.version)}`
  const delivery = await measureResponse(new URL(path, origin))
  if (delivery.decoded !== entry.size)
    throw new Error(`${entry.name}:${entry.env} decoded ${delivery.decoded}, expected ${entry.size}`)
  return delivery
}

async function measureStartup(env: string) {
  const url = new URL(`/@cosmos/startup?env=${encodeURIComponent(env)}`, origin)
  const response = await fetch(url, {headers: {"Accept-Encoding": "br, gzip"}})
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  const entry = {
    name: response.headers.get("X-Package-Name"),
    env: response.headers.get("X-Package-Env"),
    version: response.headers.get("X-Package-Version"),
    sha256: response.headers.get("X-Package-SHA256"),
    size: Number(response.headers.get("X-Package-Size")),
  }
  if (
    entry.name !== "@cosmos/startup"
    || entry.env !== env
    || !entry.version
    || !entry.sha256
    || !Number.isSafeInteger(entry.size)
    || entry.size <= 0
  ) throw new Error(`startup ${env} identity is invalid`)
  const delivery = await measureResponse(url, response)
  if (delivery.decoded !== entry.size)
    throw new Error(`startup:${env} decoded ${delivery.decoded}, expected ${entry.size}`)
  return {...entry, delivery} as ReleasedPackage & {delivery: DeliverySize}
}

async function measureResponse(url: URL, prefetched?: Response): Promise<DeliverySize> {
  const response = prefetched
    ?? await fetch(url, {headers: {"Accept-Encoding": "br, gzip"}})
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  const decoded = (await response.arrayBuffer()).byteLength
  const wire = contentLength(response.headers.get("Content-Length"), decoded)
  const sourceMapUrl = response.headers.get("SourceMap")
  return {
    decoded,
    encoding: response.headers.get("Content-Encoding"),
    sourceMap: sourceMapUrl
      ? await measureResponse(new URL(sourceMapUrl, origin))
      : null,
    url: url.href,
    wire,
  }
}

async function inspectBrowser(cdpPort: number, pageOrigin: string): Promise<BrowserState> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json() as Promise<CdpTarget[]>,
      )
      const pages = targets.filter((target) =>
        target.type === "page"
        && target.url.startsWith(`${pageOrigin}/`)
        && target.webSocketDebuggerUrl
      )
      if (pages.length !== 1) throw new Error(`expected one managed page, found ${pages.length}`)
      return await withCdp(pages[0]!.webSocketDebuggerUrl!, async (send) => {
        const response = await send("Runtime.evaluate", {
          expression: `(async () => {
            const entries = []
            for (const cacheName of await caches.keys()) {
              const cache = await caches.open(cacheName)
              for (const request of await cache.keys()) {
                const response = await cache.match(request, {ignoreVary: true})
                entries.push({
                  bytes: response ? (await response.clone().arrayBuffer()).byteLength : 0,
                  cache: cacheName,
                  env: response?.headers.get("X-Package-Env") ?? null,
                  package: response?.headers.get("X-Package-Name") ?? null,
                  url: request.url,
                  version: response?.headers.get("X-Package-Version") ?? null,
                })
              }
            }
            return {
              bodyBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
              entries,
              estimate: await navigator.storage.estimate(),
            }
          })()`,
          awaitPromise: true,
          returnByValue: true,
        }) as {result?: {value?: BrowserState}}
        const state = response.result?.value
        if (!state) throw new Error("browser size state is missing")
        return state
      })
    } catch (error) {
      if (attempt === 9) throw error
      await Bun.sleep(200)
    }
  }
  throw new Error("browser size inspection failed")
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
    for (const request of pending.values()) clearTimeout(request.timeout)
    pending.clear()
    socket.close()
  }
}

function contentLength(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function formatWire(delivery: Pick<DeliverySize, "encoding" | "wire">) {
  return delivery.encoding
    ? `${formatBytes(delivery.wire)} ${delivery.encoding}`
    : formatBytes(delivery.wire)
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`
}
