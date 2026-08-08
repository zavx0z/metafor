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
