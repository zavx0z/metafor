import {describe, expect, test} from "bun:test"
import type {MatrixConditionValue} from "@matrix/types/condition"
import type {MatrixBraneValue, MatrixFieldRecord} from "@matrix/types/data"
import {CPUWeakRuntime} from "../cpu"
import {GPUWeakRuntime} from "../gpu"
import {
  createConditionFixture,
  createIsolatedStore,
  normalizeChanges,
  setBraneFieldValue,
} from "./shared/fixtures.ts"
import {createExecutableDevice, flushRuntime} from "./shared/gpu.ts"

type ConditionCase = {
  name: string
  field: MatrixFieldRecord
  value: MatrixBraneValue
  condition: MatrixConditionValue
  changes: Array<[number, number]>
}

const cases: ConditionCase[] = [
  {name: "number eq", field: {type: 0}, value: 42, condition: {eq: 42}, changes: [[0, 1]]},
  {name: "number neq", field: {type: 0}, value: 42, condition: {neq: 41}, changes: [[0, 1]]},
  {name: "negative number", field: {type: 0}, value: -10, condition: {lt: 0}, changes: [[0, 1]]},
  {name: "fractional number", field: {type: 0}, value: 3.5, condition: {gt: 3}, changes: [[0, 1]]},
  {name: "number gte", field: {type: 0}, value: 50, condition: {gte: 50}, changes: [[0, 1]]},
  {name: "number lte", field: {type: 0}, value: 50, condition: {lte: 50}, changes: [[0, 1]]},
  {name: "number in", field: {type: 0}, value: 3, condition: {in: [1, 3, 5]}, changes: [[0, 1]]},
  {name: "number not in", field: {type: 0}, value: 4, condition: {notIn: [1, 3, 5]}, changes: [[0, 1]]},
  {name: "F32 rounds value and operand identically", field: {type: 0}, value: 16_777_217, condition: {eq: 16_777_216}, changes: [[0, 1]]},
  {name: "U32 keeps precision above F32 range", field: {type: 1}, value: 4_000_000_001, condition: {gt: 4_000_000_000}, changes: [[0, 1]]},
  {name: "combined number range", field: {type: 0}, value: 36.8, condition: {gte: 36.6, lte: 37}, changes: [[0, 1]]},
  {name: "failed number condition", field: {type: 0}, value: 1, condition: {gt: 5}, changes: []},
  {name: "boolean true", field: {type: 2}, value: true, condition: true, changes: [[0, 1]]},
  {name: "boolean false", field: {type: 2}, value: false, condition: false, changes: [[0, 1]]},
  {name: "boolean neq", field: {type: 2}, value: false, condition: {neq: true}, changes: [[0, 1]]},
  {name: "string eq", field: {type: 3}, value: "hero", condition: {eq: "hero"}, changes: [[0, 1]]},
  {name: "string neq", field: {type: 3}, value: "mage", condition: {neq: "hero"}, changes: [[0, 1]]},
  {name: "unicode string in", field: {type: 3}, value: "привет", condition: {in: ["мир", "привет"]}, changes: [[0, 1]]},
  {name: "emoji string in", field: {type: 3}, value: "🚀", condition: {in: ["🧪", "🚀"]}, changes: [[0, 1]]},
  {name: "string not in", field: {type: 3}, value: "rogue", condition: {notIn: ["hero", "mage"]}, changes: [[0, 1]]},
  {name: "string starts with", field: {type: 3}, value: "привет", condition: {startsWith: "при"}, changes: [[0, 1]]},
  {name: "string ends with", field: {type: 3}, value: "привет", condition: {endsWith: "вет"}, changes: [[0, 1]]},
  {name: "string include", field: {type: 3}, value: "alpha-beta", condition: {include: "ha-b"}, changes: [[0, 1]]},
  {name: "string negative operators", field: {type: 3}, value: "alpha", condition: {notStartsWith: "beta", notEndsWith: "beta", notInclude: "beta"}, changes: [[0, 1]]},
  {name: "string length uses JavaScript UTF-16", field: {type: 3}, value: "🚀", condition: {length: 2}, changes: [[0, 1]]},
  {name: "string length range", field: {type: 3}, value: "hero", condition: {length: {min: 4, max: 4}}, changes: [[0, 1]]},
  {name: "string inclusive between", field: {type: 3}, value: "middle", condition: {between: ["alpha", "zulu"]}, changes: [[0, 1]]},
  {name: "string regular expression", field: {type: 3}, value: "Ready", condition: {pattern: {source: "^r", flags: "i"}}, changes: [[0, 1]]},
  {
    name: "enum eq",
    field: {type: 1, enum: ["WARRIOR", "MAGE", "ROGUE"]},
    value: "MAGE",
    condition: {eq: "MAGE"},
    changes: [[0, 1]],
  },
  {
    name: "enum not in",
    field: {type: 1, enum: ["WARRIOR", "MAGE", "ROGUE"]},
    value: "ROGUE",
    condition: {notIn: ["WARRIOR", "MAGE"]},
    changes: [[0, 1]],
  },
  {name: "array include", field: {type: 4, elementType: "number"}, value: [1, 5, 10], condition: {include: 5}, changes: [[0, 1]]},
  {name: "array not include", field: {type: 4, elementType: "number"}, value: [1, 5, 10], condition: {notInclude: 3}, changes: [[0, 1]]},
  {name: "empty array notIncludes", field: {type: 4, elementType: "number"}, value: [], condition: {notIncludes: 3}, changes: [[0, 1]]},
  {name: "array exact equality", field: {type: 4, elementType: "number"}, value: [1, 2], condition: [1, 2], changes: [[0, 1]]},
  {name: "array every", field: {type: 4, elementType: "number"}, value: [1, 2, 3], condition: {every: {gte: 1}}, changes: [[0, 1]]},
  {name: "array some", field: {type: 4, elementType: "number"}, value: [1, 2, 3], condition: {some: {gt: 2}}, changes: [[0, 1]]},
  {name: "empty array every is true", field: {type: 4, elementType: "number"}, value: [], condition: {every: {gt: 2}}, changes: [[0, 1]]},
  {name: "empty array some is false", field: {type: 4, elementType: "number"}, value: [], condition: {some: {gt: 2}}, changes: []},
  {name: "array length", field: {type: 4, elementType: "number"}, value: [1, 2, 3], condition: {length: 3}, changes: [[0, 1]]},
  {name: "array length range", field: {type: 4, elementType: "number"}, value: [1, 2, 3], condition: {length: {gt: 2, lte: 3}}, changes: [[0, 1]]},
  {name: "empty array", field: {type: 4, elementType: "number"}, value: [], condition: {isEmpty: true}, changes: [[0, 1]]},
  {name: "non-empty array", field: {type: 4, elementType: "number"}, value: [1], condition: {isEmpty: false}, changes: [[0, 1]]},
  {
    name: "string array include and length",
    field: {type: 4, elementType: "string"},
    value: ["warrior", "hero"],
    condition: {include: "hero", length: 2},
    changes: [[0, 1]],
  },
  {name: "null is absent", field: {type: 0}, value: null, condition: {null: true}, changes: [[0, 1]]},
  {name: "zero is present", field: {type: 0}, value: 0, condition: {null: false, eq: 0}, changes: [[0, 1]]},
  {name: "false is present", field: {type: 2}, value: false, condition: {null: false, eq: false}, changes: [[0, 1]]},
  {name: "empty string is present", field: {type: 3}, value: "", condition: {null: false, eq: ""}, changes: [[0, 1]]},
  {name: "first enum value is present", field: {type: 1, enum: ["FIRST", "SECOND"]}, value: "FIRST", condition: {null: false, eq: "FIRST"}, changes: [[0, 1]]},
  {name: "empty array is present", field: {type: 4, elementType: "number"}, value: [], condition: {null: false, isEmpty: true}, changes: [[0, 1]]},
  {name: "absent array is not an empty array", field: {type: 4, elementType: "number"}, value: null, condition: {notIncludes: 3}, changes: []},
]

describe("CPU/WebGPU parity — all condition kinds", () => {
  for (const item of cases) {
    test(item.name, async () => {
      const fixture = createConditionFixture(item.field, item.value, item.condition)
      const cpuStore = createIsolatedStore(fixture)
      const gpuStore = createIsolatedStore(fixture)
      const cpu = new CPUWeakRuntime(cpuStore)
      const gpu = await GPUWeakRuntime.create(await createExecutableDevice(), gpuStore)

      try {
        cpu.step()
        gpu.step()
        const cpuChanges = normalizeChanges(await cpu.readChanges())
        const gpuChanges = normalizeChanges(await gpu.readChanges())
        expect(gpuChanges).toEqual(cpuChanges)
        expect(cpuChanges).toEqual(item.changes)
      } finally {
        cpu.clear()
        gpu.clear()
        await flushRuntime(gpu as unknown as {pending?: Promise<unknown>})
      }
    })
  }

  test("unknown enum value is rejected while preparing a fixture", () => {
    expect(() => createConditionFixture(
      {type: 1, enum: ["WARRIOR", "MAGE"]},
      "UNKNOWN",
      {eq: "MAGE"},
    )).toThrow("not in enum")
  })

  test("enum ordering is rejected because public enum conditions are set-based", () => {
    expect(() => createConditionFixture(
      {type: 1, enum: ["WARRIOR", "MAGE"]},
      "MAGE",
      {gt: "WARRIOR"},
    )).toThrow("not valid for Field type")
  })

  test("invalid F32 and U32 values are rejected before execution", () => {
    expect(() => createConditionFixture({type: 0}, Number.NaN, {eq: 0}))
      .toThrow("finite F32")
    expect(() => createConditionFixture({type: 0}, Number.POSITIVE_INFINITY, {eq: 0}))
      .toThrow("finite F32")
    expect(() => createConditionFixture({type: 1}, -1, {eq: 0}))
      .toThrow("U32 range")
    expect(() => createConditionFixture({type: 1}, 1.5, {eq: 1}))
      .toThrow("U32 range")
    expect(() => createConditionFixture({type: 1}, 0x1_0000_0000, {eq: 0}))
      .toThrow("U32 range")
  })

  test("unknown enum update is rejected", () => {
    const fixture = createConditionFixture(
      {type: 1, enum: ["WARRIOR", "MAGE"]},
      "WARRIOR",
      {eq: "MAGE"},
    )
    expect(() => setBraneFieldValue(fixture.store, 0, 0, "UNKNOWN")).toThrow("not found in enum")
  })

  test("WebGPU recomputes a regular expression after a Field update", async () => {
    const fixture = createConditionFixture(
      {type: 3},
      "not-ready",
      {pattern: {source: "^ready$", flags: "i"}},
    )
    const cpuStore = createIsolatedStore(fixture)
    const gpuStore = createIsolatedStore(fixture)
    const cpu = new CPUWeakRuntime(cpuStore)
    const gpu = await GPUWeakRuntime.create(await createExecutableDevice(), gpuStore)

    try {
      setBraneFieldValue(cpuStore, 0, 0, "READY")
      setBraneFieldValue(gpuStore, 0, 0, "READY")
      cpu.heapUpdate([{kind: "field", braneIndex: 0, fieldIndex: 0}])
      gpu.heapUpdate([{kind: "field", braneIndex: 0, fieldIndex: 0}])
      cpu.step()
      gpu.step()
      expect(normalizeChanges(await gpu.readChanges()))
        .toEqual(normalizeChanges(await cpu.readChanges()))
      expect(cpu.statesSnapshot()).toEqual([1])
    } finally {
      cpu.clear()
      gpu.clear()
      await flushRuntime(gpu as unknown as {pending?: Promise<unknown>})
    }
  })
})
