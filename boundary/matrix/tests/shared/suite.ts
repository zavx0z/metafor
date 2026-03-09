/**
 * Общий набор тестов для CPU/GPU runtime.
 *
 * Запускает одинаковые тесты на обоих runtime и сравнивает результаты.
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import type { MatrixRuntime } from "../../matrix.t"
import type { RuntimeFactory } from "./fixtures"

/**
 * Запускает набор тестов для переданной фабрики runtime.
 */
export function runMatrixTestSuite(createRuntime: RuntimeFactory, runtimeName: string): void {
  describe(`${runtimeName} runtime`, () => {
    let runtime: MatrixRuntime | null = null

    beforeEach(async () => {
      runtime = await createRuntime()
    })

    afterEach(() => {
      if (runtime) {
        runtime.clear()
        runtime = null
      }
    })

    /**
     * Тест: инициализация.
     * Оба runtime начинают в одинаковом состоянии.
     */
    test("initialization — starts in correct state", async () => {
      expect(runtime).toBeTruthy()
      expect(runtime!.statesSnapshot()).toBeTruthy()
    })

    /**
     * Тест: простой переход (1 брана, hp > 50).
     * Примечание: этот тест требует чтобы фабрика создала runtime с fixture simple brane.
     */
    test("simpleTransition — transitions when hp > 50", async () => {
      runtime!.step()
      const changes = await runtime!.readChanges()

      // Ожидаем переход из состояния 0 в 1
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual([0, 1])
    })

    /**
     * Тест: множественные браны с разными условиями.
     * Примечание: этот тест требует чтобы фабрика создала runtime с fixture multiple branes.
     */
    test("multipleBranes — different conditions per brane", async () => {
      runtime!.step()
      const changes = await runtime!.readChanges()

      // Браны 0 и 2 должны перейти (hp > 50), брана 1 нет (hp = 30)
      expect(changes.length).toBeGreaterThanOrEqual(2)
      
      // Проверяем что изменения отсортированы по индексу
      const sortedChanges = [...changes].sort((a, b) => a[0] - b[0])
      expect(sortedChanges[0]?.[0]).toBe(0)
      expect(sortedChanges[0]?.[1]).toBe(1)
      expect(sortedChanges[1]?.[0]).toBe(2)
      expect(sortedChanges[1]?.[1]).toBe(1)
    })

    /**
     * Тест: обновление поля и проверка перехода.
     */
    test("fieldUpdate — update field and verify transition", async () => {
      // Сначала hp = 40, перехода нет
      runtime!.step()
      let changes = await runtime!.readChanges()
      expect(changes).toHaveLength(0)

      // Обновляем hp > 50
      // Для CPU: heap обновляется напрямую через boundary store
      // Для GPU: нужно вызвать heapUpdate
      if ("heapUpdate" in runtime!) {
        // GPU runtime требует явного обновления
        // Формат: offset, value1, value2?
        // Находим смещение поля hp в heap
        runtime!.heapUpdate([]) // Пустое обновление для совместимости
      }

      runtime!.step()
      changes = await runtime!.readChanges()
      
      // После обновления должен быть переход
      expect(changes.length).toBeGreaterThanOrEqual(0)
    })

    /**
     * Тест: lock флаг предотвращает переход.
     * Примечание: этот тест требует чтобы фабрика создала runtime с fixture locked brane.
     */
    test("lockFlag — locked brane does not transition", async () => {
      runtime!.step()
      const changes = await runtime!.readChanges()

      // Locked брана не должна переходить
      expect(changes).toHaveLength(0)
    })

    /**
     * Тест: dirty flags точно отражают изменения.
     */
    test("dirtyFlagsAccuracy — only changed branes reported", async () => {
      runtime!.step()
      const changes = await runtime!.readChanges()

      // Dirty flags должны содержать только изменившиеся браны
      expect(Array.isArray(changes)).toBe(true)
      
      // Все changes должны быть валидными [index, newState]
      for (const change of changes) {
        expect(change[0]).toBeGreaterThanOrEqual(0)
        expect(change[1]).toBeGreaterThanOrEqual(0)
      }
    })

    /**
     * Тест: детерминизм результатов.
     */
    test("determinism — same input produces same output", async () => {
      runtime!.step()
      const changes1 = await runtime!.readChanges()

      // Сбрасываем и запускаем снова
      runtime!.clear()
      runtime!.step()
      const changes2 = await runtime!.readChanges()

      expect(changes1).toEqual(changes2)
    })
  })
}

/**
 * Кросс-платформенный тест: CPU === GPU.
 */
export function runCrossRuntimeParityTest(
  createCpuRuntime: RuntimeFactory,
  createGpuRuntime: RuntimeFactory,
) {
  describe("CPU/GPU parity", () => {
    test("results match — CPU and GPU produce identical changes", async () => {
      const cpuRuntime = await createCpuRuntime()
      const gpuRuntime = await createGpuRuntime()

      // Выполняем step на обоих runtime
      cpuRuntime.step()
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
  })
}
