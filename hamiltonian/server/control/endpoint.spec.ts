import {describe, expect, test} from "bun:test"
import {
  HamiltonianControlEndpoint,
  type HamiltonianControlSocketData,
  type HamiltonianControlUpgradeServer,
} from "./endpoint.ts"

const validQuery = Object.freeze({
  token: "test-token",
  device: "browser-profile",
  transport: "websocket:control",
  worker: "service-worker:worker-a",
})

function controlUrl(overrides: Partial<Record<keyof typeof validQuery, string | null>> = {}): URL {
  const url = new URL("http://hamiltonian.test/control")
  for (const [key, value] of Object.entries({...validQuery, ...overrides})) {
    if (value !== null) url.searchParams.set(key, value)
  }
  return url
}

function upgradeServer(result: boolean) {
  const attempts: Array<{request: Request; data: HamiltonianControlSocketData}> = []
  const server: HamiltonianControlUpgradeServer = {
    upgrade(request, {data}) {
      attempts.push({request, data})
      return result
    },
  }
  return {attempts, server}
}

describe("Hamiltonian control endpoint", () => {
  test("preserves exact token and endpoint identity validation", async () => {
    const cases: Array<{
      name: string
      overrides: Partial<Record<keyof typeof validQuery, string | null>>
      acceptToken?: (candidate: string) => boolean
    }> = [
      {name: "token", overrides: {token: "wrong-token"}, acceptToken: () => false},
      {name: "missing device", overrides: {device: null}},
      {name: "long device", overrides: {device: "d".repeat(129)}},
      {name: "missing transport", overrides: {transport: null}},
      {name: "transport scheme", overrides: {transport: "rtc:control"}},
      {name: "long transport", overrides: {transport: `websocket:${"t".repeat(503)}`}},
      {name: "missing worker", overrides: {worker: null}},
      {name: "worker kind", overrides: {worker: "page:worker-a"}},
      {name: "long worker", overrides: {worker: `service-worker:${"w".repeat(498)}`}},
    ]

    for (const {
      name,
      overrides,
      acceptToken = (candidate: string) => candidate === validQuery.token,
    } of cases) {
      const endpoint = new HamiltonianControlEndpoint(acceptToken)
      const {attempts, server} = upgradeServer(true)
      const url = controlUrl(overrides)
      const response = endpoint.upgrade(new Request(url), url, server)

      expect(response?.status, name).toBe(401)
      expect(await response?.text(), name).toBe("Unauthorized")
      expect(attempts, name).toHaveLength(0)
      expect(endpoint.currentConnectionGeneration, name).toBe(0)
    }
  })

  test("passes only the supplied token to the host-owned predicate", () => {
    const candidates: string[] = []
    const endpoint = new HamiltonianControlEndpoint((candidate) => {
      candidates.push(candidate)
      return true
    })
    const {server} = upgradeServer(true)
    const url = controlUrl({token: "opaque-token"})

    expect(endpoint.upgrade(new Request(url), url, server)).toBeUndefined()
    expect(candidates).toEqual(["opaque-token"])
  })

  test("creates the complete initial socket state and returns undefined after upgrade", () => {
    const endpoint = new HamiltonianControlEndpoint((candidate) => candidate === validQuery.token)
    const {attempts, server} = upgradeServer(true)
    const url = controlUrl()
    const before = Date.now()

    expect(endpoint.upgrade(new Request(url), url, server)).toBeUndefined()

    const data = attempts[0]!.data
    expect(data.connectionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(data.openedAt).toBeGreaterThanOrEqual(before)
    expect(data.lastPongAt).toBeGreaterThanOrEqual(data.openedAt)
    expect(data).toEqual({
      connectionId: data.connectionId,
      connectionGeneration: 1,
      deviceId: validQuery.device,
      lifecycleTransportId: validQuery.transport,
      workerEntityId: validQuery.worker,
      openedAt: data.openedAt,
      lastPongAt: data.lastPongAt,
      lastChallengeSeq: 0,
      lastAckSeq: 0,
      nextHeartbeatTimer: null,
      heartbeatTimeoutTimer: null,
      workerIdentity: null,
      workerRuntimeIncarnation: null,
      workerCodeVersion: null,
      resumeNonce: null,
      identityConfirmed: false,
      workerUpdateRequired: false,
      retainAuthorityOnClose: false,
      reportedEmptyWindowInventory: false,
    })
  })

  test("preserves 426 and advances generation monotonically for valid upgrade attempts", async () => {
    const endpoint = new HamiltonianControlEndpoint((candidate) => candidate === validQuery.token)
    const rejected = upgradeServer(false)
    const accepted = upgradeServer(true)
    const firstUrl = controlUrl()
    const secondUrl = controlUrl({device: "browser-profile-b"})

    const response = endpoint.upgrade(new Request(firstUrl), firstUrl, rejected.server)
    expect(response?.status).toBe(426)
    expect(await response?.text()).toBe("WebSocket upgrade required")
    expect(rejected.attempts[0]!.data.connectionGeneration).toBe(1)
    expect(endpoint.currentConnectionGeneration).toBe(1)

    expect(endpoint.upgrade(new Request(secondUrl), secondUrl, accepted.server)).toBeUndefined()
    expect(accepted.attempts[0]!.data.connectionGeneration).toBe(2)
    expect(endpoint.currentConnectionGeneration).toBe(2)
  })
})
