import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {META_OBSERVATION_CONTRACT_VERSION} from "@metafor/types/metafor/observation"
import {DarkForceHistory} from "../force/history.ts"
import {DarkForceHistoryReadService} from "./history.ts"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
})

const service = (): {history: DarkForceHistory; service: DarkForceHistoryReadService} => {
  const root = mkdtempSync(join(tmpdir(), "metafor-history-rpc-"))
  roots.push(root)
  const history = new DarkForceHistory(join(root, "v1"), {
    cutId: "rpc-cut",
    startedAt: "2026-08-04T00:00:00.000Z",
  })
  for (let sequence = 1; sequence <= 3; sequence++) {
    history.accept({part: "gluon", op: "replace", path: sequence, by: "matrix", ts: sequence, value: {sequence}})
  }
  return {history, service: new DarkForceHistoryReadService(history)}
}

describe("Dark Force history RPC projection", () => {
  test("returns the exact current frontier without reading a second journal", () => {
    const {service: reader} = service()
    expect(reader.read({contractVersion: 1, query: {kind: "frontier"}})).toEqual({
      contractVersion: META_OBSERVATION_CONTRACT_VERSION,
      resolution: "exact",
      frontier: {cutId: "rpc-cut", throughSequence: 3, retroactiveComplete: false},
      range: null,
      entries: [],
    })
  })

  test("paginates one immutable accepted range and reports its causal boundary", () => {
    const {service: reader} = service()
    const first = reader.read({
      contractVersion: 1,
      query: {kind: "range", cutId: "rpc-cut", fromSequence: 1, limit: 2},
    })
    expect(first.frontier).toEqual({cutId: "rpc-cut", throughSequence: 3, retroactiveComplete: false})
    expect(first.entries.map((entry) => entry.sequence)).toEqual([1, 2])
    expect(first.range).toEqual({
      requestedFromSequence: 1,
      requestedToSequence: null,
      firstSequence: 1,
      lastSequence: 2,
      truncated: true,
      nextSequence: 3,
    })
    const second = reader.read({
      contractVersion: 1,
      query: {kind: "range", cutId: "rpc-cut", fromSequence: 3, limit: 2},
    })
    expect(second.entries.map((entry) => entry.sequence)).toEqual([3])
    expect(second.range).toMatchObject({truncated: false, nextSequence: null})
  })

  test("rejects a different cut and mutation-shaped request", () => {
    const {service: reader} = service()
    expect(() => reader.read({
      contractVersion: 1,
      query: {kind: "range", cutId: "other-cut", fromSequence: 1, limit: 1},
    })).toThrow("cut mismatch")
    expect(() => reader.read({contractVersion: 1, query: {kind: "frontier"}, clear: true}))
      .toThrow("invalid_request")
  })
})
