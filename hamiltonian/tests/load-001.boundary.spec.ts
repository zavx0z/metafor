import {expect, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {join} from "node:path"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))

test("LOAD-001 keeps release policy and WebSocket outside immutable startup", async () => {
  const [packageUrl, startupMain, startupService, startupCache, startupLoader, releaseService, releaseState, releaseLoader, storage, html] =
    await Promise.all([
    Bun.file(join(hamiltonian, "web/package-url.ts")).text(),
    Bun.file(join(hamiltonian, "web/startup/main/index.ts")).text(),
    Bun.file(join(hamiltonian, "web/startup/service/index.ts")).text(),
    Bun.file(join(hamiltonian, "web/startup/service/cache.ts")).text(),
    Bun.file(join(hamiltonian, "web/startup/service/loader.ts")).text(),
    Bun.file(join(hamiltonian, "web/release/service/index.ts")).text(),
    Bun.file(join(hamiltonian, "web/release/service/state.ts")).text(),
    Bun.file(join(hamiltonian, "web/release/service/loader.ts")).text(),
    Bun.file(join(hamiltonian, "web/release/service/storage.ts")).text(),
    Bun.file(join(hamiltonian, "web/static/index.html")).text(),
    ])

  expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1)
  expect(html).toContain('src="/@startup/main?env=main"')
  expect(html).toContain('"@release/main": "/@release/main?env=main"')
  expect(html).toContain('"@internal/visual": "/@internal/visual?env=main"')
  expect(html).not.toContain('"@release/":')

  expect(startupMain).toContain('import("@release/main")')
  expect(startupMain.indexOf('await import("@release/main")'))
    .toBeLessThan(startupMain.indexOf('serviceWorker.postMessage({type: "connect"})'))
  expect(startupMain).not.toContain("@internal/")
  expect(startupMain).not.toContain("@metafor/")

  expect(startupService).toContain('new URL("/@release/service?env=service-worker", location.origin)')
  expect(startupService).not.toContain("@internal/")
  expect(startupService).not.toContain("@metafor/")
  expect(startupService).not.toContain("WebSocket")
  expect(startupService).not.toContain("importModule")

  const startupServicePackage = await Bun.file(
    join(hamiltonian, "web/startup/service/package.json"),
  ).json() as {
    artifact?: {headers?: Record<string, string>}
    dependencies?: Record<string, string>
  }
  const startupMainPackage = await Bun.file(
    join(hamiltonian, "web/startup/main/package.json"),
  ).json() as {dependencies?: Record<string, string>}
  expect(startupServicePackage.artifact?.headers?.["Service-Worker-Allowed"]).toBe("/")
  expect(startupMainPackage.dependencies?.["@release/main"]).toBe("workspace:^0.1.6")
  expect(startupServicePackage.dependencies?.["@release/service"]).toBe("workspace:^0.1.7")

  expect(packageUrl).toContain('name?.startsWith("@release/")')
  expect(packageUrl).toContain('name?.startsWith("@internal/")')
  expect(packageUrl).toContain('name?.startsWith("@metafor/")')
  expect(packageUrl).not.toContain("@internal/visual")
  expect(startupCache).not.toContain("/code?module=")

  expect(startupLoader).not.toContain("rememberRelease")
  expect(startupLoader).not.toContain("activateRelease")
  expect(startupLoader).not.toContain("pendingRestart")
  expect(startupLoader).not.toContain("discardInactiveReleases")
  expect(releaseState).toContain("rememberRelease")
  expect(releaseState).toContain("activateRelease")
  expect(releaseState).toContain("discardInactiveReleases")
  expect(releaseState).toContain("requiredCacheOwner(entry.name)")
  expect(releaseLoader).toContain("requiredCacheOwner(entry.name)")
  expect(releaseLoader).toContain("browserPackageUrl(entry.name, entry.env, entry.version)")
  expect(releaseState).not.toContain("entry.cache")
  expect(releaseState).not.toContain("entry.endpoint")
  expect(releaseLoader).not.toContain("entry.cache")
  expect(releaseLoader).not.toContain("entry.endpoint")
  expect(releaseLoader).not.toContain("return {...entry, storage}")

  expect(releaseService).toContain("startRpc({")
  expect(releaseService).toContain('import type {ReleaseLoader} from "./contract"')
  expect(releaseLoader).toContain('import type {ReleaseLoader} from "./contract"')
  expect(startupService).toContain('import type {ReleaseLoader} from "@release/service"')
  expect(releaseService).not.toContain("../../startup/")
  expect(releaseLoader).not.toContain("../../startup/")
  expect(releaseService).toContain("updatePackages(input)")
  expect(releaseService).toContain("updateRelease(loader, packages)")
  expect(releaseService).toContain("registration.unregister()")
  expect(releaseService).toContain("client.navigate(client.url)")
  expect(storage).not.toContain("@internal/rpc")
  expect(releaseService).not.toContain("loadModule")
})

test("UPD-002 exposes the development update path through owner-scoped diagnostics", async () => {
  const [server, delivery, update, build, rpcServer, rpcService, releaseService, updateLoader, startupMain] =
    await Promise.all([
      Bun.file(join(hamiltonian, "server.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/server/delivery.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/server/update.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/server/build.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/server/rpc/index.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/service/rpc/index.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/service/index.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/service/loader.ts")).text(),
      Bun.file(join(hamiltonian, "web/startup/main/index.ts")).text(),
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
  expect(rpcServer).toContain('console.debug("[@release/server:rpc]", "Service Worker подключён к серверу обновлений"')
  expect(rpcService).toContain(
    'console.debug("[@release/service:rpc:update]", "получено уведомление об обновлении"',
  )
  expect(releaseService).toContain(
    'console.debug("[@release/service:update]", "проверяем состояние пакетов"',
  )
  expect(releaseService).toContain(
    'console.debug("[@release/service:restart]", "начинаем перезагрузку страниц"',
  )
  expect(updateLoader).toContain(
    'console.debug("[@release/service:activate]", "вся группа открыта в активном кэше"',
  )
  expect(startupMain).toContain('console.debug("[@startup/main]", "страница готова к работе"')

  for (const source of [server, delivery, update, build, rpcServer, rpcService, releaseService, updateLoader]) {
    expect(source).not.toMatch(/const [A-Z_]*SCOPE/)
  }
})
