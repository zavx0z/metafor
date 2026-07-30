import {describe, expect, test} from "bun:test"
import type {MatrixConditionValue} from "@metafor/types/matrix/condition"
import type {MatrixBraneValue, MatrixFieldRecord} from "@metafor/types/matrix/data"
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
  {
    name: "enum eq",
    field: {type: 1, enum: ["WARRIOR", "MAGE", "ROGUE"]},
    value: "MAGE",
    condition: {eq: "MAGE"},
    changes: [[0, 1]],
  },
  {
    name: "enum ordering",
    field: {type: 1, enum: ["WARRIOR", "MAGE", "ROGUE"]},
    value: "MAGE",
    condition: {gt: "WARRIOR"},
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

  test("unknown enum update is rejected", () => {
    const fixture = createConditionFixture(
      {type: 1, enum: ["WARRIOR", "MAGE"]},
      "WARRIOR",
      {eq: "MAGE"},
    )
    expect(() => setBraneFieldValue(fixture.store, 0, 0, "UNKNOWN")).toThrow("not found in enum")
  })
})
