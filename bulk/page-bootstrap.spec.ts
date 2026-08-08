import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {BulkStoreInitial} from "@metafor/types/bulk/store"
import snapshotJson from "./fixture/oracle-snapshot.json"
import {
  bulkInitialPageErrorResponse,
  bulkPageShellResponse,
  parseBulkInitialValue,
  readBulkInitialResponse,
  serveBulkInitialStore,
  serveBulkPageShell,
} from "./page-bootstrap.ts"
import {buildBulkStore, isBulkStoreInitial} from "./store.ts"
import {BulkVisualSceneLifecycle} from "./visual.ts"
import {prepareBulkInitialVisual} from "./visual-initial.ts"

const baseStore = () => {
  const lifecycle = new BulkVisualSceneLifecycle()
  lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
  const state = lifecycle.state()
  return buildBulkStore(
    state.manifest,
    prepareBulkInitialVisual(state.manifest, state.projection).payload,
  )
}

const initialStore = (
  session = "page-session",
  rootLabel?: string,
): BulkStoreInitial => {
  const store = baseStore()
  if (rootLabel !== undefined) {
    store.text.push(rootLabel)
    store.dark.label[0] = store.text.length - 1
  }
  return {session, store}
}

describe("Bulk Store split page bootstrap", () => {
  test("ships an immediate loader and starts initial fetch without embedded data", async () => {
    const html = await Bun.file(new URL("./index.html", import.meta.url)).text()

    expect(html).toContain('id="bulk-loader"')
    expect(html).toContain('fetch("/initial"')
    expect(html).toContain('__METAFOR_BULK_INITIAL_RESPONSE__')
    expect(html).not.toContain('id="bulk-initial"')
    expect(html).not.toContain("__METAFOR_BULK_INITIAL_JSON__")
  })

  test("returns the page shell without opening or preparing an initial session", async () => {
    let shellReads = 0
    const response = await serveBulkPageShell({
      async readShell() {
        shellReads++
        return "<!doctype html><canvas id=\"bulk-canvas\"></canvas>"
      },
    })

    expect(shellReads).toBe(1)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("bulk-canvas")
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  test("serves one validated Store per dedicated initial request", async () => {
    let session = 0
    const prepared: string[] = []
    const dependencies = {
      openSession: () => `page-${++session}`,
      cancelSession() {},
      async prepareInitial(value: string) {
        prepared.push(value)
        return initialStore(value)
      },
    }
    const firstResponse = await serveBulkInitialStore(dependencies)
    const secondResponse = await serveBulkInitialStore(dependencies)
    const first = await readBulkInitialResponse(firstResponse)
    const second = await readBulkInitialResponse(secondResponse)

    expect(prepared).toEqual(["page-1", "page-2"])
    expect(first.session).toBe("page-1")
    expect(second.session).toBe("page-2")
    expect(isBulkStoreInitial(first)).toBe(true)
    expect(Object.keys(first).sort()).toEqual(["session", "store"])
    const json = JSON.stringify(first)
    for (const forbidden of ["graph", "manifest", "readyScene", "throughTs", "version", "path"]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
    expect(firstResponse.headers.get("cache-control")).toBe("private, no-store, max-age=0")
    expect(firstResponse.headers.get("content-type")).toBe("application/json; charset=utf-8")
    expect(firstResponse.headers.get("x-content-type-options")).toBe("nosniff")
  })

  test("round-trips visible text as JSON without HTML embedding", async () => {
    const dangerous = "</script><script>globalThis.compromised=true</script><!--&>\u2028\u2029"
    const initial = initialStore("page-session", dangerous)
    const response = await serveBulkInitialStore({
      openSession: () => "page-session",
      cancelSession() {},
      async prepareInitial() { return initial },
    })

    expect(response.headers.get("content-type")?.startsWith("application/json")).toBe(true)
    expect(await readBulkInitialResponse(response)).toEqual(initial)
  })

  test("returns a non-cacheable 503 and cancels a failed handoff session", async () => {
    const cancelled: string[] = []
    const response = await serveBulkInitialStore({
      openSession: () => "not-ready",
      cancelSession: (session) => cancelled.push(session),
      async prepareInitial() { throw new Error("Bulk Store is not ready") },
    })
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
    expect(await response.json()).toEqual({ok: false, error: "Bulk Store is not ready"})
    expect(cancelled).toEqual(["not-ready"])
  })

  test("reports invalid and failed initial responses exactly", async () => {
    expect(() => parseBulkInitialValue({session: "only"})).toThrow(
      "Bulk initial response is not one validated Bulk Store",
    )
    await expect(readBulkInitialResponse(Response.json(
      {ok: false, error: "Boundary unavailable"},
      {status: 503},
    ))).rejects.toThrow("Bulk initial request failed with 503: Boundary unavailable")
  })

  test("keeps standalone shell and error responses explicit", async () => {
    const shell = bulkPageShellResponse("<html></html>")
    expect(shell.headers.get("content-type")).toBe("text/html; charset=utf-8")
    const error = bulkInitialPageErrorResponse("Boundary unavailable")
    expect(error.status).toBe(503)
    expect(await error.json()).toEqual({ok: false, error: "Boundary unavailable"})
  })
})
