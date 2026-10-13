import {describe, expect, test} from "bun:test"
import {fileURLToPath} from "node:url"

const cosmosRoot = fileURLToPath(new URL(".", import.meta.url))
const serverPath = fileURLToPath(new URL("./server.ts", import.meta.url))
const releaseRuntimePath = fileURLToPath(new URL("./release/server/runtime.ts", import.meta.url))
const releaseDeliveryPath = fileURLToPath(new URL("./release/server/http/delivery.ts", import.meta.url))
const releaseUpdatePath = fileURLToPath(new URL("./release/server/release/update.ts", import.meta.url))
const rpcServerPath = fileURLToPath(new URL("./release/server/rpc/index.ts", import.meta.url))

const routes = [
  '"/"',
  '"/manifest.webmanifest"',
  '"/assets/fonts/jetbrains-mono-bold.ttf"',
  '"/assets/*"',
  '"/@cosmos/:module"',
  '"/@cosmos/:module/*"',
  '"/@internal/:module"',
  '"/@internal/:module/*"',
  '"/@metafor/:module"',
  '"/@metafor/:module/*"',
  '"/code"',
  '"/sw"',
  '"/peer"',
  '"/_quantum/*"',
  '"/health"',
  '"/force"',
  '"/ws"',
  '"/oracle/*"',
  '"/*"',
] as const

describe("Cosmos singleton server boundary", () => {
  test("keeps a thin root while release owns one complete Bun server", async () => {
    const [source, runtime] = await Promise.all([
      Bun.file(serverPath).text(),
      Bun.file(releaseRuntimePath).text(),
    ])
    const packageJson = await Bun.file(`${cosmosRoot}/package.json`).json() as {
      scripts?: {start?: string}
    }

    expect(packageJson.scripts?.start).toBe(
      "env -u COSMOS_RELEASE_INSPECT bun --conditions=cosmos:server --conditions=internal:server --port=4444 server",
    )
    expect(source).toContain('if (Bun.env.COSMOS_RELEASE_STORE)')
    expect(source).toContain('const {runInstalledCosmos} = await import("./installed")')
    expect(source).toContain('await runInstalledCosmos({')
    expect(source).toContain('await runServerStartup({readyTimeoutMs: 120_000})')
    expect(source).not.toContain("Bun.serve")
    expect(runtime.match(/Bun\.serve</g)).toHaveLength(1)
    expect(runtime.indexOf("await recoverPublication()"))
      .toBeLessThan(runtime.indexOf("Bun.serve<ReleaseServerSocketData>"))
    expect(source).not.toContain("class ")
    expect(source).toContain('from "@cosmos/startup"')
    expect(source).not.toContain('from "@cosmos/release"')
    expect(source).not.toContain("@internal/rpc")
    expect(runtime).toContain("GET: getRelease")
    expect(runtime).toMatch(
      /POST: \(request: Request, current: Bun\.Server<ReleaseServerSocketData>\) => publishRelease\(request/,
    )
    for (const operation of ["open", "message", "close"]) {
      expect(runtime).toContain(`agentUi.websocket.${operation}(socket as Bun.ServerWebSocket<AgentBrowserSocketData>`)
      expect(runtime).toContain(`quantum.websocket.${operation}(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>`)
    }
    expect(runtime).toContain("openRpc(socket as Bun.ServerWebSocket<RpcSocketData>)")
    expect(runtime).toContain("messageRpc(socket as Bun.ServerWebSocket<RpcSocketData>, message)")
    expect(runtime).toContain("closeRpc(socket as Bun.ServerWebSocket<RpcSocketData>, code, reason)")
    expect(runtime).toContain('"/assets/*": async (request: Request) =>')

    const declarations = [...runtime.matchAll(/^\s{6}("\/[^"]*"):/gm)]
      .map((match) => match[1])
    expect(declarations).toEqual([...routes])
    for (const route of ["AGENT_UI_PATH", "AGENT_UI_PROVIDER_PATH", "AGENT_UI_CONNECT_PATH", "AGENT_UI_PROFILE_PATH"]) expect(runtime).toContain(`[${route}]:`)
    expect(runtime).toContain('[`${AGENT_BROWSER_PATH}/*`]:')
  })

  test("shows transport wiring while release subjects own their implementation", async () => {
    const [runtime, delivery, update, rpcServer] = await Promise.all([
      Bun.file(releaseRuntimePath).text(),
      Bun.file(releaseDeliveryPath).text(),
      Bun.file(releaseUpdatePath).text(),
      Bun.file(rpcServerPath).text(),
    ])

    expect(runtime).toContain('"/code": {')
    expect(runtime).toMatch(
      /"\/sw": \(request: Request, current: Bun\.Server<ReleaseServerSocketData>\) =>/,
    )
    expect(runtime).toContain("observations.data(request,current)")
    expect(runtime).toContain("observations.message(socket as Bun.ServerWebSocket<RpcSocketData>,value)")
    expect(runtime).not.toContain("releaseRoute")
    expect(delivery).toContain("export async function getRelease")
    expect(update).toContain("export async function publishRelease")
    expect(update).toContain("publishPackages(packages)")
    expect(delivery).not.toContain("Bun.serve")
    expect(update).not.toContain("Bun.serve")
    expect(rpcServer).toContain("export function upgradeRpc")
    expect(rpcServer).toContain("export function openRpc")
    expect(rpcServer).toContain("export async function messageRpc")
    expect(rpcServer).toContain("export function closeRpc")
    expect(rpcServer).not.toMatch(/Bun\.serve\s*[<(]/)
  })

  test("keeps the complete RPC implementation inside @cosmos/release server env", async () => {
    const source = await Bun.file(rpcServerPath).text()
    expect(source).toContain("socket.subscribe(rpcServiceTopic)")
    expect(source).toContain("socket.unsubscribe(rpcServiceTopic)")
    expect(source).toContain('source: "release/service"')
  })
})
