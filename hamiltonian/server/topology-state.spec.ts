import {describe, expect, test} from "bun:test"
import {HostTopology} from "./topology-state.ts"

describe("Hamiltonian host topology", () => {
  test("keeps exactly one stable leader until that Window disappears", () => {
    const topology = new HostTopology("host-epoch-a")
    topology.connect("connection-a", "device-a")
    topology.updateWindows("connection-a", [
      {tabId: "tab-a", joinedAt: 10, visible: true},
      {tabId: "tab-b", joinedAt: 20, visible: true},
    ])
    topology.connect("connection-b", "device-b")
    topology.updateWindows("connection-b", [
      {tabId: "tab-c", joinedAt: 5, visible: true},
    ])

    const first = topology.snapshot().leader
    expect(first).toMatchObject({
      hostEpoch: "host-epoch-a",
      deviceId: "device-a",
      tabId: "tab-a",
      fencingToken: 1,
    })

    topology.updateWindows("connection-a", [
      {tabId: "tab-a", joinedAt: 10, visible: false},
      {tabId: "tab-b", joinedAt: 20, visible: true},
    ])
    expect(topology.snapshot().leader).toMatchObject({
      deviceId: "device-a",
      tabId: "tab-a",
      fencingToken: first?.fencingToken,
      leaseId: first?.leaseId,
    })

    topology.updateWindows("connection-a", [
      {tabId: "tab-b", joinedAt: 20, visible: true},
    ])
    const second = topology.snapshot().leader
    expect(second).toMatchObject({deviceId: "device-a", tabId: "tab-b", fencingToken: 2})
    expect(second?.leaseId).not.toBe(first?.leaseId)

    topology.disconnect("connection-a")
    const third = topology.snapshot().leader
    expect(third).toMatchObject({deviceId: "device-b", tabId: "tab-c", fencingToken: 3})
    expect(third?.leaseId).not.toBe(second?.leaseId)
  })

  test("has no leader without a Window candidate", () => {
    const topology = new HostTopology("host-epoch-a")
    topology.connect("connection-a", "device-a")
    expect(topology.snapshot().leader).toBeNull()
  })

  test("does not reuse an authority identity after a host restart", () => {
    const first = new HostTopology("host-epoch-a")
    first.connect("connection-a", "device-a")
    first.updateWindows("connection-a", [{tabId: "tab-a", joinedAt: 10, visible: true}])

    const restarted = new HostTopology("host-epoch-b")
    restarted.connect("connection-a", "device-a")
    restarted.updateWindows("connection-a", [{tabId: "tab-a", joinedAt: 10, visible: true}])

    expect(first.snapshot().leader?.fencingToken).toBe(1)
    expect(restarted.snapshot().leader?.fencingToken).toBe(1)
    expect(restarted.snapshot().leader?.leaseId).not.toBe(first.snapshot().leader?.leaseId)
  })

  test("rebinds a detached leader to a new control connection without changing authority", () => {
    const topology = new HostTopology("host-epoch-a")
    topology.connect("connection-old", "device-a")
    topology.updateWindows("connection-old", [
      {tabId: "tab-a", joinedAt: 10, visible: true},
      {tabId: "tab-b", joinedAt: 20, visible: true},
    ])
    const before = topology.snapshot().leader
    if (!before) throw new Error("Missing initial leader")

    topology.connect("connection-new", "device-a")
    expect(topology.rebindLeaderConnection("connection-old", "connection-new", [
      {tabId: "tab-a", joinedAt: 10, visible: true},
      {tabId: "tab-b", joinedAt: 20, visible: true},
    ])).toBeTrue()

    expect(topology.snapshot().leader).toEqual({
      ...before,
      connectionId: "connection-new",
    })
    expect(topology.snapshot().peers.map((peer) => peer.connectionId)).toEqual(["connection-new"])
  })
})
