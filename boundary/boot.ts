import { applyStructuralPatchFromSharedDb, applyWeakResultPacket, setValues } from "./boundary.ts"
import type { SharedDbBackend } from "../pkg/db/core.ts"
import {
  GLUON_BROADCAST_CHANNEL,
  GRAVITY_BROADCAST_CHANNEL,
  HIGGS_BROADCAST_CHANNEL,
  isGluonMessage,
  isGravitonMessage,
  isHiggsMessage,
  isWMessage,
  WEAK_W_BROADCAST_CHANNEL,
} from "pkg/protocol"

export type OpenBoundaryDb = () => Promise<SharedDbBackend> | SharedDbBackend

type BoundaryWorkerRuntime = {
  db: Promise<SharedDbBackend>
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
    const message = event.data
    if (!isGravitonMessage(message)) return
    if (message.source !== "dark") return

    enqueue(async () => {
      const backend = await db
      for (const patch of message.patches) {
        await applyStructuralPatchFromSharedDb(backend, patch)
      }
    })
  }

  gluon.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data
    if (!isGluonMessage(message)) return

    enqueue(async () => await applyValuePatches(message.patches))
  }

  higgs.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data
    if (!isHiggsMessage(message)) return

    enqueue(async () => await applyValuePatches(message.patches))
  }

  weak.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data
    if (!isWMessage(message)) return
    if (message.source !== "bulk") return

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
