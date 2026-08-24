import {describe, expect, test} from "bun:test"
import {fileURLToPath} from "node:url"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

describe("parent nodes playground server", () => {
  test("serves catalog and every package page from one no-HMR origin", async () => {
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
      const origin = `http://127.0.0.1:${port}`
      const catalog = await waitForResponse(`${origin}/`)
      const catalogHtml = await catalog.text()
      expect(catalog.headers.get("cache-control")).toBe("no-cache")
      expect(catalogHtml).toContain("<title>Nodes playground</title>")
      expect(catalogHtml).toContain('id="nodes-package-catalog"')

      const overviewCases = [
        ["/core/", "@nodes/core", 'id="core-snapshot"', "core"],
        ["/editor/", "@nodes/editor", 'id="nodes-playground-canvas"', "editor"],
        ["/layout/", "@nodes/layout", 'id="svg-view"', "layout"],
        ["/layout-worker/", "@nodes/layout-worker", 'id="worker-request"', "layout-worker"],
        ["/ui/", "@nodes/ui", 'id="nodes-playground-canvas"', "ui"],
      ] as const
      const leafCases = [
        ["/core/live-node-tree", "@nodes/core", 'id="core-snapshot"', "core"],
        ["/editor/live-node-tree", "@nodes/editor", 'id="nodes-playground-canvas"', "editor"],
        ["/layout/fixed-adaptive", "@nodes/layout", 'id="svg-view"', "layout"],
        ["/layout-worker/protocol", "@nodes/layout-worker", 'id="worker-request"', "layout-worker"],
        ["/ui/socket/boolean/input", "@nodes/ui", 'id="nodes-playground-canvas"', "ui"],
      ] as const
      for (const [route, packageName, marker, pageId] of [...overviewCases, ...leafCases]) {
        const response = await fetch(`${origin}${route}`)
        const html = await response.text()
        expect(response.status, route).toBe(200)
        expect(html, route).toContain(`<title>Nodes playground · ${packageName}</title>`)
        expect(html, route).toContain(marker)
        expect(html, route).toContain(`/@playground-assets/${pageId}/entry.js`)
        const entry = await fetch(`${origin}/@playground-assets/${pageId}/entry.js`)
        expect(entry.status, `${pageId} entry`).toBe(200)
        expect(entry.headers.get("content-type"), pageId).toContain("text/javascript")
      }
      expect(await fetch(`${origin}/unknown`).then(({status}) => status)).toBe(404)
      expect(await fetch(`${origin}/core/unknown`).then(({status}) => status)).toBe(404)
      expect(await fetch(`${origin}/ui/socket/unknown`).then(({status}) => status)).toBe(404)
      const redirect = await fetch(`${origin}/core`, {redirect: "manual"})
      expect(redirect.status).toBe(308)
      expect(redirect.headers.get("location")).toBe("/core/")
    } finally {
      process.kill()
      await process.exited
    }
  }, 30_000)
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
