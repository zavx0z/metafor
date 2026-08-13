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
 * A MessagePort alone does not keep a Service Worker alive. A visible page
 * therefore treats one second without any worker reply as an expired liveness
 * lease and reconnects through ServiceWorker.postMessage. Hidden pages use a
 * wider lease because browsers throttle them.
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
 * `clients.matchAll()` can briefly omit a still-live Window while a new
 * Service Worker claims it. Only an expired heartbeat lease turns that
 * absence into a terminal page observation; an explicit disconnect remains
 * immediate and does not use this helper.
 *
 * @param {object} input
 * @param {boolean} input.hasLiveClient
 * @param {number} input.now
 * @param {number} input.lastSeenAt
 * @param {number} input.timeoutMs
 */
export function windowClientLeaseExpired({hasLiveClient, now, lastSeenAt, timeoutMs}) {
  return !hasLiveClient && now - lastSeenAt > timeoutMs
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

/**
 * A reload may connect its successor while the browser still exposes the old
 * WindowClient. Only the one-shot predecessor written by pagehide proves that
 * this is replacement rather than a cloned tab with copied sessionStorage.
 *
 * @param {{tabId: string, pageIncarnation: string} | null | undefined} previous
 * @param {{tabId: string, pageIncarnation: string, predecessorPageIncarnation?: string | null}} next
 */
export function isWindowPageReplacement(previous, next) {
  return Boolean(
    previous &&
    previous.tabId === next.tabId &&
    previous.pageIncarnation !== next.pageIncarnation &&
    previous.pageIncarnation === next.predecessorPageIncarnation,
  )
}

/**
 * A restarted Service Worker must not publish a stable-scope page snapshot
 * until every live WindowClient has restored its MessagePort channel.
 *
 * @param {readonly string[]} liveClientIds
 * @param {readonly string[]} connectedClientIds
 */
export function missingWindowClientChannels(liveClientIds, connectedClientIds) {
  const connected = new Set(connectedClientIds)
  return [...new Set(liveClientIds)]
    .filter((clientId) => !connected.has(clientId))
    .sort((left, right) => left.localeCompare(right))
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
