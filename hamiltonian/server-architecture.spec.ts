import {describe, expect, test} from "bun:test"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL(".", import.meta.url))
const serverPath = fileURLToPath(new URL("./server.ts", import.meta.url))
const releaseRoutePath = fileURLToPath(new URL("./release/server/route.ts", import.meta.url))
const rpcServerPath = fileURLToPath(new URL("./internal/rpc/server/index.ts", import.meta.url))

const routes = [
  '"/"',
  '"/manifest.webmanifest"',
  '"/assets/fonts/JetBrainsMono-Bold.ttf"',
  '"/assets/*"',
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

    expect(packageJson.scripts?.start).toBe("bun --port=4444 server")
    expect(source.match(/Bun\.serve</g)).toHaveLength(1)
    expect(source).not.toContain("class ")
    expect(source).toContain('import {releaseRoute} from "@release/server"')
    expect(source).toContain('from "@internal/rpc/server"')
    expect(source).toContain("const code = releaseRoute<RpcSocketData>")
    expect(source).toContain("websocket,")

    const declarations = [...source.matchAll(/^\s{4}("\/[^\"]*"):/gm)]
      .map((match) => match[1])
    expect(declarations).toEqual([...routes])
  })

  test("delegates release and RPC policy to their owning server packages", async () => {
    const [source, releaseRoute, rpcServer] = await Promise.all([
      Bun.file(serverPath).text(),
      Bun.file(releaseRoutePath).text(),
      Bun.file(rpcServerPath).text(),
    ])

    expect(source).toContain('"/code": code')
    expect(source).toContain('"/sw": sw')
    expect(source).not.toMatch(/\bGET:\s|getRelease|publishPackages|packageChanges/)
    expect(releaseRoute).toContain("GET: getRelease")
    expect(releaseRoute).toContain("POST: (request: Request")
    expect(releaseRoute).toContain("publishPackages(packages)")
    expect(releaseRoute).not.toContain("Bun.serve")
    expect(rpcServer).toContain("export const sw =")
    expect(rpcServer).toContain("export const websocket:")
    expect(rpcServer).not.toMatch(/Bun\.serve\s*[<(]/)
  })

  test("keeps the complete RPC WebSocket surface in @internal/rpc/server", async () => {
    const source = await Bun.file(rpcServerPath).text()
    expect(source).toMatch(
      /websocket:[\s\S]*?open\(socket\)[\s\S]*?message\(\) \{\}[\s\S]*?close\(socket, code, reason\)/,
    )
    expect(source).toContain("socket.subscribe(rpcServiceTopic)")
    expect(source).toContain("socket.unsubscribe(rpcServiceTopic)")
    expect(source).toContain('source: "rpc/service"')
  })
})
