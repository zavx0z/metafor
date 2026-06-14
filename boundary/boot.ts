import { applyStructuralPartFromDb, applyWeakResultPacket, setValues } from "./boundary.ts"
import type { DbBackend } from "store/db/core"
import {force, type ForceSurface, type Particle} from "store"

export type OpenBoundaryDb = () => Promise<DbBackend> | DbBackend

type BoundaryWorkerRuntime = {
  db: Promise<DbBackend>
  force: ForceSurface
}

const boundaryWorker = globalThis as typeof globalThis & {
  __metaforBoundaryRuntime?: BoundaryWorkerRuntime
}

const partsToValues = (parts: Array<{ path: string; value: unknown }>): Record<string, unknown> => {
  const values: Record<string, unknown> = {}

  for (const part of parts) {
    if (!part.path.startsWith("/field/")) continue
    const fieldId = part.path.slice("/field/".length)
    if (!fieldId) continue
    values[fieldId] = part.value
  }

  return values
}

export const bootBoundaryDomain = (openDb: OpenBoundaryDb): void => {
  const db = Promise.resolve(openDb())
  const applyValueParts = async (parts: Array<{ path: string; value: unknown }>): Promise<void> => {
    const values = partsToValues(parts)
    if (Object.keys(values).length === 0) return
    await setValues(values)
  }

  force.observe((event) => {
    void (async () => {
      const parts = event.data.parts
      const backend = await db

      for (const part of parts) {
        if (part.part !== "graviton") continue
        await applyStructuralPartFromDb(backend, part as { op: "add" | "remove" | "test"; path: string; value?: unknown })
      }

      await applyValueParts(
        parts
          .filter((part) => part.part === "gluon" || part.part === "higgs")
          .map((part) => ({ path: part.path, value: part.value })),
      )

      for (const message of collectWeakResultPackets(parts)) {
        await applyWeakResultPacket(message)
      }
    })()
  })

  boundaryWorker.__metaforBoundaryRuntime = {
    db,
    force,
  }
}

const collectWeakResultPackets = (
  parts: Particle[],
): Array<{ wimpId: string; processId: string; parts: Array<{ op: "replace"; path: string; value: unknown }> }> => {
  const packets = new Map<string, { wimpId: string; processId: string; parts: Array<{ op: "replace"; path: string; value: unknown }> }>()

  for (const part of parts) {
    if (part.part !== "w") continue
    if (part.op !== "replace" && !isWeakResultMarker(part)) continue
    const wimpId = typeof part.wimpId === "string" ? part.wimpId : null
    const processId = typeof part.processId === "string" ? part.processId : null
    if (!wimpId || !processId) continue

    const key = `${wimpId}\0${processId}`
    let packet = packets.get(key)
    if (!packet) {
      packet = { wimpId, processId, parts: [] }
      packets.set(key, packet)
    }
    if (part.op === "replace") {
      packet.parts.push({ op: "replace", path: part.path, value: part.value })
    }
  }

  return [...packets.values()]
}

const isWeakResultMarker = (part: Particle): boolean =>
  part.op === "test" && (part.kind === "result" || (isRecord(part.value) && part.value.kind === "result"))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
