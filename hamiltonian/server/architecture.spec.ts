import {describe, expect, test} from "bun:test"
import {existsSync} from "node:fs"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL("..", import.meta.url))

describe("Hamiltonian Bun server architecture", () => {
  test("keeps the production listener direct and removes the hidden host factory", async () => {
    const packageManifest = await Bun.file(join(hamiltonianRoot, "package.json")).json() as {
      scripts?: Record<string, string>
    }
    const serverSource = await Bun.file(join(hamiltonianRoot, "server.ts")).text()
    const compositionSource = await Bun.file(join(hamiltonianRoot, "server/composition.ts")).text()

    expect(packageManifest.scripts?.start).toBe("bun run server.ts")
    expect(serverSource).toMatch(/export const server = Bun\.serve<HamiltonianControlSocketData>\(\{/)
    expect(serverSource).toContain("routes: composition.routes.table")
    expect(serverSource).toContain("websocket: composition.control.websocket")
    expect(serverSource).not.toContain("createHamiltonianHost")
    expect(serverSource).not.toContain("startHamiltonianServer")
    expect(compositionSource).not.toContain("Bun.serve")
    expect(existsSync(join(hamiltonianRoot, "host.ts"))).toBe(false)
    expect(existsSync(join(hamiltonianRoot, "server/http-router.ts"))).toBe(false)
  })

  test("keeps mechanism dependencies directed away from the entrypoint and routes", async () => {
    const mechanismPaths = [
      "server/browser/publication.ts",
      "server/browser/release.ts",
      "server/control/session.ts",
      "server/lifecycle.ts",
      "server/observation.ts",
      "server/peer/coordinator.ts",
      "server/process/coordinator.ts",
      "server/status.ts",
      "server/topology.ts",
      "server/web-push/coordinator.ts",
    ]
    for (const path of mechanismPaths) {
      const source = await Bun.file(join(hamiltonianRoot, path)).text()
      expect(source).not.toMatch(/from\s+["'][^"']*server\.ts["']/)
      expect(source).not.toMatch(/from\s+["'][^"']*routes\.ts["']/)
    }
  })
})
