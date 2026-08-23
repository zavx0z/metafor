export const SOAK_EVIDENCE_SCHEMA = "hamiltonian.open-tab-soak/v2" as const

export interface SoakIdentity {
  hostEpoch: string
  connectionId: string | null
  workerIncarnationId: string | null
  leaseId: string
  deviceId: string
  tabId: string
  peerId: string
  peerSessionEpoch: string
  peerGeneration: number
  peerAuthorityKey: string
}

export interface SoakCounters {
  heartbeatAck: number
  oracleRequests: number
  forceEvents: number
  realtimeFramesOnControlSocket: number
}

export interface SoakSample {
  index: number
  observedAt: string
  identity: SoakIdentity
  counters: SoakCounters
}

export interface SoakFailure {
  kind: "aborted" | "configuration" | "invariant" | "request" | "request-timeout"
  message: string
  sampleIndex: number | null
}

export interface SoakEvidence {
  schema: typeof SOAK_EVIDENCE_SCHEMA
  outcome: "passed" | "failed"
  endpoint: string
  startedAt: string
  finishedAt: string
  requestedDurationMs: number
  intervalMs: number
  requestTimeoutMs: number
  sampleCount: number
  identity: SoakIdentity | null
  initialCounters: SoakCounters | null
  finalCounters: SoakCounters | null
  progress: {
    heartbeatAcks: number
    oracleRequests: number
    forceEvents: number
  } | null
  physicalTransitions: {
    connectionChanges: number
    workerRebirths: number
    detachedSamples: number
  }
  samples: SoakSample[]
  failure: SoakFailure | null
}

export type StatusReader = (signal: AbortSignal) => Promise<unknown>

export interface TimerHooks {
  set(callback: () => void, delayMs: number): unknown
  clear(handle: unknown): void
}

export interface OpenTabSoakOptions {
  hostUrl: string | URL
  token: string
  durationMs?: number
  intervalMs?: number
  requestTimeoutMs?: number
  signal?: AbortSignal
  readStatus?: StatusReader
  fetchImpl?: typeof fetch
  now?: () => number
  delay?: (delayMs: number, signal: AbortSignal) => Promise<void>
  timers?: TimerHooks
}

class SoakCheckError extends Error {
  readonly kind: SoakFailure["kind"]
  readonly sampleIndex: number | null

  constructor(kind: SoakFailure["kind"], message: string, sampleIndex: number | null = null) {
    super(message)
    this.name = "SoakCheckError"
    this.kind = kind
    this.sampleIndex = sampleIndex
  }
}

function requireObject(value: unknown, field: string, sampleIndex: number): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SoakCheckError("invariant", `${field} must be an object`, sampleIndex)
  }
  return value as Record<string, unknown>
}

function requireArray(value: unknown, field: string, sampleIndex: number): unknown[] {
  if (!Array.isArray(value)) {
    throw new SoakCheckError("invariant", `${field} must be an array`, sampleIndex)
  }
  return value
}

function requireString(value: unknown, field: string, sampleIndex: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SoakCheckError("invariant", `${field} must be a non-empty string`, sampleIndex)
  }
  return value
}

function requireCounter(value: unknown, field: string, sampleIndex: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new SoakCheckError("invariant", `${field} must be a non-negative safe integer`, sampleIndex)
  }
  return Number(value)
}

function requireEqual(
  actual: string,
  expected: string,
  field: string,
  sampleIndex: number,
): void {
  if (actual !== expected) {
    throw new SoakCheckError(
      "invariant",
      `${field} changed: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
      sampleIndex,
    )
  }
}

function requireNonDecrease(
  actual: number,
  previous: number,
  field: string,
  sampleIndex: number,
): void {
  if (actual < previous) {
    throw new SoakCheckError(
      "invariant",
      `${field} moved backwards: previous ${previous}, received ${actual}`,
      sampleIndex,
    )
  }
}

export function extractSoakSample(status: unknown, index: number, observedAt: string): SoakSample {
  const root = requireObject(status, "status", index)
  const hostEpoch = requireString(root.hostEpoch, "hostEpoch", index)
  const topology = requireObject(root.topology, "topology", index)
  const leader = requireObject(topology.leader, "topology.leader", index)
  const leaderHostEpoch = requireString(leader.hostEpoch, "topology.leader.hostEpoch", index)
  requireEqual(leaderHostEpoch, hostEpoch, "topology.leader.hostEpoch", index)

  const connectionId = requireString(leader.connectionId, "topology.leader.connectionId", index)
  const deviceId = requireString(leader.deviceId, "topology.leader.deviceId", index)
  const tabId = requireString(leader.tabId, "topology.leader.tabId", index)
  const leaseId = requireString(leader.leaseId, "topology.leader.leaseId", index)

  const topologyPeer = requireArray(topology.peers, "topology.peers", index)
    .map((value, peerIndex) => requireObject(value, `topology.peers[${peerIndex}]`, index))
    .find((candidate) => candidate.connectionId === connectionId)
  if (!topologyPeer) {
    throw new SoakCheckError("invariant", "leader connection is absent from topology.peers", index)
  }
  const openWindow = requireArray(topologyPeer.windows, "leader peer windows", index)
    .map((value, windowIndex) => requireObject(value, `leader peer windows[${windowIndex}]`, index))
    .find((candidate) => candidate.tabId === tabId)
  if (!openWindow) {
    throw new SoakCheckError("invariant", "leader Window is no longer open", index)
  }

  const connection = requireArray(root.connections, "connections", index)
    .map((value, connectionIndex) => requireObject(value, `connections[${connectionIndex}]`, index))
    .find((candidate) => candidate.connectionId === connectionId)
  const workerIncarnationId = connection
    ? requireString(connection.workerIncarnationId, "connection.workerIncarnationId", index)
    : null

  const peer = requireObject(root.peer, "peer", index)
  if (peer.error !== null) {
    throw new SoakCheckError(
      "invariant",
      `peer.error must stay null, received ${JSON.stringify(peer.error)}`,
      index,
    )
  }
  const realtimeFramesOnControlSocket = requireCounter(
    peer.realtimeFramesOnControlSocket,
    "peer.realtimeFramesOnControlSocket",
    index,
  )
  const heartbeatAck = requireCounter(peer.heartbeatAcks, "peer.heartbeatAcks", index)
  if (realtimeFramesOnControlSocket !== 0) {
    throw new SoakCheckError("invariant", "realtime payload was relayed over the control socket", index)
  }

  const assignment = requireObject(peer.assignment, "peer.assignment", index)
  requireEqual(
    requireString(assignment.key, "peer.assignment.key", index),
    leaseId,
    "peer.assignment.key",
    index,
  )
  requireEqual(
    requireString(assignment.connectionId, "peer.assignment.connectionId", index),
    connectionId,
    "peer.assignment.connectionId",
    index,
  )
  requireEqual(
    requireString(assignment.tabId, "peer.assignment.tabId", index),
    tabId,
    "peer.assignment.tabId",
    index,
  )
  const peerId = requireString(assignment.peerId, "peer.assignment.peerId", index)
  const peerSessionEpoch = requireString(
    assignment.sessionEpoch,
    "peer.assignment.sessionEpoch",
    index,
  )
  const peerGeneration = requireCounter(
    assignment.peerGeneration,
    "peer.assignment.peerGeneration",
    index,
  )
  if (peerGeneration === 0) {
    throw new SoakCheckError("invariant", "peer.assignment.peerGeneration must be positive", index)
  }
  const peerAuthorityKey = requireString(
    assignment.authorityKey,
    "peer.assignment.authorityKey",
    index,
  )

  const snapshot = requireObject(peer.snapshot, "peer.snapshot", index)
  requireEqual(
    requireString(snapshot.peerId, "peer.snapshot.peerId", index),
    peerId,
    "peer.snapshot.peerId",
    index,
  )
  requireEqual(
    requireString(snapshot.sessionEpoch, "peer.snapshot.sessionEpoch", index),
    peerSessionEpoch,
    "peer.snapshot.sessionEpoch",
    index,
  )
  requireEqual(
    requireString(snapshot.state, "peer.snapshot.state", index),
    "connected",
    "peer.snapshot.state",
    index,
  )
  const channels = requireArray(snapshot.channels, "peer.snapshot.channels", index)
  if (!channels.includes("oracle") || !channels.includes("force")) {
    throw new SoakCheckError("invariant", "peer oracle and force channels must both be open", index)
  }

  return {
    index,
    observedAt,
    identity: {
      hostEpoch,
      connectionId: connection ? connectionId : null,
      workerIncarnationId,
      leaseId,
      deviceId,
      tabId,
      peerId,
      peerSessionEpoch,
      peerGeneration,
      peerAuthorityKey,
    },
    counters: {
      heartbeatAck,
      oracleRequests: requireCounter(snapshot.oracleRequests, "peer.snapshot.oracleRequests", index),
      forceEvents: requireCounter(snapshot.forceEvents, "peer.snapshot.forceEvents", index),
      realtimeFramesOnControlSocket,
    },
  }
}

export function compareSoakSamples(previous: SoakSample, current: SoakSample): void {
  const stableFields: Array<keyof SoakIdentity> = [
    "hostEpoch",
    "leaseId",
    "deviceId",
    "tabId",
    "peerId",
    "peerSessionEpoch",
    "peerGeneration",
    "peerAuthorityKey",
  ]
  for (const field of stableFields) {
    if (current.identity[field] !== previous.identity[field]) {
      throw new SoakCheckError(
        "invariant",
        `${field} changed: expected ${JSON.stringify(previous.identity[field])}, ` +
          `received ${JSON.stringify(current.identity[field])}`,
        current.index,
      )
    }
  }
  requireNonDecrease(
    current.counters.heartbeatAck,
    previous.counters.heartbeatAck,
    "heartbeatAck",
    current.index,
  )
  requireNonDecrease(
    current.counters.oracleRequests,
    previous.counters.oracleRequests,
    "oracleRequests",
    current.index,
  )
  requireNonDecrease(
    current.counters.forceEvents,
    previous.counters.forceEvents,
    "forceEvents",
    current.index,
  )
}

export function statusEndpoint(hostUrl: string | URL): URL {
  const endpoint = new URL(hostUrl)
  endpoint.pathname = "/lab/status"
  endpoint.search = ""
  endpoint.hash = ""
  return endpoint
}

export function createAuthenticatedStatusReader(
  hostUrl: string | URL,
  token: string,
  fetchImpl: typeof fetch = fetch,
): StatusReader {
  const endpoint = statusEndpoint(hostUrl)
  return async (signal) => {
    const response = await fetchImpl(endpoint, {
      cache: "no-store",
      headers: {authorization: `Bearer ${token}`},
      signal,
    })
    if (!response.ok) {
      throw new SoakCheckError(
        "request",
        `/lab/status returned HTTP ${response.status}`,
      )
    }
    try {
      return await response.json()
    } catch (error) {
      throw new SoakCheckError(
        "request",
        `/lab/status returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

const defaultTimers: TimerHooks = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

function abortError(reason: unknown): SoakCheckError {
  if (reason instanceof SoakCheckError) return reason
  return new SoakCheckError(
    "aborted",
    reason instanceof Error ? reason.message : String(reason ?? "soak aborted"),
  )
}

function defaultDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal.reason))
      return
    }
    const timer = setTimeout(done, delayMs)
    function done() {
      signal.removeEventListener("abort", aborted)
      resolve()
    }
    function aborted() {
      clearTimeout(timer)
      signal.removeEventListener("abort", aborted)
      reject(abortError(signal.reason))
    }
    signal.addEventListener("abort", aborted, {once: true})
  })
}

async function readWithTimeout(
  reader: StatusReader,
  parentSignal: AbortSignal,
  requestTimeoutMs: number,
  timers: TimerHooks,
): Promise<unknown> {
  const controller = new AbortController()
  const parentAborted = () => controller.abort(parentSignal.reason)
  if (parentSignal.aborted) parentAborted()
  else parentSignal.addEventListener("abort", parentAborted, {once: true})
  const timeoutError = new SoakCheckError(
    "request-timeout",
    `/lab/status request exceeded ${requestTimeoutMs}ms`,
  )
  const timeout = timers.set(() => controller.abort(timeoutError), requestTimeoutMs)
  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject
  })
  const requestAborted = () => rejectAbort(abortError(controller.signal.reason))
  if (controller.signal.aborted) requestAborted()
  else controller.signal.addEventListener("abort", requestAborted, {once: true})

  try {
    return await Promise.race([
      Promise.resolve().then(() => reader(controller.signal)),
      aborted,
    ])
  } catch (error) {
    if (error instanceof SoakCheckError) throw error
    if (controller.signal.aborted) throw abortError(controller.signal.reason)
    throw new SoakCheckError(
      "request",
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    timers.clear(timeout)
    parentSignal.removeEventListener("abort", parentAborted)
    controller.signal.removeEventListener("abort", requestAborted)
    if (!controller.signal.aborted) controller.abort(new Error("status request finished"))
  }
}

function sampleTargets(durationMs: number, intervalMs: number): number[] {
  const targets = [0]
  for (let target = intervalMs; target < durationMs; target += intervalMs) targets.push(target)
  targets.push(durationMs)
  return targets
}

function validateConfiguration(
  hostUrl: string | URL,
  token: string,
  durationMs: number,
  intervalMs: number,
  requestTimeoutMs: number,
): URL {
  let endpoint: URL
  try {
    endpoint = statusEndpoint(hostUrl)
  } catch {
    throw new SoakCheckError("configuration", "hostUrl must be an absolute HTTP(S) URL")
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new SoakCheckError("configuration", "hostUrl must use HTTP or HTTPS")
  }
  if (!token) throw new SoakCheckError("configuration", "token must be non-empty")
  for (const [field, value] of [
    ["durationMs", durationMs],
    ["intervalMs", intervalMs],
    ["requestTimeoutMs", requestTimeoutMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new SoakCheckError("configuration", `${field} must be a positive safe integer`)
    }
  }
  const count = sampleTargets(durationMs, intervalMs).length
  if (count > 10_000) {
    throw new SoakCheckError("configuration", "soak would exceed the 10,000-sample evidence bound")
  }
  return endpoint
}

function failureFrom(error: unknown, sampleIndex: number | null): SoakFailure {
  if (error instanceof SoakCheckError) {
    return {
      kind: error.kind,
      message: error.message,
      sampleIndex: error.sampleIndex ?? sampleIndex,
    }
  }
  return {
    kind: "request",
    message: error instanceof Error ? error.message : String(error),
    sampleIndex,
  }
}

function makeEvidence(
  outcome: SoakEvidence["outcome"],
  endpoint: string,
  startedAt: string,
  finishedAt: string,
  durationMs: number,
  intervalMs: number,
  requestTimeoutMs: number,
  samples: SoakSample[],
  failure: SoakFailure | null,
): SoakEvidence {
  const first = samples[0] ?? null
  const last = samples.at(-1) ?? null
  let connectionChanges = 0
  let workerRebirths = 0
  let lastObservedWorkerIncarnation = first?.identity.workerIncarnationId ?? null
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!.identity
    const current = samples[index]!.identity
    if (previous.connectionId !== current.connectionId) connectionChanges += 1
    if (current.workerIncarnationId) {
      if (
        lastObservedWorkerIncarnation &&
        lastObservedWorkerIncarnation !== current.workerIncarnationId
      ) workerRebirths += 1
      lastObservedWorkerIncarnation = current.workerIncarnationId
    }
  }
  return {
    schema: SOAK_EVIDENCE_SCHEMA,
    outcome,
    endpoint,
    startedAt,
    finishedAt,
    requestedDurationMs: durationMs,
    intervalMs,
    requestTimeoutMs,
    sampleCount: samples.length,
    identity: first?.identity ?? null,
    initialCounters: first?.counters ?? null,
    finalCounters: last?.counters ?? null,
    progress: first && last
      ? {
        heartbeatAcks: last.counters.heartbeatAck - first.counters.heartbeatAck,
        oracleRequests: last.counters.oracleRequests - first.counters.oracleRequests,
        forceEvents: last.counters.forceEvents - first.counters.forceEvents,
      }
      : null,
    physicalTransitions: {
      connectionChanges,
      workerRebirths,
      detachedSamples: samples.filter((sample) => sample.identity.connectionId === null).length,
    },
    samples,
    failure,
  }
}

export async function observeOpenTabSoak(options: OpenTabSoakOptions): Promise<SoakEvidence> {
  const durationMs = options.durationMs ?? 5 * 60_000
  const intervalMs = options.intervalMs ?? 15_000
  const requestTimeoutMs = options.requestTimeoutMs ?? 5_000
  const now = options.now ?? Date.now
  const delay = options.delay ?? defaultDelay
  const timers = options.timers ?? defaultTimers
  let endpoint = "invalid"
  let startedAtMs = now()
  let startedAt = new Date(startedAtMs).toISOString()
  let runController: AbortController | null = null
  let unlinkParent = () => {}
  const samples: SoakSample[] = []
  let currentSampleIndex: number | null = null

  try {
    const validatedEndpoint = validateConfiguration(
      options.hostUrl,
      options.token,
      durationMs,
      intervalMs,
      requestTimeoutMs,
    )
    endpoint = validatedEndpoint.toString()
    const reader = options.readStatus ?? createAuthenticatedStatusReader(
      validatedEndpoint,
      options.token,
      options.fetchImpl,
    )
    runController = new AbortController()
    const parentSignal = options.signal
    if (parentSignal) {
      const parentAborted = () => runController?.abort(parentSignal.reason)
      if (parentSignal.aborted) parentAborted()
      else parentSignal.addEventListener("abort", parentAborted, {once: true})
      unlinkParent = () => parentSignal.removeEventListener("abort", parentAborted)
    }

    startedAtMs = now()
    startedAt = new Date(startedAtMs).toISOString()
    const targets = sampleTargets(durationMs, intervalMs)
    for (let index = 0; index < targets.length; index += 1) {
      currentSampleIndex = index
      const target = targets[index]!
      const remainingDelay = Math.max(0, startedAtMs + target - now())
      if (remainingDelay > 0) await delay(remainingDelay, runController.signal)
      if (runController.signal.aborted) throw abortError(runController.signal.reason)
      const rawStatus = await readWithTimeout(
        reader,
        runController.signal,
        requestTimeoutMs,
        timers,
      )
      const sample = extractSoakSample(rawStatus, index, new Date(now()).toISOString())
      const previous = samples.at(-1)
      if (previous) compareSoakSamples(previous, sample)
      samples.push(sample)
    }

    const first = samples[0]
    const last = samples.at(-1)
    if (!first || !last) throw new SoakCheckError("invariant", "soak produced no samples")
    for (const [field, progress] of [
      ["heartbeatAck", last.counters.heartbeatAck - first.counters.heartbeatAck],
      ["oracleRequests", last.counters.oracleRequests - first.counters.oracleRequests],
      ["forceEvents", last.counters.forceEvents - first.counters.forceEvents],
    ] as const) {
      if (progress <= 0) {
        throw new SoakCheckError("invariant", `${field} made no progress during the soak`, last.index)
      }
    }

    return makeEvidence(
      "passed",
      endpoint,
      startedAt,
      new Date(now()).toISOString(),
      durationMs,
      intervalMs,
      requestTimeoutMs,
      samples,
      null,
    )
  } catch (error) {
    const failure = failureFrom(error, currentSampleIndex)
    return makeEvidence(
      "failed",
      endpoint,
      startedAt,
      new Date(now()).toISOString(),
      durationMs,
      intervalMs,
      requestTimeoutMs,
      samples,
      failure,
    )
  } finally {
    unlinkParent()
    if (runController && !runController.signal.aborted) {
      runController.abort(new Error("soak observer finished"))
    }
  }
}
