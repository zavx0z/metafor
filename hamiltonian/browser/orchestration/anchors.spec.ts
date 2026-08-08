import {describe, expect, test} from "bun:test"
import {
  parseHamiltonianNodeAnchors,
  serializeHamiltonianNodeAnchors,
  withHamiltonianNodeAnchor,
  withHamiltonianNodeGeometry,
} from "./anchors.ts"

describe("Hamiltonian node anchors", () => {
  test("round-trips exact graph coordinates in last-used order", () => {
    let anchors = new Map([["host", {x: 12.5, y: -4}]])
    anchors = withHamiltonianNodeAnchor(anchors, "window:1", {x: 80, y: 140})
    anchors = withHamiltonianNodeAnchor(anchors, "host", {x: 24, y: 32})

    expect([...parseHamiltonianNodeAnchors(serializeHamiltonianNodeAnchors(anchors))]).toEqual([
      ["window:1", {x: 80, y: 140}],
      ["host", {x: 24, y: 32}],
    ])
  })

  test("treats corrupt storage as absent and rejects non-finite entries", () => {
    expect(parseHamiltonianNodeAnchors("not json").size).toBe(0)
    expect(parseHamiltonianNodeAnchors(JSON.stringify({
      kind: "hamiltonian.node-anchors.v1",
      anchors: [
        {nodeId: "good", x: 1, y: 2},
        {nodeId: "bad-x", x: "1", y: 2},
        {nodeId: "bad-y", x: 1, y: null},
      ],
    }))).toEqual(new Map([["good", {x: 1, y: 2}]]))
  })

  test("evicts the oldest presentation anchor at the configured bound", () => {
    let anchors = new Map<string, {x: number; y: number}>()
    anchors = withHamiltonianNodeAnchor(anchors, "a", {x: 1, y: 1}, 2)
    anchors = withHamiltonianNodeAnchor(anchors, "b", {x: 2, y: 2}, 2)
    anchors = withHamiltonianNodeAnchor(anchors, "c", {x: 3, y: 3}, 2)
    expect([...anchors.keys()]).toEqual(["b", "c"])
  })

  test("round-trips width and preserves it when the card is moved afterwards", () => {
    let anchors = withHamiltonianNodeGeometry(new Map(), "host", {x: 20, y: 30, width: 340})
    anchors = withHamiltonianNodeAnchor(anchors, "host", {x: 80, y: 90})
    expect(parseHamiltonianNodeAnchors(serializeHamiltonianNodeAnchors(anchors))).toEqual(new Map([
      ["host", {x: 80, y: 90, width: 340}],
    ]))
  })
})
