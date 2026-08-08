import {describe, expect, test} from "bun:test"
import {
  createOrchestrationEnvelope,
  createOrchestrationProjection,
  hamiltonianWindowNodeId,
  hasForbiddenOrchestrationData,
  isOrchestrationEnvelope,
  OrchestrationEnvelopeCursor,
  parseLocalHamiltonianWindowAction,
} from "./orchestration.js"

function projection() {
  return createOrchestrationProjection(
    {workerIncarnationId: "sw-1", socket: "connected", connectionId: "connection-1"},
    {
      identity: "hamiltonian-lab",
      hostEpoch: "host-1",
      version: "v1",
      placement: "browser",
      serverAuthority: {leaseId: "must-not-leak", authorityKey: "must-not-leak"},
      bunEmbodiments: {
        "main-probe": {runtime: "bun-process", state: "ready", incarnation: "bun-1", pid: 42},
      },
      peer: {
        assignment: {
          peerId: "peer-1",
          sessionEpoch: "session-1",
          peerGeneration: 1,
          connectionId: "connection-1",
          tabId: "tab-1",
          authorityKey: "must-not-leak",
        },
        snapshot: {
          peerId: "peer-1",
          sessionEpoch: "session-1",
          state: "connected",
          channels: ["oracle", "force", "unknown"],
          oracleRequests: 3,
          forceEvents: 2,
        },
      },
    },
    {
      revision: 4,
      leaseDurationMs: 6_000,
      leader: {
        hostEpoch: "host-1",
        connectionId: "connection-1",
        deviceId: "device-1",
        tabId: "tab-1",
        joinedAt: 10,
        fencingToken: 2,
        leaseId: "must-not-leak",
        leaseExpiresAt: 1_000,
      },
      peers: [{
        connectionId: "connection-1",
        deviceId: "device-1",
        windows: [{tabId: "tab-1", joinedAt: 10, visible: true}],
      }],
    },
    "topology",
  )
}

describe("Hamiltonian orchestration projection", () => {
  test("copies only observable fields and keeps logical lane labels without payload", () => {
    const value = projection()
    expect(value.host?.peer.snapshot?.channels).toEqual(["oracle", "force"])
    expect(value.host?.peer.assignment && "authorityKey" in value.host.peer.assignment).toBeFalse()
    expect(value.topology?.leader && "leaseId" in value.topology.leader).toBeFalse()
    expect(hasForbiddenOrchestrationData(value)).toBeFalse()
  })

  test("rejects authority, signaling and causal payload keys recursively", () => {
    for (const unsafe of [
      {token: "secret"},
      {nested: {resumeNonce: "secret"}},
      {signal: {sdp: "offer"}},
      {payload: [{particle: {id: 1}}]},
      {rpc: {method: "probe"}},
    ]) {
      expect(hasForbiddenOrchestrationData(unsafe)).toBeTrue()
      expect(isOrchestrationEnvelope({
        kind: "hamiltonian-orchestration",
        version: 1,
        source: "service-worker",
        sourceId: "sw-1",
        revision: 1,
        at: 1,
        projection: unsafe,
      })).toBeFalse()
    }
  })

  test("accepts only increasing revisions and retires the previous Worker incarnation", () => {
    const cursor = new OrchestrationEnvelopeCursor()
    const envelope = (sourceId: string, revision: number) => createOrchestrationEnvelope({
      sourceId,
      revision,
      projection: projection(),
      at: revision,
    })
    expect(cursor.accept(envelope("sw-1", 1))).not.toBeNull()
    expect(cursor.accept(envelope("sw-1", 1))).toBeNull()
    expect(cursor.accept({...envelope("sw-1", 2), revision: 0})).toBeNull()
    expect(cursor.accept(envelope("sw-1", 2))).not.toBeNull()
    expect(cursor.accept(envelope("sw-2", 1))).not.toBeNull()
    expect(cursor.accept(envelope("sw-1", 3))).toBeNull()
    expect(cursor.snapshot()).toEqual({sourceId: "sw-2", revision: 1})
  })

  test("accepts only an allowlisted action addressed to the exact local Window", () => {
    const nodeId = hamiltonianWindowNodeId("device/1", "tab 1")
    expect(nodeId).toBe("window:device%2F1:tab%201")
    expect(parseLocalHamiltonianWindowAction({nodeId, actionId: "reconnect"}, "device/1", "tab 1"))
      .toEqual({nodeId, actionId: "reconnect"})
    expect(parseLocalHamiltonianWindowAction({nodeId: "window:other:tab%201", actionId: "reconnect"}, "device/1", "tab 1"))
      .toBeNull()
    expect(parseLocalHamiltonianWindowAction({nodeId, actionId: "invented-action"}, "device/1", "tab 1"))
      .toBeNull()
    expect(parseLocalHamiltonianWindowAction({nodeId}, "device/1", "tab 1")).toBeNull()
    expect(parseLocalHamiltonianWindowAction(null, "device/1", "tab 1")).toBeNull()
  })
})
