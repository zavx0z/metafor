/**
 * Тесты для CPU runtime матрицы.
 */
import { describe, expect, test } from "bun:test"
import { CPUMatrixRuntime } from "../../matrix/cpu"
import {
  createSimpleBraneFixture,
  createMultipleBranesFixture,
  createLockedBraneFixture,
  createFieldUpdateFixture,
  createIsolatedStore,
  setBraneFieldValue,
} from "./shared/fixtures"

describe("CPU runtime — specific tests", () => {
  test("statesSnapshot returns canonical state array", () => {
    const fixture = createSimpleBraneFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(store)

    const snapshot = runtime.statesSnapshot()
    expect(Array.isArray(snapshot)).toBe(true)
    expect(snapshot).toEqual([0])
  })

  test("heapUpdate is no-op (uses canonical store directly)", () => {
    const fixture = createSimpleBraneFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(store)

    expect(() => runtime.heapUpdate([{ offset: 0, value1: 100 }])).not.toThrow()
  })

  test("clear resets state", () => {
    const fixture = createSimpleBraneFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(store)

    runtime.step()
    runtime.clear()

    expect(runtime.statesSnapshot()).toEqual([])
  })
})

describe("CPU runtime — scenario tests", () => {
  test("simpleTransition — 1 brane hp > 50", async () => {
    const runtime = new CPUMatrixRuntime(createIsolatedStore(createSimpleBraneFixture()))

    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([0, 1])
  })

  test("multipleBranes — 3 branes different conditions", async () => {
    const runtime = new CPUMatrixRuntime(createIsolatedStore(createMultipleBranesFixture()))

    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(2)
    expect(changes).toContainEqual([0, 1])
    expect(changes).toContainEqual([2, 1])
  })

  test("lockFlag — locked brane does not transition", async () => {
    const runtime = new CPUMatrixRuntime(createIsolatedStore(createLockedBraneFixture()))

    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(0)
  })

  test("fieldUpdate — update canonical field value and verify transition", async () => {
    const store = createIsolatedStore(createFieldUpdateFixture())
    const runtime = new CPUMatrixRuntime(store)

    runtime.step()
    let changes = await runtime.readChanges()
    expect(changes).toHaveLength(0)

    setBraneFieldValue(store, 0, 0, 100)
    runtime.heapUpdate([])
    runtime.step()
    changes = await runtime.readChanges()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([0, 1])
  })

  test("dirtyFlagsAccuracy — only changed branes reported", async () => {
    const runtime = new CPUMatrixRuntime(createIsolatedStore(createMultipleBranesFixture()))

    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(2)
    const indices = changes.map((change) => change[0])
    expect(indices).toContain(0)
    expect(indices).toContain(2)
    expect(indices).not.toContain(1)
  })

  test("determinism — multiple steps produce consistent results", async () => {
    const runtime = new CPUMatrixRuntime(createIsolatedStore(createSimpleBraneFixture()))

    runtime.step()
    const changes1 = await runtime.readChanges()

    runtime.step()
    const changes2 = await runtime.readChanges()

    expect(changes1).toHaveLength(1)
    expect(changes2).toHaveLength(0)
  })
})
