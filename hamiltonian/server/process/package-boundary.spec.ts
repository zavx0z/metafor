import {describe, expect, test} from "bun:test"
import {existsSync} from "node:fs"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL("../..", import.meta.url))
const processRoot = join(hamiltonianRoot, "server/process")

describe("Hamiltonian Bun process package boundary", () => {
  test("keeps host, supervisor and child entry in one directed runtime chain", async () => {
    const hostSource = await Bun.file(join(hamiltonianRoot, "host.ts")).text()
    const supervisorSource = await Bun.file(join(processRoot, "embodiment-supervisor.ts")).text()
    const entrySource = await Bun.file(join(processRoot, "embodiment-entry.ts")).text()

    expect(hostSource).toMatch(
      /from\s+["']\.\/server\/process\/embodiment-supervisor\.ts["']/,
    )
    expect(hostSource).not.toContain("bun-embodiment.ts")
    expect(hostSource).not.toContain("embodiment-entry.ts")

    expect(supervisorSource).toContain(
      'const childEntry = fileURLToPath(new URL("./embodiment-entry.ts", import.meta.url))',
    )
    expect(supervisorSource).toMatch(
      /cmd:\s*\[process\.execPath,\s*childEntry,\s*incarnation,\s*this\.role,\s*payload\.serverEntityId,\s*ipcTransportId\]/,
    )
    expect(supervisorSource).not.toMatch(
      /(?:from\s+|import\s*\()["']\.\/embodiment-entry\.ts["']/,
    )

    expect(entrySource).not.toContain("embodiment-supervisor")
    expect(entrySource).not.toMatch(/from\s+["'](?:\.\.\/)*host\.ts["']/)
    expect(entrySource).not.toMatch(/from\s+["'](?:\.\.\/)*server\.ts["']/)
  })

  test("removes the historical root process paths", () => {
    expect(existsSync(join(hamiltonianRoot, "bun-embodiment.ts"))).toBe(false)
    expect(existsSync(join(hamiltonianRoot, "embodiment-process.ts"))).toBe(false)
    expect(existsSync(join(processRoot, "embodiment-supervisor.ts"))).toBe(true)
    expect(existsSync(join(processRoot, "embodiment-entry.ts"))).toBe(true)
  })
})
