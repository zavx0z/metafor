import type {MatterContinuation, MatterEntry, MatterLayerResult, MatterParticlePlan, MatterWimpResult} from "@dark/types/dark"
import type {DarkParticle} from "@dark/types"
import type {Store} from "../store/index.ts"
import {emitAdd, emitBarrier} from "@dark/gravity/channel.ts"
import {Axion, Fuzzy, materializeFields, Macho, Meta, resolveWimpContinuation, Wimp} from "@dark/strong"
import {loadMeta} from "./load.ts"
import {projectStoreMatterParticles} from "./matter.ts"
import {dark$} from "./store.ts"
import {emitActorPatches} from "./patch/actor.ts"
import type {MetaIndex} from "./patch/meta.ts"

interface MatterOptions {
  store: Pick<Store, "meta" | "update">
  onMaterializedStep?: (step: MatterMaterializationStep) => Promise<void> | void
  suppressGravityBarrier?: boolean
  positionByParent?: Map<string, number>
}

interface RuntimeMetaMaterialization {
  meta: Meta
  particles: MatterParticlePlan[]
  index: MetaIndex
}

export interface MatterMaterializationStep {
  kind: "layer" | "root"
  layerWimps: MatterLayerResult
  wimp: Wimp
}

const cloneContinuation = (continuation: MatterContinuation): MatterContinuation => {
  const cloned: MatterContinuation = {}

  if (continuation.fieldInits !== undefined) {
    cloned.fieldInits = continuation.fieldInits.map((fieldInit) => {
      const nextFieldInit: typeof fieldInit = {
        key: fieldInit.key,
        value: structuredClone(fieldInit.value),
      }

      if (fieldInit.source !== undefined) nextFieldInit.source = fieldInit.source
      return nextFieldInit
    })
  }

  if (continuation.mass !== undefined) cloned.mass = structuredClone(continuation.mass)

  return cloned
}

const registerParticle = (particle: DarkParticle, parent: DarkParticle): void => {
  parent.children.add(particle)
  if (parent instanceof Fuzzy) parent.branch.set(particle, particle)
  dark$.particles.set(particle.id, particle)
}

const findMetaBySrc = (src: string): Meta | undefined => {
  for (const meta of dark$.meta.values()) {
    if (meta.src === src) return meta
  }
  return undefined
}

const registerMeta = (meta: Meta): Meta => {
  const existing = findMetaBySrc(meta.src)
  if (existing) return existing

  dark$.meta.set(meta.id, meta)
  for (const field of Object.values(meta.fields)) {
    dark$.fields.set(field.id, field)
  }

  return meta
}

const findParentWimpId = (wimp: Wimp): string | null => {
  let current = wimp.parent
  while (current) {
    if (current instanceof Wimp) return current.id
    current = current.parent
  }
  return null
}

const nextActorPosition = (counter: Map<string, number>, parentKey: string): number => {
  const next = counter.get(parentKey) ?? 0
  counter.set(parentKey, next + 1)
  return next
}

const readRuntimeMeta = async (
  src: string,
  store: Pick<Store, "meta" | "update">,
): Promise<RuntimeMetaMaterialization> => {
  const index = await loadMeta(src, store)
  const particleModel = await store.meta.readDarkParticleModel(src)
  if (!particleModel) {
    throw new Error(`Dark runtime meta "${src}" is not canonicalized in store after loadMeta`)
  }
  return {
    meta: new Meta(particleModel.meta),
    particles: projectStoreMatterParticles(particleModel.particles),
    index,
  }
}

const appendChildEntries = (frontier: MatterEntry[], plan: MatterParticlePlan, parent: DarkParticle): void => {
  if (!Array.isArray(plan.children) || plan.children.length === 0) return
  frontier.push(...plan.children.map((child) => ({plan: child, parent})))
}

const processMatterParticle = (
  entry: MatterEntry,
  fields: Wimp["fields"],
  nextFrontier: MatterEntry[],
  wimps: MatterWimpResult[],
): void => {
  switch (entry.plan.kind) {
    case "wimp": {
      const continuation = cloneContinuation(
        resolveWimpContinuation(
          {
            ...(entry.plan.fieldsBinding !== undefined ? {fieldsBinding: entry.plan.fieldsBinding} : {}),
            ...(entry.plan.massBinding !== undefined ? {massBinding: entry.plan.massBinding} : {}),
          },
          fields,
        ),
      )
      const wimp = new Wimp({src: entry.plan.src, parent: entry.parent})
      wimps.push([wimp, continuation])
      registerParticle(wimp, entry.parent)
      appendChildEntries(nextFrontier, entry.plan, wimp)
      return
    }
    case "fuzzy": {
      const fuzzy = new Fuzzy({parent: entry.parent})
      registerParticle(fuzzy, entry.parent)
      appendChildEntries(nextFrontier, entry.plan, fuzzy)
      return
    }
    case "axion": {
      const axion = new Axion({parent: entry.parent})
      registerParticle(axion, entry.parent)
      appendChildEntries(nextFrontier, entry.plan, axion)
      return
    }
    case "macho": {
      const macho = new Macho({parent: entry.parent})
      registerParticle(macho, entry.parent)
      appendChildEntries(nextFrontier, entry.plan, macho)
      return
    }
  }
}

/**
 * Явный послойный проход одной меты.
 *
 * На первом `next()` генератор инициализирует корневой `Wimp` и эмитит actor-патчи через store,
 * затем обрабатывает первый слой particle-plan и yield-ит только Wimp, обнаруженные на этом шаге.
 */
export async function* matterMeta(
  wimp: Wimp,
  continuation: MatterContinuation | undefined,
  options: MatterOptions,
): AsyncGenerator<MatterLayerResult, void> {
  const runtimeMeta = await readRuntimeMeta(wimp.src, options.store)
  const meta = registerMeta(runtimeMeta.meta)
  const positionByParent = options.positionByParent ?? new Map<string, number>()

  wimp.meta = meta
  wimp.fields = materializeFields(wimp, meta.fields, continuation?.fieldInits)
  wimp.mass = continuation?.mass
  dark$.particles.set(wimp.id, wimp)

  const parentKey = findParentWimpId(wimp) ?? "root"
  const position = nextActorPosition(positionByParent, parentKey)
  await emitActorPatches(wimp, {position, store: options.store, metaIndex: runtimeMeta.index})
  emitAdd(wimp.id)

  await options.onMaterializedStep?.({kind: "root", layerWimps: [], wimp})

  if (runtimeMeta.particles.length === 0) return

  let frontier = runtimeMeta.particles.map((plan): MatterEntry => ({plan, parent: wimp}))

  while (frontier.length > 0) {
    const currentLayer = frontier
    const nextFrontier: MatterEntry[] = []
    const levelWimps: MatterLayerResult = []

    frontier = nextFrontier

    for (const entry of currentLayer) {
      processMatterParticle(entry, wimp.fields, nextFrontier, levelWimps)
    }

    await options.onMaterializedStep?.({kind: "layer", layerWimps: levelWimps, wimp})
    yield levelWimps
  }
}

/**
 * Публичный entrypoint Dark.
 *
 * Owner outer orchestration:
 * - канонизирует мету через эмиттер graviton-патчей в `store.update`,
 * - вызывает single-meta `matterMeta()`,
 * - рекурсивно проходит дочерние Wimp,
 * - один раз публикует gravity barrier на верхнем вызове.
 */
export async function matter(
  wimp: Wimp,
  continuation: MatterContinuation | undefined,
  options: MatterOptions,
): Promise<void> {
  const shouldEmitGravityBarrier = options.suppressGravityBarrier !== true
  const positionByParent = options.positionByParent ?? new Map<string, number>()

  const generator = matterMeta(wimp, continuation, {...options, positionByParent})

  for await (const wimps of generator) {
    for (const [childWimp, childContinuation] of wimps) {
      await matter(childWimp, childContinuation, {
        ...options,
        positionByParent,
        suppressGravityBarrier: true,
      })
    }
  }

  if (shouldEmitGravityBarrier) {
    emitBarrier()
  }
}
