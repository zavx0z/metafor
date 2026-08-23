import type {MatrixStore} from "@matrix/types/store"
import type {WeakChanges, WeakHeapUpdate, WeakStepMode, WeakStructuralUpdate} from "@matrix/types/weak"
import {createWeakRuntime} from "./factory"
import {weak$} from "./store"
import {StepMode} from "./constants"

const runWeakOperation = async <T>(task: () => Promise<T>): Promise<T> => {
  const previous = weak$.operationMutex
  let release: (() => void) | undefined
  weak$.operationMutex = new Promise<void>((resolve) => {
    release = resolve
  })

  if (previous) await previous

  try {
    return await task()
  } finally {
    release?.()
  }
}

/** Initializes the one live Matrix Weak backend over the packed Matrix store. */
export async function weakInit(store$: MatrixStore): Promise<void> {
  await runWeakOperation(async () => {
    if (weak$.initialized) throw new Error("Weak runtime is already initialized")
    const selected = await createWeakRuntime(store$)
    weak$.initialized = true
    weak$.mode = selected.mode
    weak$.runtime = selected.runtime
    weak$.matrix$ = store$

    const snapshot = selected.runtime.statesSnapshot()
    if (snapshot) store$.states = snapshot
  })
}

/** Executes one step on the active WebGPU/CPU Weak backend. */
export function weakStep(mode: WeakStepMode = StepMode.Full): void {
  if (!weak$.initialized || !weak$.runtime) throw new Error("Weak runtime not initialized")
  weak$.runtime.step(mode)
}

/** Reads changed states produced by the last Weak step. */
export async function weakReadChanges(): Promise<WeakChanges> {
  if (!weak$.initialized || !weak$.runtime) throw new Error("Weak runtime not initialized")
  const changes = await weak$.runtime.readChanges()
  const snapshot = weak$.runtime.statesSnapshot()
  if (snapshot && weak$.matrix$) weak$.matrix$.states = snapshot
  return changes
}

/** Synchronizes packed field/lock updates into the active Weak backend. */
export function weakHeapUpdate(updates: WeakHeapUpdate[]): void {
  if (!weak$.initialized || !weak$.runtime) throw new Error("Weak runtime not initialized")
  weak$.runtime.heapUpdate(updates)
}

/** Synchronizes locally changed structural rows without recreating the backend. */
export function weakStructuralUpdate(update: WeakStructuralUpdate): void {
  if (!weak$.initialized || !weak$.runtime) throw new Error("Weak runtime not initialized")
  weak$.runtime.structuralUpdate(update)
}

/** Executes a Weak step and returns the changed states. */
export async function weakRunStep(mode: WeakStepMode = StepMode.Full): Promise<WeakChanges> {
  if (!weak$.initialized) throw new Error("Weak runtime not initialized")
  weakStep(mode)
  return await weakReadChanges()
}

export {weak$}
