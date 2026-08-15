import {expect, setDefaultTimeout, test} from "bun:test"
import {existsSync} from "node:fs"
import {mkdtemp, rm} from "node:fs/promises"
import {createServer} from "node:net"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import puppeteer, {
  TargetType,
  type Browser,
  type Page,
  type Target,
  type WebWorker,
} from "puppeteer-core"

setDefaultTimeout(180_000)

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))
const chrome = resolveChrome()

interface RunningServer {
  port: number
  root: string
  output: () => string
  stop: () => Promise<void>
}

interface WorkerHandle {
  target: Target
  worker: WebWorker
}

interface CacheSnapshot {
  [name: string]: string[]
}

test.serial("LOAD-001 restores accepted startup, importers and internal module from caches", async () => {
  const profile = await mkdtemp(join(tmpdir(), "metafor-load-001-"))
  const server = await startServer()
  let browser: Browser | null = null
  let witness: ReturnType<typeof startColdWitness> | null = null
  let serverStopped = false

  try {
    browser = await launchBrowser(profile)

    const probeContext = await browser.createBrowserContext()
    const probe = await probeContext.newPage()
    await probe.setBypassServiceWorker(true)
    await probe.goto(server.root, {waitUntil: "domcontentloaded"})

    const routeProbes = await probe.evaluate(async () => {
      const paths = ["/import/main", "/import/service", "/internal/rpc"]
      const current = await Promise.all(paths.map(async (path) => {
        const first = await fetch(path)
        const firstBody = await first.text()
        const second = await fetch(path)
        const secondBody = await second.text()
        return {
          path,
          firstStatus: first.status,
          secondStatus: second.status,
          firstBody,
          secondBody,
          type: first.headers.get("content-type"),
        }
      }))
      const legacy = await Promise.all([
        "/main.js",
        "/import-main.js",
        "/import-service.js",
        "/rpc-service.js",
      ].map(async (path) => ({path, status: (await fetch(path)).status})))
      return {current, legacy}
    })

    for (const route of routeProbes.current) {
      expect(route.firstStatus).toBe(200)
      expect(route.secondStatus).toBe(200)
      expect(route.firstBody.length).toBeGreaterThan(0)
      expect(route.secondBody).toBe(route.firstBody)
      expect(route.type).toStartWith("text/javascript")
    }
    for (const route of routeProbes.legacy) expect(route.status).toBe(404)
    await probeContext.close()

    const pageLogs: string[] = []
    const requests: string[] = []
    const responses = new Map<string, boolean>()
    const workerObserver = observeStartupWorker(browser)
    const page = await browser.newPage()
    const connectionsBefore = countMatches(server.output(), "rpc/service connected")

    page.on("console", (message) => pageLogs.push(message.text()))
    page.on("request", (request) => requests.push(new URL(request.url()).pathname))
    page.on("response", (response) => {
      responses.set(new URL(response.url()).pathname, response.fromServiceWorker())
    })

    const navigation = await page.goto(server.root, {waitUntil: "load"})
    expect(navigation?.status()).toBe(200)

    const firstWorker = await workerObserver.promise
    expect(new URL(firstWorker.target.url()).pathname).toBe("/startup-service.js")
    await waitForAcceptedCaches(page)
    await waitUntil(() => pageLogs.includes("main importer"))
    await waitUntil(() => countMatches(server.output(), "rpc/service connected") > connectionsBefore)

    const documentContract = await page.evaluate(async () => ({
      scripts: Array.from(document.scripts, (script) => script.getAttribute("src")),
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      scope: (await navigator.serviceWorker.getRegistration())?.scope ?? null,
    }))

    expect(documentContract.scripts).toEqual(["/startup-main.js"])
    expect(documentContract.controller).toBe(`${server.root}/startup-service.js`)
    expect(documentContract.scope).toBe(`${server.root}/`)
    expect(requests).toContain("/startup-main.js")
    expect(requests).toContain("/import/main")
    expect(requests.some((path) => /hmr|_bun/i.test(path))).toBe(false)
    expect(responses.get("/import/main")).toBe(true)

    const initial = await cacheSnapshot(page)
    expect(Object.keys(initial).sort()).toEqual(["import", "internal", "startup"])
    expect(initial.startup).toEqual(expect.arrayContaining([
      "/",
      "/manifest.webmanifest",
      "/startup-main.js",
    ]))
    expect(initial.startup).not.toContain("/import/main")
    expect(initial.startup).not.toContain("/import/service")
    expect(initial.startup).not.toContain("/internal/rpc")
    expect(initial.import).toEqual(expect.arrayContaining(["/import/main", "/import/service"]))
    expect(initial.internal).toContain("/internal/rpc")
    expect(initial.metafor).toBeUndefined()

    const missingScript = await page.evaluate(async () => {
      const response = await fetch("/missing.js")
      return {status: response.status, type: response.headers.get("content-type")}
    })
    expect(missingScript.status).toBe(404)
    expect(missingScript.type ?? "").not.toContain("text/html")

    const assetCandidates = [
      "/assets/screenshots/screenshot-mobile.png",
      "/assets/screenshots/screenshot-wide.png",
      "/assets/icons/icon-512-maskable.png",
      "/assets/icons/icon-192-maskable.png",
    ]
    const lazyAsset = assetCandidates.find((path) => !(initial.startup ?? []).includes(path))
    expect(lazyAsset).toBeDefined()

    const onlineAsset = await page.evaluate(async (path) => {
      const response = await fetch(path)
      return {status: response.status, bytes: (await response.arrayBuffer()).byteLength}
    }, lazyAsset!)
    expect(onlineAsset.status).toBe(200)
    expect(onlineAsset.bytes).toBeGreaterThan(0)
    await waitUntil(async () => (await cacheSnapshot(page)).startup?.includes(lazyAsset!) ?? false)

    const mainImportsBeforeOffline = pageLogs.filter((message) => message === "main importer").length
    await server.stop()
    serverStopped = true
    await page.setOfflineMode(false)

    const offlineAsset = await page.evaluate(async (path) => {
      const response = await fetch(path)
      return {status: response.status, bytes: (await response.arrayBuffer()).byteLength}
    }, lazyAsset!)
    expect(offlineAsset.status).toBe(200)
    expect(offlineAsset.bytes).toBe(onlineAsset.bytes)

    const missingOfflineAsset = await page.evaluate(async () => {
      const response = await fetch("/assets/not-cached.png")
      return response.status
    })
    expect(missingOfflineAsset).toBe(503)

    const nested = await page.goto(`${server.root}/net/peer`, {waitUntil: "load"})
    expect(nested?.status()).toBe(200)
    expect(nested?.fromServiceWorker()).toBe(true)
    expect(page.url()).toBe(`${server.root}/net/peer`)
    await waitUntil(() => pageLogs.filter((message) => message === "main importer").length > mainImportsBeforeOffline)

    const afterNested = await cacheSnapshot(page)
    expect(Object.values(afterNested).flat()).not.toContain("/net/peer")

    await browser.close()
    browser = null

    witness = startColdWitness(server.port)
    browser = await launchBrowser(profile)
    const coldWorkerObserver = observeStartupWorker(browser)
    const coldPageLogs: string[] = []
    const coldPage = await browser.newPage()
    coldPage.on("console", (message) => coldPageLogs.push(message.text()))

    const coldNavigation = await coldPage.goto(`${server.root}/cold/restored`, {waitUntil: "load"})
    expect(coldNavigation?.status()).toBe(200)
    expect(coldNavigation?.fromServiceWorker()).toBe(true)

    const coldWorker = await coldWorkerObserver.promise
    expect(new URL(coldWorker.target.url()).pathname).toBe("/startup-service.js")
    await waitUntil(() => coldPageLogs.includes("main importer"))
    await waitUntil(() => witness!.connections() >= 1)
    expect(witness.requests).not.toContain("/")
    expect(witness.requests).not.toContain("/import/main")
    expect(witness.requests).not.toContain("/import/service")
    expect(witness.requests).not.toContain("/internal/rpc")

    const cold = await cacheSnapshot(coldPage)
    expect(cold.startup).toEqual(expect.arrayContaining(["/", "/manifest.webmanifest", "/startup-main.js"]))
    expect(cold.import).toEqual(expect.arrayContaining(["/import/main", "/import/service"]))
    expect(cold.internal).toContain("/internal/rpc")
    expect(Object.values(cold).flat()).not.toContain("/cold/restored")
  } catch (error) {
    throw withServerOutput(error, server.output())
  } finally {
    if (browser) await browser.close()
    if (witness) await witness.stop()
    if (!serverStopped) await server.stop()
    await rm(profile, {recursive: true, force: true})
  }
})

test.serial("LOAD-001 rejects failed or invalid artifacts and retries exact entries", async () => {
  for (const scenario of [
    {fault: "import-service-http-once", failed: "importService"},
    {fault: "internal-invalid-once", failed: "internalRpc"},
  ] as const) {
    const profile = await mkdtemp(join(tmpdir(), `metafor-load-001-${scenario.fault}-`))
    const server = await startServer(scenario.fault)
    let browser: Browser | null = null

    try {
      browser = await launchBrowser(profile)
      const page = await browser.newPage()
      await page.goto(server.root, {waitUntil: "load"})
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
      await waitForRequestCount(page, scenario.failed, 1)
      await waitForFailedEntries(page, scenario.fault)

      const failed = await cacheSnapshot(page)
      expect(failed.startup).toEqual(expect.arrayContaining(["/", "/manifest.webmanifest", "/startup-main.js"]))
      expect(failed.import).toContain("/import/main")
      expect(failed.import).not.toContain("/import/service")
      expect(failed.internal ?? []).not.toContain("/internal/rpc")

      await retryConnectUntil(page, scenario.failed, 2)
      await waitForAcceptedCaches(page)

      const recovered = await cacheSnapshot(page)
      expect(recovered.import).toEqual(expect.arrayContaining(["/import/main", "/import/service"]))
      expect(recovered.internal).toContain("/internal/rpc")
      expect(recovered.metafor).toBeUndefined()
    } catch (error) {
      throw withServerOutput(error, server.output())
    } finally {
      if (browser) await browser.close()
      await server.stop()
      await rm(profile, {recursive: true, force: true})
    }
  }
})

async function startServer(fault: "none" | "import-service-http-once" | "internal-invalid-once" = "none"): Promise<RunningServer> {
  const port = await freePort()
  const bun = Bun.which("bun") ?? process.execPath
  const command = fault === "none"
    ? [bun, `--port=${port}`, "server.ts"]
    : [bun, "tests/fixture/server.ts"]
  let stdout = ""
  let stderr = ""

  const child = Bun.spawn(command, {
    cwd: hamiltonian,
    env: {
      ...process.env,
      LOAD_TEST_FAULT: fault,
      LOAD_TEST_PORT: String(port),
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdoutTask = collect(child.stdout, (chunk) => { stdout += chunk })
  const stderrTask = collect(child.stderr, (chunk) => { stderr += chunk })
  const root = `http://127.0.0.1:${port}`

  await waitUntil(async () => {
    if (child.exitCode !== null) throw new Error(`Hamiltonian test server exited with ${child.exitCode}`)
    try {
      const response = await fetch(root, {headers: {Accept: "text/html"}})
      return response.ok
    } catch {
      return false
    }
  }, 60_000)

  let stopped = false
  return {
    port,
    root,
    output: () => `${stdout}\n${stderr}`.trim(),
    stop: async () => {
      if (stopped) return
      stopped = true
      child.kill()
      await child.exited
      await Promise.allSettled([stdoutTask, stderrTask])
    },
  }
}

async function launchBrowser(profile: string) {
  return await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    userDataDir: profile,
    args: [
      "--disable-background-networking",
      "--no-default-browser-check",
      "--no-first-run",
    ],
  })
}

function observeStartupWorker(browser: Browser) {
  let resolve!: (handle: WorkerHandle) => void
  let settled = false
  const promise = new Promise<WorkerHandle>((ready) => { resolve = ready })

  const inspect = (target: Target) => {
    if (settled || target.type() !== TargetType.SERVICE_WORKER) return
    if (new URL(target.url()).pathname !== "/startup-service.js") return
    void target.worker()
      .then((worker) => {
        if (!worker || settled) return
        settled = true
        resolve({target, worker})
      })
      .catch(() => {})
  }

  browser.on("targetcreated", inspect)
  for (const target of browser.targets()) inspect(target)
  return {promise}
}

function startColdWitness(port: number) {
  const requests: string[] = []
  let connections = 0
  const server = Bun.serve<{source: "cold-witness"}>({
    hostname: "127.0.0.1",
    port,
    fetch(request, bunServer) {
      const pathname = new URL(request.url).pathname
      if (pathname === "/sw" && bunServer.upgrade(request, {data: {source: "cold-witness"}}))
        return
      requests.push(pathname)
      return new Response(null, {status: 503})
    },
    websocket: {
      open() {
        connections += 1
      },
      message() {},
    },
  })

  return {
    requests,
    connections: () => connections,
    stop: async () => { await server.stop(true) },
  }
}

async function waitForAcceptedCaches(page: Page) {
  await page.waitForFunction(async () => {
    const startup = await caches.open("startup")
    const imports = await caches.open("import")
    const internal = await caches.open("internal")
    return Boolean(
      await startup.match("/")
      && await startup.match("/startup-main.js")
      && await startup.match("/manifest.webmanifest")
      && await imports.match("/import/main")
      && await imports.match("/import/service")
      && await internal.match("/internal/rpc")
    )
  }, {timeout: 30_000})
}

async function waitForFailedEntries(page: Page, fault: "import-service-http-once" | "internal-invalid-once") {
  await page.waitForFunction(async (expectedFault) => {
    const state = await (await fetch("/__tests/state")).json() as {
      requests: {importService: number; internalRpc: number}
    }
    const imports = await caches.open("import")
    const internal = await caches.open("internal")
    const requestObserved = expectedFault === "import-service-http-once"
      ? state.requests.importService >= 1
      : state.requests.internalRpc >= 1
    return requestObserved
      && Boolean(await imports.match("/import/main"))
      && !await imports.match("/import/service")
      && !await internal.match("/internal/rpc")
  }, {timeout: 30_000}, fault)
}

async function retryConnectUntil(page: Page, field: "importService" | "internalRpc", count: number) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    await page.evaluate(() => navigator.serviceWorker.controller?.postMessage({type: "connect"}))
    const reached = await page.evaluate(async ({field, count}) => {
      const state = await (await fetch("/__tests/state")).json() as {
        requests: Record<string, number>
      }
      return (state.requests[field] ?? 0) >= count
    }, {field, count})
    if (reached) return
    await Bun.sleep(100)
  }
  throw new Error(`Retry did not reach ${field} request ${count}`)
}

async function waitForRequestCount(page: Page, field: "importService" | "internalRpc", count: number) {
  await page.waitForFunction(async ({field, count}) => {
    const state = await (await fetch("/__tests/state")).json() as {
      requests: Record<string, number>
    }
    return (state.requests[field] ?? 0) >= count
  }, {timeout: 30_000}, {field, count})
}

async function cacheSnapshot(page: Page): Promise<CacheSnapshot> {
  return await page.evaluate(async () => Object.fromEntries(await Promise.all(
    (await caches.keys()).sort().map(async (name) => [
      name,
      (await (await caches.open(name)).keys())
        .map((request) => new URL(request.url).pathname)
        .sort(),
    ]),
  )))
}

async function freePort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Could not allocate test port")
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function collect(stream: ReadableStream<Uint8Array>, append: (chunk: string) => void) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const {done, value} = await reader.read()
    if (done) break
    append(decoder.decode(value, {stream: true}))
  }
  append(decoder.decode())
}

async function waitUntil(check: () => boolean | Promise<boolean>, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) return
    await Bun.sleep(50)
  }
  throw new Error(`Condition was not reached within ${timeout} ms`)
}

function resolveChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    Bun.which("google-chrome"),
    Bun.which("chromium"),
  ]
  const executable = candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)))
  if (!executable) throw new Error("Chrome executable is missing; set PUPPETEER_EXECUTABLE_PATH")
  return executable
}

function withServerOutput(error: unknown, output: string) {
  const cause = error instanceof Error ? error : new Error(String(error))
  if (!output) return cause
  return new Error(`${cause.message}\n\nHamiltonian test server output:\n${output}`, {cause})
}

function countMatches(value: string, expected: string) {
  return value.split(expected).length - 1
}
