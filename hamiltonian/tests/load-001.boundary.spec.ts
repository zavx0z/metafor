import {expect, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {join} from "node:path"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))

test("LOAD-001 keeps release policy and WebSocket outside immutable startup", async () => {
  const [packageUrl, packageBuild, startupMain, startupService, startupRuntime, releaseCache, startupLoader, releaseService, releaseState, releaseLoader, transaction, html] =
    await Promise.all([
    Bun.file(join(hamiltonian, "web/package-url.ts")).text(),
    Bun.file(join(hamiltonian, "release/server/package.ts")).text(),
    Bun.file(join(hamiltonian, "startup/main/index.ts")).text(),
    Bun.file(join(hamiltonian, "startup/service-worker/index.ts")).text(),
    Bun.file(join(hamiltonian, "startup/service-worker/runtime.ts")).text(),
    Bun.file(join(hamiltonian, "release/service-worker/cache.ts")).text(),
    Bun.file(join(hamiltonian, "startup/service-worker/loader.ts")).text(),
    Bun.file(join(hamiltonian, "release/service-worker/index.ts")).text(),
    Bun.file(join(hamiltonian, "release/service-worker/state.ts")).text(),
    Bun.file(join(hamiltonian, "release/service-worker/loader.ts")).text(),
    Bun.file(join(hamiltonian, "release/transaction.ts")).text(),
    Bun.file(join(hamiltonian, "web/static/index.html")).text(),
    ])

  expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1)
  expect(html).toContain('src="/@hamiltonian/startup?env=main"')
  expect(html).toContain('"@hamiltonian/release": "/@hamiltonian/release?env=main"')
  expect(html).toContain('"@internal/visual": "/@internal/visual?env=main"')
  expect(html).not.toContain('"@release/":')

  expect(startupMain).toContain('import("@hamiltonian/release")')
  expect(startupMain).not.toContain('postMessage({type: "connect"})')
  expect(startupMain).not.toContain("@internal/")
  expect(startupMain).not.toContain("@metafor/")

  expect(startupService).toContain('new URL("/@hamiltonian/release?env=service-worker", location.origin)')
  expect(startupService).not.toContain("@internal/")
  expect(startupService).not.toContain("@metafor/")
  expect(startupService).not.toContain("WebSocket")
  expect(startupService).not.toContain("importModule")
  expect(startupService).toContain("registerReleaseListeners")
  expect(startupService).toContain("host.boot()")
  expect(startupRuntime).toContain("event.respondWith(operation)")
  expect(startupRuntime).toContain("event.waitUntil(operation)")
  expect(startupRuntime).toContain("await drain(previous)")
  expect(startupRuntime).toContain("await previous.destroy()")

  const startupPackage = await Bun.file(join(hamiltonian, "startup/package.json")).json() as {
    artifact?: unknown
    dependencies?: Record<string, string>
  }
  expect(startupPackage.artifact).toBeUndefined()
  expect(startupPackage.dependencies?.["@hamiltonian/release"]).toBe("workspace:^0.1.3")
  expect(packageBuild).toContain('"Service-Worker-Allowed": "/"')
  expect(packageBuild).toContain('"Content-Security-Policy": "script-src \'unsafe-eval\'"')

  expect(packageUrl).toContain('name === "@hamiltonian/release"')
  expect(packageUrl).toContain('name?.startsWith("@internal/")')
  expect(packageUrl).toContain('name?.startsWith("@metafor/")')
  expect(packageUrl).not.toContain("@internal/visual")
  expect(releaseCache).not.toContain("/code?module=")
  expect(releaseCache).toContain("cacheFirst")
  expect(releaseCache).toContain("cacheStartup")

  expect(startupLoader).toContain("exactSlotResponse")
  expect(startupLoader).not.toContain("transaction")
  expect(startupLoader).not.toContain("parseReleaseDeltaMessage")
  expect(startupLoader).not.toContain("rememberRelease")
  expect(startupLoader).not.toContain("activateRelease")
  expect(startupLoader).not.toContain("pendingRestart")
  expect(startupLoader).not.toContain("discardInactiveReleases")
  expect(releaseState).toContain("beginTransaction")
  expect(releaseState).toContain("pendingTransaction")
  expect(releaseState).toContain("commitTransaction")
  expect(releaseState).not.toContain("crypto.randomUUID")
  expect(transaction).toContain('transactionCache = "transaction"')
  expect(transaction).toContain('transactionMarkerPath = "/transaction"')
  expect(releaseLoader).toContain("requiredCacheOwner(entry.name)")
  expect(releaseLoader).toContain("browserPackageUrl(entry.name, entry.env, entry.version)")
  expect(releaseState).not.toContain("entry.cache")
  expect(releaseState).not.toContain("entry.endpoint")
  expect(releaseLoader).not.toContain("entry.cache")
  expect(releaseLoader).not.toContain("entry.endpoint")
  expect(releaseLoader).not.toContain("return {...entry, storage}")

  expect(releaseService).toContain("startRpc({")
  expect(releaseService).toContain("ReleaseDependencies")
  expect(releaseService).toContain("ReleaseRuntime")
  expect(releaseLoader).toContain('import type {ReleaseLoader, ReleaseRuntime} from "./contract"')
  expect(startupService).toContain('import type {ReleaseLoader} from "@hamiltonian/release"')
  expect(releaseService).not.toContain("../../startup/")
  expect(releaseLoader).not.toContain("../../startup/")
  expect(releaseService).toContain("updateRelease(dependencies.loader, delta")
  expect(releaseService).toContain("prepare: dependencies.runtime.prepare")
  expect(releaseService).toContain("activate: dependencies.runtime.activate")
  expect(releaseLoader).toContain("await beginTransaction()")
  expect(releaseLoader).toContain("await commitTransaction()")
  expect(releaseLoader.indexOf("await beginTransaction()"))
    .toBeLessThan(releaseLoader.indexOf("await fetch("))
  expect(releaseService).not.toContain("registration.unregister()")
  expect(releaseService).toContain("client.navigate(client.url)")
  expect(releaseService).not.toContain("loadModule")
})

test("UPD-002 exposes the development update path through owner-scoped diagnostics", async () => {
  const [server, delivery, update, build, rpcServer, rpcService, releaseService, updateLoader, startupMain] =
    await Promise.all([
      Bun.file(join(hamiltonian, "server.ts")).text(),
      Bun.file(join(hamiltonian, "release/server/delivery.ts")).text(),
      Bun.file(join(hamiltonian, "release/server/update.ts")).text(),
      Bun.file(join(hamiltonian, "release/server/build.ts")).text(),
      Bun.file(join(hamiltonian, "release/server/rpc/index.ts")).text(),
      Bun.file(join(hamiltonian, "release/service-worker/rpc/index.ts")).text(),
      Bun.file(join(hamiltonian, "release/service-worker/index.ts")).text(),
      Bun.file(join(hamiltonian, "release/service-worker/loader.ts")).text(),
      Bun.file(join(hamiltonian, "startup/main/index.ts")).text(),
    ])

  expect(server).toContain("GET: getRelease")
  expect(server).toMatch(/POST: \(request: Request, server: Bun\.Server<RpcSocketData>\) => publishRelease\(request/)
  expect(server).toContain("open: openRpc")
  expect(server).toContain("message: messageRpc")
  expect(server).toContain("close: closeRpc")
  expect(server).not.toContain("releaseRoute")
  expect(delivery).toContain('debug("получен запрос клиентского пакета"')
  expect(update).toContain('debug("уведомление об обновлении отправлено"')
  expect(build).toContain(
    'debug("проверка пакета перед сборкой началась"',
  )
  expect(build).toContain(
    'debug("сборка пакета завершена"',
  )
  expect(rpcServer).toContain('console.debug("[@hamiltonian/release:server:rpc]", "Service Worker подключён к серверу обновлений"')
  expect(rpcService).toContain(
    'console.debug("[@hamiltonian/release:service-worker:rpc:update]", "получен сигнал об обновлении"',
  )
  expect(releaseService).toContain(
    'console.debug("[@hamiltonian/release:service-worker:update]", "применяем fresh server delta"',
  )
  expect(releaseService).toContain(
    'console.debug("[@hamiltonian/release:service-worker:restart]", "начинаем перезагрузку страниц"',
  )
  expect(updateLoader).toContain(
    'console.debug("[@hamiltonian/release:service-worker:activate]", "transaction завершена удалением cache"',
  )
  expect(startupMain).toContain('console.debug("[@hamiltonian/startup:main]", "страница готова к работе"')

  for (const source of [server, delivery, update, build, rpcServer, rpcService, releaseService, updateLoader]) {
    expect(source).not.toMatch(/const [A-Z_]*SCOPE/)
  }
})
