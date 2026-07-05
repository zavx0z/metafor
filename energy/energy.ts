import {existsSync} from "node:fs"
import {dirname, isAbsolute, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type { EnergyHandlerDescriptor, EnergyProcessDescriptor } from "@metafor/types/energy/process"
import type { EnergyRuntimeSnapshot } from "@metafor/types/energy/catalog"
import type { EnergyMassContext, EnergyMassStore } from "@metafor/types/energy/mass"
import type { EnergyProtocol, EnergyProtocolOptions } from "@metafor/types/energy/protocol"
import type { EnergyActionParams, PendingEnergyProcess } from "@metafor/types/energy/runtime"
import type { ForceMessage } from "@metafor/types/force/message"

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

export function createInMemoryEnergyMassStore(): EnergyMassStore {
  const masses = new Map<string, Record<string, unknown>>()

  return {
    get(ctx: EnergyMassContext) {
      const key = `${ctx.wimp}\0${ctx.actorId}`
      let mass = masses.get(key)
      if (!mass) {
        mass = {}
        masses.set(key, mass)
      }
      return mass
    },
    clear() {
      masses.clear()
    },
  }
}

const canExecuteInRuntime = (descriptor: EnergyProcessDescriptor, runtimeKind: string): boolean => {
  if (descriptor.env.length === 0) return true
  for (const env of descriptor.env) {
    if (env === "any" || env === "*" || env === runtimeKind) return true
    if (runtimeKind === "server" && env === "node") return true
    if (runtimeKind === "desktop-main" && env === "node") return true
    if (runtimeKind === "browser-main" && env === "browser") return true
    if (runtimeKind === "service-worker" && env === "worker") return true
  }
  return false
}

const isUrlSpecifier = (specifier: string): boolean => /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(specifier)

const resolveWimpSourceDir = (wimp: string): string => {
  const root = resolve(import.meta.dir, "..")
  const directMeta = resolve(root, "github", wimp, "meta.ts")
  const srcMeta = resolve(root, "github", wimp, "src", "meta.ts")
  if (existsSync(directMeta)) return dirname(directMeta)
  if (existsSync(srcMeta)) return dirname(srcMeta)
  return resolve(root, "github", wimp)
}

const resolveActionImportSpecifier = (specifier: string, wimp: string): string => {
  if (isUrlSpecifier(specifier)) return specifier
  if (isAbsolute(specifier)) return pathToFileURL(specifier).href
  if (!specifier.startsWith(".")) return specifier
  return pathToFileURL(resolve(resolveWimpSourceDir(wimp), specifier)).href
}

const rewriteWrapperDynamicImports = (source: string, wimp: string): string =>
  source.replace(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g, (_match, _quote, specifier: string) =>
    `import(${JSON.stringify(resolveActionImportSpecifier(specifier, wimp))})`,
  )

const buildActionValue = (
  fields: Record<string, unknown>,
  readFields: Array<[fieldId: number, key: string]>,
): Record<string, unknown> => {
  const value: Record<string, unknown> = {}
  for (const [fieldId, key] of readFields) {
    const fieldValue = fields[String(fieldId)]
    if (fieldValue !== undefined) value[key] = fieldValue
  }
  return value
}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

const collectHandlerFields = (
  writeFields: Array<[fieldId: number, key: string]>,
): {fields: Record<string, unknown>; update(values: unknown): Record<string, unknown>} => {
  const fieldIdByKey = new Map(writeFields.map(([fieldId, key]) => [key, String(fieldId)]))
  const fields: Record<string, unknown> = {}

  return {
    fields,
    update(values: unknown) {
      if (!isRecord(values)) return fields
      for (const [key, value] of Object.entries(values)) {
        const fieldId = fieldIdByKey.get(key)
        if (fieldId !== undefined) fields[fieldId] = value
      }
      return fields
    },
  }
}

const executeProcessHandler = async (
  pending: PendingEnergyProcess,
  handler: EnergyHandlerDescriptor | undefined,
  fields: Record<string, unknown>,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  if (!handler) return {}

  const collector = collectHandlerFields(handler.writeFields)
  const fn = (0, eval)(`(${rewriteWrapperDynamicImports(handler.src, pending.wimp)})`)
  if (typeof fn !== "function") throw new Error("Energy process handler did not evaluate to a function")
  await fn({...params, update: collector.update, value: buildActionValue(fields, handler.readFields)})
  return collector.fields
}

const executeProcessAction = async (
  pending: PendingEnergyProcess,
  energyId: string,
  fields: Record<string, unknown>,
  massStore: EnergyMassStore,
): Promise<unknown> => {
  const params: EnergyActionParams = {
    field: {},
    value: buildActionValue(fields, pending.descriptor.action.readFields),
    mass: massStore.get({energyId, actorId: pending.actorId, wimp: pending.wimp, state: pending.state}),
    self: {
      atom: String(pending.actorId),
      meta: pending.wimp,
      path: String(pending.actorId),
    },
  }

  if (pending.descriptor.action.wrapperSrc) {
    const fn = (0, eval)(`(${rewriteWrapperDynamicImports(pending.descriptor.action.wrapperSrc, pending.wimp)})`)
    if (typeof fn !== "function") throw new Error("Energy wrapperSrc did not evaluate to a function")
    return await fn(params)
  }

  const module = await import(resolveActionImportSpecifier(pending.descriptor.action.src, pending.wimp))
  const fn = pending.descriptor.action.importSpecifier
    ? module[pending.descriptor.action.importSpecifier]
    : module.default
  if (typeof fn !== "function") {
    throw new Error(`Energy action export is not a function: ${pending.descriptor.action.importSpecifier ?? "default"}`)
  }
  return await fn(params)
}

export function startEnergyProtocol(options: EnergyProtocolOptions = {}): EnergyProtocol {
  const force = options.force ?? new BroadcastChannel("force")
  const energyId = options.energyId ?? readEnergyId()
  const timeoutMs = options.timeoutMs ?? readTimeoutMs()
  const runtimeKind = options.runtimeKind ?? readRuntimeKind()
  const ownsMassStore = options.massStore === undefined
  const massStore = options.massStore ?? createInMemoryEnergyMassStore()
  const actorWimpById = new Map<number, string>(options.catalog?.actors ?? [])
  const descriptorByWimpState = new Map<string, EnergyProcessDescriptor>(
    options.catalog?.processes.map((process) => [descriptorKey(process.wimp, process.state), process.descriptor]) ?? [],
  )
  const pendingByActorId = new Map<number, PendingEnergyProcess>()
  const fallbackTimersByActorId = new Map<number, ReturnType<typeof setTimeout>>()
  const runningActorIds = new Set<number>()

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

          pendingByActorId.set(actorId, {actorId, wimp, state: part.value, descriptor})
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
          const processFields = part.value.fields
          if (runningActorIds.has(actorId) || fallbackTimersByActorId.has(actorId)) break
          const pending = pendingByActorId.get(actorId)

          if (pending) {
            runningActorIds.add(actorId)
            void executeProcessAction(pending, energyId, processFields, massStore)
              .then(async (data) => {
                let fields: Record<string, unknown>
                try {
                  fields = await executeProcessHandler(pending, pending.descriptor.success, processFields, {data})
                } catch (error) {
                  force.postMessage({
                    parts: [{
                      part: "w-",
                      op: "replace",
                      path: actorId,
                      value: {error: toError(error).message, fields: {}},
                    }],
                  })
                  return
                }
                force.postMessage({
                  parts: [{
                    part: "w+",
                    op: "replace",
                    path: actorId,
                    value: {fields},
                  }],
                })
              })
              .catch(async (thrown) => {
                const actionError = toError(thrown)
                try {
                  const fields = await executeProcessHandler(pending, pending.descriptor.error, processFields, {error: actionError})
                  force.postMessage({
                    parts: [{
                      part: "w-",
                      op: "replace",
                      path: actorId,
                      value: {error: actionError.message, fields},
                    }],
                  })
                } catch (handlerThrown) {
                  force.postMessage({
                    parts: [{
                      part: "w-",
                      op: "replace",
                      path: actorId,
                      value: {error: toError(handlerThrown).message, fields: {}},
                    }],
                  })
                }
              })
              .finally(() => {
                pendingByActorId.delete(actorId)
                runningActorIds.delete(actorId)
              })
            break
          }

          const timer = setTimeout(() => {
            fallbackTimersByActorId.delete(actorId)
            force.postMessage({
              parts: [{
                part: "w+",
                op: "replace",
                path: actorId,
                value: {fields: {}},
              }],
            })
          }, timeoutMs)
          fallbackTimersByActorId.set(actorId, timer)
          break
        }
      }
    }
  }

  return {
    close() {
      for (const timer of fallbackTimersByActorId.values()) clearTimeout(timer)
      fallbackTimersByActorId.clear()
      pendingByActorId.clear()
      runningActorIds.clear()
      if (ownsMassStore) massStore.clear?.()
      force.close()
    },
  }
}
