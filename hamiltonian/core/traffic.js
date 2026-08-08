/**
 * Earliest browser-realm traffic observation for Hamiltonian orchestration.
 *
 * The module deliberately has no application imports. Loading it is enough to
 * create the browser BroadcastChannel before Window, Service Worker or
 * Dedicated Worker application code starts evaluating.
 */

export const HAMILTONIAN_TRAFFIC_VERSION = 1
export const HAMILTONIAN_TRAFFIC_CHANNEL = "metafor.hamiltonian.edge-traffic.v1"
export const HAMILTONIAN_TRAFFIC_KIND = "hamiltonian-edge-traffic"

const SINGLETON = Symbol.for("metafor.hamiltonian.edge-traffic.singleton.v1")
const MAX_BACKLOG = 256
const FIELD_NAMES = Object.freeze([
  "at",
  "direction",
  "edgeId",
  "kind",
  "messageClass",
  "sequence",
  "sourceId",
  "version",
])

/** @typedef {"forward" | "reverse"} HamiltonianTrafficDirection */
/**
 * @typedef {Readonly<{
 *   kind: "hamiltonian-edge-traffic",
 *   version: 1,
 *   sourceId: string,
 *   sequence: number,
 *   at: number,
 *   edgeId: string,
 *   direction: HamiltonianTrafficDirection,
 *   messageClass: string,
 * }>} HamiltonianTrafficEnvelope
 */
/**
 * @typedef {{
 *   source: HamiltonianTrafficSource,
 *   subscribers: Set<(envelope: HamiltonianTrafficEnvelope) => unknown>,
 *   backlog: HamiltonianTrafficEnvelope[],
 *   channel: BroadcastChannel | null,
 * }} HamiltonianTrafficState
 */

export class HamiltonianTrafficSource {
  /** @type {string} */
  #sourceId
  #sequence = 0

  /** @param {string} sourceId */
  constructor(sourceId) {
    if (!validBoundedString(sourceId, 128)) throw new Error("invalid traffic sourceId")
    this.#sourceId = sourceId
  }

  /**
   * @param {object} input
   * @param {string} input.edgeId
   * @param {HamiltonianTrafficDirection} input.direction
   * @param {string} input.messageClass
   * @param {number} [input.at]
   */
  next({edgeId, direction, messageClass, at = Date.now()}) {
    return createHamiltonianTrafficEnvelope({
      sourceId: this.#sourceId,
      sequence: this.#sequence += 1,
      at,
      edgeId,
      direction,
      messageClass,
    })
  }
}

export class HamiltonianTrafficEnvelopeCursor {
  /** @type {Map<string, number>} */
  #sequences = new Map()

  /** @param {unknown} value @returns {HamiltonianTrafficEnvelope | null} */
  accept(value) {
    if (!isHamiltonianTrafficEnvelope(value)) return null
    const previous = this.#sequences.get(value.sourceId) ?? 0
    if (value.sequence <= previous) return null
    this.#sequences.set(value.sourceId, value.sequence)
    return value
  }
}

/**
 * @param {object} input
 * @param {string} input.sourceId
 * @param {number} input.sequence
 * @param {number} input.at
 * @param {string} input.edgeId
 * @param {HamiltonianTrafficDirection} input.direction
 * @param {string} input.messageClass
 */
export function createHamiltonianTrafficEnvelope(input) {
  const envelope = {
    kind: HAMILTONIAN_TRAFFIC_KIND,
    version: HAMILTONIAN_TRAFFIC_VERSION,
    sourceId: input.sourceId,
    sequence: input.sequence,
    at: input.at,
    edgeId: input.edgeId,
    direction: input.direction,
    messageClass: normalizeHamiltonianMessageClass(input.messageClass),
  }
  if (!isHamiltonianTrafficEnvelope(envelope)) throw new Error("invalid Hamiltonian traffic envelope")
  return /** @type {HamiltonianTrafficEnvelope} */ (Object.freeze(envelope))
}

/** @param {unknown} value @returns {value is HamiltonianTrafficEnvelope} */
export function isHamiltonianTrafficEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  if (Object.keys(record).sort().join("\0") !== [...FIELD_NAMES].sort().join("\0")) return false
  return record.kind === HAMILTONIAN_TRAFFIC_KIND &&
    record.version === HAMILTONIAN_TRAFFIC_VERSION &&
    validBoundedString(record.sourceId, 128) &&
    Number.isSafeInteger(record.sequence) && Number(record.sequence) > 0 &&
    Number.isSafeInteger(record.at) && Number(record.at) >= 0 &&
    validBoundedString(record.edgeId, 512) &&
    (record.direction === "forward" || record.direction === "reverse") &&
    validMessageClass(record.messageClass)
}

/**
 * Emits in the current realm synchronously, then to other browser realms.
 * @param {object} input
 * @param {string} input.edgeId
 * @param {HamiltonianTrafficDirection} input.direction
 * @param {string} input.messageClass
 * @param {number} [input.at]
 */
export function emitHamiltonianTraffic(input) {
  const state = trafficState()
  const envelope = state.source.next(input)
  publish(state, envelope, true)
  return envelope
}

/** Relays an already identified event without changing its identity. @param {unknown} value */
export function publishHamiltonianTrafficEnvelope(value) {
  if (!isHamiltonianTrafficEnvelope(value)) return false
  publish(trafficState(), value, true)
  return true
}

/**
 * Subscribers receive the retained early backlog before future events.
 * @param {(envelope: HamiltonianTrafficEnvelope) => unknown} handler
 */
export function subscribeHamiltonianTraffic(handler) {
  const state = trafficState()
  state.subscribers.add(handler)
  for (const envelope of state.backlog) handler(envelope)
  return () => state.subscribers.delete(handler)
}

/** @param {unknown} value @returns {string} */
export function normalizeHamiltonianMessageClass(value) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return validMessageClass(normalized) ? normalized : "unknown"
}

/** @param {string} connectionId */
export function hamiltonianControlWssEdgeId(connectionId) {
  return `control-wss:${trafficId(connectionId)}`
}

/** @param {string} connectionId @param {string} tabId */
export function hamiltonianMessagePortEdgeId(connectionId, tabId) {
  return `message-port:${trafficId(connectionId)}:${trafficId(tabId)}`
}

/** @param {string} connectionId @param {string} tabId */
export function hamiltonianBroadcastEdgeId(connectionId, tabId) {
  return `broadcast:${trafficId(connectionId)}:${trafficId(tabId)}`
}

/** @param {string} role */
export function hamiltonianIpcEdgeId(role) {
  return `ipc:${trafficId(role)}`
}

export const HAMILTONIAN_PEER_SUPERVISION_EDGE_ID = "peer-supervision"
export const HAMILTONIAN_ORACLE_EDGE_ID = "oracle-lane"
export const HAMILTONIAN_FORCE_EDGE_ID = "force-lane"

/** @param {unknown} value */
function trafficId(value) {
  const normalized = typeof value === "string" && value.length > 0 ? value : "unknown"
  return encodeURIComponent(normalized)
}

/** @returns {HamiltonianTrafficState} */
function trafficState() {
  const global = /** @type {any} */ (globalThis)
  if (global[SINGLETON]) return /** @type {HamiltonianTrafficState} */ (global[SINGLETON])
  const source = new HamiltonianTrafficSource(`realm:${randomId()}`)
  /** @type {Set<(envelope: HamiltonianTrafficEnvelope) => unknown>} */
  const subscribers = new Set()
  /** @type {HamiltonianTrafficEnvelope[]} */
  const backlog = []
  const isBrowserRealm = typeof global.Bun === "undefined" &&
    typeof global.BroadcastChannel === "function" &&
    typeof global.navigator === "object"
  const channel = isBrowserRealm ? new global.BroadcastChannel(HAMILTONIAN_TRAFFIC_CHANNEL) : null
  /** @type {HamiltonianTrafficState} */
  const state = {source, subscribers, backlog, channel}
  if (channel) {
    channel.addEventListener("message", /** @param {MessageEvent} event */ (event) => {
      if (!isHamiltonianTrafficEnvelope(event.data)) return
      publish(state, event.data, false)
    })
  }
  global[SINGLETON] = state
  return state
}

/** @param {HamiltonianTrafficState} state @param {HamiltonianTrafficEnvelope} envelope @param {boolean} broadcast */
function publish(state, envelope, broadcast) {
  state.backlog.push(envelope)
  if (state.backlog.length > MAX_BACKLOG) state.backlog.splice(0, state.backlog.length - MAX_BACKLOG)
  for (const subscriber of state.subscribers) subscriber(envelope)
  if (broadcast) state.channel?.postMessage(envelope)
}

function randomId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}:${Math.random().toString(36).slice(2)}`
  }
}

/** @param {unknown} value @param {number} max */
function validBoundedString(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max
}

/** @param {unknown} value */
function validMessageClass(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value)
}
