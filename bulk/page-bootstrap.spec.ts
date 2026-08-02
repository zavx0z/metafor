import {describe, expect, test} from "bun:test"
import {readFileSync} from "node:fs"
import {
  GRAPH_SCHEMA,
  READ_GRAPH_METHOD,
  parseMetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import {buildBulkManifestation} from "./manifestation.ts"
import {projectBulkGraph} from "./graph.ts"
import {BulkMonad} from "./monad.ts"
import {
  BULK_INITIAL_JSON_MARKER,
  bulkInitialPageErrorResponse,
  embedBulkInitialScene,
  parseBulkInitialJson,
  serializeBulkInitialJson,
  serveBulkInitialPage,
} from "./page-bootstrap.ts"
import {
  isBulkInitialScene,
  prepareBulkInitialVisual,
  type BulkInitialScene,
} from "./visual-initial.ts"

const ROOT = parseMetaAddress("example/root")!

const graph = (name = "Root"): Graph => ({
  schema: GRAPH_SCHEMA,
  root: ROOT,
  template: {
    [ROOT]: {
      name,
      fields: [],
      superposition: [],
      mass: [],
      processes: [],
    },
  },
  runtime: {
    roots: [{
      kind: "atom",
      declaration: "#/template/example~1root",
      meta: ROOT,
      state: null,
      values: {},
    }],
  },
})

const initialScene = (
  session = "page-session",
  name = "Root",
): BulkInitialScene => {
  const document = graph(name)
  const projection = projectBulkGraph(document).runtime
  const manifest = buildBulkManifestation(projection, ROOT)
  return {
    kind: "bulk-ready-scene",
    version: 1,
    throughTs: null,
    rootSrc: ROOT,
    visual: prepareBulkInitialVisual(manifest, projection),
    session,
  }
}

const shell = (): string =>
  `<!doctype html><canvas></canvas><script id="bulk-initial" type="application/json">${BULK_INITIAL_JSON_MARKER}</script><script type="module" src="/client.js"></script>`

const embeddedText = (html: string): string => {
  const marker = '<script id="bulk-initial" type="application/json">'
  const start = html.indexOf(marker)
  if (start < 0) throw new Error("Initial script is absent")
  const contentStart = start + marker.length
  const end = html.indexOf("</script>", contentStart)
  if (end < 0) throw new Error("Initial script is not closed")
  return html.slice(contentStart, end)
}

describe("Bulk dynamic GET bootstrap", () => {
  test("embeds one valid inert initial scene and disables page caching", async () => {
    let session = 0
    const prepared: string[] = []
    const dependencies = {
      openSession: () => `page-${++session}`,
      cancelSession() {},
      async prepareInitial(value: string) {
        prepared.push(value)
        return initialScene(value)
      },
      async readShell() {
        return shell()
      },
    }

    const first = await serveBulkInitialPage(dependencies)
    const second = await serveBulkInitialPage(dependencies)
    const firstValue = parseBulkInitialJson(embeddedText(await first.text()))
    const secondValue = parseBulkInitialJson(embeddedText(await second.text()))

    expect(prepared).toEqual(["page-1", "page-2"])
    expect(firstValue.session).toBe("page-1")
    expect(secondValue.session).toBe("page-2")
    expect(isBulkInitialScene(firstValue)).toBe(true)
    expect(Object.keys(firstValue).sort()).toEqual([
      "kind",
      "rootSrc",
      "session",
      "throughTs",
      "version",
      "visual",
    ])
    expect(JSON.stringify(firstValue)).not.toContain('\"graph\":')
    expect(JSON.stringify(firstValue)).not.toContain('\"manifest\":')
    expect(first.headers.get("cache-control")).toBe("private, no-store, max-age=0")
    expect(first.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(first.headers.get("x-content-type-options")).toBe("nosniff")
  })

  test("reads one fresh rootless Dark Graph for every dynamic GET", async () => {
    const documents = [graph("First"), graph("Second")]
    const calls: Array<{
      target: string
      method: string
      params: unknown
      options: unknown
    }> = []
    const peer = {
      async call(
        target: string,
        method: string,
        params: unknown,
        options: unknown,
      ): Promise<Graph> {
        calls.push({target, method, params, options})
        const document = documents.shift()
        if (document === undefined) throw new Error("Unexpected Graph read")
        return structuredClone(document)
      },
    }
    const monad = new BulkMonad()
    await monad.onServerStarted()
    monad.onRuntimeBorn()
    let session = 0
    const dependencies = {
      openSession: () => `fresh-${++session}`,
      cancelSession() {},
      prepareInitial: async (value: string) =>
        await monad.openFreshObserver(peer as never, value),
      async readShell() {
        return shell()
      },
    }

    const first = parseBulkInitialJson(embeddedText(
      await (await serveBulkInitialPage(dependencies)).text(),
    ))
    const second = parseBulkInitialJson(embeddedText(
      await (await serveBulkInitialPage(dependencies)).text(),
    ))

    expect(first.visual.payload.tori[0]?.label).toBe("First")
    expect(second.visual.payload.tori[0]?.label).toBe("Second")
    expect("graph" in first).toBe(false)
    expect("manifest" in first).toBe(false)
    expect(calls).toEqual([
      {
        target: "dark",
        method: READ_GRAPH_METHOD,
        params: {},
        options: {waitMs: 30_000},
      },
      {
        target: "dark",
        method: READ_GRAPH_METHOD,
        params: {},
        options: {waitMs: 30_000},
      },
    ])
  })

  test("escapes script termination and HTML parser hazards without changing data", () => {
    const dangerous = "</script><script>globalThis.compromised=true</script><!--&>\u2028\u2029"
    const initial = initialScene("page-session", dangerous)

    const serialized = serializeBulkInitialJson(initial)
    const html = embedBulkInitialScene(shell(), initial)

    expect(serialized).not.toMatch(/[<>&\u2028\u2029]/)
    expect(html).not.toContain("<script>globalThis.compromised=true</script>")
    expect(parseBulkInitialJson(embeddedText(html))).toEqual(initial)
  })

  test("fails closed when the shell marker is missing or duplicated", () => {
    const initial = initialScene()
    expect(() => embedBulkInitialScene("<html></html>", initial))
      .toThrow("received 0")
    expect(() => embedBulkInitialScene(
      `${BULK_INITIAL_JSON_MARKER}${BULK_INITIAL_JSON_MARKER}`,
      initial,
    )).toThrow("received 2")
  })

  test("returns an explicit non-cacheable 503 and cancels the page session", async () => {
    const cancelled: string[] = []
    const response = await serveBulkInitialPage({
      openSession: () => "not-ready",
      cancelSession: (session) => cancelled.push(session),
      async prepareInitial() {
        throw new Error("Bulk observer cannot open: runtime is not ready (prepared)")
      },
      async readShell() {
        return shell()
      },
    })

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
    expect(await response.json()).toEqual({
      ok: false,
      error: "Bulk observer cannot open: runtime is not ready (prepared)",
    })
    expect(cancelled).toEqual(["not-ready"])
  })

  test("keeps the standalone error response explicit", async () => {
    const response = bulkInitialPageErrorResponse("Dark unavailable")
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ok: false, error: "Dark unavailable"})
  })

  test("browser startup reads embedded JSON and no /initial route remains", () => {
    const client = readFileSync(new URL("./client.ts", import.meta.url), "utf8")
    const server = readFileSync(new URL("./server.ts", import.meta.url), "utf8")
    const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")

    expect(client).not.toContain("fetch(\"/initial\"")
    expect(server).not.toContain("\"/initial\"")
    expect(html).toContain('id="bulk-initial" type="application/json"')
    expect(html).toContain(BULK_INITIAL_JSON_MARKER)
  })
})
