/** @typedef {{kind?: string, tabId?: string}} PeerControlMessage */
/** @typedef {{connectionId?: string, deviceId?: string, tabId?: string}} LeaderControl */
/**
 * @typedef {object} PeerGenerationIdentity
 * @property {string} peerId
 * @property {string} sessionEpoch
 * @property {number} peerGeneration
 * @property {string} authorityKey
 */
/** @typedef {{worker: {terminate: () => void}}} WorkerEmbodiment */

export const HAMILTONIAN_PAGE_HEARTBEAT_MS = 500
export const HAMILTONIAN_VISIBLE_WORKER_QUIET_MS = 1_000
export const HAMILTONIAN_HIDDEN_WORKER_QUIET_MS = 3_500

/**
 * A MessagePort does not keep ServiceWorkerGlobalScope alive. A visible page
 * therefore treats one second without any worker reply as an expired liveness
 * lease and reconnects through ServiceWorker.postMessage, which wakes a fresh
 * global scope. Hidden pages use a wider lease because browsers throttle them.
 *
 * @param {object} input
 * @param {number} input.now
 * @param {number} input.lastWorkerMessageAt
 * @param {string} input.visibility
 */
export function pageWorkerChannelIsQuiet({now, lastWorkerMessageAt, visibility}) {
  const quietMs = visibility === "visible"
    ? HAMILTONIAN_VISIBLE_WORKER_QUIET_MS
    : HAMILTONIAN_HIDDEN_WORKER_QUIET_MS
  return now - lastWorkerMessageAt > quietMs
}

/**
 * @param {object} input
 * @param {PeerControlMessage | null | undefined} input.message
 * @param {LeaderControl | null | undefined} input.leader
 * @param {string | null | undefined} input.deviceId
 * @param {string | null | undefined} input.tabId
 * @param {string | null | undefined} input.connectionId
 */
export function isCurrentLeaderPeerControl({message, leader, deviceId, tabId, connectionId}) {
  return Boolean(
    (message?.kind === "peer-signal" || message?.kind === "peer-failed") &&
    leader?.connectionId === connectionId &&
    leader?.deviceId === deviceId &&
    leader?.tabId === tabId &&
    message.tabId === tabId,
  )
}

/**
 * @param {PeerGenerationIdentity | null | undefined} currentPeer
 * @param {Partial<PeerGenerationIdentity> | null | undefined} message
 */
export function isCurrentPeerGeneration(currentPeer, message) {
  return Boolean(
    currentPeer &&
    currentPeer.peerId === message?.peerId &&
    currentPeer.sessionEpoch === message?.sessionEpoch &&
    currentPeer.peerGeneration === message?.peerGeneration &&
    currentPeer.authorityKey === message?.authorityKey,
  )
}

/** @template T */
export class ExclusiveResourceSlot {
  /** @type {T | null} */
  #current = null

  get current() {
    return this.#current
  }

  /** @param {T} resource */
  attach(resource) {
    if (this.#current) return false
    this.#current = resource
    return true
  }

  /** @param {T} resource */
  isCurrent(resource) {
    return this.#current === resource
  }

  /** @param {T} resource */
  clearIfCurrent(resource) {
    if (!this.isCurrent(resource)) return false
    this.#current = null
    return true
  }
}

/**
 * A replaced MessagePort may still deliver an already queued event. Only the
 * registry entry that currently owns the Window identity may forward control.
 *
 * @param {{get: (key: string) => unknown}} registry
 * @param {{tabId: string}} channel
 */
export function isCurrentWindowChannel(registry, channel) {
  return registry.get(channel.tabId) === channel
}

/** @template T @param {T | null} current @param {T} candidate */
export function isCurrentPageChannel(current, candidate) {
  return current === candidate
}

/**
 * @param {WorkerEmbodiment | null} currentEmbodiment
 * @param {WorkerEmbodiment} failedEmbodiment
 * @returns {WorkerEmbodiment | null}
 */
export function disposeFailedWorker(currentEmbodiment, failedEmbodiment) {
  failedEmbodiment?.worker?.terminate()
  return currentEmbodiment === failedEmbodiment ? null : currentEmbodiment
}

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
 * A dev source revision reloads a page at most once. Persisting the accepted
 * revision in sessionStorage prevents a reconnect or duplicate worker message
 * from creating a reload loop.
 *
 * @param {string | null | undefined} currentRevision
 * @param {string | null | undefined} nextRevision
 */
export function sourceRevisionRequiresReload(currentRevision, nextRevision) {
  return typeof nextRevision === "string" && nextRevision.length > 0 &&
    currentRevision !== nextRevision
}
