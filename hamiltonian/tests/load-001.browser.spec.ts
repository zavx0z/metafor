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

type FixtureFault =
  | "import-service-http-once"
  | "internal-invalid-once"
  | "update-build-failure-once"
type ServerMode = "production" | "update" | FixtureFault

test.serial("UPD-002 updates one module group and restarts every Window once", async () => {
  const profile = await mkdtemp(join(tmpdir(), "metafor-upd-002-"))
  const server = await startServer("update-build-failure-once")
  let browser: Browser | null = null

  try {
    browser = await launchBrowser(profile)
    const firstWorkerObserver = observeStartupWorker(browser)
    const firstPage = await browser.newPage()
    const connectionsBefore = countMatches(server.output(), "rpc/service connected")

    const firstNavigation = await firstPage.goto(server.root, {waitUntil: "load"})
    expect(firstNavigation?.status()).toBe(200)
    const firstWorker = await firstWorkerObserver.promise
    await waitForAcceptedCaches(firstPage)
    await waitUntil(() => countMatches(server.output(), "rpc/service connected") > connectionsBefore)

    const secondPage = await browser.newPage()
    const secondNavigation = await secondPage.goto(server.root, {waitUntil: "load"})
    expect(secondNavigation?.status()).toBe(200)
    expect(await secondPage.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

    const modules = ["@import/main", "@internal/rpc", "@import/main"]
    const requestsBefore = await fixtureRequests(server.root)
    const sourceBefore = await updateSources(firstPage)
    expect(sourceBefore.importMain.length).toBeGreaterThan(0)
    expect(sourceBefore.internalRpc.length).toBeGreaterThan(0)

    const navigations = {first: 0, second: 0}
    firstPage.on("framenavigated", (frame) => {
      if (frame === firstPage.mainFrame()) navigations.first += 1
    })
    secondPage.on("framenavigated", (frame) => {
      if (frame === secondPage.mainFrame()) navigations.second += 1
    })

    const legacyUrl = new URL("/code", server.root)
    legacyUrl.searchParams.set("module", "@internal/rpc")
    expect((await fetch(legacyUrl, {method: "POST"})).status).toBe(415)
    expect((await fetch(new URL("/code", server.root), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({modules: []}),
    })).status).toBe(400)
    expect((await fetch(new URL("/code", server.root), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({modules: ["@startup/main"]}),
    })).status).toBe(404)

    const failed = await requestBuild(server.root, modules)
    expect(failed.status).toBe(422)
    expect(failed.body.success).toBe(false)
    await Bun.sleep(250)
    expect(navigations).toEqual({first: 0, second: 0})
    expect(await updateSources(firstPage)).toEqual(sourceBefore)

    const nextWorkerObserver = observeStartupWorker(browser, firstWorker.target)
    const firstReload = firstPage.waitForNavigation({waitUntil: "load", timeout: 30_000})
    const secondReload = secondPage.waitForNavigation({waitUntil: "load", timeout: 30_000})
    const build = await requestBuild(server.root, modules)
    expect(build.status).toBe(200)
    expect(build.body.success).toBe(true)
    expect(build.body.results.map((result) => result.module)).toEqual([
      "@import/main",
      "@internal/rpc",
    ])

    const [firstReloadResponse, secondReloadResponse, nextWorker] = await Promise.all([
      firstReload,
      secondReload,
      nextWorkerObserver.promise,
    ])
    if (!firstReloadResponse || !secondReloadResponse)
      throw new Error("Updated Window navigation response is missing")
    expect([200, 304]).toContain(firstReloadResponse.status())
    expect([200, 304]).toContain(secondReloadResponse.status())
    expect(nextWorker.target).not.toBe(firstWorker.target)

    await waitForAcceptedCaches(firstPage)
    await waitUntil(() => countMatches(server.output(), "rpc/service connected") > connectionsBefore + 1)
    const sourceAfter = await updateSources(firstPage)
    expect(sourceAfter.importMain).not.toBe(sourceBefore.importMain)
    expect(sourceAfter.importMain).toContain("fixture @import/main 1")
    expect(sourceAfter.internalRpc).not.toBe(sourceBefore.internalRpc)
    expect(sourceAfter.internalRpc).toContain("fixture @internal/rpc 1")
    expect((await fixtureRequests(server.root)).importMain).toBeGreaterThan(requestsBefore.importMain)
    expect((await fixtureRequests(server.root)).internalRpc).toBeGreaterThan(requestsBefore.internalRpc)
    expect(navigations).toEqual({first: 1, second: 1})
  } finally {
    if (browser) await browser.close().catch(() => {})
    await server.stop().catch(() => {})
    await rm(profile, {recursive: true, force: true})
  }
})

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
      const paths = [
        "/code?module=@import/main",
        "/code?module=@import/service",
        "/code?module=@internal/rpc",
      ]
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

    const requests: string[] = []
    const serviceWorkerResponses: string[] = []
    const workerObserver = observeStartupWorker(browser)
    const page = await browser.newPage()
    const connectionsBefore = countMatches(server.output(), "rpc/service connected")

    page.on("request", (request) => {
      const url = new URL(request.url())
      requests.push(`${url.pathname}${url.search}`)
    })
    page.on("response", (response) => {
      const url = new URL(response.url())
      if (response.fromServiceWorker()) serviceWorkerResponses.push(`${url.pathname}${url.search}`)
    })

    const navigation = await page.goto(server.root, {waitUntil: "load"})
    expect(navigation?.status()).toBe(200)

    const firstWorker = await workerObserver.promise
    expect(new URL(firstWorker.target.url()).searchParams.get("module")).toBe("@startup/service")
    await waitForAcceptedCaches(page)
    await waitUntil(() => countMatches(server.output(), "rpc/service connected") > connectionsBefore)

    const documentContract = await page.evaluate(async () => ({
      scripts: Array.from(document.scripts, (script) => script.getAttribute("src")),
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      scope: (await navigator.serviceWorker.getRegistration())?.scope ?? null,
    }))

    expect(documentContract.scripts).toEqual(["/code?module=@startup/main"])
    expect(documentContract.controller).toBe(`${server.root}/code?module=@startup/service`)
    expect(documentContract.scope).toBe(`${server.root}/`)
    expect(requests).toContain("/code?module=@startup/main")
    expect(requests).toContain("/code?module=@import/main")
    expect(requests.some((path) => /hmr|_bun/i.test(path))).toBe(false)
    expect(serviceWorkerResponses).toContain("/code?module=@import/main")

    const initial = await cacheSnapshot(page)
    expect(Object.keys(initial).sort()).toEqual(["import", "internal", "startup"])
    expect(initial.startup).toEqual(expect.arrayContaining([
      "/",
      "/manifest.webmanifest",
      "/code?module=@startup/main",
    ]))
    expect(initial.startup).not.toContain("/code?module=@import/main")
    expect(initial.startup).not.toContain("/code?module=@import/service")
    expect(initial.startup).not.toContain("/code?module=@internal/rpc")
    expect(initial.import).toEqual(expect.arrayContaining([
      "/code?module=@import/main",
      "/code?module=@import/service",
    ]))
    expect(initial.internal).toContain("/code?module=@internal/rpc")
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

    const mainImportsBeforeOffline = countMatches(requests.join("\n"), "/code?module=@import/main")
    const mainResponsesBeforeOffline = countMatches(
      serviceWorkerResponses.join("\n"),
      "/code?module=@import/main",
    )
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
    await waitUntil(() =>
      countMatches(requests.join("\n"), "/code?module=@import/main") > mainImportsBeforeOffline)
    await waitUntil(() => countMatches(
      serviceWorkerResponses.join("\n"),
      "/code?module=@import/main",
    ) > mainResponsesBeforeOffline)

    const afterNested = await cacheSnapshot(page)
    expect(Object.values(afterNested).flat()).not.toContain("/net/peer")

    await browser.close()
    browser = null

    witness = startColdWitness(server.port)
    browser = await launchBrowser(profile)
    const coldWorkerObserver = observeStartupWorker(browser)
    const coldRequests: string[] = []
    const coldServiceWorkerResponses: string[] = []
    const coldPage = await browser.newPage()
    coldPage.on("request", (request) => {
      const url = new URL(request.url())
      coldRequests.push(`${url.pathname}${url.search}`)
    })
    coldPage.on("response", (response) => {
      const url = new URL(response.url())
      if (response.fromServiceWorker())
        coldServiceWorkerResponses.push(`${url.pathname}${url.search}`)
    })

    const coldNavigation = await coldPage.goto(`${server.root}/cold/restored`, {waitUntil: "load"})
    expect(coldNavigation?.status()).toBe(200)
    expect(coldNavigation?.fromServiceWorker()).toBe(true)

    const coldWorker = await coldWorkerObserver.promise
    expect(new URL(coldWorker.target.url()).searchParams.get("module")).toBe("@startup/service")
    await waitUntil(() => coldRequests.includes("/code?module=@import/main"))
    await waitUntil(() => coldServiceWorkerResponses.includes("/code?module=@import/main"))
    await waitUntil(() => witness!.connections() >= 1)
    expect(witness.requests).not.toContain("/")
    expect(witness.requests).not.toContain("/code?module=@import/main")
    expect(witness.requests).not.toContain("/code?module=@import/service")
    expect(witness.requests).not.toContain("/code?module=@internal/rpc")

    const cold = await cacheSnapshot(coldPage)
    expect(cold.startup).toEqual(expect.arrayContaining([
      "/",
      "/manifest.webmanifest",
      "/code?module=@startup/main",
    ]))
    expect(cold.import).toEqual(expect.arrayContaining([
      "/code?module=@import/main",
      "/code?module=@import/service",
    ]))
    expect(cold.internal).toContain("/code?module=@internal/rpc")
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
      expect(failed.startup).toEqual(expect.arrayContaining([
        "/",
        "/manifest.webmanifest",
        "/code?module=@startup/main",
      ]))
      expect(failed.import).toContain("/code?module=@import/main")
      expect(failed.import).not.toContain("/code?module=@import/service")
      expect(failed.internal ?? []).not.toContain("/code?module=@internal/rpc")

      await retryConnectUntil(page, scenario.failed, 2)
      await waitForAcceptedCaches(page)

      const recovered = await cacheSnapshot(page)
      expect(recovered.import).toEqual(expect.arrayContaining([
        "/code?module=@import/main",
        "/code?module=@import/service",
      ]))
      expect(recovered.internal).toContain("/code?module=@internal/rpc")
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

async function startServer(
  mode: ServerMode = "production",
): Promise<RunningServer> {
  const port = await freePort()
  const bun = Bun.which("bun") ?? process.execPath
  const command = mode === "production"
    ? [bun, `--port=${port}`, "server.ts"]
    : [bun, "tests/fixture/server.ts"]
  const fault = mode === "production" || mode === "update" ? "none" : mode
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

function observeStartupWorker(browser: Browser, excluded?: Target) {
  let resolve!: (handle: WorkerHandle) => void
  let settled = false
  const promise = new Promise<WorkerHandle>((ready) => { resolve = ready })

  const inspect = (target: Target) => {
    if (settled || target === excluded || target.type() !== TargetType.SERVICE_WORKER) return
    if (new URL(target.url()).searchParams.get("module") !== "@startup/service") return
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
      const url = new URL(request.url)
      if (url.pathname === "/sw" && bunServer.upgrade(request, {data: {source: "cold-witness"}}))
        return
      requests.push(`${url.pathname}${url.search}`)
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
      && await startup.match("/code?module=@startup/main")
      && await startup.match("/manifest.webmanifest")
      && await imports.match("/code?module=@import/main")
      && await imports.match("/code?module=@import/service")
      && await internal.match("/code?module=@internal/rpc")
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
      && Boolean(await imports.match("/code?module=@import/main"))
      && !await imports.match("/code?module=@import/service")
      && !await internal.match("/code?module=@internal/rpc")
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
        .map((request) => {
          const url = new URL(request.url)
          return `${url.pathname}${url.search}`
        })
        .sort(),
    ]),
  )))
}

async function fixtureRequests(root: string) {
  const response = await fetch(new URL("/__tests/state", root))
  if (!response.ok) throw new Error(`Fixture state returned ${response.status}`)
  const state = await response.json() as {
    requests: {importMain: number, importService: number, internalRpc: number}
  }
  return state.requests
}

async function requestBuild(root: string, modules: string[]) {
  const response = await fetch(new URL("/code", root), {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({modules}),
  })
  const body = await response.json() as {
    success: boolean
    results: Array<{module: string, success: boolean}>
  }
  return {status: response.status, body}
}

async function updateSources(page: Page) {
  return await page.evaluate(async () => ({
    importMain: await (await (await caches.open("import"))
      .match("/code?module=@import/main"))?.text() ?? "",
    internalRpc: await (await (await caches.open("internal"))
      .match("/code?module=@internal/rpc"))?.text() ?? "",
  }))
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
