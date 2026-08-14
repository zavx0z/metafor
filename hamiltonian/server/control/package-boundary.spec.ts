import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL("../..", import.meta.url))
const protocolPath = join(hamiltonianRoot, "server/control/protocol.ts")
const endpointPath = join(hamiltonianRoot, "server/control/endpoint.ts")

describe("Hamiltonian control protocol boundary", () => {
  test("keeps the protocol pure and directed into host composition", async () => {
    const hostSource = await Bun.file(join(hamiltonianRoot, "host.ts")).text()
    const protocolSource = await Bun.file(protocolPath).text()

    expect(hostSource).toMatch(
      /from\s+["']\.\/server\/control\/protocol\.ts["']/,
    )
    expect(hostSource).toContain("parseHamiltonianControlClientMessage(rawMessage)")
    expect(hostSource).toContain("isHamiltonianRealtimePayloadOnControlChannel(rawMessage)")
    expect(protocolSource).not.toMatch(/(?:from\s+|import\s*\()["'](?:\.\.\/)*host\.ts["']/)
    expect(protocolSource).not.toContain("Bun.serve")
    expect(protocolSource).not.toContain("ServerWebSocket")
    expect(protocolSource).not.toContain("setTimeout")
    expect(protocolSource).not.toMatch(/\.(?:send|close|upgrade)\s*\(/)
  })

  test("keeps upgrade and socket state in one endpoint behind host delegation", async () => {
    const hostSource = await Bun.file(join(hamiltonianRoot, "host.ts")).text()
    const endpointSource = await Bun.file(endpointPath).text()

    expect(hostSource).toMatch(
      /from\s+["']\.\/server\/control\/endpoint\.ts["']/,
    )
    expect(
      hostSource.match(/controlEndpoint\.upgrade\(request,\s*url,\s*bunServer\)/g),
    ).toHaveLength(1)
    expect(hostSource).not.toContain("url.searchParams.get(")
    expect(hostSource).not.toContain("bunServer.upgrade(")
    expect(hostSource).not.toContain("controlConnectionGeneration")
    expect(hostSource).not.toContain("interface SocketData")
    expect(hostSource).toContain("controlEndpoint.currentConnectionGeneration")

    expect(endpointSource).not.toMatch(/(?:from\s+|import\s*\()["'](?:\.\.\/)*host\.ts["']/)
    expect(endpointSource).toContain("export interface HamiltonianControlSocketData")
    expect(endpointSource).toContain("url.searchParams.get(")
    expect(endpointSource).toContain("server.upgrade(request")
    expect(endpointSource).not.toMatch(/\b(?:open|message|close)\s*\(socket/)
    expect(endpointSource).not.toContain("Bun.serve")
  })
})
