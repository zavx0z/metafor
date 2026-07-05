import type { MatrixStore } from "@metafor/types/matrix/store"
import type { WeakChanges, WeakHeapUpdate, WeakStepMode } from "@metafor/types/matrix/weak"
import { createWeakRuntime } from "./factory"
import { weak$ } from "./store"
import { StepMode } from "./constants"

const runWeakOperation = async <T>(task: () => Promise<T>): Promise<T> => {
  const prev = weak$.operationMutex
  let release: (() => void) | undefined
  weak$.operationMutex = new Promise<void>((resolve) => {
    release = resolve
  })

  if (prev) {
    await prev
  }

  try {
    return await task()
  } finally {
    release?.()
  }
}

/**
 * Инициализирует слабый runtime и фиксирует выбранную среду.
 */
export async function weakInit(store$: MatrixStore): Promise<void> {
  await runWeakOperation(async () => {
    weak$.reset()
    const selected = await createWeakRuntime(store$)
    weak$.initialized = true
    weak$.mode = selected.mode
    weak$.runtime = selected.runtime
    weak$.matrix$ = store$

    const snapshot = selected.runtime.statesSnapshot()
    if (snapshot) {
      store$.states = snapshot
    }
  })
}

/**
 * Выполняет один шаг активного слабого runtime.
 */
export function weakStep(mode: WeakStepMode = StepMode.Full): void {
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
  if (!weak$.runtime) throw new Error("Weak runtime not initialized")
  weak$.runtime.step(mode)
}

/**
 * Читает изменения состояний после последнего шага слабого runtime.
 */
export async function weakReadChanges(): Promise<WeakChanges> {
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
  if (!weak$.runtime) throw new Error("Weak runtime not initialized")
  const changes = await weak$.runtime.readChanges()
  const snapshot = weak$.runtime.statesSnapshot()
  if (snapshot && weak$.matrix$) {
    weak$.matrix$.states = snapshot
  }
  return changes
}

/**
 * Синхронизирует канонические обновления store с активной средой слабого runtime.
 */
export function weakHeapUpdate(updates: WeakHeapUpdate[]): void {
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
  if (!weak$.runtime) throw new Error("Weak runtime not initialized")
  weak$.runtime.heapUpdate(updates)
}

/**
 * Выполняет шаг и возвращает список изменившихся состояний.
 */
export async function weakRunStep(mode: WeakStepMode = StepMode.Full): Promise<WeakChanges> {
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
  weakStep(mode)
  return await weakReadChanges()
}

export { weak$ }
