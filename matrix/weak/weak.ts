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
  if (prev) await prev
  try {
    return await task()
  } finally {
    release?.()
  }
}

const installRuntime = async (store$: MatrixStore): Promise<void> => {
  const selected = await createWeakRuntime(store$)
  weak$.initialized = true
  weak$.mode = selected.mode
  weak$.runtime = selected.runtime
  weak$.matrix$ = store$
  const snapshot = selected.runtime.statesSnapshot()
  if (snapshot) store$.states = snapshot
}

/** Initializes the Weak derived runtime from the canonical Matrix store. */
export async function weakInit(store$: MatrixStore): Promise<void> {
  await runWeakOperation(async () => {
    const nextStates = [...store$.states]
    weak$.dispose()
    store$.states = nextStates
    await installRuntime(store$)
  })
}

/**
 * Refreshes backend-derived buffers after structural edits while preserving the
 * canonical Matrix store, brane identities, states and locks.
 */
export async function weakReconfigure(store$: MatrixStore): Promise<void> {
  await runWeakOperation(async () => {
    if (!weak$.initialized || !weak$.runtime || weak$.matrix$ !== store$) {
      await installRuntime(store$)
      return
    }
    if (weak$.runtime.reconfigure) {
      weak$.runtime.reconfigure()
      return
    }
    const nextStates = [...store$.states]
    weak$.dispose()
    store$.states = nextStates
    await installRuntime(store$)
  })
}

export function weakStep(mode: WeakStepMode = StepMode.Full): void {
  if (!weak$.initialized || !weak$.runtime) throw new Error("Weak runtime not initialized")
  weak$.runtime.step(mode)
}

export async function weakReadChanges(): Promise<WeakChanges> {
  if (!weak$.initialized || !weak$.runtime) throw new Error("Weak runtime not initialized")
  const changes = await weak$.runtime.readChanges()
  const snapshot = weak$.runtime.statesSnapshot()
  if (snapshot && weak$.matrix$) weak$.matrix$.states = snapshot
  return changes
}

export function weakHeapUpdate(updates: WeakHeapUpdate[]): void {
  if (!weak$.initialized || !weak$.runtime) throw new Error("Weak runtime not initialized")
  weak$.runtime.heapUpdate(updates)
}

export async function weakRunStep(mode: WeakStepMode = StepMode.Full): Promise<WeakChanges> {
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
  weakStep(mode)
  return await weakReadChanges()
}

export { weak$ }
