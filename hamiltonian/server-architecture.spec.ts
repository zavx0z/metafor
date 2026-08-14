import {describe, expect, test} from "bun:test"
import {existsSync} from "node:fs"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL(".", import.meta.url))
const serverPath = fileURLToPath(new URL("./server.ts", import.meta.url))
const runtimePath = fileURLToPath(new URL("./server-runtime.ts", import.meta.url))

const routes = [
  '"/"',
  '"/index.html"',
  '"/orchestration.js"',
  '"/layout-worker.js"',
  '"/web-push-client.js"',
  '"/sw-entry.js"',
  '"/control"',
  '"/push/vapid-public-key"',
  '"/lab/wake-service-worker"',
  '"/manifest.json"',
  '"/lab/status"',
  "[versionedModulePath]",
  '"/window-entry.js"',
  '"/app.js"',
  '"/embodiment-worker.js"',
  '"/embodiment-worker-entry.js"',
  '"/styles.css"',
  '"/engine-static/JetBrainsMono-Bold.ttf"',
  '"/core/runtime.js"',
  '"/core/cache.js"',
  '"/core/browser-control.js"',
  '"/update/page-update.js"',
  '"/core/monitor.js"',
  '"/core/lifecycle.js"',
  '"/core/orchestration.js"',
] as const

const messageKinds = [
  "lifecycle-retirement",
  "browser-lifecycle-snapshot",
  "pong",
  "identity",
  "push-subscription",
  "peer-signal",
  "peer-failed",
  "tabs",
] as const

describe("Hamiltonian singleton server boundary", () => {
  test("declares the only Bun server and the complete routes object in server.ts", async () => {
    const source = await Bun.file(serverPath).text()
    const runtime = await Bun.file(runtimePath).text()
    const packageJson = await Bun.file(`${hamiltonianRoot}/package.json`).json() as {scripts?: {start?: string}}

    expect(packageJson.scripts?.start).toBe("bun run server.ts")
    expect(source.match(/Bun\.serve</g)).toHaveLength(1)
    expect(source).toContain("development: false")
    expect(source).toMatch(/routes:\s*\{\s*\/\*\*/)
    expect(runtime).not.toContain("Bun.serve")
    expect(source).not.toContain("class ")
    expect(existsSync(`${hamiltonianRoot}/host.ts`)).toBeFalse()

    const declarations = [...source.matchAll(/^\s{4}("\/[^"]+"|"\/"|\[versionedModulePath\]):/gm)]
      .map((match) => match[1])
    expect(declarations).toEqual([...routes])
  })

  test("keeps every route documented and every multi-variant condition inside its handler", async () => {
    const source = await Bun.file(serverPath).text()
    for (const route of routes) {
      const declaration = `${route}:`
      const before = source.slice(0, source.indexOf(declaration))
      expect(before.match(/\/\*\*([\s\S]*?)\*\/\s*$/)?.[1] ?? "").toMatch(/[А-Яа-яЁё]/)
    }
    expect(source).toMatch(/"\/": async[\s\S]*?if \(request\.method === "GET"\)[\s\S]*?else \{/)
    expect(source).toMatch(/"\/control":[\s\S]*?if \([\s\S]*?controlTokenMatches[\s\S]*?else if \(bunServer\.upgrade[\s\S]*?else \{/)
    expect(source).toMatch(/"\/lab\/wake-service-worker":[\s\S]*?if \(!isAuthorizedRequest[\s\S]*?try \{[\s\S]*?if \(workerEntityId === null[\s\S]*?else if \(hasPendingWake[\s\S]*?else \{/)
    expect(source).not.toMatch(/async fetch\s*\(request/)
  })

  test("shows the complete WebSocket surface and dispatches every message kind explicitly", async () => {
    const source = await Bun.file(serverPath).text()
    expect(source).toMatch(/websocket:\s*\{[\s\S]*?open\(socket\)[\s\S]*?message\(socket, rawMessage\)[\s\S]*?close\(socket, code, reason\)[\s\S]*?drain\(socket\)/)
    expect(source).toMatch(/if \(isRealtimePayloadOnControlChannel\(rawMessage\)\)/)
    expect(source).toMatch(/if \(message === null\)[\s\S]*?else if \(!applicationMessageAllowed[\s\S]*?else if \(!acceptControlMessageMonitor/)
    for (const kind of messageKinds) {
      expect(source).toContain(`case "${kind}":`)
    }
    expect(source.match(/case "[^"]+":/g)).toHaveLength(messageKinds.length)
    expect(source).toContain("handleLifecycleRetirement(socket, message)")
    expect(source).toContain("handleBrowserLifecycleSnapshot(socket, message)")
    expect(source).toContain("handlePong(socket, message)")
    expect(source).toContain("await handleIdentity(socket, message)")
    expect(source).toContain("await handlePushSubscription(socket, message)")
    expect(source).toContain("handlePeerSignal(socket, message)")
    expect(source).toContain("handlePeerFailure(socket, message)")
    expect(source).toContain("handleTabs(socket, message)")
  })
})
