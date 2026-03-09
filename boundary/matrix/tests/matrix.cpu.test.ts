/**
 * Тесты для CPU runtime матрицы.
 *
 * Проверяет корректность выполнения переходов на CPU.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { CPUMatrixRuntime } from "../../matrix/cpu"
import { floatToUint, findFieldOffset } from "../../fields"
import {
  createSimpleBraneFixture,
  createMultipleBranesFixture,
  createLockedBraneFixture,
  createFieldUpdateFixture,
  createIsolatedStore,
} from "./shared/fixtures"

/**
 * Специфичные тесты для CPU runtime.
 */
describe("CPU runtime — specific tests", () => {
  test("statesSnapshot returns Uint32Array", () => {
    const fixture = createSimpleBraneFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(fixture.initialStates)

    const snapshot = runtime.statesSnapshot()
    expect(snapshot).toBeInstanceOf(Uint32Array)
    expect(snapshot).toEqual(fixture.initialStates)
  })

  test("heapUpdate is no-op (uses shared heap)", () => {
    const fixture = createSimpleBraneFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(fixture.initialStates)

    // CPU runtime использует общий heap, heapUpdate — no-op
    expect(() => runtime.heapUpdate([{ offset: 0, value1: 100 }])).not.toThrow()
  })

  test("clear resets state", () => {
    const fixture = createSimpleBraneFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(fixture.initialStates)

    runtime.step(store)
    runtime.clear()

    const snapshot = runtime.statesSnapshot()
    expect(snapshot.length).toBe(0)
  })
})

/**
 * Детальные тесты сценариев.
 */
describe("CPU runtime — scenario tests", () => {
  test("simpleTransition — 1 brane hp > 50", async () => {
    const fixture = createSimpleBraneFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(fixture.initialStates)

    runtime.step(store)
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([0, 1])
  })

  test("multipleBranes — 3 branes different conditions", async () => {
    const fixture = createMultipleBranesFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(fixture.initialStates)

    runtime.step(store)
    const changes = await runtime.readChanges()

    // Браны 0 и 2 (hp > 50) должны перейти, брана 1 (hp = 30) нет
    expect(changes).toHaveLength(2)
    expect(changes).toContainEqual([0, 1])
    expect(changes).toContainEqual([2, 1])
  })

  test("lockFlag — locked brane does not transition", async () => {
    const fixture = createLockedBraneFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(fixture.initialStates)

    runtime.step(store)
    const changes = await runtime.readChanges()

    // Locked брана не должна переходить
    expect(changes).toHaveLength(0)
  })

  test("fieldUpdate — update field value and verify transition", async () => {
    const fixture = createFieldUpdateFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(fixture.initialStates)

    // Сначала hp = 40, перехода нет
    runtime.step(store)
    let changes = await runtime.readChanges()
    expect(changes).toHaveLength(0)

    // Обновляем hp > 50 напрямую в heap
    const blockPtr = fixture.blockPtrs[0]!
    
    // Используем findFieldOffset для нахождения смещения поля 0 (hp)
    const fieldOffset = findFieldOffset(store.heap, blockPtr, 0)
    expect(fieldOffset).not.toBeNull()

    if (fieldOffset !== null) {
      store.heap[fieldOffset] = floatToUint(100) // Устанавливаем hp = 100 (encoded)

      runtime.step(store)
      changes = await runtime.readChanges()

      // Теперь должен быть переход
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual([0, 1])
    }
  })

  test("dirtyFlagsAccuracy — only changed branes reported", async () => {
    const fixture = createMultipleBranesFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(fixture.initialStates)

    runtime.step(store)
    const changes = await runtime.readChanges()

    // Только браны 0 и 2 должны быть в changes
    expect(changes).toHaveLength(2)
    const indices = changes.map((c) => c[0])
    expect(indices).toContain(0)
    expect(indices).toContain(2)
    expect(indices).not.toContain(1)
  })

  test("determinism — multiple steps produce consistent results", async () => {
    const fixture = createSimpleBraneFixture()
    const store = createIsolatedStore(fixture)
    const runtime = new CPUMatrixRuntime(fixture.initialStates)

    runtime.step(store)
    const changes1 = await runtime.readChanges()

    runtime.step(store)
    const changes2 = await runtime.readChanges()

    // После первого шага состояние = 1 (терминальное), изменений больше нет
    expect(changes1).toHaveLength(1)
    expect(changes2).toHaveLength(0)
  })
})
