import {describe, expect, test} from "bun:test"
import {
  createAuthenticatedStatusReader,
  observeOpenTabSoak,
  type OpenTabSoakOptions,
  type TimerHooks,
} from "./observer.ts"

interface FixtureOverrides {
  hostEpoch?: string
  connectionId?: string
  workerIncarnationId?: string
  leaseId?: string
  tabId?: string
  peerId?: string
  sessionEpoch?: string
  peerGeneration?: number
  authorityKey?: string
  heartbeatAck?: number
  oracleRequests?: number
  forceEvents?: number
  peerError?: string | null
  realtimeFrames?: number
  includeWindow?: boolean
  connectionPresent?: boolean
}

function statusFixture(sequence: number, overrides: FixtureOverrides = {}) {
  const hostEpoch = overrides.hostEpoch ?? "host-epoch-a"
  const connectionId = overrides.connectionId ?? "connection-a"
  const workerIncarnationId = overrides.workerIncarnationId ?? "worker-a"
  const leaseId = overrides.leaseId ?? "lease-a"
  const tabId = overrides.tabId ?? "tab-a"
  const peerId = overrides.peerId ?? "peer-a"
  const sessionEpoch = overrides.sessionEpoch ?? "session-a"
  const peerGeneration = overrides.peerGeneration ?? 1
  const authorityKey = overrides.authorityKey ?? "authority-a"
  return {
    hostEpoch,
    topology: {
      leader: {hostEpoch, connectionId, deviceId: "device-a", tabId, leaseId},
      peers: [{
        connectionId,
        deviceId: "device-a",
        windows: overrides.includeWindow === false ? [] : [{tabId, joinedAt: 1, visible: true}],
      }],
    },
    connections: overrides.connectionPresent === false ? [] : [{
      connectionId,
      workerIncarnationId,
      lastAckSeq: overrides.heartbeatAck ?? sequence,
    }],
    peer: {
      assignment: {
        key: leaseId,
        peerId,
        sessionEpoch,
        peerGeneration,
        authorityKey,
        connectionId,
        tabId,
      },
      snapshot: {
        peerId,
        sessionEpoch,
        state: "connected",
        channels: ["oracle", "force"],
        oracleRequests: overrides.oracleRequests ?? sequence,
        forceEvents: overrides.forceEvents ?? sequence,
      },
      error: overrides.peerError ?? null,
      heartbeatAcks: overrides.heartbeatAck ?? sequence,
      realtimeFramesOnControlSocket: overrides.realtimeFrames ?? 0,
    },
  }
}

function deterministicOptions(fixtures: unknown[]): OpenTabSoakOptions {
  let fixtureIndex = 0
  let elapsed = 0
  return {
    hostUrl: "https://hamiltonian.test/ignored",
    token: "fixture-token",
    durationMs: fixtures.length - 1,
    intervalMs: 1,
    requestTimeoutMs: 100,
    now: () => Date.UTC(2026, 7, 8) + elapsed,
    delay: async (delayMs, signal) => {
      if (signal.aborted) throw signal.reason
      elapsed += delayMs
    },
    readStatus: async () => fixtures[fixtureIndex++],
  }
}

describe("Hamiltonian open-tab soak observer", () => {
  test("emits bounded JSON evidence for one stable, progressing open Window", async () => {
    const evidence = await observeOpenTabSoak(deterministicOptions([
      statusFixture(10),
      statusFixture(11),
      statusFixture(12),
    ]))

    expect(evidence).toMatchObject({
      schema: "hamiltonian.open-tab-soak/v2",
      outcome: "passed",
      endpoint: "https://hamiltonian.test/lab/status",
      sampleCount: 3,
      identity: {
        hostEpoch: "host-epoch-a",
        connectionId: "connection-a",
        workerIncarnationId: "worker-a",
        leaseId: "lease-a",
        tabId: "tab-a",
        peerSessionEpoch: "session-a",
        peerGeneration: 1,
        peerAuthorityKey: "authority-a",
      },
      progress: {heartbeatAcks: 2, oracleRequests: 2, forceEvents: 2},
      physicalTransitions: {connectionChanges: 0, workerRebirths: 0, detachedSamples: 0},
      failure: null,
    })
    expect(() => JSON.parse(JSON.stringify(evidence))).not.toThrow()
  })

  for (const [field, override] of [
    ["hostEpoch", {hostEpoch: "host-epoch-b"}],
    ["leaseId", {leaseId: "lease-b"}],
    ["peer session", {sessionEpoch: "session-b"}],
    ["peer generation", {peerGeneration: 2}],
    ["peer authority", {authorityKey: "authority-b"}],
  ] as const) {
    test(`fails evidence when stable ${field} changes`, async () => {
      const evidence = await observeOpenTabSoak(deterministicOptions([
        statusFixture(10),
        statusFixture(11, override),
      ]))
      expect(evidence.outcome).toBe("failed")
      expect(evidence.failure).toMatchObject({kind: "invariant", sampleIndex: 1})
      expect(evidence.sampleCount).toBe(1)
    })
  }

  test("allows a new physical WSS and Service Worker incarnation under the same logical authority", async () => {
    const evidence = await observeOpenTabSoak(deterministicOptions([
      statusFixture(10),
      statusFixture(11, {connectionPresent: false}),
      statusFixture(12, {connectionId: "connection-b", workerIncarnationId: "worker-b"}),
    ]))
    expect(evidence.outcome).toBe("passed")
    expect(evidence.physicalTransitions).toEqual({
      connectionChanges: 2,
      workerRebirths: 1,
      detachedSamples: 1,
    })
  })

  for (const [field, override] of [
    ["heartbeatAck", {heartbeatAck: 10}],
    ["oracleRequests", {oracleRequests: 10}],
    ["forceEvents", {forceEvents: 10}],
  ] as const) {
    test(`requires ${field} to make progress over the complete soak`, async () => {
      const evidence = await observeOpenTabSoak(deterministicOptions([
        statusFixture(10),
        statusFixture(11, override),
      ]))
      expect(evidence.outcome).toBe("failed")
      expect(evidence.failure?.message).toContain(`${field} made no progress during the soak`)
    })
  }

  test("allows one unchanged intermediate sample when counters remain monotonic", async () => {
    const evidence = await observeOpenTabSoak(deterministicOptions([
      statusFixture(10),
      statusFixture(11, {heartbeatAck: 10, oracleRequests: 10, forceEvents: 10}),
      statusFixture(12),
    ]))
    expect(evidence.outcome).toBe("passed")
  })

  test("fails if the elected Window disappears", async () => {
    const evidence = await observeOpenTabSoak(deterministicOptions([
      statusFixture(10),
      statusFixture(11, {includeWindow: false}),
    ]))
    expect(evidence.failure).toMatchObject({
      kind: "invariant",
      message: "leader Window is no longer open",
      sampleIndex: 1,
    })
  })

  test("fails on peer error or realtime relay over the control socket", async () => {
    const peerError = await observeOpenTabSoak(deterministicOptions([
      statusFixture(10, {peerError: "peer failed"}),
      statusFixture(11),
    ]))
    const relay = await observeOpenTabSoak(deterministicOptions([
      statusFixture(10, {realtimeFrames: 1}),
      statusFixture(11),
    ]))
    expect(peerError.failure?.message).toContain("peer.error must stay null")
    expect(relay.failure?.message).toContain("realtime payload was relayed")
  })

  test("builds an authenticated, uncached /lab/status request without network", async () => {
    const requests: Array<{url: string; init: RequestInit | undefined}> = []
    const reader = createAuthenticatedStatusReader(
      "https://hamiltonian.test/somewhere?token=must-not-leak",
      "secret-token",
      (async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({url: String(input), init})
        return Response.json(statusFixture(1))
      }) as typeof fetch,
    )
    const controller = new AbortController()
    await reader(controller.signal)

    const request = requests[0]!
    expect(request.url).toBe("https://hamiltonian.test/lab/status")
    expect(new Headers(request.init?.headers).get("authorization")).toBe("Bearer secret-token")
    expect(request.init?.cache).toBe("no-store")
    expect(request.init?.signal).toBe(controller.signal)
  })

  test("aborts a stuck request on its deadline and clears the timer deterministically", async () => {
    let cleared = 0
    const timers: TimerHooks = {
      set(callback) {
        queueMicrotask(callback)
        return "request-timeout"
      },
      clear(handle) {
        expect(handle).toBe("request-timeout")
        cleared += 1
      },
    }
    const evidence = await observeOpenTabSoak({
      ...deterministicOptions([statusFixture(1), statusFixture(2)]),
      timers,
      readStatus: async (signal) => await new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {once: true})
      }),
    })

    expect(evidence.failure).toMatchObject({kind: "request-timeout", sampleIndex: 0})
    expect(cleared).toBe(1)
  })

  test("clears every successful request deadline", async () => {
    const cleared: unknown[] = []
    let nextTimer = 0
    const timers: TimerHooks = {
      set() {
        nextTimer += 1
        return nextTimer
      },
      clear(handle) {
        cleared.push(handle)
      },
    }
    const evidence = await observeOpenTabSoak({
      ...deterministicOptions([statusFixture(1), statusFixture(2), statusFixture(3)]),
      timers,
    })

    expect(evidence.outcome).toBe("passed")
    expect(cleared).toEqual([1, 2, 3])
  })

  test("honors an already-aborted parent signal without sampling", async () => {
    const controller = new AbortController()
    controller.abort(new Error("fixture stop"))
    let reads = 0
    const evidence = await observeOpenTabSoak({
      ...deterministicOptions([statusFixture(1), statusFixture(2)]),
      signal: controller.signal,
      readStatus: async () => {
        reads += 1
        return statusFixture(reads)
      },
    })

    expect(evidence.failure).toMatchObject({kind: "aborted", message: "fixture stop", sampleIndex: 0})
    expect(reads).toBe(0)
  })
})
