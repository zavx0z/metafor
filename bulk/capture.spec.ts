import {describe, expect, test} from "bun:test"
import {
  BULK_VIEWPORT_CAPTURE_VERSION,
  type BulkViewportCaptureControlRequest,
  type BulkViewportCaptureControlResponse,
  type BulkViewportCaptureImage,
} from "@metafor/types/bulk/capture"
import type {BulkProjectionSnapshot} from "@metafor/types/bulk/initial"
import {
  BulkViewportCaptureRegistry,
  type BulkViewportObserverClient,
} from "./capture.ts"
import {BulkProjectionStore} from "./projection.ts"

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const PNG_BYTES = 68
const OWNER_SESSION = "owner-observer-session"
const OTHER_SESSION = "other-observer-session"
const EMPTY_PROJECTION: BulkProjectionSnapshot = {
  runtime: {
    atoms: [],
    topologies: [],
    wimps: [],
    fields: [],
    states: [],
    transitions: [],
    conditions: [],
    processes: [],
    reactions: [],
    atomStates: [],
    fieldEnumVariants: [],
    atomValues: [],
    values: [],
    valueItems: [],
    matterParticles: [],
    matterTopologyBindingPaths: [],
    matterChildWimpBindingPaths: [],
  },
  declarations: [],
}

class Client implements BulkViewportObserverClient {
  readonly domain = "bulk"
  readonly sent: BulkViewportCaptureControlRequest[] = []
  sendable = true

  constructor(readonly id: string) {}

  send(message: BulkViewportCaptureControlRequest): boolean {
    if (!this.sendable) return false
    this.sent.push(message)
    return true
  }
}

const request = (
  observerId?: string,
  grant = OWNER_SESSION,
) => ({
  version: BULK_VIEWPORT_CAPTURE_VERSION,
  grant,
  ...(observerId === undefined ? {} : {observerId}),
})

const captureImage = (
  observerId: string,
  sequence: number,
  patch: Partial<BulkViewportCaptureImage> = {},
): BulkViewportCaptureImage => ({
  version: BULK_VIEWPORT_CAPTURE_VERSION,
  observer: {domain: "bulk", id: observerId},
  projection: {throughTs: 1_700_000_000_001, rootSrc: "world/root"},
  viewport: {
    cssWidth: 640,
    cssHeight: 360,
    pixelWidth: 1_280,
    pixelHeight: 720,
    devicePixelRatio: 2,
  },
  sequence,
  capturedAt: "2026-07-28T10:00:00.000Z",
  snapshot: {
    version: 1,
    throughTs: 1_700_000_000_001,
    rootSrc: "world/root",
    projection: structuredClone(EMPTY_PROJECTION),
  },
  mimeType: "image/png",
  pngBytes: PNG_BYTES,
  pngBase64: PNG_BASE64,
  ...patch,
})

const respond = (
  registry: BulkViewportCaptureRegistry,
  client: Client,
  request: BulkViewportCaptureControlRequest,
  image = captureImage(client.id, request.sequence),
): boolean => {
  const response: BulkViewportCaptureControlResponse = {
    control: "bulk.viewport.capture.response",
    version: BULK_VIEWPORT_CAPTURE_VERSION,
    id: request.id,
    result: {ok: true, capture: image},
  }
  return registry.receive(client, response)
}

const allowedRegistry = (
  options: ConstructorParameters<typeof BulkViewportCaptureRegistry>[0] = {},
) => new BulkViewportCaptureRegistry({
  minIntervalMs: 0,
  randomId: () => "capture",
  ...options,
})

describe("Bulk observer viewport capture registry", () => {
  test("defaults to deny and never treats an observer id as authorization", async () => {
    const registry = new BulkViewportCaptureRegistry()
    registry.connect(new Client("visible-observer"), OTHER_SESSION)

    expect(await registry.capture(request("visible-observer"), {source: "codex"})).toEqual({
      ok: false,
      error: {
        code: "permission_denied",
        message: "Bulk observer session is not bound to this Monad caller",
      },
    })
  })

  test("binds the live observer session to one Monad caller without deployment configuration", async () => {
    const registry = allowedRegistry()
    const owner = new Client("owner")
    const unrelated = new Client("unrelated")
    registry.connect(owner, OWNER_SESSION)
    registry.connect(unrelated, OTHER_SESSION)

    const allowed = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    expect(respond(registry, owner, owner.sent[0]!)).toBe(true)
    expect((await allowed).ok).toBe(true)

    expect(await registry.capture(request("owner"), {source: "other-caller"})).toMatchObject({
      ok: false,
      error: {code: "permission_denied"},
    })
    expect(await registry.capture(request("unrelated"), {source: "codex"})).toMatchObject({
      ok: false,
      error: {code: "permission_denied"},
    })
    expect(unrelated.sent).toHaveLength(0)
  })

  test("requires exactly one observer when selector is omitted and reports missing selectors", async () => {
    const registry = allowedRegistry()
    expect(await registry.capture(request(), {source: "codex"})).toMatchObject({
      ok: false,
      error: {code: "observer_not_found"},
    })

    registry.connect(new Client("one"), OWNER_SESSION)
    registry.connect(new Client("two"), OTHER_SESSION)
    expect(await registry.capture(request(), {source: "codex"})).toMatchObject({
      ok: false,
      error: {code: "observer_ambiguous"},
    })
    expect(await registry.capture(request("missing"), {source: "codex"})).toMatchObject({
      ok: false,
      error: {code: "observer_not_found"},
    })
  })

  test("treats duplicate observer ids as ambiguous instead of selecting a socket", async () => {
    const registry = allowedRegistry()
    registry.connect(new Client("duplicate"), OWNER_SESSION)
    registry.connect(new Client("duplicate"), OTHER_SESSION)

    expect(await registry.capture(request("duplicate"), {source: "codex"})).toMatchObject({
      ok: false,
      error: {code: "observer_ambiguous"},
    })
  })

  test("returns the selected observer PNG with frozen projection and viewport metadata", async () => {
    const registry = allowedRegistry()
    const client = new Client("owner-viewport")
    registry.connect(client, OWNER_SESSION)

    const pending = registry.capture(request("owner-viewport"), {source: "codex"})
    await Bun.sleep(0)
    expect(client.sent).toHaveLength(1)
    const control = client.sent[0]!
    expect(respond(registry, client, control)).toBe(true)

    const result = await pending
    expect(result).toEqual({
      ok: true,
      capture: captureImage("owner-viewport", 1),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const hydrated = new BulkProjectionStore()
      hydrated.hydrate(result.capture.snapshot.projection)
      expect(hydrated.snapshot()).toEqual(EMPTY_PROJECTION)
      expect(result.capture.snapshot.throughTs).toBe(result.capture.projection.throughTs)
      expect(result.capture.snapshot.rootSrc).toBe(result.capture.projection.rootSrc)
    }
  })

  test("allows only one in-flight capture per observer", async () => {
    const registry = allowedRegistry()
    const client = new Client("owner")
    registry.connect(client, OWNER_SESSION)

    const first = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    expect(await registry.capture(request("owner"), {source: "codex"})).toMatchObject({
      ok: false,
      error: {code: "capture_in_flight"},
    })
    respond(registry, client, client.sent[0]!)
    await first
  })

  test("rate limits completed captures with a bounded retry interval", async () => {
    let now = 10_000
    const registry = allowedRegistry({minIntervalMs: 1_000, now: () => now})
    const client = new Client("owner")
    registry.connect(client, OWNER_SESSION)

    const first = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    respond(registry, client, client.sent[0]!)
    await first

    expect(await registry.capture(request("owner"), {source: "codex"})).toMatchObject({
      ok: false,
      error: {code: "rate_limited", retryAfterMs: 1_000},
    })
    now += 1_000
    const second = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    respond(registry, client, client.sent[1]!)
    expect((await second).ok).toBe(true)
  })

  test("ignores spoofed, duplicate, and late responses without settling another capture", async () => {
    const registry = allowedRegistry({timeoutMs: 15})
    const owner = new Client("owner")
    const spoof = new Client("spoof")
    registry.connect(owner, OWNER_SESSION)
    registry.connect(spoof, OTHER_SESSION)

    let settled = false
    const pending = registry.capture(request("owner"), {source: "codex"}).then((result) => {
      settled = true
      return result
    })
    await Bun.sleep(0)
    const control = owner.sent[0]!
    expect(respond(registry, spoof, control, captureImage("owner", control.sequence))).toBe(true)
    await Bun.sleep(0)
    expect(settled).toBe(false)

    expect(respond(registry, owner, control)).toBe(true)
    expect((await pending).ok).toBe(true)
    expect(respond(registry, owner, control)).toBe(true)

    const timedOut = registry.capture(request("spoof", OTHER_SESSION), {source: "codex"})
    await Bun.sleep(0)
    const late = spoof.sent[0]!
    expect(await timedOut).toMatchObject({ok: false, error: {code: "capture_timeout"}})
    expect(respond(registry, spoof, late)).toBe(true)
  })

  test("cancels an in-flight capture when its selected observer disconnects", async () => {
    const registry = allowedRegistry()
    const client = new Client("owner")
    const disconnect = registry.connect(client, OWNER_SESSION)

    const pending = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    disconnect()
    expect(await pending).toMatchObject({
      ok: false,
      error: {code: "observer_disconnected"},
    })
  })

  test("reports unavailable, viewport, payload, and malformed response failures distinctly", async () => {
    const registry = allowedRegistry({
      limits: {
        maxCssWidth: 1_000,
        maxCssHeight: 1_000,
        maxPixelWidth: 2_000,
        maxPixelHeight: 2_000,
        maxPixels: 4_000_000,
        maxPngBytes: PNG_BYTES,
        maxSnapshotBytes: 1_024,
      },
    })
    const client = new Client("owner")
    registry.connect(client, OWNER_SESSION)

    const unavailable = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    const first = client.sent[0]!
    registry.receive(client, {
      control: "bulk.viewport.capture.response",
      version: 1,
      id: first.id,
      result: {ok: false, error: {code: "capture_unavailable", message: "no toBlob"}},
    })
    expect(await unavailable).toMatchObject({ok: false, error: {code: "capture_unavailable"}})

    const tooWide = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    const second = client.sent[1]!
    respond(registry, client, second, captureImage("owner", second.sequence, {
      viewport: {
        cssWidth: 1_001,
        cssHeight: 360,
        pixelWidth: 1_280,
        pixelHeight: 720,
        devicePixelRatio: 2,
      },
    }))
    expect(await tooWide).toMatchObject({ok: false, error: {code: "viewport_too_large"}})

    const tooLarge = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    const third = client.sent[2]!
    respond(registry, client, third, captureImage("owner", third.sequence, {
      pngBytes: PNG_BYTES + 1,
    }))
    expect(await tooLarge).toMatchObject({ok: false, error: {code: "payload_too_large"}})

    const malformed = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    const fourth = client.sent[3]!
    respond(registry, client, fourth, captureImage("other", fourth.sequence))
    expect(await malformed).toMatchObject({ok: false, error: {code: "invalid_response"}})

    const mismatchedCut = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    const fifth = client.sent[4]!
    respond(registry, client, fifth, captureImage("owner", fifth.sequence, {
      snapshot: {
        version: 1,
        throughTs: 1_700_000_000_001,
        rootSrc: "another/root",
        projection: structuredClone(EMPTY_PROJECTION),
      },
    }))
    expect(await mismatchedCut).toMatchObject({ok: false, error: {code: "invalid_response"}})

    const oversizedSnapshot = registry.capture(request("owner"), {source: "codex"})
    await Bun.sleep(0)
    const sixth = client.sent[5]!
    const largeProjection = structuredClone(EMPTY_PROJECTION)
    largeProjection.declarations.push({
      src: "owner/root",
      section: "meta",
      localId: "root",
      value: {payload: "x".repeat(2_000)},
    })
    respond(registry, client, sixth, captureImage("owner", sixth.sequence, {
      snapshot: {
        version: 1,
        throughTs: 1_700_000_000_001,
        rootSrc: "world/root",
        projection: largeProjection,
      },
    }))
    expect(await oversizedSnapshot).toMatchObject({ok: false, error: {code: "payload_too_large"}})
  })
})
