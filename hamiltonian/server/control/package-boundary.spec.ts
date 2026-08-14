import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL("../..", import.meta.url))
const protocolPath = join(hamiltonianRoot, "server/control/protocol.ts")
const endpointPath = join(hamiltonianRoot, "server/control/endpoint.ts")

describe("Hamiltonian control protocol boundary", () => {
  test("keeps the protocol pure and directed into the control session", async () => {
    const sessionSource = await Bun.file(join(hamiltonianRoot, "server/control/session.ts")).text()
    const protocolSource = await Bun.file(protocolPath).text()

    expect(sessionSource).toMatch(/from\s+["']\.\/protocol\.ts["']/)
    expect(sessionSource).toContain("parseHamiltonianControlClientMessage(rawMessage)")
    expect(sessionSource).toContain("isHamiltonianRealtimePayloadOnControlChannel(rawMessage)")
    expect(protocolSource).not.toMatch(/(?:from\s+|import\s*\()["'](?:\.\.\/)*host\.ts["']/)
    expect(protocolSource).not.toContain("Bun.serve")
    expect(protocolSource).not.toContain("ServerWebSocket")
    expect(protocolSource).not.toContain("setTimeout")
    expect(protocolSource).not.toMatch(/\.(?:send|close|upgrade)\s*\(/)
  })

  test("keeps upgrade generation in endpoint behind session delegation", async () => {
    const sessionSource = await Bun.file(join(hamiltonianRoot, "server/control/session.ts")).text()
    const endpointSource = await Bun.file(endpointPath).text()

    expect(sessionSource).toMatch(/from\s+["']\.\/endpoint\.ts["']/)
    expect(sessionSource).toContain("this.#endpoint.upgrade(request, url, server)")
    expect(sessionSource).not.toContain("url.searchParams.get(")
    expect(sessionSource).not.toContain("server.upgrade(request")
    expect(sessionSource).not.toContain("controlConnectionGeneration")
    expect(sessionSource).toContain("this.#endpoint.currentConnectionGeneration")

    expect(endpointSource).not.toMatch(/(?:from\s+|import\s*\()["'](?:\.\.\/)*host\.ts["']/)
    expect(endpointSource).toContain("export interface HamiltonianControlSocketData")
    expect(endpointSource).toContain("url.searchParams.get(")
    expect(endpointSource).toContain("server.upgrade(request")
    expect(endpointSource).not.toMatch(/\b(?:open|message|close)\s*\(socket/)
    expect(endpointSource).not.toContain("Bun.serve")
  })
})
