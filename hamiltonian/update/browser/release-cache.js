/** @param {Response} response */
export async function sha256Hex(response) {
  const bytes = await response.arrayBuffer()
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

/** @param {Response | null | undefined} response @param {string} expectedHash */
export async function responseMatchesHash(response, expectedHash) {
  if (!response) return false
  if (response.headers.get("x-hamiltonian-sha256") !== expectedHash) return false
  return await sha256Hex(response.clone()) === expectedHash
}

/**
 * @param {string[]} names
 * @param {string} currentCacheName
 * @param {string | null} [previousCacheName]
 * @param {number} [limit]
 */
export function selectRetainedCaches(names, currentCacheName, previousCacheName = null, limit = 2) {
  const ordered = [...new Set(names)].sort()
  const keep = new Set([currentCacheName])
  if (previousCacheName && ordered.includes(previousCacheName)) keep.add(previousCacheName)
  for (let index = ordered.length - 1; index >= 0 && keep.size < limit; index -= 1) {
    const name = ordered[index]
    if (name) keep.add(name)
  }
  return ordered.filter((name) => keep.has(name))
}

/**
 * @typedef {{version: string; moduleUrl: string; sha256: string}} HamiltonianVersionManifest
 * @typedef {{
 *   kind: "version-ready";
 *   version: string;
 *   moduleUrl: string;
 *   sha256: string;
 *   caches: string[];
 * }} HamiltonianVersionReadyState
 * @typedef {{
 *   match(input: RequestInfo | URL): Promise<Response | undefined>;
 *   put(input: RequestInfo | URL, response: Response): Promise<void>;
 * }} HamiltonianReleaseCache
 * @typedef {{
 *   open(name: string): Promise<HamiltonianReleaseCache>;
 *   keys(): Promise<string[]>;
 *   delete(name: string): Promise<boolean>;
 *   match(input: RequestInfo | URL): Promise<Response | undefined>;
 * }} HamiltonianReleaseCacheStorage
 */

const VERSION_CACHE_PREFIX = "hamiltonian-code:"
const MAX_VERSION_CACHES = 2

export class HamiltonianBrowserReleaseCacheController {
  /** @type {string} */
  #origin
  /** @type {HamiltonianReleaseCacheStorage} */
  #cacheStorage
  /** @type {(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>} */
  #fetchResponse
  /** @type {(message: string, level?: string) => void} */
  #emit
  /** @type {(state: HamiltonianVersionReadyState) => void} */
  #publish
  /** @type {HamiltonianVersionReadyState | null} */
  #currentVersionState = null

  /**
   * @param {{
   *   origin: string;
   *   cacheStorage: HamiltonianReleaseCacheStorage;
   *   fetchResponse(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
   *   emit(message: string, level?: string): void;
   *   publish(state: HamiltonianVersionReadyState): void;
   * }} options
   */
  constructor({origin, cacheStorage, fetchResponse, emit, publish}) {
    this.#origin = origin
    this.#cacheStorage = cacheStorage
    this.#fetchResponse = fetchResponse
    this.#emit = emit
    this.#publish = publish
  }

  /** @returns {HamiltonianVersionReadyState | null} */
  get currentVersionState() {
    return this.#currentVersionState
  }

  /** @param {Request} request */
  handlesVersionRequest(request) {
    const url = new URL(request.url)
    return url.origin === this.#origin && url.pathname.startsWith("/versions/")
  }

  /** @param {Request} request */
  async cachedVersionResponse(request) {
    return await this.#cacheStorage.match(request) ?? null
  }

  /**
   * @param {string} expectedVersion
   * @param {string | null} token
   * @returns {Promise<HamiltonianVersionReadyState | null>}
   */
  async prepare(expectedVersion, token) {
    try {
      const headers = {authorization: `Bearer ${token}`}
      const manifestResponse = await this.#fetchResponse("/manifest.json", {headers, cache: "no-store"})
      if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}`)
      const manifest = await manifestResponse.json()
      if (!isVersionManifest(manifest)) throw new Error("invalid version manifest")
      if (manifest.version !== expectedVersion) throw new Error("host and manifest versions differ")

      const cacheName = `${VERSION_CACHE_PREFIX}${manifest.version}`
      const cache = await this.#cacheStorage.open(cacheName)
      let moduleResponse = await cache.match(manifest.moduleUrl)
      if (!await responseMatchesHash(moduleResponse, manifest.sha256)) {
        const fetched = await this.#fetchResponse(manifest.moduleUrl, {headers, cache: "no-store"})
        if (!fetched.ok) throw new Error(`module ${fetched.status}`)
        const actualHash = await sha256Hex(fetched.clone())
        if (actualHash !== manifest.sha256) throw new Error("module SHA-256 mismatch")
        await cache.put(manifest.moduleUrl, fetched.clone())
        moduleResponse = fetched
        this.#emit(`cached version ${manifest.version} after SHA-256 verification`)
      } else {
        this.#emit(`reused cached version ${manifest.version}`)
      }

      const cacheNames = await this.#retainVersionCaches(cacheName)
      const state = {
        kind: /** @type {const} */ ("version-ready"),
        version: manifest.version,
        moduleUrl: manifest.moduleUrl,
        sha256: manifest.sha256,
        caches: cacheNames,
      }
      this.#currentVersionState = state
      this.#publish(state)
      return state
    } catch (error) {
      this.#emit(
        `version preparation failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      )
      return null
    }
  }

  /** @param {string} currentCacheName */
  async #retainVersionCaches(currentCacheName) {
    const names = (await this.#cacheStorage.keys())
      .filter((name) => name.startsWith(VERSION_CACHE_PREFIX))
      .sort()
    const previous = this.#currentVersionState
      ? `${VERSION_CACHE_PREFIX}${this.#currentVersionState.version}`
      : null
    const keep = new Set(selectRetainedCaches(
      names,
      currentCacheName,
      previous,
      MAX_VERSION_CACHES,
    ))
    await Promise.all(names
      .filter((name) => !keep.has(name))
      .map((name) => this.#cacheStorage.delete(name)))
    return (await this.#cacheStorage.keys())
      .filter((name) => name.startsWith(VERSION_CACHE_PREFIX))
      .sort()
  }
}

/** @param {unknown} value @returns {value is HamiltonianVersionManifest} */
function isVersionManifest(value) {
  return typeof value === "object" && value !== null &&
    typeof /** @type {Record<string, unknown>} */ (value).version === "string" &&
    typeof /** @type {Record<string, unknown>} */ (value).moduleUrl === "string" &&
    typeof /** @type {Record<string, unknown>} */ (value).sha256 === "string"
}
