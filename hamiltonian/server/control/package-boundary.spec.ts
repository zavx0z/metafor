import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL("../..", import.meta.url))
const protocolPath = join(hamiltonianRoot, "server/control/protocol.ts")

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
})
