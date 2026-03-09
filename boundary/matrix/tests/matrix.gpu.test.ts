/**
 * Тесты для GPU runtime матрицы.
 *
 * Проверяет корректность выполнения переходов на GPU.
 * Пропускается если GPU недоступен.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { ensureGPUDevice } from "../../matrix/device"
import { GPUMatrixRuntime } from "../../matrix/gpu"
import { floatToUint, findFieldOffset } from "../../fields"
import {
  createSimpleBraneFixture,
  createMultipleBranesFixture,
  createLockedBraneFixture,
  createFieldUpdateFixture,
  createMatrixInitParams,
} from "./shared/fixtures"
import { resetStringAtlas } from "@boundary/atlas"

/**
 * Проверяет доступность GPU и пропускает тест если недоступен.
 */
async function skipIfNoGpu(): Promise<GPUDevice | null> {
  const device = await ensureGPUDevice()
  if (!device) {
    // Возвращаем null чтобы тест мог быть пропущен
    return null
  }
  return device
}

/**
 * Создаёт GPU runtime для тестов.
 */
async function createGpuRuntimeForFixture(fixture: ReturnType<typeof createSimpleBraneFixture>) {
  const device = await ensureGPUDevice()
  if (!device) {
    throw new Error("GPU not available")
  }

  resetStringAtlas()
  const params = createMatrixInitParams(fixture)
  const atlasExport = { registry: new Uint32Array([0]), heap: new Uint32Array([0]), count: 0 }

  return await GPUMatrixRuntime.create(device, params, atlasExport)
}

/**
 * Специфичные тесты для GPU runtime.
 */
describe("GPU runtime — specific tests", () => {
  test("statesSnapshot returns null (GPU states not directly readable)", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const runtime = await createGpuRuntimeForFixture(fixture)

    const snapshot = runtime.statesSnapshot()
    expect(snapshot).toBeNull()
  })

  test("heapUpdate updates GPU heap buffer", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const runtime = await createGpuRuntimeForFixture(fixture)

    // GPU runtime требует явного обновления heap
    expect(() => runtime.heapUpdate([{ offset: 0, value1: 100 }])).not.toThrow()
  })

  test("clear destroys GPU buffers", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const runtime = await createGpuRuntimeForFixture(fixture)

    expect(() => runtime.clear()).not.toThrow()
  })
})

/**
 * Детальные тесты сценариев.
 */
describe("GPU runtime — scenario tests", () => {
  test("simpleTransition — 1 brane hp > 50", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const runtime = await createGpuRuntimeForFixture(fixture)

    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([0, 1])
  })

  test("multipleBranes — 3 branes different conditions", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createMultipleBranesFixture()
    const runtime = await createGpuRuntimeForFixture(fixture)

    runtime.step()
    const changes = await runtime.readChanges()

    // Браны 0 и 2 (hp > 50) должны перейти, брана 1 (hp = 30) нет
    expect(changes).toHaveLength(2)
    expect(changes).toContainEqual([0, 1])
    expect(changes).toContainEqual([2, 1])
  })

  test("lockFlag — locked brane does not transition", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createLockedBraneFixture()
    const runtime = await createGpuRuntimeForFixture(fixture)

    runtime.step()
    const changes = await runtime.readChanges()

    // Locked брана не должна переходить
    expect(changes).toHaveLength(0)
  })

  test("fieldUpdate — update field value and verify transition", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createFieldUpdateFixture()
    const runtime = await createGpuRuntimeForFixture(fixture)

    // Сначала hp = 40, перехода нет
    runtime.step()
    let changes = await runtime.readChanges()
    expect(changes).toHaveLength(0)

    // Обновляем hp > 50 через heapUpdate
    // Находим смещение поля 0 (hp) в heap
    const blockPtr = fixture.blockPtrs[0]!
    const fieldOffset = findFieldOffset(fixture.heap, blockPtr, 0)
    expect(fieldOffset).not.toBeNull()

    if (fieldOffset !== null) {
      // Обновляем heap на GPU
      runtime.heapUpdate([{ offset: fieldOffset, value1: floatToUint(100) }])

      runtime.step()
      changes = await runtime.readChanges()

      // Теперь должен быть переход
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual([0, 1])
    }
  })

  test("dirtyFlagsAccuracy — only changed branes reported", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createMultipleBranesFixture()
    const runtime = await createGpuRuntimeForFixture(fixture)

    runtime.step()
    const changes = await runtime.readChanges()

    // Только браны 0 и 2 должны быть в changes
    expect(changes).toHaveLength(2)
    const indices = changes.map((c) => c[0])
    expect(indices).toContain(0)
    expect(indices).toContain(2)
    expect(indices).not.toContain(1)
  })

  test("determinism — multiple steps produce consistent results", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const runtime = await createGpuRuntimeForFixture(fixture)

    runtime.step()
    const changes1 = await runtime.readChanges()

    runtime.step()
    const changes2 = await runtime.readChanges()

    // После первого шага состояние = 1 (терминальное), изменений больше нет
    expect(changes1).toHaveLength(1)
    expect(changes2).toHaveLength(0)
  })
})

/**
 * Кросс-платформенный тест: CPU === GPU.
 */
describe("CPU/GPU parity", () => {
  test("results match — CPU and GPU produce identical changes", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    
    // Создаём CPU runtime
    const { CPUMatrixRuntime } = await import("../../matrix/cpu")
    const { createIsolatedStore } = await import("./shared/fixtures")
    const cpuStore = createIsolatedStore(fixture)
    const cpuRuntime = new CPUMatrixRuntime(fixture.initialStates)

    // Создаём GPU runtime
    resetStringAtlas()
    const params = createMatrixInitParams(fixture)
    const atlasExport = { registry: new Uint32Array([0]), heap: new Uint32Array([0]), count: 0 }
    const gpuRuntime = await GPUMatrixRuntime.create(device, params, atlasExport)

    // Выполняем step на обоих runtime
    cpuRuntime.step(cpuStore)
    gpuRuntime.step()

    // Читаем изменения
    const cpuChanges = await cpuRuntime.readChanges()
    const gpuChanges = await gpuRuntime.readChanges()

    // Нормализуем для сравнения (сортируем по индексу)
    const normalize = (changes: Array<[number, number]>) =>
      [...changes].sort((a, b) => a[0] - b[0])

    expect(normalize(gpuChanges)).toEqual(normalize(cpuChanges))

    cpuRuntime.clear()
    gpuRuntime.clear()
  })

  test("multipleBranes parity — CPU and GPU produce identical changes", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createMultipleBranesFixture()
    
    // CPU runtime
    const { CPUMatrixRuntime } = await import("../../matrix/cpu")
    const { createIsolatedStore } = await import("./shared/fixtures")
    const cpuStore = createIsolatedStore(fixture)
    const cpuRuntime = new CPUMatrixRuntime(fixture.initialStates)

    // GPU runtime
    resetStringAtlas()
    const params = createMatrixInitParams(fixture)
    const atlasExport = { registry: new Uint32Array([0]), heap: new Uint32Array([0]), count: 0 }
    const gpuRuntime = await GPUMatrixRuntime.create(device, params, atlasExport)

    cpuRuntime.step(cpuStore)
    gpuRuntime.step()

    const cpuChanges = await cpuRuntime.readChanges()
    const gpuChanges = await gpuRuntime.readChanges()

    const normalize = (changes: Array<[number, number]>) =>
      [...changes].sort((a, b) => a[0] - b[0])

    expect(normalize(gpuChanges)).toEqual(normalize(cpuChanges))
  })
})
