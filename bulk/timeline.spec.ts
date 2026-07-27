import {describe, expect, test} from "bun:test"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import {buildBulkTimeline} from "./timeline.ts"

const projection = (): BulkRuntimeProjection => ({
  atoms: [
    {id: 1, wimp: "zavx0z/inference", parentAtom: null, parentTopology: null, position: 0},
    {id: 2, wimp: "zavx0z/lada", parentAtom: 1, parentTopology: null, position: 0},
    {id: 3, wimp: "zavx0z/lada-auth", parentAtom: 2, parentTopology: null, position: 0},
    {id: 4, wimp: "zavx0z/lada-chat", parentAtom: 2, parentTopology: null, position: 1},
    {id: 5, wimp: "zavx0z/other", parentAtom: null, parentTopology: null, position: 1},
  ],
  topologies: [],
  wimps: [
    {src: "zavx0z/inference", name: "Inference"},
    {src: "zavx0z/lada", name: "Лада"},
    {src: "zavx0z/lada-auth", name: "Авторизация"},
    {src: "zavx0z/lada-chat", name: "Чат"},
    {src: "zavx0z/other", name: "Other"},
  ],
  fields: [],
  states: [{id: 21, wimp: "zavx0z/lada", name: "работа", position: 0}],
  transitions: [],
  conditions: [],
  processes: [],
  reactions: [],
  atomStates: [{atom: 2, state: 21}],
  fieldEnumVariants: [],
  atomValues: [],
  values: [],
  valueItems: [],
  matterParticles: [],
  matterTopologyBindingPaths: [],
  matterChildWimpBindingPaths: [],
})

describe("Bulk timeline observer-cut adapter", () => {
  test("maps only the real Inference Atom tree at the shared causal cut", () => {
    const document = buildBulkTimeline(projection(), "zavx0z/inference", 42)

    expect(document.title).toContain("Inference")
    expect(document.playheadTick).toBe(42)
    expect(document.tracks.map((track) => track.id)).toEqual(["atom:1", "atom:2", "atom:3", "atom:4"])
    expect(document.tracks.map((track) => track.label)).toEqual(["Inference", "Лада", "Авторизация", "Чат"])
    expect(document.tracks[1]?.markers).toEqual([{
      tick: 42,
      resolution: "exact",
      selected: true,
      label: "работа",
    }])
  })

  test("marks a cold initial projection as untimestamped instead of inventing history", () => {
    const document = buildBulkTimeline(projection(), "zavx0z/inference", null)
    expect(document.playheadTick).toBe(0)
    expect(document.tracks.every((track) => track.markers[0]?.resolution === "unknown")).toBe(true)
  })

  test("rejects a requested root that is absent from the projection", () => {
    expect(() => buildBulkTimeline(projection(), "zavx0z/missing", null))
      .toThrow("root is not materialized")
  })
})
