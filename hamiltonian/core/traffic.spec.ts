import {describe, expect, test} from "bun:test"
import {
  HAMILTONIAN_FORCE_EDGE_ID,
  HAMILTONIAN_ORACLE_EDGE_ID,
  HAMILTONIAN_PEER_SUPERVISION_EDGE_ID,
  HamiltonianTrafficEnvelopeCursor,
  HamiltonianTrafficSource,
  createHamiltonianTrafficEnvelope,
  hamiltonianBroadcastEdgeId,
  hamiltonianControlWssEdgeId,
  hamiltonianIpcEdgeId,
  hamiltonianMessagePortEdgeId,
  isHamiltonianTrafficEnvelope,
} from "./traffic.js"

describe("Hamiltonian traffic observation", () => {
  test("creates a payload-free monotonic envelope and rejects duplicates", () => {
    const source = new HamiltonianTrafficSource("window-a")
    const first = source.next({edgeId: "oracle-lane", direction: "forward", messageClass: "rpc.request", at: 10})
    const second = source.next({edgeId: "oracle-lane", direction: "reverse", messageClass: "rpc.response", at: 11})
    expect(first).toEqual({
      kind: "hamiltonian-edge-traffic",
      version: 1,
      sourceId: "window-a",
      sequence: 1,
      at: 10,
      edgeId: "oracle-lane",
      direction: "forward",
      messageClass: "rpc.request",
    })
    expect(second.sequence).toBe(2)
    expect(JSON.stringify(second)).not.toContain("payload")

    const cursor = new HamiltonianTrafficEnvelopeCursor()
    expect(cursor.accept(first)).toBe(first)
    expect(cursor.accept(first)).toBeNull()
    expect(cursor.accept(second)).toBe(second)
  })

  test("rejects unknown fields so payload cannot enter the visual channel", () => {
    const safe = createHamiltonianTrafficEnvelope({
      sourceId: "host-a",
      sequence: 1,
      at: 12,
      edgeId: "control-wss:c",
      direction: "forward",
      messageClass: "topology",
    })
    expect(isHamiltonianTrafficEnvelope(safe)).toBeTrue()
    expect(isHamiltonianTrafficEnvelope({...safe, payload: {secret: true}})).toBeFalse()
    expect(isHamiltonianTrafficEnvelope({...safe, messageClass: "rpc request"})).toBeFalse()
  })

  test("shares exact edge identifiers with the topology projection", () => {
    expect(hamiltonianControlWssEdgeId("connection/a")).toBe("control-wss:connection%2Fa")
    expect(hamiltonianMessagePortEdgeId("c", "tab/1")).toBe("message-port:c:tab%2F1")
    expect(hamiltonianBroadcastEdgeId("c", "tab/1")).toBe("broadcast:c:tab%2F1")
    expect(hamiltonianIpcEdgeId("main/probe")).toBe("ipc:main%2Fprobe")
    expect(HAMILTONIAN_PEER_SUPERVISION_EDGE_ID).toBe("peer-supervision")
    expect(HAMILTONIAN_ORACLE_EDGE_ID).toBe("oracle-lane")
    expect(HAMILTONIAN_FORCE_EDGE_ID).toBe("force-lane")
  })
})
