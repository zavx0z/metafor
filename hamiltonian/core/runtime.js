/** @typedef {"oracle" | "force"} LogicalLane */
/**
 * @typedef {object} Authority
 * @property {string} hostEpoch
 * @property {string} connectionId
 * @property {string} holderId
 * @property {number} fencingToken
 * @property {string} leaseId
 * @property {number} expiresAt
 */
/** @typedef {{frame: string, bytes: number, messageClass: string}} QueuedFrame */
/**
 * @typedef {object} LaneState
 * @property {any} channel
 * @property {number} sendSeq
 * @property {number} expectedSeq
 * @property {QueuedFrame[]} queue
 * @property {number} queuedBytes
 */
/** @typedef {Record<string, any>} ProtocolEvent */

/** @type {readonly LogicalLane[]} */
export const LOGICAL_LANES = Object.freeze(["oracle", "force"])

const encoder = new TextEncoder()

/** @param {Pick<Authority, "hostEpoch" | "leaseId" | "fencingToken"> | null | undefined} authority */
export function authorityKey(authority) {
  if (!authority) return null
  return `${authority.hostEpoch}:${authority.leaseId}:${authority.fencingToken}`
}

/**
 * @param {string} hostEpoch
 * @param {number} fencingToken
 * @param {string} connectionId
 * @param {string} holderId
 */
export function makeLeaseId(hostEpoch, fencingToken, connectionId, holderId) {
  return `${hostEpoch}:${fencingToken}:${connectionId}:${holderId}`
}

export class LeaseAuthority {
  /** @type {string} */
  #hostEpoch
  /** @type {number} */
  #durationMs
  #nextToken = 0
  /** @type {Authority | null} */
  #lease = null

  /** @param {{hostEpoch: string, durationMs: number}} options */
  constructor({hostEpoch, durationMs}) {
    if (!hostEpoch) throw new Error("hostEpoch is required")
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("durationMs must be positive")
    this.#hostEpoch = hostEpoch
    this.#durationMs = durationMs
  }

  /** @param {string} connectionId @param {string} holderId @param {number} now */
  grant(connectionId, holderId, now) {
    const sameHolder = this.#lease?.connectionId === connectionId && this.#lease?.holderId === holderId
    if (!sameHolder) this.#nextToken += 1
    this.#lease = {
      hostEpoch: this.#hostEpoch,
      connectionId,
      holderId,
      fencingToken: this.#nextToken,
      leaseId: makeLeaseId(this.#hostEpoch, this.#nextToken, connectionId, holderId),
      expiresAt: now + this.#durationMs,
    }
    return /** @type {Authority} */ (this.snapshot())
  }

  /** @param {Authority | null} authority @param {number} now */
  renew(authority, now) {
    if (!this.accepts(authority, now)) return null
    const lease = this.#lease
    if (!lease) return null
    lease.expiresAt = now + this.#durationMs
    return this.snapshot()
  }

  revoke() {
    this.#lease = null
  }

  /** @param {Authority | null} authority @param {number} now */
  accepts(authority, now) {
    return Boolean(
      this.#lease &&
      now < this.#lease.expiresAt &&
      authorityKey(authority) === authorityKey(this.#lease),
    )
  }

  /** @returns {Authority | null} */
  snapshot() {
    return this.#lease ? {...this.#lease} : null
  }
}

export class FencedLedger {
  /** @type {Authority | null} */
  #authority = null
  /** @type {unknown[]} */
  #entries = []

  /** @param {Authority | null} authority */
  setAuthority(authority) {
    this.#authority = authority ? {...authority} : null
  }

  /** @param {Authority | null} authority @param {unknown} value @param {number} now */
  append(authority, value, now) {
    if (!this.#authority || now >= this.#authority.expiresAt) {
      throw new Error("authority-expired")
    }
    if (authorityKey(authority) !== authorityKey(this.#authority)) {
      throw new Error("stale-fencing-token")
    }
    this.#entries.push(value)
  }

  values() {
    return [...this.#entries]
  }
}

export class ReconnectPolicy {
  #attempt = 0
  /** @type {number} */
  #baseMs
  /** @type {number} */
  #maxMs
  /** @type {() => number} */
  #jitter

  /** @param {{baseMs?: number, maxMs?: number, jitter?: () => number}} options */
  constructor({baseMs = 500, maxMs = 15_000, jitter = () => Math.random()} = {}) {
    this.#baseMs = baseMs
    this.#maxMs = maxMs
    this.#jitter = jitter
  }

  nextDelay() {
    const base = Math.min(this.#maxMs, this.#baseMs * 2 ** this.#attempt)
    this.#attempt += 1
    return base + Math.floor(this.#jitter() * Math.min(300, base))
  }

  reset() {
    this.#attempt = 0
  }

  get attempt() {
    return this.#attempt
  }
}

export class GenerationRegistry {
  /** @type {Map<any, any>} */
  #entries = new Map()

  get size() {
    return this.#entries.size
  }

  /** @param {any} key */
  get(key) {
    return this.#entries.get(key)
  }

  /** @param {any} key @param {any} value */
  set(key, value) {
    this.#entries.set(key, value)
    return value
  }

  /** @param {any} key @param {any} expected */
  deleteIfCurrent(key, expected) {
    if (this.#entries.get(key) !== expected) return false
    return this.#entries.delete(key)
  }

  clear() {
    this.#entries.clear()
  }

  values() {
    return this.#entries.values()
  }

  [Symbol.iterator]() {
    return this.#entries[Symbol.iterator]()
  }
}

export class LogicalChannelSession {
  /** @type {string} */
  #sessionEpoch
  /** @type {Map<LogicalLane, LaneState>} */
  #lanes
  /** @type {number} */
  #maxFrameBytes
  /** @type {number} */
  #maxQueuedBytes
  /** @type {number} */
  #maxQueuedMessages
  /** @type {number} */
  #highWaterMark
  /** @type {Map<LogicalLane, Set<(payload: any, frame: any) => unknown>>} */
  #handlers = new Map()
  /** @type {(event: ProtocolEvent) => unknown} */
  #protocolHandler
  /** @type {(event: {lane: LogicalLane, direction: "forward" | "reverse", messageClass: string}) => unknown} */
  #trafficHandler
  /** @type {Set<(reason: string) => unknown>} */
  #closeHandlers = new Set()
  #closed = false

  /**
   * @param {object} options
   * @param {string} options.sessionEpoch
   * @param {Record<LogicalLane, any>} options.lanes
   * @param {number} [options.maxFrameBytes]
   * @param {number} [options.maxQueuedBytesPerLane]
   * @param {number} [options.maxQueuedMessagesPerLane]
   * @param {number} [options.highWaterMark]
   * @param {(event: ProtocolEvent) => unknown} [options.onProtocolEvent]
   * @param {(event: {lane: LogicalLane, direction: "forward" | "reverse", messageClass: string}) => unknown} [options.onTraffic]
   */
  constructor({
    sessionEpoch,
    lanes,
    maxFrameBytes = 64 * 1024,
    maxQueuedBytesPerLane = 256 * 1024,
    maxQueuedMessagesPerLane = 128,
    highWaterMark = 64 * 1024,
    onProtocolEvent = () => {},
    onTraffic = () => {},
  }) {
    if (!sessionEpoch) throw new Error("sessionEpoch is required")
    this.#sessionEpoch = sessionEpoch
    this.#maxFrameBytes = maxFrameBytes
    this.#maxQueuedBytes = maxQueuedBytesPerLane
    this.#maxQueuedMessages = maxQueuedMessagesPerLane
    this.#highWaterMark = highWaterMark
    this.#protocolHandler = onProtocolEvent
    this.#trafficHandler = onTraffic
    this.#lanes = new Map()

    for (const lane of LOGICAL_LANES) {
      const channel = lanes?.[lane]
      if (!channel) throw new Error(`missing logical channel: ${lane}`)
      /** @type {LaneState} */
      const state = {channel, sendSeq: 0, expectedSeq: 1, queue: [], queuedBytes: 0}
      this.#lanes.set(lane, state)
      channel.bufferedAmountLowThreshold = Math.floor(highWaterMark / 2)
      channel.addEventListener("message", /** @param {MessageEvent} event */ (event) =>
        this.#receive(lane, String(event.data)))
      channel.addEventListener("open", () => this.#flush(lane))
      channel.addEventListener("bufferedamountlow", () => this.#flush(lane))
      channel.addEventListener("close", () => this.close(`lane-lost:${lane}`))
    }
  }

  /**
   * @param {LogicalLane} lane
   * @param {(payload: any, frame: any) => unknown} handler
   */
  on(lane, handler) {
    if (!this.#lanes.has(lane)) throw new Error(`unknown logical channel: ${lane}`)
    const handlers = this.#handlers.get(lane) ?? new Set()
    handlers.add(handler)
    this.#handlers.set(lane, handlers)
    return () => handlers.delete(handler)
  }

  /** @param {(reason: string) => unknown} handler */
  onClose(handler) {
    this.#closeHandlers.add(handler)
    return () => this.#closeHandlers.delete(handler)
  }

  /** @param {LogicalLane} lane @param {unknown} payload */
  send(lane, payload) {
    if (this.#closed) throw new Error("session-closed")
    const state = this.#lanes.get(lane)
    if (!state) throw new Error(`unknown logical channel: ${lane}`)
    const nextSequence = state.sendSeq + 1
    const frame = JSON.stringify({
      sessionEpoch: this.#sessionEpoch,
      lane,
      sequence: nextSequence,
      payload,
    })
    const bytes = encoder.encode(frame).byteLength
    const messageClass = logicalMessageClass(payload)
    if (bytes > this.#maxFrameBytes) throw new Error(`frame-too-large:${lane}`)
    if (state.channel.readyState === "open" && state.channel.bufferedAmount < this.#highWaterMark) {
      state.channel.send(frame)
      state.sendSeq = nextSequence
      this.#trafficHandler({lane, direction: "forward", messageClass})
      return nextSequence
    }
    if (
      state.queue.length >= this.#maxQueuedMessages ||
      state.queuedBytes + bytes > this.#maxQueuedBytes
    ) {
      throw new Error(`backpressure-limit:${lane}`)
    }
    state.queue.push({frame, bytes, messageClass})
    state.queuedBytes += bytes
    state.sendSeq = nextSequence
    return nextSequence
  }

  /** @returns {Record<LogicalLane, {sent: number, expected: number, queuedMessages: number, queuedBytes: number, bufferedAmount: number}>} */
  stats() {
    return /** @type {Record<LogicalLane, {sent: number, expected: number, queuedMessages: number, queuedBytes: number, bufferedAmount: number}>} */ (Object.fromEntries([...this.#lanes].map(([lane, state]) => [lane, {
      sent: state.sendSeq,
      expected: state.expectedSeq,
      queuedMessages: state.queue.length,
      queuedBytes: state.queuedBytes,
      bufferedAmount: state.channel.bufferedAmount,
    }])))
  }

  /** @param {string} [reason] */
  close(reason = "session-closed") {
    if (this.#closed) return
    this.#closed = true
    for (const [lane, state] of this.#lanes) {
      state.queue.length = 0
      state.queuedBytes = 0
      try {
        state.channel.close()
      } catch {}
      this.#protocolHandler({kind: "lane-close", lane, reason})
    }
    this.#protocolHandler({kind: "session-close", reason})
    for (const handler of this.#closeHandlers) handler(reason)
    this.#closeHandlers.clear()
  }

  /** @param {LogicalLane} lane */
  #flush(lane) {
    if (this.#closed) return
    const state = this.#lanes.get(lane)
    if (!state || state.channel.readyState !== "open") return
    while (state.queue.length > 0 && state.channel.bufferedAmount < this.#highWaterMark) {
      const item = state.queue.shift()
      if (!item) return
      state.queuedBytes -= item.bytes
      state.channel.send(item.frame)
      this.#trafficHandler({lane, direction: "forward", messageClass: item.messageClass})
    }
  }

  /** @param {LogicalLane} physicalLane @param {string} rawFrame */
  #receive(physicalLane, rawFrame) {
    /** @type {any} */
    let frame
    try {
      frame = JSON.parse(rawFrame)
    } catch {
      this.#protocolHandler({kind: "invalid-json", lane: physicalLane})
      return
    }
    const state = this.#lanes.get(physicalLane)
    if (!state || !frame || typeof frame !== "object") {
      this.#protocolHandler({kind: "invalid-envelope", lane: physicalLane})
      return
    }
    if (frame.sessionEpoch !== this.#sessionEpoch) {
      this.#protocolHandler({
        kind: "session-epoch-mismatch",
        lane: physicalLane,
        expected: this.#sessionEpoch,
        actual: frame.sessionEpoch,
      })
      this.close(`session-epoch-mismatch:${physicalLane}`)
      return
    }
    if (
      frame.lane !== physicalLane ||
      !Number.isSafeInteger(frame.sequence) ||
      frame.sequence < 1
    ) {
      this.#protocolHandler({kind: "invalid-envelope", lane: physicalLane})
      return
    }
    if (frame.sequence < state.expectedSeq) {
      this.#protocolHandler({kind: "duplicate", lane: physicalLane, sequence: frame.sequence})
      return
    }
    if (frame.sequence > state.expectedSeq) {
      this.#protocolHandler({
        kind: "gap",
        lane: physicalLane,
        expected: state.expectedSeq,
        actual: frame.sequence,
      })
      this.close(`sequence-gap:${physicalLane}`)
      return
    }
    state.expectedSeq = frame.sequence + 1
    this.#trafficHandler({
      lane: physicalLane,
      direction: "reverse",
      messageClass: logicalMessageClass(frame.payload),
    })
    for (const handler of this.#handlers.get(physicalLane) ?? []) handler(frame.payload, frame)
  }
}

/** @param {unknown} payload */
function logicalMessageClass(payload) {
  if (!payload || typeof payload !== "object") return "message"
  const type = /** @type {{type?: unknown}} */ (payload).type
  return typeof type === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(type) ? type : "message"
}

export class PeerProtocol {
  /** @type {LogicalChannelSession} */
  #session
  /** @type {() => string} */
  #ids
  /** @type {Map<string, {resolve: (value: any) => void, reject: (reason?: any) => void, cleanup: () => void}>} */
  #pending = new Map()
  /** @type {Map<string, (params: any, context: {signal: AbortSignal}) => any>} */
  #rpcHandlers = new Map()
  /** @type {Map<string, AbortController>} */
  #activeRequests = new Map()
  /** @type {Set<(payload: any) => unknown>} */
  #forceHandlers = new Set()
  #forceSequence = 0
  #expectedForceSequence = 1
  #closed = false

  /** @param {LogicalChannelSession} session @param {{ids?: () => string}} options */
  constructor(session, {ids = (() => crypto.randomUUID())} = {}) {
    this.#session = session
    this.#ids = ids
    session.on("oracle", (payload) => void this.#receiveOracle(payload))
    session.on("force", (payload) => this.#receiveForce(payload))
    session.onClose((reason) => this.close(reason))
  }

  /** @param {string} method @param {(params: any, context: {signal: AbortSignal}) => any} handler */
  register(method, handler) {
    this.#rpcHandlers.set(method, handler)
    return () => this.#rpcHandlers.delete(method)
  }

  /**
   * @param {string} method
   * @param {unknown} params
   * @param {{timeoutMs?: number, signal?: AbortSignal}} options
   */
  request(method, params, {timeoutMs = 5_000, signal} = {}) {
    if (this.#closed) return Promise.reject(new Error("transport-lost"))
    if (signal?.aborted) return Promise.reject(rpcAbortReason(signal))
    const id = this.#ids()
    return new Promise((resolve, reject) => {
      /** @param {Error} error @param {boolean} notifyRemote */
      const finishRejected = (error, notifyRemote) => {
        const pending = this.#pending.get(id)
        if (!pending) return
        this.#pending.delete(id)
        pending.cleanup()
        if (notifyRemote) {
          try { this.#session.send("oracle", {type: "rpc.cancel", id}) } catch {}
        }
        reject(error)
      }
      const timeout = setTimeout(() => {
        finishRejected(new Error("rpc-timeout"), true)
      }, timeoutMs)
      const aborted = () => finishRejected(rpcAbortReason(signal), true)
      const cleanup = () => {
        clearTimeout(timeout)
        signal?.removeEventListener("abort", aborted)
      }
      this.#pending.set(id, {resolve, reject, cleanup})
      signal?.addEventListener("abort", aborted, {once: true})
      try {
        this.#session.send("oracle", {type: "rpc.request", id, method, params})
      } catch (error) {
        this.#pending.delete(id)
        cleanup()
        reject(error)
      }
    })
  }

  /** @param {(payload: any) => unknown} handler */
  onForce(handler) {
    this.#forceHandlers.add(handler)
    return () => this.#forceHandlers.delete(handler)
  }

  /** @param {unknown} particle @param {unknown} [appliedThrough] */
  publishForce(particle, appliedThrough = null) {
    const nextSequence = this.#forceSequence + 1
    this.#session.send("force", {
      type: "force.event",
      sequence: nextSequence,
      appliedThrough,
      particle,
    })
    this.#forceSequence = nextSequence
    return nextSequence
  }

  /** @param {string} [reason] */
  close(reason = "transport-lost") {
    if (this.#closed) return
    this.#closed = true
    for (const pending of this.#pending.values()) {
      pending.cleanup()
      pending.reject(new Error(reason))
    }
    this.#pending.clear()
    for (const controller of this.#activeRequests.values()) controller.abort(reason)
    this.#activeRequests.clear()
    this.#session.close(reason)
  }

  /** @param {any} payload */
  async #receiveOracle(payload) {
    if (payload?.type === "rpc.response") {
      const pending = this.#pending.get(payload.id)
      if (!pending) return
      pending.cleanup()
      this.#pending.delete(payload.id)
      if (payload.ok) pending.resolve(payload.result)
      else pending.reject(new Error(payload.error || "rpc-error"))
      return
    }
    if (payload?.type === "rpc.cancel") {
      this.#activeRequests.get(payload.id)?.abort("remote-cancel")
      return
    }
    if (payload?.type !== "rpc.request") return
    const handler = this.#rpcHandlers.get(payload.method)
    const controller = new AbortController()
    this.#activeRequests.set(payload.id, controller)
    try {
      if (!handler) throw new Error(`unknown-method:${payload.method}`)
      const result = await handler(payload.params, {signal: controller.signal})
      if (controller.signal.aborted) return
      this.#session.send("oracle", {type: "rpc.response", id: payload.id, ok: true, result})
    } catch (error) {
      if (controller.signal.aborted) return
      this.#session.send("oracle", {
        type: "rpc.response",
        id: payload.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.#activeRequests.delete(payload.id)
    }
  }

  /** @param {any} payload */
  #receiveForce(payload) {
    if (payload?.type !== "force.event") return
    if (payload.sequence !== this.#expectedForceSequence) {
      this.close(`force-sequence-gap:${this.#expectedForceSequence}:${payload.sequence}`)
      return
    }
    this.#expectedForceSequence += 1
    for (const handler of this.#forceHandlers) handler(payload)
  }
}

/** @param {AbortSignal | undefined} signal */
function rpcAbortReason(signal) {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  return new Error(reason === undefined ? "rpc-cancelled" : String(reason))
}
