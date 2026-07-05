import type {ForceMessage} from "boundary"

export type EnergyProtocol = {
  close(): void
}

export type EnergyProtocolOptions = {
  force?: BroadcastChannel
  energyId?: string
  timeoutMs?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseActorIdPath = (path: unknown): number | null =>
  typeof path === "number" && Number.isSafeInteger(path) && path > 0 ? path : null

const readEnergyId = (): string =>
  Bun.env.ENERGY_ID?.trim() || "energy-local"

const readTimeoutMs = (): number => {
  const raw = Bun.env.ENERGY_TIMEOUT_MS?.trim()
  if (!raw) return 2000
  const timeout = Number(raw)
  return Number.isFinite(timeout) && timeout >= 0 ? timeout : 2000
}

export function startEnergyProtocol(options: EnergyProtocolOptions = {}): EnergyProtocol {
  const force = options.force ?? new BroadcastChannel("force")
  const energyId = options.energyId ?? readEnergyId()
  const timeoutMs = options.timeoutMs ?? readTimeoutMs()
  const pendingActors = new Map<number, ReturnType<typeof setTimeout>>()

  force.onmessage = (event) => {
    for (const part of (event.data as ForceMessage).parts) {
      switch (part.part) {
        case "photon": {
          if (part.op !== "replace") break
          const actorId = parseActorIdPath(part.path)
          if (actorId === null) break

          force.postMessage({
            parts: [{
              part: "z",
              op: "test",
              path: actorId,
              value: {energy: energyId},
            }],
          })
          break
        }
        case "z": {
          if (part.op !== "copy") break
          const actorId = parseActorIdPath(part.path)
          if (actorId === null) break
          if (part.from !== energyId) break
          if (!isRecord(part.value) || !isRecord(part.value.fields)) break
          if (pendingActors.has(actorId)) break

          const timer = setTimeout(() => {
            pendingActors.delete(actorId)
            force.postMessage({
              parts: [{
                part: "w+",
                op: "replace",
                path: actorId,
                value: {fields: {}},
              }],
            })
          }, timeoutMs)
          pendingActors.set(actorId, timer)
          break
        }
      }
    }
  }

  return {
    close() {
      for (const timer of pendingActors.values()) clearTimeout(timer)
      pendingActors.clear()
      force.close()
    },
  }
}

export const energyProtocol = startEnergyProtocol()
