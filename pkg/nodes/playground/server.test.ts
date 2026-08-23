import {describe, expect, test} from "bun:test"
import {fileURLToPath} from "node:url"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("parent nodes playground server", () => {
  test("serves the exact live route through the shared no-HMR HTML shell", async () => {
    const port = await freePort()
    const process = Bun.spawn(["bun", "server.ts"], {
      cwd: playgroundRoot,
      env: {
        ...Bun.env,
        NODES_PLAYGROUND_HOST: "127.0.0.1",
        NODES_PLAYGROUND_PORT: String(port),
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    try {
      const response = await waitForResponse(`http://127.0.0.1:${port}/node-tree/runtime/live`)
      const html = await response.text()
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-cache")
      expect(html).toContain("<title>nodes</title>")
      expect(html).toContain('<canvas id="nodes-playground-canvas"></canvas>')
      expect(html).toContain('<script type="module" src="/entry.js"></script>')
    } finally {
      process.kill()
      await process.exited
    }
  }, 15_000)
})

async function freePort(): Promise<number> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("probe"),
  })
  const port = server.port
  server.stop(true)
  if (port === undefined) throw new Error("Bun did not allocate a test port")
  return port
}

async function waitForResponse(url: string): Promise<Response> {
  const deadline = Date.now() + 5_000
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`Unexpected HTTP status: ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await Bun.sleep(25)
  }
  throw new Error(`Playground server did not become ready: ${String(lastError)}`)
}
