export const HAMILTONIAN_LIFECYCLE_CHANNEL = "metafor.hamiltonian.lifecycle.v1"

const SINGLETON = Symbol.for("metafor.hamiltonian.monitor.bootstrap.v1")
const MAX_EARLY_BACKLOG = 512
const CHANNELS = Object.freeze([
  HAMILTONIAN_LIFECYCLE_CHANNEL,
])

/**
 * @typedef {{
 *   name: string,
 *   channel: BroadcastChannel | null,
 *   subscribers: Set<(value: unknown) => unknown>,
 *   backlog: unknown[],
 * }} EarlyChannelState
 */

/**
 * The first dependency in every browser realm. It opens every observation
 * BroadcastChannel before application modules evaluate and retains messages
 * until their typed consumers subscribe.
 */
function monitorState() {
  const global = /** @type {any} */ (globalThis)
  if (global[SINGLETON]) return global[SINGLETON]

  const kind = realmKind(global)
  const incarnation = kind === "dedicated-worker" && typeof global.name === "string" && global.name
    ? global.name
    : randomId()
  const realm = Object.freeze({
    incarnation,
    kind,
    startedAt: Date.now(),
  })
  const channels = new Map()
  const canBroadcast = typeof global.BroadcastChannel === "function" &&
    typeof global.navigator === "object" &&
    typeof global.Bun === "undefined"

  for (const name of CHANNELS) {
    /** @type {Set<(value: unknown) => unknown>} */
    const subscribers = new Set()
    /** @type {unknown[]} */
    const backlog = []
    const channel = canBroadcast ? new global.BroadcastChannel(name) : null
    /** @type {EarlyChannelState} */
    const state = {name, channel, subscribers, backlog}
    channel?.addEventListener("message", /** @param {MessageEvent} event */ (event) => retainAndPublish(state, event.data))
    channels.set(name, state)
  }

  const state = {realm, channels}
  global[SINGLETON] = state
  return state
}

export function hamiltonianRealmSnapshot() {
  return monitorState().realm
}

/** @param {string} name @param {(value: unknown) => unknown} handler */
export function subscribeHamiltonianEarlyChannel(name, handler) {
  const channel = monitorState().channels.get(name)
  if (!channel) return () => {}
  channel.subscribers.add(handler)
  const pending = channel.backlog.splice(0)
  for (const value of pending) handler(value)
  return () => channel.subscribers.delete(handler)
}

/** @param {string} name @param {unknown} value */
export function publishHamiltonianEarlyChannel(name, value) {
  const channel = monitorState().channels.get(name)
  channel?.channel?.postMessage(value)
}

export function hamiltonianPageBootstrap() {
  if (typeof document !== "object") return null
  /** @param {string} name */
  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? ""
  const realm = hamiltonianRealmSnapshot()
  return Object.freeze({
    pageIncarnation: realm.incarnation,
    observedAt: realm.startedAt,
    navigationId: meta("hamiltonian-navigation-id"),
    servedAt: Number(meta("hamiltonian-served-at")) || 0,
    server: Object.freeze({
      identity: meta("hamiltonian-host-identity") || "hamiltonian",
      hostEpoch: meta("hamiltonian-host-epoch"),
      version: meta("hamiltonian-host-version"),
    }),
  })
}

/** @param {EarlyChannelState} state @param {unknown} value */
function retainAndPublish(state, value) {
  if (state.subscribers.size === 0) {
    state.backlog.push(value)
    if (state.backlog.length > MAX_EARLY_BACKLOG) {
      state.backlog.splice(0, state.backlog.length - MAX_EARLY_BACKLOG)
    }
    return
  }
  for (const subscriber of state.subscribers) subscriber(value)
}

/** @param {any} global */
function realmKind(global) {
  if (typeof global.document === "object") return "page"
  if (typeof global.clients === "object" && typeof global.registration === "object") return "service-worker"
  if (typeof global.postMessage === "function") return "dedicated-worker"
  return "unknown"
}

function randomId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}:${Math.random().toString(36).slice(2)}`
  }
}

monitorState()
