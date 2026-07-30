import {describe, expect, test} from "bun:test"
import {
  META_JSON_V1_SCHEMA,
  parseMetaAddress,
  type MetaJSONV1,
} from "@metafor/types/metafor/meta-json"
import type {CheckpointJsonValue} from "@metafor/types/dark/checkpoint"
import {
  applyMetaJSONPatchV1,
  canonicalizeMetaJSONV1,
  CheckpointProjectionError,
  diffMetaJSONV1,
} from "./projection.ts"

const ROOT = parseMetaAddress("example/root")!

const projection = (name = "Root", values: number[] = [1, 2]): MetaJSONV1 => ({
  schema: META_JSON_V1_SCHEMA,
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

describe("checkpoint canonical MetaJSON projection", () => {
  test("uses deterministic RFC 8785-style bytes without locale order or trailing newline", () => {
    const input = projection()
    const first = canonicalizeMetaJSONV1(input)
    const second = canonicalizeMetaJSONV1(JSON.parse(JSON.stringify(input)))

    expect(first.sha256).toBe(second.sha256)
    expect(first.bytes.at(-1)).not.toBe(10)
    expect(new TextDecoder().decode(first.bytes)).toStartWith('{"root":"example/root","runtime"')
  })

  test("derives only deterministic forward add/remove/replace and round-trips", () => {
    const base = projection("Root", [1, 2])
    const result = projection("Renamed", [2, 3])
    const operations = diffMetaJSONV1(base, result)

    expect(operations).toEqual([
      {
        op: "replace",
        path: "/runtime/roots",
        value: structuredClone(result.runtime.roots) as unknown as CheckpointJsonValue,
      },
      {op: "replace", path: "/template/example~1root/name", value: "Renamed"},
    ])
    expect(applyMetaJSONPatchV1(base, operations)).toEqual(result)
  })

  test("rejects non-I-JSON strings before hashing", () => {
    const input = projection()
    input.template[ROOT]!.name = "\ud800"
    expect(() => canonicalizeMetaJSONV1(input)).toThrow(CheckpointProjectionError)
  })
})
