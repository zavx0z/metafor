import {existsSync} from "node:fs"
import {dirname, isAbsolute, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type {EnergyHandlerDescriptor, EnergyProcessDescriptor} from "@metafor/types/energy/process"
import type {EnergyMassContext, EnergyMassStore} from "@metafor/types/energy/mass"
import type {EnergyProtocol, EnergyProtocolOptions} from "@metafor/types/energy/protocol"
import type {EnergyActionParams, PendingEnergyProcess} from "@metafor/types/energy/runtime"
import type {ProcessExecutionClaim, ProcessExecutionGrant, ProcessResultProposal} from "@metafor/types/force/execution"
import type {ForceMessage} from "@metafor/types/force/message"
import {
  REACTION_CLAIM_KIND,
  isReactionExecutionSignal,
  type ReactionExecutionClaim,
  type ReactionExecutionSignal,
  type ReactionResultProposal,
} from "@metafor/types/force/reaction"
import {Force} from "force"
import {EnergyCatalogStore} from "./catalog.ts"
import {executeReaction} from "./reaction.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseActorIdPath = (path: unknown): number | null =>
  typeof path === "number" && Number.isSafeInteger(path) && path > 0 ? path : null

const readEnergyId = (): string =>
  Bun.env.ENERGY_ID?.trim() || "energy-local"

const readRuntimeKind = (): string =>
  Bun.env.ENERGY_RUNTIME_KIND?.trim() || "server"

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
  const force = options.force ?? new Force("energy")
  const energyId = options.energyId ?? readEnergyId()
  const runtimeKind = options.runtimeKind ?? readRuntimeKind()
  const ownsMassStore = options.massStore === undefined
  const massStore = options.massStore ?? createInMemoryEnergyMassStore()
  const catalog = new EnergyCatalogStore()
  const pendingByActorId = new Map<number, PendingEnergyProcess>()
  const runningActorIds = new Set<number>()
  const pendingReactions = new Map<string, ReactionExecutionSignal>()
  const runningReactionIds = new Set<string>()

  const emitReactionProposal = (
    part: "w+" | "w-",
    signal: ReactionExecutionSignal,
    proposal: ReactionResultProposal,
  ): void => {
    force.impulse({parts: [{
      part,
      op: "replace",
      path: signal.target.actorId,
      from: energyId,
      value: proposal,
    }]})
  }

  force.onImpulse = (message: ForceMessage) => {
    const part = message.parts[0]
    if (part.part === "graviton") {
      const change = catalog.apply(part)
      for (const actorId of change.affectedActorIds) {
        const pending = pendingByActorId.get(actorId)
        if (!pending) continue
        const actorWimp = catalog.actorWimp(actorId)
        const process = actorWimp && catalog.process(actorWimp, pending.state)
        if (!process || process.descriptor !== pending.descriptor) pendingByActorId.delete(actorId)
      }
      return
    }

    switch (part.part) {
      case "photon": {
        if (part.op !== "test") break
        const actorId = parseActorIdPath(part.path)
        if (actorId === null) break

        if (isReactionExecutionSignal(part.value)) {
          const signal = part.value
          if (signal.target.actorId !== actorId || part.from !== signal.reactionExecutionId) break
          pendingReactions.set(signal.reactionExecutionId, structuredClone(signal))
          const claim: ReactionExecutionClaim = {
            kind: REACTION_CLAIM_KIND,
            energy: energyId,
            reactionExecutionId: signal.reactionExecutionId,
          }
          force.impulse({parts: [{part: "z", op: "test", path: actorId, value: claim}]})
          break
        }

        if (typeof part.value !== "string" || typeof part.from !== "string" || part.from.trim().length === 0) break
        const wimp = catalog.actorWimp(actorId)
        if (wimp === undefined) break
        const process = catalog.process(wimp, part.value)
        const descriptor = process?.descriptor
        if (!process || !descriptor || !canExecuteInRuntime(descriptor, runtimeKind)) break

        const pending: PendingEnergyProcess = {
          actorId,
          wimp,
          state: part.value,
          descriptor,
          processExecutionId: part.from,
          processId: process.id,
        }
        pendingByActorId.set(actorId, pending)
        const claim: ProcessExecutionClaim = {energy: energyId, processExecutionId: part.from}
        force.impulse({parts: [{part: "z", op: "test", path: actorId, value: claim}]})
        break
      }

      case "z": {
        if (part.op !== "copy") break
        const actorId = parseActorIdPath(part.path)
        if (actorId === null || part.from !== energyId) break

        if (isReactionExecutionSignal(part.value)) {
          const signal = part.value
          const pending = pendingReactions.get(signal.reactionExecutionId)
          if (!pending || pending.target.actorId !== actorId || runningReactionIds.has(signal.reactionExecutionId)) break
          runningReactionIds.add(signal.reactionExecutionId)
          void executeReaction(signal, energyId, massStore)
            .then((result) => {
              if (!result.matched) {
                emitReactionProposal("w-", signal, {
                  reactionExecutionId: signal.reactionExecutionId,
                  reactionId: signal.reactionId,
                  matched: false,
                  fields: {},
                })
                return
              }
              emitReactionProposal("w+", signal, {
                reactionExecutionId: signal.reactionExecutionId,
                reactionId: signal.reactionId,
                matched: true,
                fields: result.fields,
              })
            })
            .catch((thrown) => {
              emitReactionProposal("w-", signal, {
                reactionExecutionId: signal.reactionExecutionId,
                reactionId: signal.reactionId,
                matched: false,
                fields: {},
                error: toError(thrown).message,
              })
            })
            .finally(() => {
              pendingReactions.delete(signal.reactionExecutionId)
              runningReactionIds.delete(signal.reactionExecutionId)
            })
          break
        }

        if (!isRecord(part.value) || !isRecord(part.value.fields) || typeof part.value.processExecutionId !== "string") break
        const grant = part.value as unknown as ProcessExecutionGrant
        if (runningActorIds.has(actorId)) break
        const pending = pendingByActorId.get(actorId)
        if (!pending || pending.processExecutionId !== grant.processExecutionId) break

        runningActorIds.add(actorId)
        void executeProcess(pending, energyId, grant.fields, massStore)
          .then(async (data) => {
            if (pending.descriptor.type === "finally") {
              const proposal: ProcessResultProposal = {
                processExecutionId: pending.processExecutionId,
                processId: pending.processId,
                fields: {},
              }
              force.impulse({parts: [{part: "w+", op: "replace", path: actorId, from: energyId, value: proposal}]})
              return
            }
            let fields: Record<string, unknown>
            try {
              fields = await executeProcessHandler(pending, pending.descriptor.success, grant.fields, {data})
            } catch (error) {
              const proposal: ProcessResultProposal = {
                processExecutionId: pending.processExecutionId,
                processId: pending.processId,
                fields: {},
                error: toError(error).message,
              }
              force.impulse({parts: [{part: "w-", op: "replace", path: actorId, from: energyId, value: proposal}]})
              return
            }
            const proposal: ProcessResultProposal = {
              processExecutionId: pending.processExecutionId,
              processId: pending.processId,
              fields,
            }
            force.impulse({parts: [{part: "w+", op: "replace", path: actorId, from: energyId, value: proposal}]})
          })
          .catch(async (thrown) => {
            const actionError = toError(thrown)
            if (pending.descriptor.type === "finally") {
              const proposal: ProcessResultProposal = {
                processExecutionId: pending.processExecutionId,
                processId: pending.processId,
                fields: {},
                error: actionError.message,
              }
              force.impulse({parts: [{part: "w-", op: "replace", path: actorId, from: energyId, value: proposal}]})
              return
            }
            try {
              const fields = await executeProcessHandler(pending, pending.descriptor.error, grant.fields, {error: actionError})
              const proposal: ProcessResultProposal = {
                processExecutionId: pending.processExecutionId,
                processId: pending.processId,
                fields,
                error: actionError.message,
              }
              force.impulse({parts: [{part: "w-", op: "replace", path: actorId, from: energyId, value: proposal}]})
            } catch (handlerThrown) {
              const proposal: ProcessResultProposal = {
                processExecutionId: pending.processExecutionId,
                processId: pending.processId,
                fields: {},
                error: toError(handlerThrown).message,
              }
              force.impulse({parts: [{part: "w-", op: "replace", path: actorId, from: energyId, value: proposal}]})
            }
          })
          .finally(() => {
            pendingByActorId.delete(actorId)
            runningActorIds.delete(actorId)
          })
        break
      }
    }
  }

  return {
    close() {
      pendingByActorId.clear()
      runningActorIds.clear()
      pendingReactions.clear()
      runningReactionIds.clear()
      if (ownsMassStore) massStore.clear?.()
      force.onImpulse = () => {}
    },
  }
}
