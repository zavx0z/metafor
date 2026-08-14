import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const hamiltonianRoot = fileURLToPath(new URL(".", import.meta.url))

describe("Hamiltonian server entrypoint boundary", () => {
  test("starts through a thin server entrypoint and keeps host importable", async () => {
    const packageManifest = await Bun.file(join(hamiltonianRoot, "package.json")).json() as {
      scripts?: Record<string, string>
    }
    const serverSource = await Bun.file(join(hamiltonianRoot, "server.ts")).text()
    const hostSource = await Bun.file(join(hamiltonianRoot, "host.ts")).text()

    expect(packageManifest.scripts?.start).toBe("bun run server.ts")
    expect(serverSource).toMatch(/import\s+\{createHamiltonianHost}\s+from\s+["']\.\/host\.ts["']/)
    expect(serverSource).toContain("createHamiltonianHost()")

    expect(serverSource).not.toMatch(/\bBun\.(?:serve|build|spawn)\b/)
    for (const route of [
      "/control",
      "/index.html",
      "/lab/status",
      "/lab/wake-service-worker",
      "/layout-worker.js",
      "/manifest.json",
      "/orchestration.js",
      "/push/vapid-public-key",
      "/sw-entry.js",
      "/web-push-client.js",
    ]) {
      expect(serverSource).not.toContain(route)
    }

    expect(hostSource).not.toContain("import.meta.main")
    expect(hostSource).not.toContain("advertisedHosts")
    expect(hostSource).not.toContain("networkInterfaces")
    expect(hostSource).not.toContain("One listener:")
    expect(hostSource).not.toContain("Remote browsers need trusted HTTPS")
  })
})
