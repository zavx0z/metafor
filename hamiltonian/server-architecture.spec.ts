import {describe, expect, test} from "bun:test"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL(".", import.meta.url))
const serverPath = fileURLToPath(new URL("./server.ts", import.meta.url))
const releaseDeliveryPath = fileURLToPath(new URL("./release/server/delivery.ts", import.meta.url))
const releaseUpdatePath = fileURLToPath(new URL("./release/server/update.ts", import.meta.url))
const rpcServerPath = fileURLToPath(new URL("./release/server/rpc/index.ts", import.meta.url))

const routes = [
  '"/"',
  '"/manifest.webmanifest"',
  '"/assets/fonts/JetBrainsMono-Bold.ttf"',
  '"/assets/*"',
  '"/@hamiltonian/:module"',
  '"/@internal/:module"',
  '"/@metafor/:module"',
  '"/code"',
  '"/sw"',
  '"/*"',
] as const

describe("Hamiltonian singleton server boundary", () => {
  test("keeps one Bun server and the complete root route composition in server.ts", async () => {
    const source = await Bun.file(serverPath).text()
    const packageJson = await Bun.file(`${hamiltonianRoot}/package.json`).json() as {
      scripts?: {start?: string}
    }

    expect(packageJson.scripts?.start).toBe(
      "bun --conditions=hamiltonian:server --conditions=internal:server --port=4444 server",
    )
    expect(source.match(/Bun\.serve</g)).toHaveLength(1)
    expect(source.indexOf("await recoverPublication()"))
      .toBeLessThan(source.indexOf("Bun.serve<RpcSocketData>"))
    expect(source).not.toContain("class ")
    expect(source).toContain('from "@hamiltonian/release"')
    expect(source).not.toContain("@internal/rpc")
    expect(source).toContain("GET: getRelease")
    expect(source).toMatch(/POST: \(request: Request, server: Bun\.Server<RpcSocketData>\) => publishRelease\(request/)
    expect(source).toContain("open: openRpc")
    expect(source).toContain("message: messageRpc")
    expect(source).toContain("close: closeRpc")
    expect(source).toContain('"/assets/*": async (request: Request) =>')

    const declarations = [...source.matchAll(/^\s{4}("\/[^\"]*"):/gm)]
      .map((match) => match[1])
    expect(declarations).toEqual([...routes])
  })

  test("shows transport wiring while release package owns its implementation", async () => {
    const [source, delivery, update, rpcServer] = await Promise.all([
      Bun.file(serverPath).text(),
      Bun.file(releaseDeliveryPath).text(),
      Bun.file(releaseUpdatePath).text(),
      Bun.file(rpcServerPath).text(),
    ])

    expect(source).toContain('"/code": {')
    expect(source).toMatch(/"\/sw": \(request: Request, server: Bun\.Server<RpcSocketData>\) => upgradeRpc\(request, server\)/)
    expect(source).not.toContain("releaseRoute")
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

  test("keeps the complete RPC implementation inside @hamiltonian/release server env", async () => {
    const source = await Bun.file(rpcServerPath).text()
    expect(source).toContain("socket.subscribe(rpcServiceTopic)")
    expect(source).toContain("socket.unsubscribe(rpcServiceTopic)")
    expect(source).toContain('source: "release/service"')
  })
})
