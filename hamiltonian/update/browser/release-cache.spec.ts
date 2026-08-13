import {describe, expect, test} from "bun:test"
import {
  HamiltonianBrowserReleaseCacheController,
  responseMatchesHash,
  selectRetainedCaches,
  sha256Hex,
} from "./release-cache.js"

const ORIGIN = "https://hamiltonian.test"

describe("version cache policy", () => {
  test("rehashes bytes and rejects a forged matching metadata header", async () => {
    const valid = new Response("expected bytes")
    const hash = await sha256Hex(valid.clone())
    const verified = new Response("expected bytes", {headers: {"x-hamiltonian-sha256": hash}})
    const corrupted = new Response("different bytes", {headers: {"x-hamiltonian-sha256": hash}})

    expect(await responseMatchesHash(verified, hash)).toBeTrue()
    expect(await responseMatchesHash(corrupted, hash)).toBeFalse()
  })

  test("retains the current and one deterministic rollback cache", () => {
    expect(selectRetainedCaches(
      ["hamiltonian-code:v1", "hamiltonian-code:v2", "hamiltonian-code:v3"],
      "hamiltonian-code:v3",
      "hamiltonian-code:v2",
    )).toEqual(["hamiltonian-code:v2", "hamiltonian-code:v3"])
  })
})

describe("browser release cache controller", () => {
  test("rejects failed, malformed, and host-mismatched manifests", async () => {
    const cases: Array<{response: Response; message: string}> = [
      {response: new Response("unavailable", {status: 503}), message: "manifest 503"},
      {response: jsonResponse({version: "v1"}), message: "invalid version manifest"},
      {response: jsonResponse(versionManifest("v2", "hash")), message: "host and manifest versions differ"},
    ]

    for (const {response, message} of cases) {
      const events: Array<{message: string; level?: string}> = []
      const controller = createController({
        fetchResponse: async (_input, init) => {
          expect(init).toEqual(authorizedNoStore())
          return response.clone()
        },
        emit: (eventMessage, level) => events.push({message: eventMessage, level}),
        publish: () => {
          throw new Error("invalid manifest must not publish version-ready")
        },
      })

      expect(await controller.prepare("v1", "secret")).toBeNull()
      expect(controller.currentVersionState).toBeNull()
      expect(events).toEqual([{message: `version preparation failed: ${message}`, level: "error"}])
    }
  })

  test("rehashes and reuses a verified cache hit without downloading the module", async () => {
    const cacheStorage = new FakeCacheStorage()
    const source = "export const version = 'v1'\n"
    const hash = await sha256Hex(new Response(source))
    await (await cacheStorage.open("hamiltonian-code:v1")).put(
      "/versions/v1/module.js",
      new Response(source, {headers: {"x-hamiltonian-sha256": hash}}),
    )
    const fetches: FetchCall[] = []
    const events: string[] = []
    const published: unknown[] = []
    const controller = createController({
      cacheStorage,
      fetchResponse: async (input, init) => {
        fetches.push({url: String(input), init})
        if (String(input) === "/manifest.json") return jsonResponse(versionManifest("v1", hash))
        throw new Error("verified cache hit must not download the module")
      },
      emit: (message) => events.push(message),
      publish: (state) => published.push(state),
    })

    const state = await controller.prepare("v1", "secret")

    expect(state).toEqual({
      kind: "version-ready",
      version: "v1",
      moduleUrl: "/versions/v1/module.js",
      sha256: hash,
      caches: ["hamiltonian-code:v1"],
    })
    expect(controller.currentVersionState).toEqual(state)
    expect(fetches).toEqual([{url: "/manifest.json", init: authorizedNoStore()}])
    expect(events).toEqual(["reused cached version v1"])
    expect(published).toEqual([state])
  })

  test("does not publish a failed module download or SHA-256 mismatch", async () => {
    for (const failure of ["status", "hash"] as const) {
      const expected = await sha256Hex(new Response("expected module"))
      const events: Array<{message: string; level?: string}> = []
      let published = false
      const controller = createController({
        fetchResponse: async (input, init) => {
          expect(init).toEqual(authorizedNoStore())
          if (String(input) === "/manifest.json") return jsonResponse(versionManifest("v1", expected))
          return failure === "status"
            ? new Response("unavailable", {status: 502})
            : new Response("corrupted module")
        },
        emit: (message, level) => events.push({message, level}),
        publish: () => {
          published = true
        },
      })

      expect(await controller.prepare("v1", "secret")).toBeNull()
      expect(controller.currentVersionState).toBeNull()
      expect(published).toBeFalse()
      expect(events).toEqual([{
        message: failure === "status"
          ? "version preparation failed: module 502"
          : "version preparation failed: module SHA-256 mismatch",
        level: "error",
      }])
    }
  })

  test("stores verified downloads and retains only current and previous releases", async () => {
    const cacheStorage = new FakeCacheStorage()
    const modules = new Map([
      ["v1", "export const version = 'v1'\n"],
      ["v2", "export const version = 'v2'\n"],
    ])
    const hashes = new Map<string, string>()
    for (const [version, source] of modules) hashes.set(version, await sha256Hex(new Response(source)))
    const requested = {version: "v1"}
    const published: unknown[] = []
    const controller = createController({
      cacheStorage,
      fetchResponse: async (input, init) => {
        expect(init).toEqual(authorizedNoStore())
        const version = requested.version
        if (String(input) === "/manifest.json") {
          return jsonResponse(versionManifest(version, hashes.get(version)!))
        }
        return new Response(modules.get(version), {
          headers: {"x-hamiltonian-sha256": hashes.get(version)!},
        })
      },
      publish: (state) => published.push(state),
    })

    const v1 = await controller.prepare("v1", "secret")
    await cacheStorage.open("hamiltonian-code:v0")
    requested.version = "v2"
    const v2 = await controller.prepare("v2", "secret")

    expect(v1?.caches).toEqual(["hamiltonian-code:v1"])
    expect(v2?.caches).toEqual(["hamiltonian-code:v1", "hamiltonian-code:v2"])
    expect(await cacheStorage.keys()).toEqual(["hamiltonian-code:v1", "hamiltonian-code:v2"])
    expect(await (await cacheStorage.open("hamiltonian-code:v2")).match("/versions/v2/module.js"))
      .toBeInstanceOf(Response)
    expect(published).toEqual([v1, v2])
    expect(controller.currentVersionState).toEqual(v2)
  })

  test("serves a retained version before prepare and leaves misses for the entrypoint 503", async () => {
    const cacheStorage = new FakeCacheStorage()
    const request = new Request(`${ORIGIN}/versions/v1/module.js`)
    await (await cacheStorage.open("hamiltonian-code:v1")).put(request, new Response("retained module"))
    const controller = createController({cacheStorage})

    expect(controller.currentVersionState).toBeNull()
    expect(controller.handlesVersionRequest(request)).toBeTrue()
    expect(await (await controller.cachedVersionResponse(request))?.text()).toBe("retained module")
    expect(controller.handlesVersionRequest(new Request(`${ORIGIN}/app.js`))).toBeFalse()

    const miss = await controller.cachedVersionResponse(new Request(`${ORIGIN}/versions/missing/module.js`))
    const entryResponse = miss ?? new Response("Version is not prepared by Hamiltonian", {status: 503})
    expect(entryResponse.status).toBe(503)
  })
})

interface FetchCall {
  url: string
  init?: RequestInit
}

interface ControllerOptions {
  cacheStorage?: FakeCacheStorage
  fetchResponse?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  emit?: (message: string, level?: string) => void
  publish?: (state: unknown) => void
}

function createController(options: ControllerOptions = {}) {
  return new HamiltonianBrowserReleaseCacheController({
    origin: ORIGIN,
    cacheStorage: options.cacheStorage ?? new FakeCacheStorage(),
    fetchResponse: options.fetchResponse ?? (async () => {
      throw new Error("unexpected fetch")
    }),
    emit: options.emit ?? (() => {}),
    publish: options.publish ?? (() => {}),
  })
}

function versionManifest(version: string, sha256: string) {
  return {version, moduleUrl: `/versions/${version}/module.js`, sha256}
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {headers: {"content-type": "application/json"}})
}

function authorizedNoStore(): RequestInit {
  return {headers: {authorization: "Bearer secret"}, cache: "no-store"}
}

function cacheKey(input: RequestInfo | URL): string {
  const value = input instanceof Request ? input.url : String(input)
  return new URL(value, ORIGIN).toString()
}

class FakeCache {
  readonly responses = new Map<string, Response>()

  async match(input: RequestInfo | URL): Promise<Response | undefined> {
    return this.responses.get(cacheKey(input))?.clone()
  }

  async put(input: RequestInfo | URL, response: Response): Promise<void> {
    this.responses.set(cacheKey(input), response.clone())
  }
}

class FakeCacheStorage {
  readonly entries = new Map<string, FakeCache>()

  async open(name: string): Promise<FakeCache> {
    let cache = this.entries.get(name)
    if (!cache) {
      cache = new FakeCache()
      this.entries.set(name, cache)
    }
    return cache
  }

  async keys(): Promise<string[]> {
    return [...this.entries.keys()].sort()
  }

  async delete(name: string): Promise<boolean> {
    return this.entries.delete(name)
  }

  async match(input: RequestInfo | URL): Promise<Response | undefined> {
    for (const cache of this.entries.values()) {
      const response = await cache.match(input)
      if (response) return response
    }
    return undefined
  }
}
