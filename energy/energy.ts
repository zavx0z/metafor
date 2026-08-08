import {existsSync} from "node:fs"
import {dirname, isAbsolute, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type {EnergyAtomEntity} from "@metafor/types/energy/catalog"
import type {
  EnergyFinallyProcessDescriptor,
  EnergyHandlerDescriptor,
  EnergyProcessDescriptor,
} from "@metafor/types/energy/process"
import type {EnergyRuntimeContext, EnergyRuntimeStore} from "@metafor/types/energy/energy"
import type {EnergyMassContext, EnergyMassStore} from "@metafor/types/energy/mass"
import type {EnergyProtocol, EnergyProtocolOptions} from "@metafor/types/energy/protocol"
import type {EnergyActionParams, PendingEnergyProcess} from "@metafor/types/energy/runtime"
import type {MatterBindingValue} from "@metafor/types/metafor/matter"
import type {ProcessExecutionClaim, ProcessExecutionGrant, ProcessResultProposal} from "shared/protocol/force/execution"
import type {ForceMessage} from "shared/protocol/force/message"
import {
  REACTION_CLAIM_KIND,
  isReactionExecutionSignal,
  type ReactionExecutionClaim,
  type ReactionExecutionSignal,
  type ReactionResultProposal,
} from "shared/protocol/force/reaction"
import {EnergyCatalogStore} from "./catalog.ts"
import {createFilesystemEnergyMassStore} from "./mass.ts"
import {executeReaction} from "./reaction.ts"

export type StartEnergyProtocolOptions = Omit<EnergyProtocolOptions, "force"> & {
  /** ForceChannel born by the service layer only after initial hydration. */
  force: NonNullable<EnergyProtocolOptions["force"]>
  /** Pre-hydrated local catalog prepared by Energy Oracle before Force birth. */
  catalog: EnergyCatalogStore
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseAtomIdPath = (path: unknown): number | null =>
  typeof path === "number" && Number.isSafeInteger(path) && path > 0 ? path : null

const readEnergyId = (): string =>
  Bun.env.ENERGY_ID?.trim() || "energy-local"

const readRuntimeKind = (): string =>
  Bun.env.ENERGY_RUNTIME_KIND?.trim() || "server"

export function createInMemoryEnergyMassStore(): EnergyMassStore {
  const masses = new Map<string, Record<string, unknown>>()

  return {
    get(ctx: EnergyMassContext) {
      const key = `${ctx.wimp}\0${ctx.atomId}`
      let mass = masses.get(key)
      if (!mass) {
        mass = {}
        masses.set(key, mass)
      }
      return mass
    },
    bind(ctx, mass) {
      masses.set(`${ctx.wimp}\0${ctx.atomId}`, mass)
    },
    clear() {
      masses.clear()
    },
  }
}

export function createInMemoryEnergyRuntimeStore(): EnergyRuntimeStore {
  const entities = new Map<string, Record<string, unknown>>()
  const keyOf = (ctx: EnergyRuntimeContext): string => `${ctx.wimp}\0${ctx.atomId}`

  return {
    get(ctx) {
      const key = keyOf(ctx)
      let energy = entities.get(key)
      if (!energy) {
        energy = {}
        entities.set(key, energy)
      }
      return energy
    },
    bind(ctx, energy) {
      entities.set(keyOf(ctx), energy)
    },
    release(ctx) {
      entities.delete(keyOf(ctx))
    },
    clear() {
      entities.clear()
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
  const directMeta = resolve(root, "cluster", wimp, "meta.ts")
  const srcMeta = resolve(root, "cluster", wimp, "src", "meta.ts")
  if (existsSync(directMeta)) return dirname(directMeta)
  if (existsSync(srcMeta)) return dirname(srcMeta)
  return resolve(root, "cluster", wimp)
}

export const resolveActionImportSpecifier = (specifier: string, wimp: string): string => {
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

type RuntimeBindingScope = {
  mass: Record<string, unknown>
  energy: Record<string, unknown>
}

const readRuntimeBindingPath = (
  scope: RuntimeBindingScope,
  path: string,
  domain: "mass" | "energy",
): {ready: boolean; value?: unknown} => {
  const segments = path.replace(/^\/+/, "").split("/").filter(Boolean)
  if (segments.shift() !== domain || path.includes("[item]") || path.includes("[index]")) {
    throw new Error(`${domain} binding dependency must use /${domain}[/...]`)
  }
  let current: unknown = scope[domain]
  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) return {ready: false}
    current = (current as Record<string, unknown>)[segment]
  }
  return current === undefined ? {ready: false} : {ready: true, value: current}
}

const evaluateRuntimeBinding = (
  binding: MatterBindingValue,
  scope: RuntimeBindingScope,
  domain: "mass" | "energy",
): {ready: boolean; value?: Record<string, unknown>} => {
  if (domain === "mass") {
    if (typeof binding === "string") return {ready: false}
    const direct = binding.directMass
    if (direct?.kind === "whole") return {ready: true, value: scope.mass}
    if (direct?.kind !== "keys") return {ready: false}
    const value: Record<string, unknown> = {}
    for (const {target, source} of direct.entries) {
      const sourceValue = scope.mass[source]
      if (sourceValue === undefined) return {ready: false}
      value[target] = sourceValue
    }
    return {ready: true, value}
  }
  if (typeof binding === "string") {
    let value: unknown
    try {
      value = new Function(`"use strict"; return (${binding})`)() as unknown
    } catch {
      throw new Error(`${domain} static binding must be an object expression`)
    }
    if (!isRecord(value)) throw new Error(`${domain} binding must resolve to an object`)
    return {ready: true, value}
  }

  const paths = binding.data === undefined
    ? []
    : Array.isArray(binding.data) ? binding.data : [binding.data]
  const resolved = paths.map((path) => readRuntimeBindingPath(scope, path, domain))
  if (resolved.some((entry) => !entry.ready)) return {ready: false}
  const values = resolved.map((entry) => entry.value)
  const value = binding.expr === undefined
    ? values.length <= 1 ? values[0] : values
    : new Function("_", `"use strict"; return (${binding.expr})`)(values) as unknown
  if (!isRecord(value)) throw new Error(`${domain} binding must resolve to an object`)
  return {ready: true, value}
}

const runtimeContext = (
  energyId: string,
  atom: EnergyAtomEntity,
  state: string,
): EnergyRuntimeContext => ({energyId, atomId: atom.id, wimp: atom.wimp, state})

const hydrateRuntimeBindings = (
  atom: EnergyAtomEntity,
  state: string,
  energyId: string,
  catalog: EnergyCatalogStore,
  massStore: EnergyMassStore,
  energyStore: EnergyRuntimeStore,
  hydrated: Set<number>,
  massBound: Set<number>,
  energyBound: Set<number>,
  activeEnergy: Set<number>,
  hydratedStates: Map<number, string>,
  visiting: Set<number> = new Set(),
): boolean => {
  if (hydrated.has(atom.id)) return true
  if (visiting.has(atom.id)) throw new Error(`Matter runtime binding cycle at Atom ${atom.id}`)
  visiting.add(atom.id)

  const parent = catalog.parentAtom(atom.id)
  const continuation = catalog.continuation(atom.id)
  if (parent) {
    if (!hydrateRuntimeBindings(
      parent,
      state,
      energyId,
      catalog,
      massStore,
      energyStore,
      hydrated,
      massBound,
      energyBound,
      activeEnergy,
      hydratedStates,
      visiting,
    )) {
      visiting.delete(atom.id)
      return false
    }
  } else if (continuation?.massBinding !== undefined || continuation?.energyBinding !== undefined) {
    throw new Error(`Atom ${atom.id} has Matter bindings without a parent Atom`)
  }

  if (parent) {
    const parentContext = runtimeContext(energyId, parent, state)
    const childContext = runtimeContext(energyId, atom, state)
    const scope = {
      mass: massStore.get(parentContext),
      energy: energyStore.get(parentContext),
    }
    activeEnergy.add(parent.id)
    // Mass is a Boundary-authorized declared-key handle projection.  It is
    // never reconstructed by evaluating Matter expressions in Energy.
    const mass = continuation?.massBinding === undefined
      ? undefined
      : massStore.authorize !== undefined
        ? {ready: true, value: massStore.get(childContext)}
        : evaluateRuntimeBinding(continuation.massBinding, scope, "mass")
    const energy = continuation?.energyBinding === undefined
      ? undefined
      : evaluateRuntimeBinding(continuation.energyBinding, scope, "energy")
    if (mass?.ready === false || energy?.ready === false) {
      visiting.delete(atom.id)
      return false
    }
    if (mass?.value) {
      massStore.bind(childContext, mass.value)
      massBound.add(atom.id)
    } else if (massBound.delete(atom.id)) {
      massStore.bind(childContext, {})
    }
    if (energy?.value) {
      energyStore.bind(childContext, energy.value)
      energyBound.add(atom.id)
      activeEnergy.add(atom.id)
    } else if (energyBound.delete(atom.id)) {
      energyStore.bind(childContext, {})
      activeEnergy.add(atom.id)
    }
  }

  visiting.delete(atom.id)
  hydrated.add(atom.id)
  hydratedStates.set(atom.id, state)
  return true
}

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
  fields: Record<string, unknown>,
  catalog: EnergyCatalogStore,
  signal: AbortSignal,
  mass: Record<string, unknown>,
  energy: Record<string, unknown>,
): Promise<unknown> => {
  if (pending.descriptor.type === "finally") {
    return await executeFinally(pending.wimp, pending.descriptor, mass, energy, signal)
  }

  const params: EnergyActionParams = {
    field: catalog.fieldSchema(pending.wimp),
    value: buildActionValue(fields, pending.descriptor.action.readFields),
    mass,
    energy,
    signal,
    self: {
      atom: String(pending.atomId),
      meta: pending.wimp,
      path: String(pending.atomId),
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

const executeFinally = async (
  wimp: string,
  descriptor: EnergyFinallyProcessDescriptor,
  mass: Record<string, unknown>,
  energy: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> => {
  const fn = (0, eval)(`(${rewriteWrapperDynamicImports(descriptor.before.src, wimp)})`)
  if (typeof fn !== "function") throw new Error("Energy finally before did not evaluate to a function")
  return await fn({energy, mass, signal})
}

type RetiredAtomDestroy = {
  atomId: number
  wimp: string
  mass: Record<string, unknown>
  energy: Record<string, unknown>
  processes: Array<{state: string; descriptor: EnergyFinallyProcessDescriptor}>
}

export function startEnergyProtocol(options: StartEnergyProtocolOptions): EnergyProtocol {
  const force = options.force
  const energyId = options.energyId ?? readEnergyId()
  const runtimeKind = options.runtimeKind ?? readRuntimeKind()
  const ownsMassStore = options.massStore === undefined
  const massStore = options.massStore ?? createFilesystemEnergyMassStore()
  const ownsEnergyStore = options.energyStore === undefined
  const energyStore = options.energyStore ?? createInMemoryEnergyRuntimeStore()
  const catalog = options.catalog
  const hydratedBindingAtomIds = new Set<number>()
  const hydratedBindingStates = new Map<number, string>()
  const massBoundAtomIds = new Set<number>()
  const energyBoundAtomIds = new Set<number>()
  const activeEnergyAtomIds = new Set<number>()
  const pendingByAtomId = new Map<number, PendingEnergyProcess>()
  const runningByAtomId = new Map<number, {pending: PendingEnergyProcess; controller: AbortController}>()
  const pendingReactions = new Map<string, ReactionExecutionSignal>()
  const runningReactionIds = new Set<string>()
  const retiredDestroyControllers = new Set<AbortController>()
  const activeTasks = new Set<Promise<void>>()
  let retiredDestroyQueue = Promise.resolve()
  let closed = false

  const trackTask = (task: Promise<unknown>): void => {
    let tracked!: Promise<void>
    tracked = task.then(() => undefined, () => undefined).finally(() => {
      activeTasks.delete(tracked)
    })
    activeTasks.add(tracked)
  }

  const executeRetiredDestroy = async (retired: RetiredAtomDestroy): Promise<void> => {
    const controller = new AbortController()
    retiredDestroyControllers.add(controller)
    try {
      for (const process of retired.processes) {
        if (controller.signal.aborted) break
        try {
          await executeFinally(retired.wimp, process.descriptor, retired.mass, retired.energy, controller.signal)
        } catch (error) {
          console.error(
            `[energy] destroy failed atom=${retired.atomId} wimp=${retired.wimp} state=${process.state}: ${toError(error).message}`,
          )
        }
      }
    } finally {
      retiredDestroyControllers.delete(controller)
    }
  }

  const enqueueRetiredDestroy = (retired: RetiredAtomDestroy): void => {
    retiredDestroyQueue = retiredDestroyQueue.then(async () => {
      if (closed) return
      await executeRetiredDestroy(retired)
    })
  }

  const emitReactionProposal = (
    part: "w+" | "w-",
    signal: ReactionExecutionSignal,
    proposal: ReactionResultProposal,
  ): void => {
    force.impulse({parts: [{
      part,
      op: "replace",
      path: signal.target.atomId,
      ts: Date.now(),
      from: energyId,
      value: proposal,
    }]})
  }

  force.onImpulse = (message: ForceMessage) => {
    const part = message.parts[0]
    if (part.part === "graviton") {
      const affectedBefore = catalog.affectedAtomIds(part)
      const invalidatedBefore = catalog.invalidatedProcessAtomIds(part)
      const removedAtomIds = part.op === "remove" && typeof part.path === "string" &&
        /^(?:atom|topology)\/\d+$/.test(part.path.replace(/^\/+/, ""))
        ? affectedBefore
        : []
      const removedAtomIdSet = new Set(removedAtomIds)

      const previousBindings = new Map<number, {atom: EnergyAtomEntity; state: string}>()
      for (const atomId of hydratedBindingAtomIds) {
        const atom = catalog.atoms.get(atomId)
        const state = hydratedBindingStates.get(atomId)
        if (atom && state !== undefined) previousBindings.set(atomId, {atom: structuredClone(atom), state})
      }
      const retiredDestroys: RetiredAtomDestroy[] = []
      for (const atomId of removedAtomIds) {
        if (!activeEnergyAtomIds.has(atomId)) continue
        const previous = previousBindings.get(atomId)
        if (!previous) continue
        const processes = catalog.destroyProcesses(previous.atom.wimp)
          .filter((process) => process.descriptor.type === "finally" && canExecuteInRuntime(process.descriptor, runtimeKind))
          .map((process) => ({
            state: process.state,
            descriptor: process.descriptor as EnergyFinallyProcessDescriptor,
          }))
        if (processes.length === 0) continue
        const context = runtimeContext(energyId, previous.atom, previous.state)
        retiredDestroys.push({
          atomId,
          wimp: previous.atom.wimp,
          mass: massStore.get(context),
          energy: energyStore.get(context),
          processes,
        })
      }
      const change = catalog.apply(part)
      for (const atomId of change.affectedAtomIds) {
        const atom = catalog.atoms.get(atomId)
        if (atom) massStore.authorize?.(runtimeContext(energyId, atom, ""), catalog.mass(atomId))
      }
      if (!change.changed) return
      const affectedAtomIds = [...new Set([...affectedBefore, ...change.affectedAtomIds])]
      const invalidatedAtomIds = [...new Set([
        ...invalidatedBefore,
        ...catalog.invalidatedProcessAtomIds(part),
      ])]
      const retiredControllers: AbortController[] = []
      for (const atomId of invalidatedAtomIds) {
        pendingByAtomId.delete(atomId)
        const running = runningByAtomId.get(atomId)
        if (!running) continue
        runningByAtomId.delete(atomId)
        retiredControllers.push(running.controller)
      }
      if (removedAtomIdSet.size > 0) {
        for (const [reactionExecutionId, signal] of pendingReactions) {
          if (!removedAtomIdSet.has(signal.target.atomId)) continue
          pendingReactions.delete(reactionExecutionId)
          runningReactionIds.delete(reactionExecutionId)
        }
      }

      try {
        for (const atomId of affectedAtomIds) {
          const previous = previousBindings.get(atomId)
          hydratedBindingAtomIds.delete(atomId)
          hydratedBindingStates.delete(atomId)
          if (!previous) continue
          const previousContext = runtimeContext(energyId, previous.atom, previous.state)
          if (massBoundAtomIds.delete(atomId)) massStore.bind(previousContext, {})
          if (removedAtomIdSet.has(atomId)) {
            energyBoundAtomIds.delete(atomId)
            activeEnergyAtomIds.delete(atomId)
            energyStore.release(previousContext)
          } else if (energyBoundAtomIds.delete(atomId)) {
            energyStore.bind(previousContext, {})
            activeEnergyAtomIds.add(atomId)
          } else {
            activeEnergyAtomIds.delete(atomId)
            energyStore.release(previousContext)
          }
        }
        for (const atomId of affectedAtomIds) {
          const previous = previousBindings.get(atomId)
          const atom = catalog.atoms.get(atomId)
          if (!previous || !atom) continue
          hydrateRuntimeBindings(
            atom,
            previous.state,
            energyId,
            catalog,
            massStore,
            energyStore,
            hydratedBindingAtomIds,
            massBoundAtomIds,
            energyBoundAtomIds,
            activeEnergyAtomIds,
            hydratedBindingStates,
          )
        }
      } finally {
        for (const controller of retiredControllers) {
          controller.abort(new Error("Process execution detached by Energy rebuild"))
        }
      }
      for (const retired of retiredDestroys) enqueueRetiredDestroy(retired)
      return
    }

    switch (part.part) {
      case "photon": {
        if (part.op !== "test") break
        const atomId = parseAtomIdPath(part.path)
        if (atomId === null) break

        if (isReactionExecutionSignal(part.value)) {
          const signal = part.value
          if (signal.target.atomId !== atomId || part.from !== signal.reactionExecutionId) break
          pendingReactions.set(signal.reactionExecutionId, structuredClone(signal))
          const claim: ReactionExecutionClaim = {
            kind: REACTION_CLAIM_KIND,
            energy: energyId,
            reactionExecutionId: signal.reactionExecutionId,
          }
          force.impulse({parts: [{part: "z", op: "test", path: atomId, ts: Date.now(), value: claim}]})
          break
        }

        if (typeof part.value !== "string" || typeof part.from !== "string" || part.from.trim().length === 0) break
        const wimp = catalog.atomWimp(atomId)
        if (wimp === undefined) break
        const process = catalog.process(wimp, part.value)
        const descriptor = process?.descriptor
        if (!process || !descriptor || !canExecuteInRuntime(descriptor, runtimeKind)) break
        const atom = catalog.atoms.get(atomId)
        if (!atom || !hydrateRuntimeBindings(
          atom,
          part.value,
          energyId,
          catalog,
          massStore,
          energyStore,
          hydratedBindingAtomIds,
          massBoundAtomIds,
          energyBoundAtomIds,
          activeEnergyAtomIds,
          hydratedBindingStates,
        )) break

        const pending: PendingEnergyProcess = {
          atomId,
          wimp,
          state: part.value,
          descriptor: structuredClone(descriptor),
          processExecutionId: part.from,
          processId: process.id,
        }
        pendingByAtomId.set(atomId, pending)
        const claim: ProcessExecutionClaim = {energy: energyId, processExecutionId: part.from}
        force.impulse({parts: [{part: "z", op: "test", path: atomId, ts: Date.now(), value: claim}]})
        break
      }

      case "z": {
        if (part.op !== "copy") break
        const atomId = parseAtomIdPath(part.path)
        if (atomId === null || part.from !== energyId) break

        if (isReactionExecutionSignal(part.value)) {
          const signal = part.value
          const pending = pendingReactions.get(signal.reactionExecutionId)
          if (!pending || pending.target.atomId !== atomId || runningReactionIds.has(signal.reactionExecutionId)) break
          runningReactionIds.add(signal.reactionExecutionId)
          trackTask(executeReaction(signal, energyId, massStore)
            .then((result) => {
              if (!pendingReactions.has(signal.reactionExecutionId) || !runningReactionIds.has(signal.reactionExecutionId)) return
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
              if (!pendingReactions.has(signal.reactionExecutionId) || !runningReactionIds.has(signal.reactionExecutionId)) return
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
            }))
          break
        }

        if (!isRecord(part.value) || !isRecord(part.value.fields) || typeof part.value.processExecutionId !== "string") break
        const grant = part.value as unknown as ProcessExecutionGrant
        if (runningByAtomId.has(atomId)) break
        const pending = pendingByAtomId.get(atomId)
        if (!pending || pending.processExecutionId !== grant.processExecutionId) break

        const controller = new AbortController()
        runningByAtomId.set(atomId, {pending, controller})
        const context = {energyId, atomId: pending.atomId, wimp: pending.wimp, state: pending.state}
        const mass = massStore.get(context)
        const energy = energyStore.get(context)
        activeEnergyAtomIds.add(atomId)
        const isCurrent = (): boolean => {
          const running = runningByAtomId.get(atomId)
          return running?.pending.processExecutionId === pending.processExecutionId && !controller.signal.aborted
        }
        trackTask(executeProcess(pending, grant.fields, catalog, controller.signal, mass, energy)
          .then(async (data) => {
            if (!isCurrent()) return
            if (pending.descriptor.type === "finally") {
              const proposal: ProcessResultProposal = {
                processExecutionId: pending.processExecutionId,
                processId: pending.processId,
                fields: {},
              }
              if (!isCurrent()) return
              force.impulse({parts: [{part: "w+", op: "replace", path: atomId, ts: Date.now(), from: energyId, value: proposal}]})
              return
            }
            let fields: Record<string, unknown>
            try {
              fields = await executeProcessHandler(pending, pending.descriptor.success, grant.fields, {data})
            } catch (error) {
              if (!isCurrent()) return
              const proposal: ProcessResultProposal = {
                processExecutionId: pending.processExecutionId,
                processId: pending.processId,
                fields: {},
                error: toError(error).message,
              }
              force.impulse({parts: [{part: "w-", op: "replace", path: atomId, ts: Date.now(), from: energyId, value: proposal}]})
              return
            }
            const proposal: ProcessResultProposal = {
              processExecutionId: pending.processExecutionId,
              processId: pending.processId,
              fields,
            }
            if (!isCurrent()) return
            force.impulse({parts: [{part: "w+", op: "replace", path: atomId, ts: Date.now(), from: energyId, value: proposal}]})
          })
          .catch(async (thrown) => {
            if (!isCurrent()) return
            const actionError = toError(thrown)
            if (pending.descriptor.type === "finally") {
              const proposal: ProcessResultProposal = {
                processExecutionId: pending.processExecutionId,
                processId: pending.processId,
                fields: {},
                error: actionError.message,
              }
              if (!isCurrent()) return
              force.impulse({parts: [{part: "w-", op: "replace", path: atomId, ts: Date.now(), from: energyId, value: proposal}]})
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
              if (!isCurrent()) return
              force.impulse({parts: [{part: "w-", op: "replace", path: atomId, ts: Date.now(), from: energyId, value: proposal}]})
            } catch (handlerThrown) {
              if (!isCurrent()) return
              const proposal: ProcessResultProposal = {
                processExecutionId: pending.processExecutionId,
                processId: pending.processId,
                fields: {},
                error: toError(handlerThrown).message,
              }
              force.impulse({parts: [{part: "w-", op: "replace", path: atomId, ts: Date.now(), from: energyId, value: proposal}]})
            }
          })
          .finally(() => {
            const isStillCurrent = runningByAtomId.get(atomId)?.pending.processExecutionId === pending.processExecutionId
            if (pending.descriptor.type === "finally" && isStillCurrent) {
              energyStore.release(context)
              activeEnergyAtomIds.delete(atomId)
            }
            if (pendingByAtomId.get(atomId)?.processExecutionId === pending.processExecutionId) {
              pendingByAtomId.delete(atomId)
            }
            if (runningByAtomId.get(atomId)?.pending.processExecutionId === pending.processExecutionId) {
              runningByAtomId.delete(atomId)
            }
          }))
        break
      }
    }
  }

  return {
    async quiesce() {
      while (true) {
        const retired = retiredDestroyQueue
        const tasks = [...activeTasks]
        await Promise.all([retired, ...tasks])
        if (retired === retiredDestroyQueue && activeTasks.size === 0) return
      }
    },
    close() {
      closed = true
      for (const running of runningByAtomId.values()) running.controller.abort(new Error("Energy protocol closed"))
      pendingByAtomId.clear()
      runningByAtomId.clear()
      pendingReactions.clear()
      runningReactionIds.clear()
      for (const controller of retiredDestroyControllers) controller.abort(new Error("Energy protocol closed"))
      retiredDestroyControllers.clear()
      hydratedBindingAtomIds.clear()
      hydratedBindingStates.clear()
      massBoundAtomIds.clear()
      energyBoundAtomIds.clear()
      activeEnergyAtomIds.clear()
      if (ownsMassStore) massStore.clear?.()
      if (ownsEnergyStore) energyStore.clear?.()
      force.onImpulse = () => {}
    },
  }
}
