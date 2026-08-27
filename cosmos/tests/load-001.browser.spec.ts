import {afterAll, beforeAll, expect, setDefaultTimeout, test} from "bun:test"
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
import {releaseWorkspaceState} from "./fixture/workspace-state"

setDefaultTimeout(180_000)

const cosmos = fileURLToPath(new URL("../", import.meta.url))
const chrome = resolveChrome()
const startupMainUrl = "/@cosmos/startup?env=main"
const startupServiceUrl = "/@cosmos/startup?env=service"
const releaseMainUrl = "/@cosmos/release?env=main"
const releaseServiceUrl = "/@cosmos/release?env=service"
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
type ServerMode = "production-fixture" | "update" | FixtureFault

interface FixtureArtifact {
  name: "@cosmos/startup" | "@cosmos/release" | "@internal/visual"
  env: "main" | "service"
  version: string
  path: string
}

let fixtureDirectory = ""
let fixtureArtifacts: FixtureArtifact[] = []
let workingState: Awaited<ReturnType<typeof releaseWorkspaceState>> = {}

beforeAll(async () => {
  workingState = await releaseWorkspaceState(cosmos)
  fixtureDirectory = await mkdtemp(join(tmpdir(), "metafor-load-artifacts-"))
  const [startup, release, visual] = await Promise.all([
    Bun.file(join(cosmos, "startup/package.json")).json() as Promise<{version: string}>,
    Bun.file(join(cosmos, "release/package.json")).json() as Promise<{version: string}>,
    Bun.file(join(cosmos, "internal/visual/package.json")).json() as Promise<{version: string}>,
  ])
  const plans = [
    {name: "@cosmos/startup", env: "main", version: startup.version},
    {name: "@cosmos/startup", env: "service", version: startup.version},
    {name: "@cosmos/release", env: "main", version: release.version},
    {name: "@cosmos/release", env: "service", version: release.version},
    {name: "@internal/visual", env: "main", version: visual.version},
  ] as const
  const results = await buildBrowserFixtures(plans.map((plan, index) => ({
    plan,
    path: join(fixtureDirectory, `${index}.js`),
  })))
  const failure = results.find(({result}) => !result.success)
  if (failure) throw new Error(
    `Browser fixture build failed for ${failure.plan.name}:${failure.plan.env}: ${failure.result.stderr}`,
  )
  fixtureArtifacts = results.map(({plan, path}) => ({...plan, path}))
})

afterAll(async () => {
  if (fixtureDirectory !== "") await rm(fixtureDirectory, {recursive: true, force: true})
  expect(existsSync(fixtureDirectory)).toBeFalse()
  expect(await releaseWorkspaceState(cosmos)).toEqual(workingState)
})

async function buildBrowserFixtures(
  fixtures: Array<{
    plan: Pick<FixtureArtifact, "name" | "env" | "version">
    path: string
  }>,
) {
  const input = fixtures.map(({plan, path}) => ({
    name: plan.name,
    env: plan.env,
    path,
  }))
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "--conditions=cosmos:server",
    "--conditions=internal:server",
    "-e",
    `import {buildPackage} from "./release/server"
const plans=${JSON.stringify(input)}
console.log(JSON.stringify(await Promise.all(plans.map(async ({name,env,path})=>({name,env,path,result:await buildPackage(name,{env,artifact:path})})))))`,
  ], {
    cwd: cosmos,
    env: {...process.env, NODE_ENV: "development"},
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Browser fixture build process failed: ${stderr || stdout}`)
  const line = stdout.trim().split("\n").at(-1)
  if (!line) throw new Error(`Browser fixture build result is missing: ${stderr}`)
  const results = JSON.parse(line) as Array<{
    name: FixtureArtifact["name"]
    env: FixtureArtifact["env"]
    path: string
    result: {success: boolean, stderr: string}
  }>
  return results.map(({name, env, path, result}) => ({
    plan: fixtures.find((fixture) =>
      fixture.plan.name === name && fixture.plan.env === env && fixture.path === path)!.plan,
    path,
    result,
  }))
}

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
  const browserDiagnostics: string[] = []

  try {
    browser = await launchBrowser(profile)
    const firstWorkerObserver = observeStartupWorker(browser, browserDiagnostics)
    const firstPage = await browser.newPage()
    const startupDiagnostics: string[] = []
    firstPage.on("console", (message) => startupDiagnostics.push(`console:${message.type()}:${message.text()}`))
    firstPage.on("pageerror", (error) => startupDiagnostics.push(`pageerror:${String(error)}`))
    firstPage.on("requestfailed", (request) =>
      startupDiagnostics.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? "unknown"}`))
    const connectionsBefore = countMatches(server.output(), "подписка release service создана")

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
      countMatches(server.output(), "подписка release service создана") > connectionsBefore)

    const secondPage = await browser.newPage()
    const secondNavigation = await secondPage.goto(server.root, {waitUntil: "load"})
    expect(secondNavigation?.status()).toBe(200)
    expect(await secondPage.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

    const packages = [
      {name: "@cosmos/release", change: "patch"},
      {name: "@internal/visual", change: "patch"},
      {name: "@cosmos/release", change: "patch"},
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
    legacyUrl.searchParams.set("module", "@cosmos/release")
    expect((await fetch(legacyUrl, {method: "POST"})).status).toBe(415)
    expect((await fetch(new URL("/code", server.root), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({packages: []}),
    })).status).toBe(400)
    expect((await fetch(new URL("/code", server.root), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({packages: [{name: "@cosmos/startup", change: "patch"}]}),
    })).status).toBe(404)

    const failed = await requestBuild(server.root, packages)
    expect(failed.status).toBe(422)
    expect(failed.body.success).toBe(false)
    await Bun.sleep(250)
    expect(navigations).toEqual({first: 0, second: 0})
    expect(await updateSources(firstPage)).toEqual(sourceBefore)

    const firstReload = firstPage.waitForNavigation({waitUntil: "load", timeout: 30_000})
    const secondReload = secondPage.waitForNavigation({waitUntil: "load", timeout: 30_000})
    const build = await requestBuild(server.root, packages)
    expect(build.status).toBe(200)
    expect(build.body.success).toBe(true)
    expect(build.body.results.map((result) => result.module)).toEqual([
      "@cosmos/release",
      "@cosmos/release",
      "@internal/visual",
    ])
    expect(build.body.results.map((result) => result.version)).toEqual(
      failed.body.results.map((result) => result.version),
    )

    const [firstReloadResponse, secondReloadResponse] = await Promise.all([
      firstReload,
      secondReload,
    ])
    if (!firstReloadResponse || !secondReloadResponse)
      throw new Error("Updated Window navigation response is missing")
    expect([200, 304]).toContain(firstReloadResponse.status())
    expect([200, 304]).toContain(secondReloadResponse.status())
    const workerState = await firstPage.evaluate(async () => ({
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      registrations: (await navigator.serviceWorker.getRegistrations()).map((registration) => ({
        active: registration.active?.scriptURL ?? null,
        scope: registration.scope,
      })),
    }))
    expect(workerState).toEqual({
      controller: `${server.root}${startupServiceUrl}`,
      registrations: [{
        active: `${server.root}${startupServiceUrl}`,
        scope: `${server.root}/`,
      }],
    })
    expect(browser.targets()).toContain(firstWorker.target)

    await waitForAcceptedCaches(firstPage)
    await waitUntil(() =>
      countMatches(server.output(), "подписка release service создана") > connectionsBefore + 1)
    const sourceAfter = await updateSources(firstPage)
    expect(sourceAfter.releaseMain).not.toBe(sourceBefore.releaseMain)
    expect(sourceAfter.releaseMain).toContain("fixture @cosmos/release 1")
    expect(sourceAfter.releaseService).not.toBe(sourceBefore.releaseService)
    expect(sourceAfter.releaseService).toContain("fixture @cosmos/release 1")
    expect(sourceAfter.internalVisual).not.toBe(sourceBefore.internalVisual)
    expect(sourceAfter.internalVisual).toContain("fixture @internal/visual 1")
    const requestsAfter = await fixtureRequests(server.root)
    expect(requestsAfter.releaseMain).toBeGreaterThan(requestsBefore.releaseMain)
    expect(requestsAfter.releaseService).toBeGreaterThan(requestsBefore.releaseService)
    expect(requestsAfter.internalVisual).toBeGreaterThan(requestsBefore.internalVisual)
    await expectCanonicalReleaseCaches(firstPage)
    expect(navigations).toEqual({first: 1, second: 1})
    expectDiagnosticOrder(browserDiagnostics, [
      "transaction начата",
      "полный candidate composition проверен",
      "release runtime candidate подготовлен",
      "canonical cleanup завершён",
      "transaction завершена",
      "release service запущен",
      "release service очищен",
      "перезагрузка Window начата",
      "перезагрузка Window завершена",
    ])
    expectDiagnosticOrder(startupDiagnostics, [
      "основное visual-окружение создано",
      "Visual runtime подключён",
      "страница готова к работе",
    ])

    await browser.close()
    browser = null
    const disconnectedBuild = await requestBuild(server.root, [
      {name: "@cosmos/release", change: "patch"},
      {name: "@cosmos/release", change: "patch"},
      {name: "@internal/visual", change: "patch"},
    ])
    expect(disconnectedBuild.status).toBe(200)
    expect(disconnectedBuild.body.results.map((result) => result.previousVersion)).toEqual(
      build.body.results.map((result) => result.version),
    )

    browser = await launchBrowser(profile)
    const restoredWorkerObserver = observeStartupWorker(browser, browserDiagnostics)
    const restoredPage = await browser.newPage()
    restoredPage.on("console", (message) =>
      browserDiagnostics.push(`page:${message.type()}:${message.text()}`))
    restoredPage.on("pageerror", (error) =>
      browserDiagnostics.push(`pageerror:${String(error)}`))
    let restoredNavigations = 0
    restoredPage.on("framenavigated", (frame) => {
      if (frame === restoredPage.mainFrame()) restoredNavigations += 1
    })
    const restoredNavigation = await restoredPage.goto(server.root, {waitUntil: "load"})
    expect(restoredNavigation?.status()).toBe(200)
    await Promise.race([
      restoredWorkerObserver.promise,
      Bun.sleep(15_000).then(() => {
        throw new Error("Restored startup Worker was not created")
      }),
    ])
    await waitUntil(async () => {
      try {
        const sources = await updateSources(restoredPage)
        return sources.releaseMain.includes("fixture @cosmos/release 2")
          && sources.releaseService.includes("fixture @cosmos/release 2")
          && sources.internalVisual.includes("fixture @internal/visual 2")
      } catch {
        return false
      }
    }, 30_000)
    await waitForAcceptedCaches(restoredPage)
    await expectCanonicalReleaseCaches(restoredPage)
    // The disconnected update may commit before this newly opened Window is a
    // controlled client. In that valid race the initial navigation already
    // reads the accepted composition and no redundant client.navigate occurs.
    expect(restoredNavigations).toBeGreaterThanOrEqual(1)
    expect(restoredNavigations).toBeLessThanOrEqual(2)
  } catch (error) {
    const failureState = browser ? await browserFailureState(browser).catch(String) : null
    throw withServerOutput(error, `${server.output()}\n${browserDiagnostics.join("\n")}\n${JSON.stringify(failureState)}`)
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
    const transactionStarted = (async () => {
      let interrupted: CacheSnapshot | undefined
      await waitUntil(async () => {
        const snapshot = await cacheSnapshot(page)
        if (!snapshot.transaction?.includes("/transaction")) return false
        interrupted = snapshot
        return true
      })
      return interrupted!
    })()
    const build = await requestBuild(server.root, [
      {name: "@cosmos/release", change: "patch"},
      {name: "@cosmos/release", change: "patch"},
    ])
    expect(build.status).toBe(200)

    await Bun.sleep(300)
    expect(navigations).toBe(0)
    expect(await updateSources(page)).toEqual(sourceBefore)
    const interrupted = await transactionStarted
    expect(Object.keys(interrupted).filter((name) => name === "transaction")).toEqual([
      "transaction",
    ])
    expect(Object.keys(interrupted).every((name) => !name.includes(":release:"))).toBe(true)

    expect(await reload).not.toBeNull()
    await waitUntil(async () => {
      try {
        const sources = await updateSources(page)
        return sources.releaseMain.includes("fixture @cosmos/release 1")
          && sources.releaseService.includes("fixture @cosmos/release 1")
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
    await waitUntil(() => countMatches(server.output(), "состояние browser cache сверено") >= 2)
    const output = server.output()
    expect(countMatches(output, "подписка release service создана")).toBeGreaterThanOrEqual(2)
    expect(countMatches(output, "подписка release service удалена")).toBeGreaterThanOrEqual(1)
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
          env: "main" | "worker" | "service"
          version: string
          sha256: string
          size: number
        }>
      }
      const current = state.packages.find(({name}) => name === "@cosmos/release")
      if (!current) throw new Error("Release main state is missing")
      const cache = await caches.open("release")
      const currentUrl = `/@cosmos/release?env=main&version=${current.version}`
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
        `/@cosmos/release?env=main&version=${staleVersion}`,
        new Response(bytes, {headers}),
      )

      await (await caches.open("transaction")).put(
        "/transaction",
        new Response(null, {status: 204}),
      )
    })

    const interrupted = await cacheSnapshot(page)
    expect(interrupted.transaction).toEqual(["/transaction"])
    expect((interrupted.release ?? []).filter((path) =>
      new URL(path, "http://cache.test").pathname === "/@cosmos/release")).toHaveLength(3)

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

    const routeProbes = await (async (paths: string[]) => {
      const current = await Promise.all(paths.map(async (path) => {
        const first = await fetch(new URL(path, server.root))
        const firstBody = await first.text()
        const second = await fetch(new URL(path, server.root))
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
      ].map(async (path) => ({
        path,
        status: (await fetch(new URL(path, server.root))).status,
      })))
      const queryArtifact = await fetch(new URL("/code?module=@cosmos/release", server.root))
      const serverEnvironment = await fetch(new URL("/@cosmos/release?env=server", server.root))
      const releaseState = await (await fetch(new URL("/code", server.root))).json() as {
        packages: Array<{name: string, env: string}>
      }
      return {
        current,
        legacy,
        queryArtifactStatus: queryArtifact.status,
        serverEnvironmentStatus: serverEnvironment.status,
        releaseEnvironments: releaseState.packages
          .filter(({name}) => name === "@cosmos/release")
          .map(({env}) => env),
      }
    })([releaseMainUrl, releaseServiceUrl, internalVisualUrl])

    for (const route of routeProbes.current) {
      expect(route.firstStatus).toBe(200)
      expect(route.secondStatus).toBe(200)
      expect(route.firstBody.length).toBeGreaterThan(0)
      expect(route.secondBody).toBe(route.firstBody)
      expect(route.type).toStartWith("text/javascript")
    }
    expect(routeProbes.queryArtifactStatus).toBe(404)
    expect(routeProbes.serverEnvironmentStatus).toBe(404)
    expect(routeProbes.releaseEnvironments).toEqual(["main", "service"])
    for (const route of routeProbes.legacy) expect(route.status).toBe(404)
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
    expect(hasCachedSlot(initial, "release", "@cosmos/release", "main")).toBe(true)
    expect(hasCachedSlot(initial, "release", "@cosmos/release", "service")).toBe(true)
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

    const runtimeFont = "/assets/fonts/jetbrains-mono-bold.ttf"
    const onlineFont = await page.evaluate(async (path) => {
      const response = await fetch(path)
      return {status: response.status, bytes: (await response.arrayBuffer()).byteLength}
    }, runtimeFont)
    expect(onlineFont.status).toBe(200)
    expect(onlineFont.bytes).toBeGreaterThan(0)
    expect((await cacheSnapshot(page)).startup).toContain(runtimeFont)

    const presentationAssets = [
      "/assets/screenshots/screenshot-mobile.png",
      "/assets/screenshots/screenshot-wide.png",
      "/assets/icons/icon-512-maskable.png",
      "/assets/icons/icon-192-maskable.png",
    ]
    const presentationAsset = presentationAssets.find(
      (path) => !(initial.startup ?? []).includes(path),
    )
    expect(presentationAsset).toBeDefined()

    const onlineAsset = await page.evaluate(async (path) => {
      const response = await fetch(path)
      return {status: response.status, bytes: (await response.arrayBuffer()).byteLength}
    }, presentationAsset!)
    expect(onlineAsset.status).toBe(200)
    expect(onlineAsset.bytes).toBeGreaterThan(0)
    expect((await cacheSnapshot(page)).startup).not.toContain(presentationAsset!)

    const mainReleaseRequestsBeforeOffline = countMatches(requests.join("\n"), releaseMainUrl)
    const mainResponsesBeforeOffline = countMatches(
      serviceWorkerResponses.join("\n"),
      releaseMainUrl,
    )
    await server.stop()
    serverStopped = true
    await page.setOfflineMode(false)

    const offlineFont = await page.evaluate(async (path) => {
      const response = await fetch(path)
      return {status: response.status, bytes: (await response.arrayBuffer()).byteLength}
    }, runtimeFont)
    expect(offlineFont).toEqual(onlineFont)

    const offlineAsset = await page.evaluate(async (path) => {
      const response = await fetch(path)
      return {status: response.status, bytes: (await response.arrayBuffer()).byteLength}
    }, presentationAsset!)
    expect(offlineAsset).toEqual({status: 503, bytes: 0})

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
    expect(hasCachedSlot(cold, "release", "@cosmos/release", "main")).toBe(true)
    expect(hasCachedSlot(cold, "release", "@cosmos/release", "service")).toBe(true)
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
      await waitForRequestCount(page, scenario.failed, 2)
      await waitForAcceptedCaches(page)

      const recovered = await cacheSnapshot(page)
      expect(hasCachedSlot(recovered, "release", "@cosmos/release", "main")).toBe(true)
      expect(hasCachedSlot(recovered, "release", "@cosmos/release", "service")).toBe(true)
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
  mode: ServerMode = "production-fixture",
): Promise<RunningServer> {
  const port = await freePort()
  const bun = Bun.which("bun") ?? process.execPath
  const command = [bun, "tests/fixture/server.ts"]
  const fault = mode === "production-fixture" || mode === "update" ? "none" : mode
  let stdout = ""
  let stderr = ""

  const child = Bun.spawn(command, {
    cwd: cosmos,
    env: {
      ...process.env,
      LOAD_TEST_FAULT: fault,
      LOAD_TEST_PORT: String(port),
      LOAD_TEST_ARTIFACTS: JSON.stringify(fixtureArtifacts),
      NODE_ENV: mode === "production-fixture" ? "production" : "development",
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdoutTask = collect(child.stdout, (chunk) => { stdout += chunk })
  const stderrTask = collect(child.stderr, (chunk) => { stderr += chunk })
  const root = `http://127.0.0.1:${port}`

  await waitUntil(async () => {
    if (child.exitCode !== null) throw new Error(`Cosmos test server exited with ${child.exitCode}`)
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

async function browserFailureState(browser: Browser) {
  const pages = await Promise.all((await browser.pages())
    .filter((page) => page.url().startsWith("http"))
    .map(async (page) => ({
    url: page.url(),
    caches: await cacheSnapshot(page).catch((error: unknown) => ({error: String(error)})),
    sources: await updateSources(page).then((sources) => Object.fromEntries(
      Object.entries(sources).map(([name, source]) => [name, {
        bytes: source.length,
        revision: source.match(/fixture @[a-z/]+ \d+/)?.[0] ?? null,
      }]),
    )).catch((error: unknown) => ({error: String(error)})),
    fixture: await page.evaluate(async () => await fetch("/__tests/state").then((response) => response.json()))
      .catch((error: unknown) => ({error: String(error)})),
    })))
  const services = await Promise.all(browser.targets()
    .filter((target) => target.type() === TargetType.SERVICE_WORKER)
    .map(async (target) => ({
      url: target.url(),
      state: await target.worker().then(async (worker) => await worker?.evaluate(async () => ({
        caches: Object.fromEntries(await Promise.all((await caches.keys()).map(async (name) => [
          name,
          (await (await caches.open(name)).keys()).map(({url}) => url),
        ]))),
        location: location.href,
      }))).catch((error: unknown) => ({error: String(error)})),
    })))
  return {pages, services}
}

function observeStartupWorker(browser: Browser, diagnostics?: string[]) {
  let resolve!: (handle: WorkerHandle) => void
  let settled = false
  const promise = new Promise<WorkerHandle>((ready) => { resolve = ready })

  const inspect = (target: Target) => {
    if (settled || target.type() !== TargetType.SERVICE_WORKER) return
    const url = new URL(target.url())
    if (`${url.pathname}${url.search}` !== startupServiceUrl) return
    void target.worker()
      .then((worker) => {
        if (!worker || settled) return
        if (diagnostics) {
          worker.on("console", (message) =>
            diagnostics.push(`service:${message.type()}:${message.text()}`))
          worker.on("error", (error) =>
            diagnostics.push(`service-error:${String(error)}`))
        }
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
            env: "main" | "worker" | "service",
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
            cachedPackage("@cosmos/release", "main", releases),
            cachedPackage("@cosmos/release", "service", releases),
            cachedPackage("@internal/visual", "main", internal),
          ])
          return Boolean(
            await startup.match("/")
            && await startup.match("/@cosmos/startup?env=main")
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

async function waitForRequestCount(page: Page, field: "releaseService", count: number) {
  await page.waitForFunction(async ({field, count}) => {
    const state = await (await fetch("/__tests/state")).json() as {
      requests: Record<string, number>
    }
    return (state.requests[field] ?? 0) >= count
  }, {timeout: 30_000}, {field, count})
}

async function cacheSnapshot(page: Page): Promise<CacheSnapshot> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
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
    } catch (error) {
      if (!String(error).includes("Execution context was destroyed") || attempt === 4) throw error
      await Bun.sleep(50)
    }
  }
  throw new Error("Cache snapshot was not read")
}

function hasCachedPackage(snapshot: CacheSnapshot, owner: string, name: string) {
  return snapshot[owner]?.some((path) =>
    new URL(path, "http://cache.test").pathname === `/${name}`) ?? false
}

function hasCachedSlot(
  snapshot: CacheSnapshot,
  owner: string,
  name: string,
  env: "main" | "worker" | "service",
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
    {name: "@cosmos/release", env: "main", owner: "release"},
    {name: "@cosmos/release", env: "service", owner: "release"},
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
  expect(Object.values(snapshot).flat()).not.toContain("/transaction")
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
      env: "main" | "worker" | "service",
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
      releaseMain: await source("@cosmos/release", "main", "release"),
      releaseService: await source("@cosmos/release", "service", "release"),
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
  return new Error(`${cause.message}\n\nCosmos test server output:\n${output}`, {cause})
}

function countMatches(value: string, expected: string) {
  return value.split(expected).length - 1
}

function expectDiagnosticOrder(diagnostics: string[], events: string[]) {
  const source = diagnostics.join("\n")
  let cursor = -1
  for (const event of events) {
    const next = source.indexOf(event, cursor + 1)
    expect(next).toBeGreaterThan(cursor)
    cursor = next
  }
}
