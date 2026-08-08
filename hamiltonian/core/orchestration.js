export const HAMILTONIAN_ORCHESTRATION_CHANNEL = "metafor.hamiltonian.orchestration.v1"
export const HAMILTONIAN_ORCHESTRATION_VERSION = 1
export const HAMILTONIAN_LOCAL_WINDOW_ACTION_IDS = Object.freeze([
  "open-window",
  "rebirth-worker",
  "reload-main",
  "reconnect",
  "reload",
])

const HAMILTONIAN_LOCAL_WINDOW_ACTION_ID_SET = new Set(HAMILTONIAN_LOCAL_WINDOW_ACTION_IDS)

/** @param {string} deviceId @param {string} tabId */
export function hamiltonianWindowNodeId(deviceId, tabId) {
  return `window:${encodeURIComponent(deviceId || "unknown")}:${encodeURIComponent(tabId || "unknown")}`
}

/**
 * Accepts only an existing local-Window action addressed to this exact page.
 * The DOM event is an adapter boundary, not authority: actual lifecycle guards
 * still remain in the action implementation.
 *
 * @param {unknown} value
 * @param {string} deviceId
 * @param {string} tabId
 * @returns {{nodeId: string, actionId: string} | null}
 */
export function parseLocalHamiltonianWindowAction(value, deviceId, tabId) {
  const record = objectValue(value)
  const nodeId = stringValue(record?.nodeId)
  const actionId = stringValue(record?.actionId)
  if (nodeId !== hamiltonianWindowNodeId(deviceId, tabId)) return null
  if (!HAMILTONIAN_LOCAL_WINDOW_ACTION_ID_SET.has(actionId)) return null
  return {nodeId, actionId}
}

/**
 * @typedef {{
 *   kind: "hamiltonian-orchestration",
 *   version: 1,
 *   source: "service-worker",
 *   sourceId: string,
 *   revision: number,
 *   at: number,
 *   projection: Record<string, unknown>,
 * }} OrchestrationEnvelope
 */

const FORBIDDEN_KEYS = new Set([
  "token",
  "resumeNonce",
  "controlResumeNonce",
  "authorityKey",
  "signal",
  "sdp",
  "candidate",
  "particle",
  "rpc",
])

/**
 * A projection deliberately copies an allow-list instead of cloning a control
 * message. This keeps browser-local observability separate from authority,
 * signaling and the Oracle/Force payload plane.
 *
 * @param {{workerIncarnationId: string, socket: string, connectionId?: string | null}} worker
 * @param {unknown} host
 * @param {unknown} topology
 * @param {string} reason
 */
export function createOrchestrationProjection(worker, host, topology, reason) {
  return {
    reason,
    worker: {
      incarnationId: worker.workerIncarnationId,
      socket: worker.socket,
      connectionId: worker.connectionId ?? null,
    },
    host: sanitizeHost(host),
    topology: sanitizeTopology(topology),
  }
}

/**
 * @param {{sourceId: string, revision: number, projection: unknown, at?: number}} input
 */
export function createOrchestrationEnvelope(input) {
  const envelope = {
    kind: "hamiltonian-orchestration",
    version: HAMILTONIAN_ORCHESTRATION_VERSION,
    source: "service-worker",
    sourceId: input.sourceId,
    revision: input.revision,
    at: input.at ?? Date.now(),
    projection: input.projection,
  }
  if (!isOrchestrationEnvelope(envelope)) {
    throw new Error("Invalid Hamiltonian orchestration envelope")
  }
  return envelope
}

/** @param {unknown} value @returns {value is OrchestrationEnvelope} */
export function isOrchestrationEnvelope(value) {
  const record = objectValue(value)
  return Boolean(
    record &&
    record.kind === "hamiltonian-orchestration" &&
    record.version === HAMILTONIAN_ORCHESTRATION_VERSION &&
    record.source === "service-worker" &&
    typeof record.sourceId === "string" &&
    record.sourceId.length > 0 &&
    record.sourceId.length <= 128 &&
    Number.isSafeInteger(record.revision) &&
    Number(record.revision) > 0 &&
    typeof record.at === "number" &&
    record.at > 0 &&
    record.projection &&
    typeof record.projection === "object" &&
    !hasForbiddenOrchestrationData(record.projection)
  )
}

/**
 * One receiver accepts one monotonic publisher incarnation. After a Service
 * Worker rebirth the former source is retired so a late message cannot roll
 * the scene back.
 */
export class OrchestrationEnvelopeCursor {
  /** @type {string | null} */
  #sourceId = null
  #revision = 0
  /** @type {Set<string>} */
  #retiredSources = new Set()

  /** @param {unknown} value */
  accept(value) {
    if (!isOrchestrationEnvelope(value)) return null
    if (this.#retiredSources.has(value.sourceId)) return null
    if (this.#sourceId === value.sourceId) {
      if (value.revision <= this.#revision) return null
    } else {
      if (this.#sourceId !== null) this.#retiredSources.add(this.#sourceId)
      this.#sourceId = value.sourceId
      this.#revision = 0
    }
    this.#revision = value.revision
    return value
  }

  snapshot() {
    return {sourceId: this.#sourceId, revision: this.#revision}
  }
}

/** @param {unknown} value @returns {boolean} */
export function hasForbiddenOrchestrationData(value) {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some((item) => hasForbiddenOrchestrationData(item))
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true
    if (hasForbiddenOrchestrationData(child)) return true
  }
  return false
}

/** @param {unknown} value */
function sanitizeHost(value) {
  if (!value || typeof value !== "object") return null
  const record = objectValue(value)
  if (record === null) return null
  const peer = objectValue(record.peer)
  const assignment = objectValue(peer?.assignment)
  const snapshot = objectValue(peer?.snapshot)
  return {
    identity: stringValue(record.identity),
    hostEpoch: stringValue(record.hostEpoch),
    version: stringValue(record.version),
    placement: record.placement === "server" ? "server" : "browser",
    bunEmbodiments: sanitizeEmbodiments(record.bunEmbodiments),
    peer: {
      assignment: assignment === null ? null : {
        peerId: stringValue(assignment.peerId),
        sessionEpoch: stringValue(assignment.sessionEpoch),
        peerGeneration: numberValue(assignment.peerGeneration),
        connectionId: stringValue(assignment.connectionId),
        tabId: stringValue(assignment.tabId),
      },
      snapshot: snapshot === null ? null : {
        peerId: stringValue(snapshot.peerId),
        sessionEpoch: stringValue(snapshot.sessionEpoch),
        state: stringValue(snapshot.state),
        channels: Array.isArray(snapshot.channels)
          ? snapshot.channels.filter((channel) => channel === "oracle" || channel === "force")
          : [],
        oracleRequests: numberValue(snapshot.oracleRequests),
        forceEvents: numberValue(snapshot.forceEvents),
      },
      error: typeof peer?.error === "string" ? peer.error : null,
    },
  }
}

/** @param {unknown} value */
function sanitizeEmbodiments(value) {
  const record = objectValue(value)
  if (record === null) return {}
  return Object.fromEntries(Object.entries(record).map(([role, raw]) => {
    const snapshot = objectValue(raw)
    return [role, {
      role,
      runtime: stringValue(snapshot?.runtime),
      state: stringValue(snapshot?.state),
      incarnation: nullableString(snapshot?.incarnation),
      pid: nullableNumber(snapshot?.pid),
      version: nullableString(snapshot?.version),
      description: nullableString(snapshot?.description),
      error: nullableString(snapshot?.error),
      fencingToken: numberValue(objectValue(snapshot?.authority)?.fencingToken),
    }]
  }))
}

/** @param {unknown} value */
function sanitizeTopology(value) {
  const record = objectValue(value)
  if (record === null) return null
  const leader = objectValue(record.leader)
  return {
    revision: numberValue(record.revision),
    leaseDurationMs: numberValue(record.leaseDurationMs),
    leader: leader === null ? null : {
      hostEpoch: stringValue(leader.hostEpoch),
      connectionId: stringValue(leader.connectionId),
      deviceId: stringValue(leader.deviceId),
      tabId: stringValue(leader.tabId),
      joinedAt: numberValue(leader.joinedAt),
      fencingToken: numberValue(leader.fencingToken),
      leaseExpiresAt: numberValue(leader.leaseExpiresAt),
    },
    peers: Array.isArray(record.peers) ? record.peers.map((rawPeer) => {
      const peer = objectValue(rawPeer)
      return {
        connectionId: stringValue(peer?.connectionId),
        deviceId: stringValue(peer?.deviceId),
        windows: Array.isArray(peer?.windows) ? peer.windows.map((rawWindow) => {
          const window = objectValue(rawWindow)
          return {
            tabId: stringValue(window?.tabId),
            joinedAt: numberValue(window?.joinedAt),
            visible: window?.visible === true,
          }
        }) : [],
      }
    }) : [],
  }
}

/** @param {unknown} value @returns {Record<string, unknown> | null} */
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null
}

/** @param {unknown} value */
function stringValue(value) {
  return typeof value === "string" ? value : ""
}

/** @param {unknown} value */
function nullableString(value) {
  return typeof value === "string" ? value : null
}

/** @param {unknown} value */
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** @param {unknown} value */
function nullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
