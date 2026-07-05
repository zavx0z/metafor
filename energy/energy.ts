import type {BoundaryEnergyProcessDescriptor, BoundaryEnergyRuntimeSnapshot, ForceMessage} from "boundary"

export type EnergyProtocol = {
  close(): void
}

export type EnergyProtocolOptions = {
  force?: BroadcastChannel
  energyId?: string
  timeoutMs?: number
  runtimeKind?: string
  catalog?: BoundaryEnergyRuntimeSnapshot
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

const readRuntimeKind = (): string =>
  Bun.env.ENERGY_RUNTIME_KIND?.trim() || "server"

const descriptorKey = (wimp: string, state: string): string => `${wimp}\0${state}`

const canExecuteInRuntime = (descriptor: BoundaryEnergyProcessDescriptor, runtimeKind: string): boolean => {
  if (descriptor.env.length === 0) return true
  for (const env of descriptor.env) {
    if (env === "*" || env === runtimeKind) return true
    if (runtimeKind === "server" && env === "node") return true
    if (runtimeKind === "desktop-main" && env === "node") return true
    if (runtimeKind === "browser-main" && env === "browser") return true
    if (runtimeKind === "service-worker" && env === "worker") return true
  }
  return false
}

export function startEnergyProtocol(options: EnergyProtocolOptions = {}): EnergyProtocol {
  const force = options.force ?? new BroadcastChannel("force")
  const energyId = options.energyId ?? readEnergyId()
  const timeoutMs = options.timeoutMs ?? readTimeoutMs()
  const runtimeKind = options.runtimeKind ?? readRuntimeKind()
  const actorWimpById = new Map<number, string>(options.catalog?.actors ?? [])
  const descriptorByWimpState = new Map<string, BoundaryEnergyProcessDescriptor>(
    options.catalog?.processes.map((process) => [descriptorKey(process.wimp, process.state), process.descriptor]) ?? [],
  )
  const pendingDescriptorsByActorId = new Map<number, BoundaryEnergyProcessDescriptor>()
  const pendingActors = new Map<number, ReturnType<typeof setTimeout>>()

  force.onmessage = (event) => {
    for (const part of (event.data as ForceMessage).parts) {
      switch (part.part) {
        case "photon": {
          if (part.op !== "test") break
          const actorId = parseActorIdPath(part.path)
          if (actorId === null) break
          if (typeof part.value !== "string") break
          const wimp = actorWimpById.get(actorId)
          if (wimp === undefined) break
          const descriptor = descriptorByWimpState.get(descriptorKey(wimp, part.value))
          if (!descriptor || !canExecuteInRuntime(descriptor, runtimeKind)) break

          pendingDescriptorsByActorId.set(actorId, descriptor)
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
          const descriptor = pendingDescriptorsByActorId.get(actorId)

          const timer = setTimeout(() => {
            pendingActors.delete(actorId)
            if (descriptor !== undefined) pendingDescriptorsByActorId.delete(actorId)
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
      pendingDescriptorsByActorId.clear()
      force.close()
    },
  }
}
