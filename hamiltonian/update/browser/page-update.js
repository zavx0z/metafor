/**
 * A page reload is required only when the current page realm already owns an
 * active main embodiment built from a different module. A follower that has
 * merely retained an older fingerprint in sessionStorage may accept the
 * module it has just imported and birth main later without reloading again.
 *
 * @param {boolean} hasMainEmbodiment
 * @param {string | null | undefined} loadedFingerprint
 * @param {string} nextFingerprint
 */
export function mainRealmRequiresReload(hasMainEmbodiment, loadedFingerprint, nextFingerprint) {
  return hasMainEmbodiment === true &&
    loadedFingerprint !== nextFingerprint
}

/**
 * A served-code revision reloads a page at most once. The producer derives it
 * only from browser artifacts, never from a host incarnation or local build
 * generation. Persisting the accepted revision in sessionStorage therefore
 * prevents both cold-host reloads with unchanged code and duplicate-message
 * reload loops.
 *
 * @param {string | null | undefined} currentRevision
 * @param {string | null | undefined} nextRevision
 */
export function sourceRevisionRequiresReload(currentRevision, nextRevision) {
  return typeof nextRevision === "string" && nextRevision.length > 0 &&
    currentRevision !== nextRevision
}

/**
 * @typedef {{
 *   version: string;
 *   moduleUrl: string;
 *   sha256: string;
 * }} HamiltonianPageVersionReady
 * @typedef {{
 *   version: string;
 *   createEmbodiment(options: unknown): {start(): void; stop(): void};
 * }} HamiltonianPageVersionModule
 * @typedef {HamiltonianPageVersionReady & {
 *   fingerprint: string;
 *   loaded: HamiltonianPageVersionModule;
 * }} HamiltonianPageLoadedRelease
 * @typedef {{
 *   getItem(key: string): string | null;
 *   setItem(key: string, value: string): void;
 *   removeItem(key: string): void;
 * }} HamiltonianPageUpdateStorage
 */

const SOURCE_REVISION_STORAGE_KEY = "hamiltonian-source-revision"
const MAIN_VERSION_STORAGE_KEY = "hamiltonian-main-version"
const MAIN_RELOAD_REASON_STORAGE_KEY = "hamiltonian-main-reload-reason"

/**
 * Owns the page-side transition from a served source/version release to the
 * currently loaded release. Browser realm creation and lifecycle effects stay
 * in injected callbacks so this controller remains plain browser JavaScript.
 */
export class HamiltonianPageUpdateController {
  /** @type {HamiltonianPageUpdateStorage} */
  #storage
  /** @type {(moduleUrl: string) => Promise<unknown>} */
  #importModule
  /** @type {() => void} */
  #reloadPage
  /** @type {() => boolean} */
  #hasMainEmbodiment
  /** @type {(release: HamiltonianPageLoadedRelease) => Promise<void>} */
  #birthDedicatedWorker
  /** @type {(release: HamiltonianPageLoadedRelease | null) => Promise<boolean>} */
  #reconcileMain
  /** @type {HamiltonianPageLoadedRelease | null} */
  #currentRelease = null
  /** @type {Promise<unknown>} */
  #transitionQueue = Promise.resolve()

  /**
   * @param {{
   *   storage: HamiltonianPageUpdateStorage;
   *   importModule(moduleUrl: string): Promise<unknown>;
   *   reloadPage(): void;
   *   hasMainEmbodiment(): boolean;
   *   birthDedicatedWorker(release: HamiltonianPageLoadedRelease): Promise<void>;
   *   reconcileMain(release: HamiltonianPageLoadedRelease | null): Promise<boolean>;
   * }} options
   */
  constructor({
    storage,
    importModule,
    reloadPage,
    hasMainEmbodiment,
    birthDedicatedWorker,
    reconcileMain,
  }) {
    this.#storage = storage
    this.#importModule = importModule
    this.#reloadPage = reloadPage
    this.#hasMainEmbodiment = hasMainEmbodiment
    this.#birthDedicatedWorker = birthDedicatedWorker
    this.#reconcileMain = reconcileMain
  }

  /** @returns {HamiltonianPageLoadedRelease | null} */
  get currentRelease() {
    return this.#currentRelease
  }

  /** @param {string | null | undefined} revision */
  acceptNavigationSourceRevision(revision) {
    if (typeof revision !== "string" || revision.length === 0) return false
    this.#storage.setItem(SOURCE_REVISION_STORAGE_KEY, revision)
    return true
  }

  /** @param {string | null | undefined} revision */
  acceptSourceRevision(revision) {
    const currentRevision = this.#storage.getItem(SOURCE_REVISION_STORAGE_KEY)
    if (!sourceRevisionRequiresReload(currentRevision, revision)) return false
    this.#storage.setItem(SOURCE_REVISION_STORAGE_KEY, revision)
    this.#storage.setItem(MAIN_RELOAD_REASON_STORAGE_KEY, `source ${revision}`)
    this.#reloadPage()
    return true
  }

  /** @param {HamiltonianPageVersionReady} release */
  activateVersion(release) {
    return this.#enqueue(async () => {
      const fingerprint = `${release.version}:${release.sha256}`
      if (this.#currentRelease?.fingerprint === fingerprint) return this.#currentRelease
      if (mainRealmRequiresReload(
        this.#hasMainEmbodiment(),
        this.#currentRelease?.fingerprint,
        fingerprint,
      )) {
        this.#storage.setItem(MAIN_VERSION_STORAGE_KEY, fingerprint)
        this.#storage.setItem(MAIN_RELOAD_REASON_STORAGE_KEY, `version ${release.version}`)
        this.#reloadPage()
        return null
      }

      const imported = await this.#importModule(release.moduleUrl)
      if (!isHamiltonianPageVersionModule(imported, release.version)) {
        throw new Error("main realm received an invalid version module")
      }
      const loadedRelease = {...release, fingerprint, loaded: imported}
      this.#currentRelease = loadedRelease
      this.#storage.setItem(MAIN_VERSION_STORAGE_KEY, fingerprint)
      await this.#birthDedicatedWorker(loadedRelease)
      if (await this.#reconcileMain(loadedRelease)) this.#clearMainReloadReason()
      return loadedRelease
    })
  }

  reconcileCurrent() {
    return this.#enqueue(async () => {
      if (await this.#reconcileMain(this.#currentRelease)) this.#clearMainReloadReason()
      return this.#currentRelease
    })
  }

  rebirthDedicatedWorker() {
    return this.#enqueue(async () => {
      if (!this.#currentRelease) return false
      await this.#birthDedicatedWorker(this.#currentRelease)
      return true
    })
  }

  /** @param {string} reason */
  reloadCurrentMain(reason) {
    if (!this.#currentRelease || !this.#hasMainEmbodiment()) return false
    this.#storage.setItem(MAIN_RELOAD_REASON_STORAGE_KEY, reason)
    this.#reloadPage()
    return true
  }

  #clearMainReloadReason() {
    if (this.#storage.getItem(MAIN_RELOAD_REASON_STORAGE_KEY)) {
      this.#storage.removeItem(MAIN_RELOAD_REASON_STORAGE_KEY)
    }
  }

  /**
   * @template T
   * @param {() => Promise<T>} transition
   * @returns {Promise<T>}
   */
  #enqueue(transition) {
    const result = this.#transitionQueue.then(transition)
    this.#transitionQueue = result.catch(() => {})
    return result
  }
}

/**
 * @param {unknown} value
 * @param {string} expectedVersion
 * @returns {value is HamiltonianPageVersionModule}
 */
function isHamiltonianPageVersionModule(value, expectedVersion) {
  return typeof value === "object" && value !== null &&
    /** @type {Record<string, unknown>} */ (value).version === expectedVersion &&
    typeof /** @type {Record<string, unknown>} */ (value).createEmbodiment === "function"
}
