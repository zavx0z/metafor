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
  expect(startupMain).not.toContain("@internal/")
  expect(startupMain).not.toContain("@metafor/")

  expect(startupService).toContain('new URL("/code?module=@import/service", location.origin)')
  expect(startupService).not.toContain("@internal/")
  expect(startupService).not.toContain("@metafor/")
  expect(startupService).not.toContain("WebSocket")
  expect(startupService).not.toContain("importModule")

  expect(importService).toContain("importModule(loader, rpc)")
  expect(storage).toContain('endpoint: "/code?module=@internal/rpc"')
  expect(storage).toContain('cache: "internal"')
})
