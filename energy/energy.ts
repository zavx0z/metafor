import {existsSync} from "node:fs"
import {dirname, isAbsolute, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type { EnergyHandlerDescriptor, EnergyProcessDescriptor } from "@metafor/types/energy/process"
import type { EnergyMassContext, EnergyMassStore } from "@metafor/types/energy/mass"
import type { EnergyProtocol, EnergyProtocolOptions } from "@metafor/types/energy/protocol"
import type { EnergyActionParams, PendingEnergyProcess } from "@metafor/types/energy/runtime"
import type { ForceMessage } from "@metafor/types/force/message"
import {Force} from "force"
import {EnergyCatalogStore, type EnergyProcessEntry} from "./catalog.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseActorIdPath = (path: unknown): number | null =>
  typeof path === "number" && Number.isSafeInteger(path) && path > 0 ? path : null

const readEnergyId = (): string => Bun.env.ENERGY_ID?.trim() || "energy-local"
const readRuntimeKind = (): string => Bun.env.ENERGY_RUNTIME_KIND?.trim() || "server"

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

const toError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error))

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

const executeProcess = async (
  pending: PendingEnergyProcess,
  energyId: string,
  fields: Record<string, unknown>,
  massStore: EnergyMassStore,
): Promise<unknown> => {
  const mass = massStore.get({energyId, actorId: pending.actorId, wimp: pending.wimp, state: pending.state})
  if (pending.descriptor.type === "finally") {
    const fn = (0, eval)(`(${rewriteWrapperDynamicImports(pending.descriptor.before.src, pending.wimp)})`)
    if (typeof fn !== "function") throw new Error("Energy finally before did not evaluate to a function")
    return await fn({mass})
  }

  const params: EnergyActionParams = {
    field: {},
    value: buildActionValue(fields, pending.descriptor.action.readFields),
    mass,
    self: {atom: String(pending.actorId), meta: pending.wimp, path: String(pending.actorId)},
  }
  if (pending.descriptor.action.wrapperSrc) {
    const fn = (0, eval)(`(${rewriteWrapperDynamicImports(pending.descriptor.action.wrapperSrc, pending.wimp)})`)
    if (typeof fn !== "function") throw new Error("Energy wrapperSrc did not evaluate to a function")
    return await fn(params)
  }
  const module = await import(resolveActionImportSpecifier(pending.descriptor.action.src, pending.wimp))
  const fn = pending.descriptor.action.importSpecifier ? module[pending.descriptor.action.importSpecifier] : module.default
  if (typeof fn !== "function") {
    throw new Error(`Energy action export is not a function: ${pending.descriptor.action.importSpecifier ?? "default"}`)
  }
  return await fn(params)
}

const photonExecution = (value: unknown, actorId: number): {state: string; execution: string} | null => {
  if (isRecord(value) && typeof value.state === "string" && typeof value.execution === "string" && value.execution.length > 0) {
    return {state: value.state, execution: value.execution}
  }
  if (typeof value === "string") return {state: value, execution: `legacy:${actorId}:${value}`}
  return null
}

const pendingMatchesCatalog = (catalog: EnergyCatalogStore, pending: PendingEnergyProcess): boolean => {
  const current = catalog.processEntry(pending.wimp, pending.state)
  return current?.key === pending.processKey && current.revision === pending.processRevision
}

const createPending = (
  actorId: number,
  wimp: string,
  request: {state: string; execution: string},
  entry: EnergyProcessEntry,
): PendingEnergyProcess => ({
  actorId,
  wimp,
  state: request.state,
  execution: request.execution,
  processKey: entry.key,
  processRevision: entry.revision,
  descriptor: structuredClone(entry.process.descriptor),
})

export function startEnergyProtocol(options: EnergyProtocolOptions = {}): EnergyProtocol {
  const force = options.force ?? new Force("energy")
  const energyId = options.energyId ?? readEnergyId()
  const runtimeKind = options.runtimeKind ?? readRuntimeKind()
  const ownsMassStore = options.massStore === undefined
  const massStore = options.massStore ?? createInMemoryEnergyMassStore()
  const catalog = new EnergyCatalogStore()
  const pendingByActorId = new Map<number, PendingEnergyProcess>()
  const runningExecutionByActorId = new Map<number, string>()

  const stillCurrent = (pending: PendingEnergyProcess): boolean =>
    pendingByActorId.get(pending.actorId)?.execution === pending.execution &&
    pendingMatchesCatalog(catalog, pending)

  const sendResult = (
    pending: PendingEnergyProcess,
    part: "w+" | "w-",
    value: Record<string, unknown>,
  ): void => {
    if (!stillCurrent(pending)) return
    force.impulse({parts: [{
      part,
      op: "replace",
      path: pending.actorId,
      from: energyId,
      value: {execution: pending.execution, ...value},
    }]})
  }

  force.onImpulse = (message: ForceMessage) => {
    const part = message.parts[0]
    if (part.part === "graviton") {
      const change = catalog.apply(part)
      for (const actorId of change.affectedActorIds) {
        const pending = pendingByActorId.get(actorId)
        if (pending && !pendingMatchesCatalog(catalog, pending)) pendingByActorId.delete(actorId)
      }
      return
    }

    if (part.part === "photon") {
      if (part.op !== "test") return
      const actorId = parseActorIdPath(part.path)
      if (actorId === null) return
      const request = photonExecution(part.value, actorId)
      if (!request) return
      const wimp = catalog.actorWimp(actorId)
      if (!wimp) return
      const entry = catalog.processEntry(wimp, request.state)
      if (!entry || !canExecuteInRuntime(entry.process.descriptor, runtimeKind)) return
      const pending = createPending(actorId, wimp, request, entry)
      pendingByActorId.set(actorId, pending)
      force.impulse({parts: [{
        part: "z",
        op: "test",
        path: actorId,
        value: {energy: energyId, execution: pending.execution},
      }]})
      return
    }

    if (part.part !== "z" || part.op !== "copy") return
    const actorId = parseActorIdPath(part.path)
    if (actorId === null || part.from !== energyId || !isRecord(part.value) || !isRecord(part.value.fields)) return
    const pending = pendingByActorId.get(actorId)
    if (!pending || part.value.execution !== pending.execution || !pendingMatchesCatalog(catalog, pending)) return
    if (runningExecutionByActorId.has(actorId)) return
    const processFields = structuredClone(part.value.fields)
    runningExecutionByActorId.set(actorId, pending.execution)

    void executeProcess(pending, energyId, processFields, massStore)
      .then(async (data) => {
        if (pending.descriptor.type === "finally") {
          sendResult(pending, "w+", {fields: {}})
          return
        }
        try {
          const fields = await executeProcessHandler(pending, pending.descriptor.success, processFields, {data})
          sendResult(pending, "w+", {fields})
        } catch (error) {
          sendResult(pending, "w-", {error: toError(error).message, fields: {}})
        }
      })
      .catch(async (thrown) => {
        const actionError = toError(thrown)
        if (pending.descriptor.type === "finally") {
          sendResult(pending, "w-", {error: actionError.message, fields: {}})
          return
        }
        try {
          const fields = await executeProcessHandler(pending, pending.descriptor.error, processFields, {error: actionError})
          sendResult(pending, "w-", {error: actionError.message, fields})
        } catch (handlerThrown) {
          sendResult(pending, "w-", {error: toError(handlerThrown).message, fields: {}})
        }
      })
      .finally(() => {
        if (pendingByActorId.get(actorId)?.execution === pending.execution) pendingByActorId.delete(actorId)
        if (runningExecutionByActorId.get(actorId) === pending.execution) runningExecutionByActorId.delete(actorId)
      })
  }

  return {
    close() {
      pendingByActorId.clear()
      runningExecutionByActorId.clear()
      if (ownsMassStore) massStore.clear?.()
      force.onImpulse = () => {}
    },
  }
}
