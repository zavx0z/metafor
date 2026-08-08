import {describe, expect, test} from "bun:test"
import type {PositionedNodeSystem} from "@ui/node"
import {
  nodeSystemStructureKey,
  projectHamiltonianTopology,
  refreshPositionedNodeSystem,
} from "./projection.ts"

const context = {origin: "https://hamiltonian.local", deviceId: "device-1", tabId: "tab-1"}

function observation(forceEvents = 2) {
  return {
    worker: {incarnationId: "sw-1", socket: "connected", connectionId: "connection-1"},
    host: {
      identity: "Hamiltonian",
      hostEpoch: "host-1",
      version: "v1",
      placement: "browser",
      bunEmbodiments: {
        "main-probe": {state: "ready", pid: 42, incarnation: "bun-1"},
      },
      peer: {
        assignment: {peerId: "peer-1", sessionEpoch: "session-1", peerGeneration: 1},
        snapshot: {state: "connected", channels: ["oracle", "force"], forceEvents},
        error: null,
      },
    },
    topology: {
      revision: 3,
      leader: {
        connectionId: "connection-1",
        deviceId: "device-1",
        tabId: "tab-1",
        fencingToken: 2,
      },
      peers: [{
        connectionId: "connection-1",
        deviceId: "device-1",
        windows: [{tabId: "tab-1", joinedAt: 10, visible: true}],
      }],
    },
  }
}

describe("Hamiltonian node projection", () => {
  test("shows physical control, browser-local UI broadcast and direct Oracle/Force lanes separately", () => {
    const document = projectHamiltonianTopology(observation(), context, 1)
    expect(document.edges.map((edge) => edge.label)).toContain("control WSS")
    expect(document.edges.map((edge) => edge.label)).toContain("BroadcastChannel · UI projection")
    expect(document.edges.map((edge) => edge.label)).toContain("Oracle · direct RPC")
    expect(document.edges.map((edge) => edge.label)).toContain("Force · direct events")
    const current = document.nodes.find((node) => node.title === "This Window")
    expect(current?.actions?.map((action) => action.id)).toEqual([
      "open-window",
      "rebirth-worker",
      "reload-main",
      "reconnect",
      "reload",
    ])
  })

  test("telemetry changes preserve the structural key", () => {
    const first = projectHamiltonianTopology(observation(2), context, 1)
    const second = projectHamiltonianTopology(observation(8), context, 2)
    expect(nodeSystemStructureKey(second)).toBe(nodeSystemStructureKey(first))
  })

  test("refreshes facts without changing ELK geometry", () => {
    const first = projectHamiltonianTopology(observation(2), context, 1)
    const second = projectHamiltonianTopology(observation(8), context, 2)
    const layout: PositionedNodeSystem = {
      revision: 1,
      bounds: {x: 0, y: 0, w: 100, h: 100},
      nodes: first.nodes.map((node, index) => ({
        node,
        rect: {x: index * 10, y: 0, w: 8, h: 8},
        ports: (node.ports ?? []).map((port) => ({port, center: {x: index * 10, y: 4}})),
      })),
      edges: first.edges.map((edge) => ({edge, points: [{x: 0, y: 0}, {x: 1, y: 1}]})),
    }
    const refreshed = refreshPositionedNodeSystem(layout, second)
    expect(refreshed.revision).toBe(2)
    expect(refreshed.nodes.map((node) => node.rect)).toEqual(layout.nodes.map((node) => node.rect))
    expect(refreshed.edges.map((edge) => edge.points)).toEqual(layout.edges.map((edge) => edge.points))
  })
})
