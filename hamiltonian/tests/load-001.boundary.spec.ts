import {expect, test} from "bun:test"
import {fileURLToPath} from "node:url"
import {join} from "node:path"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))

test("LOAD-001 keeps module policy and WebSocket outside immutable startup", async () => {
  const [startupMain, startupService, importService, storage, html] = await Promise.all([
    Bun.file(join(hamiltonian, "web/startup/main/index.ts")).text(),
    Bun.file(join(hamiltonian, "web/startup/service/index.ts")).text(),
    Bun.file(join(hamiltonian, "web/import/service/index.ts")).text(),
    Bun.file(join(hamiltonian, "web/import/service/storage.ts")).text(),
    Bun.file(join(hamiltonian, "web/static/index.html")).text(),
  ])

  expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1)
  expect(html).toContain('src="/code?module=@startup/main"')
  expect(html).not.toContain("@import/")
  expect(html).not.toContain("@internal/")

  expect(startupMain).toContain('import("/code?module=@import/main")')
  expect(startupMain.indexOf('await import("/code?module=@import/main")'))
    .toBeLessThan(startupMain.indexOf('serviceWorker.postMessage({type: "connect"})'))
  expect(startupMain).not.toContain("@internal/")
  expect(startupMain).not.toContain("@metafor/")

  expect(startupService).toContain('new URL("/code?module=@import/service", location.origin)')
  expect(startupService).not.toContain("@internal/")
  expect(startupService).not.toContain("@metafor/")
  expect(startupService).not.toContain("WebSocket")
  expect(startupService).not.toContain("importModule")

  expect(importService).toContain("importModule(loader, rpc, {")
  expect(importService).toContain("updatePackages(input)")
  expect(importService).toContain("updateModules(loader, packages)")
  expect(importService).toContain("registration.unregister()")
  expect(importService).toContain("client.navigate(client.url)")
  expect(storage).toContain('"@import/main"')
  expect(storage).toContain('"@import/service"')
  expect(storage).toContain('endpoint: "/code?module=@internal/rpc"')
  expect(storage).toContain('cache: "internal"')
})

test("UPD-002 exposes the development update path through owner-scoped diagnostics", async () => {
  const [server, build, rpcServer, rpcService, importService, updateLoader, startupMain] =
    await Promise.all([
      Bun.file(join(hamiltonian, "server.ts")).text(),
      Bun.file(join(hamiltonian, "build.ts")).text(),
      Bun.file(join(hamiltonian, "internal/rpc/server/index.ts")).text(),
      Bun.file(join(hamiltonian, "internal/rpc/service/web/index.ts")).text(),
      Bun.file(join(hamiltonian, "web/import/service/index.ts")).text(),
      Bun.file(join(hamiltonian, "web/import/service/loader.ts")).text(),
      Bun.file(join(hamiltonian, "web/startup/main/index.ts")).text(),
    ])

  expect(server).toContain(
    'console.debug("[hamiltonian/server/code:delivery]", "получен запрос клиентского модуля"',
  )
  expect(server).toContain(
    'console.debug("[hamiltonian/server/code:update]", "уведомление об обновлении отправлено"',
  )
  expect(build).toContain(
    'console.debug("[hamiltonian/server/build]", "проверка пакета перед сборкой началась"',
  )
  expect(build).toContain(
    'console.debug("[hamiltonian/server/build]", "сборка пакета завершена"',
  )
  expect(rpcServer).toContain('console.debug("[@internal/rpc/server]", "Service Worker подключён"')
  expect(rpcService).toContain(
    'console.debug("[@internal/rpc/service:update]", "получено уведомление об обновлении"',
  )
  expect(importService).toContain(
    'console.debug("[@import/service:update]", "проверяем состояние пакетов"',
  )
  expect(importService).toContain(
    'console.debug("[@import/service:restart]", "начинаем перезагрузку страниц"',
  )
  expect(updateLoader).toContain(
    'console.debug("[@import/service/loader:update]", "вся группа открыта в активном кэше"',
  )
  expect(startupMain).toContain('console.debug("[@startup/main]", "страница готова к работе"')

  for (const source of [server, build, rpcServer, rpcService, importService, updateLoader]) {
    expect(source).not.toMatch(/const [A-Z_]*SCOPE/)
  }
})
