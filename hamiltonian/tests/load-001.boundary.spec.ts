import {expect, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {join} from "node:path"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))

test("LOAD-001 keeps release policy and WebSocket outside immutable startup", async () => {
  const [startupMain, startupService, startupLoader, releaseService, releaseState, storage, html] =
    await Promise.all([
    Bun.file(join(hamiltonian, "web/startup/main/index.ts")).text(),
    Bun.file(join(hamiltonian, "web/startup/service/index.ts")).text(),
    Bun.file(join(hamiltonian, "web/startup/service/loader.ts")).text(),
    Bun.file(join(hamiltonian, "web/release/service/index.ts")).text(),
    Bun.file(join(hamiltonian, "web/release/service/state.ts")).text(),
    Bun.file(join(hamiltonian, "web/release/service/storage.ts")).text(),
    Bun.file(join(hamiltonian, "web/static/index.html")).text(),
    ])

  expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1)
  expect(html).toContain('src="/code?module=@startup/main"')
  expect(html).not.toContain("@release/")
  expect(html).not.toContain("@internal/")

  expect(startupMain).toContain('import("/code?module=@release/main")')
  expect(startupMain.indexOf('await import("/code?module=@release/main")'))
    .toBeLessThan(startupMain.indexOf('serviceWorker.postMessage({type: "connect"})'))
  expect(startupMain).not.toContain("@internal/")
  expect(startupMain).not.toContain("@metafor/")

  expect(startupService).toContain('new URL("/code?module=@release/service", location.origin)')
  expect(startupService).not.toContain("@internal/")
  expect(startupService).not.toContain("@metafor/")
  expect(startupService).not.toContain("WebSocket")
  expect(startupService).not.toContain("importModule")

  expect(startupLoader).not.toContain("rememberRelease")
  expect(startupLoader).not.toContain("activateRelease")
  expect(startupLoader).not.toContain("pendingRestart")
  expect(startupLoader).not.toContain("discardInactiveReleases")
  expect(releaseState).toContain("rememberRelease")
  expect(releaseState).toContain("activateRelease")
  expect(releaseState).toContain("discardInactiveReleases")

  expect(releaseService).toContain("loadModule(loader, rpc, {")
  expect(releaseService).toContain("updatePackages(input)")
  expect(releaseService).toContain("updateRelease(loader, packages)")
  expect(releaseService).toContain("registration.unregister()")
  expect(releaseService).toContain("client.navigate(client.url)")
  expect(storage).toContain('"@release/main"')
  expect(storage).toContain('"@release/service"')
  expect(storage).toContain('endpoint: "/code?module=@internal/rpc"')
  expect(storage).toContain('cache: "internal"')
})

test("UPD-002 exposes the development update path through owner-scoped diagnostics", async () => {
  const [server, route, build, rpcServer, rpcService, releaseService, updateLoader, startupMain] =
    await Promise.all([
      Bun.file(join(hamiltonian, "server.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/server/route.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/server/build.ts")).text(),
      Bun.file(join(hamiltonian, "internal/rpc/server/index.ts")).text(),
      Bun.file(join(hamiltonian, "internal/rpc/service/web/index.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/service/index.ts")).text(),
      Bun.file(join(hamiltonian, "web/release/service/loader.ts")).text(),
      Bun.file(join(hamiltonian, "web/startup/main/index.ts")).text(),
    ])

  expect(server).toContain('import {releaseRoute} from "@release/server"')
  expect(server).not.toContain("publishPackages")
  expect(route).toContain('debug("delivery", "получен запрос клиентского пакета"')
  expect(route).toContain('debug("update", "уведомление об обновлении отправлено"')
  expect(build).toContain(
    'debug("проверка пакета перед сборкой началась"',
  )
  expect(build).toContain(
    'debug("сборка пакета завершена"',
  )
  expect(rpcServer).toContain('console.debug("[@internal/rpc/server]", "Service Worker подключён"')
  expect(rpcService).toContain(
    'console.debug("[@internal/rpc/service:update]", "получено уведомление об обновлении"',
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

  for (const source of [server, route, build, rpcServer, rpcService, releaseService, updateLoader]) {
    expect(source).not.toMatch(/const [A-Z_]*SCOPE/)
  }
})
