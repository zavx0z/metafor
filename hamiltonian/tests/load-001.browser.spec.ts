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
const startupMainUrl = "/@hamiltonian/startup?env=main"
const startupServiceUrl = "/@hamiltonian/startup?env=service-worker"
const releaseMainUrl = "/@hamiltonian/release?env=main"
const releaseServiceUrl = "/@hamiltonian/release?env=service-worker"
const internalVisualUrl = "/@internal/visual?env=main"

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
  | "release-service-http-once"
  | "update-build-failure-once"
  | "update-fetch-failure-once"
type ServerMode = "production" | "update" | FixtureFault

test.serial("UPD-003 updates two isolated browser profiles independently", async () => {
  const firstProfile = await mkdtemp(join(tmpdir(), "metafor-upd-003-profile-a-"))
  const secondProfile = await mkdtemp(join(tmpdir(), "metafor-upd-003-profile-b-"))
  const server = await startServer("update")
  let firstBrowser: Browser | null = null
  let secondBrowser: Browser | null = null

  try {
    firstBrowser = await launchBrowser(firstProfile)
    secondBrowser = await launchBrowser(secondProfile)
    const [firstPage, secondPage] = await Promise.all([
      firstBrowser.newPage(),
      secondBrowser.newPage(),
    ])
    const [firstNavigation, secondNavigation] = await Promise.all([
      firstPage.goto(server.root, {waitUntil: "load"}),
      secondPage.goto(server.root, {waitUntil: "load"}),
    ])
    expect(firstNavigation?.status()).toBe(200)
    expect(secondNavigation?.status()).toBe(200)
    await Promise.all([
      waitForAcceptedCaches(firstPage),
      waitForAcceptedCaches(secondPage),
    ])
    await waitUntil(async () => await fixtureConnections(server.root) >= 2)

    await firstPage.evaluate(async () => {
      await (await caches.open("profile-proof")).put("/only-first-profile", new Response("first"))
    })
    expect((await cacheSnapshot(firstPage))["profile-proof"]).toEqual(["/only-first-profile"])
    expect((await cacheSnapshot(secondPage))["profile-proof"]).toBeUndefined()
    await firstPage.evaluate(async () => { await caches.delete("profile-proof") })

    const firstBefore = await updateSources(firstPage)
    const secondBefore = await updateSources(secondPage)
    const navigations = {first: 0, second: 0}
    firstPage.on("framenavigated", (frame) => {
      if (frame === firstPage.mainFrame()) navigations.first += 1
    })
    secondPage.on("framenavigated", (frame) => {
      if (frame === secondPage.mainFrame()) navigations.second += 1
    })
    const firstReload = firstPage.waitForNavigation({waitUntil: "load", timeout: 30_000})
    const secondReload = secondPage.waitForNavigation({waitUntil: "load", timeout: 30_000})

    const build = await requestBuild(server.root, [
      {name: "@internal/visual", change: "patch"},
    ])
    expect(build.status).toBe(200)
    expect(build.body.success).toBe(true)
    expect(await firstReload).not.toBeNull()
    expect(await secondReload).not.toBeNull()
    await Promise.all([
      waitForAcceptedCaches(firstPage),
      waitForAcceptedCaches(secondPage),
    ])

    const firstAfter = await updateSources(firstPage)
    const secondAfter = await updateSources(secondPage)
    expect(firstAfter.internalVisual).toContain("fixture @internal/visual 1")
    expect(secondAfter.internalVisual).toContain("fixture @internal/visual 1")
    expect(firstAfter.releaseMain).toBe(firstBefore.releaseMain)
    expect(secondAfter.releaseMain).toBe(secondBefore.releaseMain)
    expect(firstAfter.releaseService).toBe(firstBefore.releaseService)
    expect(secondAfter.releaseService).toBe(secondBefore.releaseService)
    await expectCanonicalReleaseCaches(firstPage)
    await expectCanonicalReleaseCaches(secondPage)
    expect(navigations).toEqual({first: 1, second: 1})
  } catch (error) {
    throw withServerOutput(error, server.output())
  } finally {
    if (firstBrowser) await firstBrowser.close().catch(() => {})
    if (secondBrowser) await secondBrowser.close().catch(() => {})
    await server.stop().catch(() => {})
    await rm(firstProfile, {recursive: true, force: true})
    await rm(secondProfile, {recursive: true, force: true})
  }
})

test.serial("UPD-002 updates one module group and restarts every Window once", async () => {
  const profile = await mkdtemp(join(tmpdir(), "metafor-upd-002-"))
  const server = await startServer("update-build-failure-once")
  let browser: Browser | null = null

  try {
    browser = await launchBrowser(profile)
    const firstWorkerObserver = observeStartupWorker(browser)
    const firstPage = await browser.newPage()
    const startupDiagnostics: string[] = []
    firstPage.on("console", (message) => startupDiagnostics.push(`console:${message.type()}:${message.text()}`))
    firstPage.on("pageerror", (error) => startupDiagnostics.push(`pageerror:${String(error)}`))
    firstPage.on("requestfailed", (request) =>
      startupDiagnostics.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? "unknown"}`))
    const connectionsBefore = countMatches(server.output(), "Service Worker подключён")

    const firstNavigation = await firstPage.goto(server.root, {waitUntil: "load"})
    expect(firstNavigation?.status()).toBe(200)
    const firstWorker = await Promise.race([
      firstWorkerObserver.promise,
      Bun.sleep(15_000).then(async () => {
        const state = await firstPage.evaluate(async () => ({
          controller: navigator.serviceWorker.controller?.scriptURL ?? null,
          registrations: (await navigator.serviceWorker.getRegistrations())
            .map((registration) => ({
              active: registration.active?.scriptURL ?? null,
              installing: registration.installing?.scriptURL ?? null,
              waiting: registration.waiting?.scriptURL ?? null,
            })),
        })).catch((error: unknown) => ({evaluationError: String(error)}))
        throw new Error(`Startup Worker was not created: ${JSON.stringify({startupDiagnostics, state})}`)
      }),
    ])
    await waitForAcceptedCaches(firstPage)
    await waitUntil(() =>
      countMatches(server.output(), "Service Worker подключён") > connectionsBefore)

    const secondPage = await browser.newPage()
    const secondNavigation = await secondPage.goto(server.root, {waitUntil: "load"})
    expect(secondNavigation?.status()).toBe(200)
    expect(await secondPage.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

    const packages = [
      {name: "@hamiltonian/release", change: "patch"},
      {name: "@internal/visual", change: "patch"},
      {name: "@hamiltonian/release", change: "patch"},
    ] as const
    const requestsBefore = await fixtureRequests(server.root)
    const sourceBefore = await updateSources(firstPage)
    expect(sourceBefore.releaseMain.length).toBeGreaterThan(0)
    expect(sourceBefore.releaseService.length).toBeGreaterThan(0)
    expect(sourceBefore.internalVisual.length).toBeGreaterThan(0)

    const navigations = {first: 0, second: 0}
    firstPage.on("framenavigated", (frame) => {
      if (frame === firstPage.mainFrame()) navigations.first += 1
    })
    secondPage.on("framenavigated", (frame) => {
      if (frame === secondPage.mainFrame()) navigations.second += 1
    })

    const legacyUrl = new URL("/code", server.root)
    legacyUrl.searchParams.set("module", "@hamiltonian/release")
    expect((await fetch(legacyUrl, {method: "POST"})).status).toBe(415)
    expect((await fetch(new URL("/code", server.root), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({packages: []}),
    })).status).toBe(400)
    expect((await fetch(new URL("/code", server.root), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({packages: [{name: "@hamiltonian/startup", change: "patch"}]}),
    })).status).toBe(404)

    const failed = await requestBuild(server.root, packages)
    expect(failed.status).toBe(422)
    expect(failed.body.success).toBe(false)
    await Bun.sleep(250)
    expect(navigations).toEqual({first: 0, second: 0})
    expect(await updateSources(firstPage)).toEqual(sourceBefore)

    const nextWorkerObserver = observeStartupWorker(browser, firstWorker.target)
    const firstReload = firstPage.waitForNavigation({waitUntil: "load", timeout: 30_000})
    const secondReload = secondPage.waitForNavigation({waitUntil: "load", timeout: 30_000})
    const build = await requestBuild(server.root, packages)
    expect(build.status).toBe(200)
    expect(build.body.success).toBe(true)
    expect(build.body.results.map((result) => result.module)).toEqual([
      "@hamiltonian/release",
      "@hamiltonian/release",
      "@internal/visual",
    ])
    expect(build.body.results.map((result) => result.version)).toEqual(
      failed.body.results.map((result) => result.version),
    )

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
    await waitUntil(() =>
      countMatches(server.output(), "Service Worker подключён") > connectionsBefore + 1)
    const sourceAfter = await updateSources(firstPage)
    expect(sourceAfter.releaseMain).not.toBe(sourceBefore.releaseMain)
    expect(sourceAfter.releaseMain).toContain("fixture @hamiltonian/release 1")
    expect(sourceAfter.releaseService).not.toBe(sourceBefore.releaseService)
    expect(sourceAfter.releaseService).toContain("fixture @hamiltonian/release 1")
    expect(sourceAfter.internalVisual).not.toBe(sourceBefore.internalVisual)
    expect(sourceAfter.internalVisual).toContain("fixture @internal/visual 1")
    const requestsAfter = await fixtureRequests(server.root)
    expect(requestsAfter.releaseMain).toBeGreaterThan(requestsBefore.releaseMain)
    expect(requestsAfter.releaseService).toBeGreaterThan(requestsBefore.releaseService)
    expect(requestsAfter.internalVisual).toBeGreaterThan(requestsBefore.internalVisual)
    await expectCanonicalReleaseCaches(firstPage)
    expect(navigations).toEqual({first: 1, second: 1})

    await browser.close()
    browser = null
    const disconnectedBuild = await requestBuild(server.root, [
      {name: "@hamiltonian/release", change: "patch"},
      {name: "@hamiltonian/release", change: "patch"},
      {name: "@internal/visual", change: "patch"},
    ])
    expect(disconnectedBuild.status).toBe(200)
    expect(disconnectedBuild.body.results.map((result) => result.previousVersion)).toEqual(
      build.body.results.map((result) => result.version),
    )

    browser = await launchBrowser(profile)
    const restoredPage = await browser.newPage()
    let restoredNavigations = 0
    restoredPage.on("framenavigated", (frame) => {
      if (frame === restoredPage.mainFrame()) restoredNavigations += 1
    })
    const restoredNavigation = await restoredPage.goto(server.root, {waitUntil: "load"})
    expect(restoredNavigation?.status()).toBe(200)
    await waitUntil(async () => {
      try {
        const sources = await updateSources(restoredPage)
        return sources.releaseMain.includes("fixture @hamiltonian/release 2")
          && sources.releaseService.includes("fixture @hamiltonian/release 2")
          && sources.internalVisual.includes("fixture @internal/visual 2")
      } catch {
        return false
      }
    }, 30_000)
    await waitForAcceptedCaches(restoredPage)
    await expectCanonicalReleaseCaches(restoredPage)
    expect(restoredNavigations).toBeGreaterThanOrEqual(2)
  } catch (error) {
    throw withServerOutput(error, server.output())
  } finally {
    if (browser) await browser.close().catch(() => {})
    await server.stop().catch(() => {})
    await rm(profile, {recursive: true, force: true})
  }
})

test.serial("UPD-003 keeps canonical caches unchanged and resumes one fixed transaction", async () => {
  const profile = await mkdtemp(join(tmpdir(), "metafor-upd-002-atomic-"))
  const server = await startServer("update-fetch-failure-once")
  let browser: Browser | null = null

  try {
    browser = await launchBrowser(profile)
    const page = await browser.newPage()
    const navigation = await page.goto(server.root, {waitUntil: "load"})
    expect(navigation?.status()).toBe(200)
    await waitForAcceptedCaches(page)
    const sourceBefore = await updateSources(page)
    let navigations = 0
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1
    })

    const reload = page.waitForNavigation({waitUntil: "load", timeout: 30_000})
    const build = await requestBuild(server.root, [
      {name: "@hamiltonian/release", change: "patch"},
      {name: "@hamiltonian/release", change: "patch"},
    ])
    expect(build.status).toBe(200)

    await Bun.sleep(300)
    expect(navigations).toBe(0)
    expect(await updateSources(page)).toEqual(sourceBefore)
    await waitUntil(async () => {
      const snapshot = await cacheSnapshot(page)
      return snapshot.transaction?.includes("/code?state=active") ?? false
    })
    const interrupted = await cacheSnapshot(page)
    expect(Object.keys(interrupted).filter((name) => name === "transaction")).toEqual([
      "transaction",
    ])
    expect(Object.keys(interrupted).every((name) => !name.includes(":release:"))).toBe(true)

    expect(await reload).not.toBeNull()
    await waitUntil(async () => {
      try {
        const sources = await updateSources(page)
        return sources.releaseMain.includes("fixture @hamiltonian/release 1")
          && sources.releaseService.includes("fixture @hamiltonian/release 1")
      } catch {
        return false
      }
    }, 30_000)
    await expectCanonicalReleaseCaches(page)
    expect((await cacheSnapshot(page)).transaction).toBeUndefined()
    expect(navigations).toBe(1)
  } catch (error) {
    throw withServerOutput(error, server.output())
  } finally {
    if (browser) await browser.close().catch(() => {})
    await server.stop().catch(() => {})
    await rm(profile, {recursive: true, force: true})
  }
})

test.serial("UPD-002 reconnects after a clean server-side WebSocket close", async () => {
  const profile = await mkdtemp(join(tmpdir(), "metafor-upd-002-reconnect-"))
  const server = await startServer("update")
  let browser: Browser | null = null

  try {
    browser = await launchBrowser(profile)
    const page = await browser.newPage()
    const navigation = await page.goto(server.root, {waitUntil: "load"})
    expect(navigation?.status()).toBe(200)
    await waitForAcceptedCaches(page)
    await waitUntil(async () => await fixtureConnections(server.root) === 1)
    await waitUntil(() => server.output().includes("состояние browser cache сверено"))
    await Bun.sleep(250)

    const close = await fetch(new URL("/__tests/rpc/close", server.root), {method: "POST"})
    expect(close.status).toBe(204)
    await waitUntil(async () => await fixtureConnections(server.root) >= 2)
  } catch (error) {
    throw withServerOutput(error, server.output())
  } finally {
    if (browser) await browser.close().catch(() => {})
    await server.stop().catch(() => {})
    await rm(profile, {recursive: true, force: true})
  }
})

test.serial("UPD-003 discards an empty transaction without reloading a Window", async () => {
  const profile = await mkdtemp(join(tmpdir(), "metafor-upd-003-empty-transaction-"))
  const server = await startServer("update")
  let browser: Browser | null = null

  try {
    browser = await launchBrowser(profile)
    const page = await browser.newPage()
    const navigation = await page.goto(server.root, {waitUntil: "load"})
    expect(navigation?.status()).toBe(200)
    await waitForAcceptedCaches(page)
    await waitUntil(() => server.output().includes("состояние browser cache сверено"))
    await Bun.sleep(250)

    let navigations = 0
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1
    })
    await page.evaluate(async () => { await caches.open("transaction") })
    expect((await cacheSnapshot(page)).transaction).toEqual([])

    const connections = await fixtureConnections(server.root)
    const close = await fetch(new URL("/__tests/rpc/close", server.root), {method: "POST"})
    expect(close.status).toBe(204)
    await waitUntil(async () => await fixtureConnections(server.root) > connections)
    await waitUntil(async () => {
      try {
        return (await cacheSnapshot(page)).transaction === undefined
      } catch {
        return false
      }
    })
    await Bun.sleep(250)
    await expectCanonicalReleaseCaches(page)
    expect(navigations).toBe(0)
  } catch (error) {
    throw withServerOutput(error, server.output())
  } finally {
    if (browser) await browser.close().catch(() => {})
    await server.stop().catch(() => {})
    await rm(profile, {recursive: true, force: true})
  }
})

test.serial("UPD-003 removes legacy active metadata and UUID caches during synchronization", async () => {
  const profile = await mkdtemp(join(tmpdir(), "metafor-upd-002-migrate-cache-"))
  const server = await startServer("update")
  let browser: Browser | null = null

  try {
    browser = await launchBrowser(profile)
    const page = await browser.newPage()
    const navigation = await page.goto(server.root, {waitUntil: "load"})
    expect(navigation?.status()).toBe(200)
    await waitForAcceptedCaches(page)
    await waitUntil(async () => await fixtureConnections(server.root) === 1)

    await page.evaluate(async () => {
      const state = await (await fetch("/code", {cache: "no-store"})).json() as {
        packages: Array<{
          name: string
          env: "main" | "worker" | "service-worker"
          version: string
          sha256: string
          size: number
        }>
      }
      const visual = state.packages.find(({name}) => name === "@internal/visual")
      if (!visual) throw new Error("Visual release state is missing")
      const stable = `/@internal/visual?env=${visual.env}`
      const endpoint = `${stable}&version=${visual.version}`
      const response = await fetch(endpoint, {cache: "no-store"})
      if (!response.ok) throw new Error(`Visual artifact returned ${response.status}`)

      const legacyStorage = "internal:release:legacy-proof"
      await (await caches.open(legacyStorage)).put(endpoint, response)
      await (await caches.open("internal")).delete(stable)
      await (await caches.open("internal")).delete(endpoint)
      await (await caches.open("release")).put(
        "/code?state=active",
        Response.json({
          packages: {
            [stable]: {...visual, storage: legacyStorage},
          },
          restart: [],
        }),
      )
    })

    expect(Object.keys(await cacheSnapshot(page))).toContain("internal:release:legacy-proof")
    const close = await fetch(new URL("/__tests/rpc/close", server.root), {method: "POST"})
    expect(close.status).toBe(204)
    await waitUntil(async () => await fixtureConnections(server.root) >= 2)
    await waitForAcceptedCaches(page)
    await waitUntil(async () => {
      try {
        return Object.keys(await cacheSnapshot(page)).every((name) => !name.includes(":release:"))
      } catch {
        return false
      }
    })
    await expectCanonicalReleaseCaches(page)
  } catch (error) {
    throw withServerOutput(error, server.output())
  } finally {
    if (browser) await browser.close().catch(() => {})
    await server.stop().catch(() => {})
    await rm(profile, {recursive: true, force: true})
  }
})

test.serial("UPD-003 resumes after canonical put and commits a removal-only delta", async () => {
  const profile = await mkdtemp(join(tmpdir(), "metafor-upd-003-remove-recovery-"))
  const server = await startServer("update")
  let browser: Browser | null = null

  try {
    browser = await launchBrowser(profile)
    const page = await browser.newPage()
    const navigation = await page.goto(server.root, {waitUntil: "load"})
    expect(navigation?.status()).toBe(200)
    await waitForAcceptedCaches(page)
    await waitUntil(async () => await fixtureConnections(server.root) === 1)
    await waitUntil(() => server.output().includes("состояние browser cache сверено"))
    await Bun.sleep(250)

    await page.evaluate(async () => {
      const state = await (await fetch("/code", {cache: "no-store"})).json() as {
        packages: Array<{
          name: string
          env: "main" | "worker" | "service-worker"
          version: string
          sha256: string
          size: number
        }>
      }
      const current = state.packages.find(({name}) => name === "@hamiltonian/release")
      if (!current) throw new Error("Release main state is missing")
      const cache = await caches.open("release")
      const currentUrl = `/@hamiltonian/release?env=main&version=${current.version}`
      const currentResponse = await cache.match(currentUrl)
      if (!currentResponse) throw new Error("Release main exact response is missing")
      const bytes = await currentResponse.clone().arrayBuffer()
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")
      const staleVersion = "0.0.1"
      const headers = new Headers(currentResponse.headers)
      headers.set("X-Package-Version", staleVersion)
      headers.set("X-Package-SHA256", digest)
      headers.set("X-Package-Size", String(bytes.byteLength))
      await cache.put(
        `/@hamiltonian/release?env=main&version=${staleVersion}`,
        new Response(bytes, {headers}),
      )

      await (await caches.open("transaction")).put(
        "/code?state=active",
        Response.json({type: "release-delta", update: [current], remove: []}),
      )
    })

    const interrupted = await cacheSnapshot(page)
    expect(interrupted.transaction).toEqual(["/code?state=active"])
    expect((interrupted.release ?? []).filter((path) =>
      new URL(path, "http://cache.test").pathname === "/@hamiltonian/release")).toHaveLength(3)

    let navigations = 0
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1
    })
    const reload = page.waitForNavigation({waitUntil: "load", timeout: 30_000})
    const close = await fetch(new URL("/__tests/rpc/close", server.root), {method: "POST"})
    expect(close.status).toBe(204)
    expect(await reload).not.toBeNull()
    await waitForAcceptedCaches(page)
    await expectCanonicalReleaseCaches(page)
    expect(navigations).toBe(1)
    expect(server.output()).toContain('version: "0.0.1"')
  } catch (error) {
    throw withServerOutput(error, server.output())
  } finally {
    if (browser) await browser.close().catch(() => {})
    await server.stop().catch(() => {})
    await rm(profile, {recursive: true, force: true})
  }
})

test.serial("LOAD-001 restores accepted startup and release from caches", async () => {
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

    const routeProbes = await probe.evaluate(async (paths) => {
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
        "/release-main.js",
        "/release-service.js",
        "/rpc-service.js",
      ].map(async (path) => ({path, status: (await fetch(path)).status})))
      const queryArtifact = await fetch("/code?module=@hamiltonian/release")
      const serverEnvironment = await fetch("/@hamiltonian/release?env=server")
      const releaseState = await (await fetch("/code")).json() as {
        packages: Array<{name: string, env: string}>
      }
      return {
        current,
        legacy,
        queryArtifactStatus: queryArtifact.status,
        serverEnvironmentStatus: serverEnvironment.status,
        releaseEnvironments: releaseState.packages
          .filter(({name}) => name === "@hamiltonian/release")
          .map(({env}) => env),
      }
    }, [releaseMainUrl, releaseServiceUrl, internalVisualUrl])

    for (const route of routeProbes.current) {
      expect(route.firstStatus).toBe(200)
      expect(route.secondStatus).toBe(200)
      expect(route.firstBody.length).toBeGreaterThan(0)
      expect(route.secondBody).toBe(route.firstBody)
      expect(route.type).toStartWith("text/javascript")
    }
    expect(routeProbes.queryArtifactStatus).toBe(404)
    expect(routeProbes.serverEnvironmentStatus).toBe(404)
    expect(routeProbes.releaseEnvironments).toEqual(["main", "service-worker"])
    for (const route of routeProbes.legacy) expect(route.status).toBe(404)
    await probeContext.close()

    const requests: string[] = []
    const serviceWorkerResponses: string[] = []
    const workerObserver = observeStartupWorker(browser)
    const page = await browser.newPage()

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
    expect(`${new URL(firstWorker.target.url()).pathname}${new URL(firstWorker.target.url()).search}`)
      .toBe(startupServiceUrl)
    await waitForAcceptedCaches(page)

    const documentContract = await page.evaluate(async () => ({
      scripts: Array.from(document.scripts, (script) => script.getAttribute("src")),
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      scope: (await navigator.serviceWorker.getRegistration())?.scope ?? null,
    }))

    expect(documentContract.scripts).toEqual([null, startupMainUrl])
    expect(documentContract.controller).toBe(`${server.root}${startupServiceUrl}`)
    expect(documentContract.scope).toBe(`${server.root}/`)
    expect(requests).toContain(startupMainUrl)
    expect(requests).toContain(releaseMainUrl)
    expect(requests.some((path) => /hmr|_bun/i.test(path))).toBe(false)

    const initial = await cacheSnapshot(page)
    expect(Object.keys(initial)).toEqual(expect.arrayContaining(["internal", "release", "startup"]))
    expect(initial.startup).toEqual(expect.arrayContaining([
      "/",
      "/manifest.webmanifest",
      startupMainUrl,
    ]))
    expect(initial.startup).not.toContain(releaseMainUrl)
    expect(initial.startup).not.toContain(releaseServiceUrl)
    expect(initial.startup).not.toContain(internalVisualUrl)
    expect(hasCachedSlot(initial, "release", "@hamiltonian/release", "main")).toBe(true)
    expect(hasCachedSlot(initial, "release", "@hamiltonian/release", "service-worker")).toBe(true)
    expect(initial.release).not.toContain(releaseMainUrl)
    expect(initial.release).not.toContain(releaseServiceUrl)
    expect(initial.release).not.toContain(internalVisualUrl)
    expect(hasCachedPackage(initial, "internal", "@internal/visual")).toBe(true)
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

    const mainReleaseRequestsBeforeOffline = countMatches(requests.join("\n"), releaseMainUrl)
    const mainResponsesBeforeOffline = countMatches(
      serviceWorkerResponses.join("\n"),
      releaseMainUrl,
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
      countMatches(requests.join("\n"), releaseMainUrl) > mainReleaseRequestsBeforeOffline)
    await waitUntil(() => countMatches(
      serviceWorkerResponses.join("\n"),
      releaseMainUrl,
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
    expect(`${new URL(coldWorker.target.url()).pathname}${new URL(coldWorker.target.url()).search}`)
      .toBe(startupServiceUrl)
    await waitUntil(() => coldRequests.includes(releaseMainUrl))
    await waitUntil(() => coldServiceWorkerResponses.includes(releaseMainUrl))
    await waitUntil(() => witness!.connections() >= 1)
    expect(witness.requests).not.toContain("/")
    expect(witness.requests).not.toContain(releaseMainUrl)
    expect(witness.requests).not.toContain(releaseServiceUrl)
    expect(witness.requests).not.toContain(internalVisualUrl)

    const cold = await cacheSnapshot(coldPage)
    expect(cold.startup).toEqual(expect.arrayContaining([
      "/",
      "/manifest.webmanifest",
      startupMainUrl,
    ]))
    expect(hasCachedSlot(cold, "release", "@hamiltonian/release", "main")).toBe(true)
    expect(hasCachedSlot(cold, "release", "@hamiltonian/release", "service-worker")).toBe(true)
    expect(cold.release).not.toContain(releaseMainUrl)
    expect(cold.release).not.toContain(releaseServiceUrl)
    expect(hasCachedPackage(cold, "internal", "@internal/visual")).toBe(true)
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

test.serial("LOAD-001 rejects a failed release artifact and retries its exact entry", async () => {
  for (const scenario of [
    {fault: "release-service-http-once", failed: "releaseService"},
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
        startupMainUrl,
      ]))
      expect(hasCachedSlot(failed, "release", "@hamiltonian/release", "main")).toBe(true)
      expect(hasCachedSlot(failed, "release", "@hamiltonian/release", "service-worker")).toBe(false)
      expect(hasCachedSlot(failed, "internal", "@internal/visual", "main")).toBe(true)

      await retryConnectUntil(page, scenario.failed, 2)
      await waitForAcceptedCaches(page)

      const recovered = await cacheSnapshot(page)
      expect(hasCachedSlot(recovered, "release", "@hamiltonian/release", "main")).toBe(true)
      expect(hasCachedSlot(recovered, "release", "@hamiltonian/release", "service-worker")).toBe(true)
      expect(hasCachedSlot(recovered, "internal", "@internal/visual", "main")).toBe(true)
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
    ? [
      bun,
      "--conditions=hamiltonian:server",
      "--conditions=internal:server",
      `--port=${port}`,
      "server.ts",
    ]
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
      NODE_ENV: mode === "production" ? "production" : "development",
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
    const url = new URL(target.url())
    if (`${url.pathname}${url.search}` !== startupServiceUrl) return
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
  try {
    await waitUntil(async () => {
      try {
        return await page.evaluate(async () => {
          const startup = await caches.open("startup")
          const releases = await caches.open("release")
          const internal = await caches.open("internal")
          const cachedPackage = async (
            name: string,
            env: "main" | "worker" | "service-worker",
            cache: Cache,
          ) => {
            const matches = (await cache.keys()).filter((request) => {
              const url = new URL(request.url)
              return url.pathname === `/${name}`
                && url.searchParams.get("env") === env
                && /^\d+\.\d+\.\d+$/.test(url.searchParams.get("version") ?? "")
                && [...url.searchParams.keys()].join(",") === "env,version"
            })
            const match = matches[0]
            return matches.length === 1 && match
              ? await cache.match(match, {ignoreVary: true})
              : undefined
          }
          const [releaseMain, releaseService, visual] = await Promise.all([
            cachedPackage("@hamiltonian/release", "main", releases),
            cachedPackage("@hamiltonian/release", "service-worker", releases),
            cachedPackage("@internal/visual", "main", internal),
          ])
          return Boolean(
            await startup.match("/")
            && await startup.match("/@hamiltonian/startup?env=main")
            && await startup.match("/manifest.webmanifest")
            && releaseMain
            && releaseService
            && visual
            && !(await caches.keys()).includes("transaction")
            && navigator.serviceWorker.controller
          )
        })
      } catch {
        return false
      }
    }, 30_000)
  } catch (error) {
    throw new Error(`Browser caches did not become ready: ${JSON.stringify(await cacheSnapshot(page))}`, {
      cause: error,
    })
  }
}

async function waitForFailedEntries(page: Page, fault: "release-service-http-once") {
  await page.waitForFunction(async (expectedFault) => {
    const state = await (await fetch("/__tests/state")).json() as {
      requests: {releaseService: number}
    }
    const releases = await caches.open("release")
    const requestObserved = expectedFault === "release-service-http-once"
      && state.requests.releaseService >= 1
    return requestObserved
      && (await releases.keys()).some((request) => {
        const url = new URL(request.url)
        return url.pathname === "/@hamiltonian/release"
          && url.searchParams.get("env") === "main"
          && url.searchParams.has("version")
      })
      && !(await releases.keys()).some((request) => {
        const url = new URL(request.url)
        return url.pathname === "/@hamiltonian/release"
          && url.searchParams.get("env") === "service-worker"
          && url.searchParams.has("version")
      })
  }, {timeout: 30_000}, fault)
}

async function retryConnectUntil(page: Page, field: "releaseService", count: number) {
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

async function waitForRequestCount(page: Page, field: "releaseService", count: number) {
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

function hasCachedPackage(snapshot: CacheSnapshot, owner: string, name: string) {
  return snapshot[owner]?.some((path) =>
    new URL(path, "http://cache.test").pathname === `/${name}`) ?? false
}

function hasCachedSlot(
  snapshot: CacheSnapshot,
  owner: string,
  name: string,
  env: "main" | "worker" | "service-worker",
) {
  return snapshot[owner]?.some((path) => {
    const url = new URL(path, "http://cache.test")
    return url.pathname === `/${name}`
      && url.searchParams.get("env") === env
      && /^\d+\.\d+\.\d+$/.test(url.searchParams.get("version") ?? "")
      && [...url.searchParams.keys()].join(",") === "env,version"
  }) ?? false
}

async function expectCanonicalReleaseCaches(page: Page) {
  const snapshot = await cacheSnapshot(page)

  expect(Object.keys(snapshot).sort()).toEqual(["internal", "release", "startup"])
  for (const {name, env, owner} of [
    {name: "@hamiltonian/release", env: "main", owner: "release"},
    {name: "@hamiltonian/release", env: "service-worker", owner: "release"},
    {name: "@internal/visual", env: "main", owner: "internal"},
  ] as const) {
    const packageEntries = snapshot[owner]?.filter((path) => {
      const url = new URL(path, "http://cache.test")
      return url.pathname === `/${name}` && url.searchParams.get("env") === env
    })
    expect(packageEntries).toHaveLength(1)
    expect(packageEntries?.[0]).toMatch(
      new RegExp(`^/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?env=${env}&version=\\d+\\.\\d+\\.\\d+$`),
    )
  }
  expect(Object.values(snapshot).flat()).not.toContain("/code?state=active")
  expect(Object.values(snapshot).flat()).not.toContain("/code?state=pending")
}

async function fixtureRequests(root: string) {
  const response = await fetch(new URL("/__tests/state", root))
  if (!response.ok) throw new Error(`Fixture state returned ${response.status}`)
  const state = await response.json() as {
    requests: {internalVisual: number, releaseMain: number, releaseService: number}
  }
  return state.requests
}

async function fixtureConnections(root: string) {
  const response = await fetch(new URL("/__tests/state", root))
  if (!response.ok) throw new Error(`Fixture state returned ${response.status}`)
  const state = await response.json() as {connections: number}
  return state.connections
}

async function requestBuild(
  root: string,
  packages: readonly {name: string, change: "patch" | "minor" | "major"}[],
) {
  const response = await fetch(new URL("/code", root), {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({packages}),
  })
  const body = await response.json() as {
    success: boolean
    results: Array<{
      module: string
      success: boolean
      previousVersion: string
      version: string
    }>
  }
  return {status: response.status, body}
}

async function updateSources(page: Page) {
  return await page.evaluate(async () => {
    const source = async (
      name: string,
      env: "main" | "worker" | "service-worker",
      owner: string,
    ) => {
      const cache = await caches.open(owner)
      const matches = (await cache.keys()).filter((request) => {
        const url = new URL(request.url)
        return url.pathname === `/${name}`
          && url.searchParams.get("env") === env
          && /^\d+\.\d+\.\d+$/.test(url.searchParams.get("version") ?? "")
      })
      if (matches.length !== 1)
        throw new Error(`Package slot ${name}:${env} has ${matches.length} exact entries`)
      const match = matches[0]
      if (!match) throw new Error(`Package slot ${name}:${env} has no exact entry`)
      const response = await cache.match(match, {ignoreVary: true})
      return await response?.text() ?? ""
    }

    return {
      internalVisual: await source("@internal/visual", "main", "internal"),
      releaseMain: await source("@hamiltonian/release", "main", "release"),
      releaseService: await source("@hamiltonian/release", "service-worker", "release"),
    }
  })
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
