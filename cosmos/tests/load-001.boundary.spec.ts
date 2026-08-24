import {expect, test} from "bun:test"
import {existsSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {join} from "node:path"

const cosmos = fileURLToPath(new URL("../", import.meta.url))

test("LOAD-001 keeps release policy and WebSocket outside immutable startup", async () => {
  const [packageUrl, packageBuild, startupMain, startupService, startupRuntime, releaseCache, startupLoader, releaseService, releaseLoader, transaction, html] =
    await Promise.all([
    Bun.file(join(cosmos, "shared/package/url.ts")).text(),
    Bun.file(join(cosmos, "release/server/package/manifest.ts")).text(),
    Bun.file(join(cosmos, "startup/main/index.ts")).text(),
    Bun.file(join(cosmos, "startup/service/index.ts")).text(),
    Bun.file(join(cosmos, "startup/service/runtime.ts")).text(),
    Bun.file(join(cosmos, "release/service/fetch/index.ts")).text(),
    Bun.file(join(cosmos, "startup/service/loader.ts")).text(),
    Bun.file(join(cosmos, "release/service/runtime/index.ts")).text(),
    Bun.file(join(cosmos, "release/service/update/index.ts")).text(),
    Bun.file(join(cosmos, "release/service/update/transaction.ts")).text(),
    Bun.file(join(cosmos, "static/index.html")).text(),
    ])

  expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1)
  expect(html).toContain('src="/@cosmos/startup?env=main"')
  expect(html).toContain('"@cosmos/release": "/@cosmos/release?env=main"')
  expect(html).toContain('"@internal/visual": "/@internal/visual?env=main"')
  expect(html).not.toContain('"@release/":')

  expect(startupMain).toContain('import("@cosmos/release")')
  expect(startupMain).not.toContain('postMessage({type: "connect"})')
  expect(startupMain).not.toContain("@internal/")
  expect(startupMain).not.toContain("@metafor/")

  expect(startupService).toContain('new URL("/@cosmos/release?env=service", location.origin)')
  expect(startupService).not.toContain("@internal/")
  expect(startupService).not.toContain("@metafor/")
  expect(startupService).not.toContain("WebSocket")
  expect(startupService).not.toContain("importModule")
  expect(startupService).toContain("registerReleaseListeners")
  expect(startupService).toContain("host.boot()")
  expect(startupRuntime).toContain("event.respondWith(operation)")
  expect(startupRuntime).toContain("event.waitUntil(operation)")
  expect(startupRuntime).toContain("await drain(previous.runtime)")
  expect(startupRuntime).toContain("await executor.destroy(previous)")

  const startupPackage = await Bun.file(join(cosmos, "startup/package.json")).json() as {
    artifact?: unknown
    dependencies?: Record<string, string>
  }
  expect(startupPackage.artifact).toBeUndefined()
  expect(startupPackage.dependencies?.["@cosmos/release"]).toBe("workspace:^0.1.14")
  expect(packageBuild).toContain('"Service-Worker-Allowed": "/"')
  expect(packageBuild).toContain('"Content-Security-Policy": "script-src \'unsafe-eval\'"')

  expect(packageUrl).toContain('name === "@cosmos/release"')
  expect(packageUrl).toContain('name?.startsWith("@internal/")')
  expect(packageUrl).toContain('name?.startsWith("@metafor/")')
  expect(packageUrl).not.toContain("@internal/visual")
  expect(releaseCache).not.toContain("/code?module=")
  expect(releaseCache).toContain("cacheFirst")
  expect(releaseCache).toContain("cacheStartup")
  expect(releaseCache).toContain('"/assets/fonts/JetBrainsMono-Bold.ttf"')
  expect(releaseCache).toContain("runtimeAssets.has(url.pathname)")

  expect(startupLoader).toContain("exactSlotResponse")
  expect(startupLoader).not.toContain("transaction")
  expect(startupLoader).not.toContain("parseReleaseDeltaMessage")
  expect(startupLoader).not.toContain("rememberRelease")
  expect(startupLoader).not.toContain("activateRelease")
  expect(startupLoader).not.toContain("pendingRestart")
  expect(startupLoader).not.toContain("discardInactiveReleases")
  expect(transaction).toContain("beginTransaction")
  expect(transaction).toContain("pendingTransaction")
  expect(transaction).toContain("commitTransaction")
  expect(transaction).not.toContain("crypto.randomUUID")
  expect(transaction).toContain('transactionCache = "transaction"')
  expect(transaction).toContain('transactionMarkerPath = "/transaction"')
  expect(releaseLoader).toContain("requiredCacheOwner(entry.name)")
  expect(releaseLoader).toContain("browserPackageUrl(entry.name, entry.env, entry.version)")
  expect(transaction).not.toContain("entry.cache")
  expect(transaction).not.toContain("entry.endpoint")
  expect(releaseLoader).not.toContain("entry.cache")
  expect(releaseLoader).not.toContain("entry.endpoint")
  expect(releaseLoader).not.toContain("return {...entry, storage}")

  expect(releaseService).toContain("startRpc({")
  expect(releaseService).toContain("ReleaseDependencies")
  expect(releaseService).toContain("ReleaseRuntime")
  expect(releaseLoader).toContain('import type {ReleaseLoader, ReleaseRuntime} from "../runtime/contract"')
  expect(startupService).toContain('import type {ReleaseLoader} from "@cosmos/release"')
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
      Bun.file(join(cosmos, "release/server/runtime.ts")).text(),
      Bun.file(join(cosmos, "release/server/http/delivery.ts")).text(),
      Bun.file(join(cosmos, "release/server/release/update.ts")).text(),
      Bun.file(join(cosmos, "release/server/package/build.ts")).text(),
      Bun.file(join(cosmos, "release/server/rpc/index.ts")).text(),
      Bun.file(join(cosmos, "release/service/rpc/index.ts")).text(),
      Bun.file(join(cosmos, "release/service/runtime/index.ts")).text(),
      Bun.file(join(cosmos, "release/service/update/index.ts")).text(),
      Bun.file(join(cosmos, "startup/main/index.ts")).text(),
    ])

  expect(server).toContain("GET: getRelease")
  expect(server).toMatch(/POST: \(request: Request, current: Bun\.Server<RpcSocketData>\) => publishRelease\(request/)
  expect(server).toContain("open: openRpc")
  expect(server).toContain("message: messageRpc")
  expect(server).toContain("close: closeRpc")
  expect(server).not.toContain("releaseRoute")
  expect(delivery).toContain('debug("browser artifact доставлен"')
  expect(update).toContain('debug("сигнал об обновлении отправлен"')
  expect(build).toContain(
    'debug("package typecheck начат"',
  )
  expect(build).toContain(
    'debug("сборка artifact завершена"',
  )
  expect(rpcServer).toContain('console.debug("[@cosmos/release:server:rpc]", "подписка release service создана"')
  expect(rpcService).toContain(
    'console.debug("[@cosmos/release:service:rpc:update]", "получен сигнал об обновлении"',
  )
  expect(releaseService).toContain(
    'console.debug("[@cosmos/release:service]", "release service запущен"',
  )
  expect(releaseService).toContain(
    'console.debug("[@cosmos/release:service:restart]", "перезагрузка Window начата"',
  )
  expect(updateLoader).toContain(
    'console.debug("[@cosmos/release:service:activate]", "transaction завершена"',
  )
  expect(startupMain).toContain('console.debug("[@cosmos/startup:main]", "страница готова к работе"')

  for (const source of [server, delivery, update, build, rpcServer, rpcService, releaseService, updateLoader]) {
    expect(source).not.toMatch(/const [A-Z_]*SCOPE/)
  }
})

test("UPD-003.12 keeps package, release and Service Worker subjects in canonical directories", async () => {
  expect(existsSync(join(cosmos, "web"))).toBeFalse()
  expect(existsSync(join(cosmos, "release/protocol.ts"))).toBeFalse()
  expect(existsSync(join(cosmos, "release/transaction.ts"))).toBeFalse()
  expect(existsSync(join(cosmos, "release/service/cache/state.ts"))).toBeFalse()

  for (const source of [
    "static/index.html",
    "static/manifest.json",
    "shared/package/environment.ts",
    "shared/package/integrity.ts",
    "shared/package/url.ts",
    "release/shared/protocol.ts",
    "release/server/package/build.ts",
    "release/server/release/publication.ts",
    "release/server/http/delivery.ts",
    "release/server/shared/contracts.ts",
    "release/service/index.ts",
    "release/service/runtime/contract.ts",
    "release/service/runtime/index.ts",
    "release/service/fetch/index.ts",
    "release/service/cache/current.ts",
    "release/service/update/transaction.ts",
    "release/service/rpc/index.ts",
  ]) expect(existsSync(join(cosmos, source))).toBeTrue()

  const serviceWorkerEntrypoint = await Bun.file(
    join(cosmos, "release/service/index.ts"),
  ).text()
  expect(serviceWorkerEntrypoint).toContain('export {default} from "./runtime"')
  expect(serviceWorkerEntrypoint).not.toContain("startRpc")
})
