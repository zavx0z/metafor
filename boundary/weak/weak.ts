import type { WeakChanges, WeakHeapUpdate } from "./weak.t"
import type { BoundaryStore } from "../store.t"
import { createWeakRuntime } from "./factory"
import { weak$ } from "./store"

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
export async function weakInit(store$: BoundaryStore): Promise<void> {
  await runWeakOperation(async () => {
    weak$.reset()
    const selected = await createWeakRuntime(store$)
    weak$.initialized = true
    weak$.mode = selected.mode
    weak$.runtime = selected.runtime
    weak$.boundary$ = store$

    const snapshot = selected.runtime.statesSnapshot()
    if (snapshot) {
      store$.states = snapshot
    }
  })
}

/**
 * Выполняет один шаг активного слабого runtime.
 */
export function weakStep(): void {
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
  if (!weak$.runtime) throw new Error("Weak runtime not initialized")
  weak$.runtime.step()
}

/**
 * Читает изменения состояний после последнего шага слабого runtime.
 */
export async function weakReadChanges(): Promise<WeakChanges> {
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
  if (!weak$.runtime) throw new Error("Weak runtime not initialized")
  const changes = await weak$.runtime.readChanges()
  const snapshot = weak$.runtime.statesSnapshot()
  if (snapshot && weak$.boundary$) {
    weak$.boundary$.states = snapshot
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
export async function weakRunStep(): Promise<WeakChanges> {
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
  weakStep()
  return await weakReadChanges()
}

export { weak$ }
export type { WeakMode, WeakStore } from "./store.t"
