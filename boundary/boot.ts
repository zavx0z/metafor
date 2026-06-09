import { applyStructuralPatchFromDb, applyWeakResultPacket, setValues } from "./boundary.ts"
import type { DbBackend } from "store/db/core"
import { createProtocolChannel, protocolPatches, type ProtocolPatch } from "../protocol.ts"

export type OpenBoundaryDb = () => Promise<DbBackend> | DbBackend

type BoundaryWorkerRuntime = {
  db: Promise<DbBackend>
  protocol: BroadcastChannel
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
  const protocol = createProtocolChannel()
  const applyValuePatches = async (patches: Array<{ path: string; value: unknown }>): Promise<void> => {
    const values = patchesToValues(patches)
    if (Object.keys(values).length === 0) return
    await setValues(values)
  }

  protocol.onmessage = (event: MessageEvent<unknown>) => {
    void (async () => {
      const patches = protocolPatches(event.data)
      const backend = await db

      for (const patch of patches) {
        if (patch.part !== "graviton") continue
        await applyStructuralPatchFromDb(backend, patch as { op: "add" | "remove" | "test"; path: string; value?: unknown })
      }

      await applyValuePatches(
        patches
          .filter((patch) => patch.part === "gluon" || patch.part === "higgs")
          .map((patch) => ({ path: patch.path, value: patch.value })),
      )

      for (const message of collectWeakResultPackets(patches)) {
        await applyWeakResultPacket(message)
      }
    })()
  }

  boundaryWorker.__metaforBoundaryRuntime = {
    db,
    protocol,
  }
}

const collectWeakResultPackets = (
  patches: ProtocolPatch[],
): Array<{ wimpId: string; processId: string; patches: Array<{ op: "replace"; path: string; value: unknown }> }> => {
  const packets = new Map<string, { wimpId: string; processId: string; patches: Array<{ op: "replace"; path: string; value: unknown }> }>()

  for (const patch of patches) {
    if (patch.part !== "w") continue
    if (patch.op !== "replace" && patch.op !== "result") continue
    const wimpId = typeof patch.wimpId === "string" ? patch.wimpId : null
    const processId = typeof patch.processId === "string" ? patch.processId : null
    if (!wimpId || !processId) continue

    const key = `${wimpId}\0${processId}`
    let packet = packets.get(key)
    if (!packet) {
      packet = { wimpId, processId, patches: [] }
      packets.set(key, packet)
    }
    if (patch.op === "replace") {
      packet.patches.push({ op: "replace", path: patch.path, value: patch.value })
    }
  }

  return [...packets.values()]
}
