import {describe, expect, test} from "bun:test"
import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import type {CheckpointJsonValue} from "@dark/types/checkpoint"
import {
  applyGraphPatch,
  canonicalizeGraph,
  CheckpointProjectionError,
  diffGraph,
} from "./projection.ts"

const ROOT = parseMetaAddress("example/root")!

const projection = (name = "Root", values: number[] = [1, 2]): Graph => ({
  schema: GRAPH_SCHEMA,
  root: ROOT,
  template: {
    [ROOT]: {
      name,
      fields: [{key: "items", type: "array", required: true, default: []}],
      superposition: [{name: "idle", transitions: null}],
      mass: [],
      processes: [],
    },
  },
  runtime: {
    roots: [{
      kind: "atom",
      declaration: "#/template/example~1root",
      meta: ROOT,
      state: "idle",
      values: {items: values},
      children: [],
    }],
  },
})

describe("checkpoint canonical Graph projection", () => {
  test("uses deterministic RFC 8785-style bytes without locale order or trailing newline", () => {
    const input = projection()
    const first = canonicalizeGraph(input)
    const second = canonicalizeGraph(JSON.parse(JSON.stringify(input)))

    expect(first.sha256).toBe(second.sha256)
    expect(first.bytes.at(-1)).not.toBe(10)
    expect(new TextDecoder().decode(first.bytes)).toStartWith('{"root":"example/root","runtime"')
  })

  test("derives only deterministic forward add/remove/replace and round-trips", () => {
    const base = projection("Root", [1, 2])
    const result = projection("Renamed", [2, 3])
    const operations = diffGraph(base, result)

    expect(operations).toEqual([
      {
        op: "replace",
        path: "/runtime/roots",
        value: structuredClone(result.runtime.roots) as unknown as CheckpointJsonValue,
      },
      {op: "replace", path: "/template/example~1root/name", value: "Renamed"},
    ])
    expect(applyGraphPatch(base, operations)).toEqual(result)
  })

  test("rejects non-I-JSON strings before hashing", () => {
    const input = projection()
    input.template[ROOT]!.name = "\ud800"
    expect(() => canonicalizeGraph(input)).toThrow(CheckpointProjectionError)
  })
})
