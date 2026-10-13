import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {META_OBSERVATION_CONTRACT_VERSION} from "shared/protocol/metafor/observation"
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

test("exact origin lookup stays Photon-only and bounded to one Atom/cut with honest truncation", () => {
  const {history, service: reader} = service()
  history.accept({part: "photon", op: "replace", path: 1, by: "matrix", from: "event-1", ts: 10, value: "ready"})
  history.accept({part: "photon", op: "copy", path: 1, by: "boundary", from: "event-1", ts: 10, value: {kind: "state-commit"}})
  history.accept({part: "photon", op: "copy", path: 2, by: "boundary", from: "event-1", ts: 10, value: "another Atom"})
  history.accept({part: "gluon", op: "replace", path: 1, by: "boundary", from: "event-1", ts: 10, value: "ordinary data"})
  const query = {kind: "origin", cutId: "rpc-cut", from: "event-1", path: 1, limit: 1}
  const first = reader.read({contractVersion: 1, query})
  expect(first.entries.map(entry => entry.sequence)).toEqual([4])
  expect(first.range).toMatchObject({truncated: true, nextSequence: 5})
  const second = reader.read({contractVersion: 1, query: {...query, fromSequence: 5}})
  expect(second.entries.map(entry => entry.sequence)).toEqual([5])
  expect(second.range?.truncated).toBeFalse()
  for (const invalid of [{...query, by: "matrix"}, {...query, limit: 17}, {...query, cutId: "foreign"}, {...query, path: 0}, {...query, from: ""}, {...query, part: "gluon"}]) {
    expect(() => reader.read({contractVersion: 1, query: invalid})).toThrow()
  }
})
