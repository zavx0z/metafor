import { applyStructuralPatchFromDb, applyWeakResultPacket, setValues } from "./boundary.ts"
import type { DbBackend } from "store/db/core"
import {
  GLUON_BROADCAST_CHANNEL,
  GRAVITY_BROADCAST_CHANNEL,
  HIGGS_BROADCAST_CHANNEL,
  WEAK_W_BROADCAST_CHANNEL,
} from "../protocol.ts"

export type OpenBoundaryDb = () => Promise<DbBackend> | DbBackend

type BoundaryWorkerRuntime = {
  db: Promise<DbBackend>
  gravity: BroadcastChannel
  gluon: BroadcastChannel
  higgs: BroadcastChannel
  weak: BroadcastChannel
}

const boundaryWorker = globalThis as typeof globalThis & {
  __metaforBoundaryRuntime?: BoundaryWorkerRuntime
}

const patchesToValues = (patches: Array<{ path: string; value: unknown }>): Record<string, unknown> => {
  const values: Record<string, unknown> = {}

  for (const patch of patches) {
    if (!patch.path.startsWith("/field/")) continue
    const fieldId = patch.path.slice("/field/".length)
    if (!fieldId) continue
    values[fieldId] = patch.value
  }

  return values
}

export const bootBoundaryDomain = (openDb: OpenBoundaryDb): void => {
  const db = Promise.resolve(openDb())
  const gravity = new BroadcastChannel(GRAVITY_BROADCAST_CHANNEL)
  const gluon = new BroadcastChannel(GLUON_BROADCAST_CHANNEL)
  const higgs = new BroadcastChannel(HIGGS_BROADCAST_CHANNEL)
  const weak = new BroadcastChannel(WEAK_W_BROADCAST_CHANNEL)

  let queue = Promise.resolve()
  const enqueue = (task: () => Promise<void>): void => {
    queue = queue.then(task)
  }
  const applyValuePatches = async (patches: Array<{ path: string; value: unknown }>): Promise<void> => {
    const values = patchesToValues(patches)
    if (Object.keys(values).length === 0) return
    await setValues(values)
  }

  gravity.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data as { patches?: Array<{ op: "add" | "remove" | "test"; path: string; value?: unknown }> }

    enqueue(async () => {
      const backend = await db
      for (const patch of message.patches ?? []) {
        await applyStructuralPatchFromDb(backend, patch)
      }
    })
  }

  gluon.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data as { patches?: Array<{ path: string; value: unknown }> }

    enqueue(async () => await applyValuePatches(message.patches ?? []))
  }

  higgs.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data as { patches?: Array<{ path: string; value: unknown }> }

    enqueue(async () => await applyValuePatches(message.patches ?? []))
  }

  weak.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data as { wimpId: string; processId: string; patches: Array<{ op: "replace"; path: string; value: unknown }> }

    enqueue(async () => {
      await applyWeakResultPacket(message)
    })
  }

  boundaryWorker.__metaforBoundaryRuntime = {
    db,
    gravity,
    gluon,
    higgs,
    weak,
  }
}
