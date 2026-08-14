import {describe, expect, test} from "bun:test"
import {existsSync} from "node:fs"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL("../..", import.meta.url))
const peerRoot = join(hamiltonianRoot, "server/peer")

describe("Hamiltonian peer process package boundary", () => {
  test("keeps host, supervisor, child entry and adapter in one directed runtime chain", async () => {
    const hostSource = await Bun.file(join(hamiltonianRoot, "host.ts")).text()
    const supervisorSource = await Bun.file(join(peerRoot, "process-supervisor.ts")).text()
    const entrySource = await Bun.file(join(peerRoot, "process-entry.ts")).text()
    const adapterSource = await Bun.file(join(peerRoot, "werift-peer.ts")).text()

    expect(hostSource).toMatch(
      /from\s+["']\.\/server\/peer\/process-supervisor\.ts["']/,
    )
    expect(hostSource).toMatch(
      /from\s+["']\.\/server\/peer\/werift-peer\.ts["']/,
    )
    expect(hostSource).not.toContain("peer-supervisor.ts")
    expect(hostSource).not.toContain("peer-process.ts")
    expect(hostSource).not.toContain("./peer/werift-peer.ts")
    expect(hostSource).not.toContain("server/peer/process-entry.ts")

    expect(supervisorSource).toContain(
      'const childEntry = fileURLToPath(new URL("./process-entry.ts", import.meta.url))',
    )
    expect(supervisorSource).toMatch(
      /from\s+["']\.\/werift-peer\.ts["']/,
    )
    expect(supervisorSource).not.toMatch(
      /(?:from\s+|import\s*\()["']\.\/process-entry\.ts["']/,
    )

    expect(entrySource).toMatch(/from\s+["']\.\/werift-peer\.ts["']/)
    expect(entrySource).not.toContain("process-supervisor")
    expect(entrySource).not.toMatch(/from\s+["'](?:\.\.\/)*host\.ts["']/)
    expect(entrySource).not.toMatch(/from\s+["'](?:\.\.\/)*server\.ts["']/)

    expect(adapterSource).not.toContain("process-entry")
    expect(adapterSource).not.toContain("process-supervisor")
    expect(adapterSource).not.toMatch(/from\s+["'](?:\.\.\/)*host\.ts["']/)
    expect(adapterSource).not.toMatch(/from\s+["'](?:\.\.\/)*server\.ts["']/)
  })

  test("removes the historical root and peer directory paths", () => {
    expect(existsSync(join(hamiltonianRoot, "peer-supervisor.ts"))).toBe(false)
    expect(existsSync(join(hamiltonianRoot, "peer-process.ts"))).toBe(false)
    expect(existsSync(join(hamiltonianRoot, "peer/werift-peer.ts"))).toBe(false)
    expect(existsSync(join(hamiltonianRoot, "peer/werift-peer.spec.ts"))).toBe(false)
    expect(existsSync(join(peerRoot, "process-supervisor.ts"))).toBe(true)
    expect(existsSync(join(peerRoot, "process-entry.ts"))).toBe(true)
    expect(existsSync(join(peerRoot, "werift-peer.ts"))).toBe(true)
    expect(existsSync(join(peerRoot, "werift-peer.spec.ts"))).toBe(true)
  })
})
