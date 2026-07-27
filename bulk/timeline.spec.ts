import {describe, expect, test} from "bun:test"
import {
  adaptBulkTimelineProjection,
  createBulkTimelineFixtureProjection,
} from "./timeline.ts"

describe("Bulk timeline read-only adapter", () => {
  test("maps the small fixture projection without inventing live history", () => {
    const document = adaptBulkTimelineProjection(createBulkTimelineFixtureProjection())
    expect(document.title).toContain("read-only fixture")
    expect(document.tracks.map((track) => track.id)).toEqual(["force", "mass", "boundary"])
    expect(document.tracks.find((track) => track.id === "mass")?.intervals).toEqual([
      {fromTick: 3, toTick: 7, resolution: "coarse"},
    ])
    expect(document.tracks.find((track) => track.id === "boundary")?.markers.at(-1)).toEqual({
      tick: 8,
      resolution: "exact",
      selected: true,
    })
  })
})
