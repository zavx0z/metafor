import type {MatterContinuation, MatterEntry, MatterLayerResult, MatterParticlePlan, MatterWimpResult} from "@dark/types/dark"
import type {DarkParticle} from "@dark/types"
import type {MetaIdentifiers} from "@store/meta/sqlite"
import type {Store} from "../store/index.ts"
import {emitAdd, emitBarrier} from "@dark/gravity/channel.ts"
import {Axion, Fuzzy, materializeFields, Macho, Meta, resolveWimpContinuation, Wimp} from "@dark/strong"
import {loadMeta} from "./load.ts"
import {projectStoreMatterParticles} from "./matter.ts"
import {emitActorPatches} from "./patch/actor.ts"
import {emitTopologyPatches} from "./patch/topology.ts"

interface MatterOptions {
  store: Pick<Store, "meta" | "update">
  onMaterializedStep?: (step: MatterMaterializationStep) => Promise<void> | void
  suppressGravityBarrier?: boolean
  positionByParent?: Map<string, number>
}

interface RuntimeMetaMaterialization {
  meta: Meta
  particles: MatterParticlePlan[]
  identifiers: MetaIdentifiers
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

/** Регистрирует только object-graph parent-child связь. Никаких глобальных Map'ов. */
const linkToParent = (particle: DarkParticle, parent: DarkParticle): void => {
  parent.children.add(particle)
  if (parent instanceof Fuzzy) parent.branch.set(particle, particle)
}

const nextPosition = (counter: Map<string, number>, parentKey: string): number => {
  const next = counter.get(parentKey) ?? 0
  counter.set(parentKey, next + 1)
  return next
}

const readRuntimeMeta = async (
  src: string,
  store: Pick<Store, "meta" | "update">,
): Promise<RuntimeMetaMaterialization> => {
  const identifiers = await loadMeta(src, store)
  const particleModel = await store.meta.readDarkParticleModel(src)
  if (!particleModel) {
    throw new Error(`Dark runtime meta "${src}" is not canonicalized in store after loadMeta`)
  }
  return {
    meta: new Meta(particleModel.meta),
    particles: projectStoreMatterParticles(particleModel.particles),
    identifiers,
  }
}

const appendChildEntries = (frontier: MatterEntry[], plan: MatterParticlePlan, parent: DarkParticle): void => {
  if (!Array.isArray(plan.children) || plan.children.length === 0) return
  frontier.push(...plan.children.map((child) => ({plan: child, parent})))
}

/**
 * Обрабатывает узел текущего топологического слоя:
 * - для wimp — создаёт пустой `Wimp` и кладёт в результат для последующего материализующего прохода;
 * - для fuzzy/axion/macho — создаёт runtime-инстанс, эмитит `/topology/<uuid>` graviton-патч в store.
 */
const processMatterParticle = async (
  entry: MatterEntry,
  fields: Wimp["fields"],
  nextFrontier: MatterEntry[],
  wimps: MatterWimpResult[],
  store: Pick<Store, "update">,
  positionByParent: Map<string, number>,
): Promise<void> => {
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
      linkToParent(wimp, entry.parent)
      appendChildEntries(nextFrontier, entry.plan, wimp)
      return
    }
    case "fuzzy": {
      const fuzzy = new Fuzzy({parent: entry.parent})
      linkToParent(fuzzy, entry.parent)
      const position = nextPosition(positionByParent, entry.parent.id)
      await emitTopologyPatches(fuzzy, {position, store})
      appendChildEntries(nextFrontier, entry.plan, fuzzy)
      return
    }
    case "axion": {
      const axion = new Axion({parent: entry.parent})
      linkToParent(axion, entry.parent)
      const position = nextPosition(positionByParent, entry.parent.id)
      await emitTopologyPatches(axion, {position, store})
      appendChildEntries(nextFrontier, entry.plan, axion)
      return
    }
    case "macho": {
      const macho = new Macho({parent: entry.parent})
      linkToParent(macho, entry.parent)
      const position = nextPosition(positionByParent, entry.parent.id)
      await emitTopologyPatches(macho, {position, store})
      appendChildEntries(nextFrontier, entry.plan, macho)
      return
    }
  }
}

/**
 * Явный послойный проход одной меты.
 *
 * На первом `next()` генератор инициализирует корневой `Wimp`, эмитит actor-патчи через store,
 * затем обрабатывает первый слой particle-plan и yield-ит только Wimp, обнаруженные на этом шаге.
 */
export async function* matterMeta(
  wimp: Wimp,
  continuation: MatterContinuation | undefined,
  options: MatterOptions,
): AsyncGenerator<MatterLayerResult, void> {
  const runtimeMeta = await readRuntimeMeta(wimp.src, options.store)
  const positionByParent = options.positionByParent ?? new Map<string, number>()

  wimp.meta = runtimeMeta.meta
  wimp.fields = materializeFields(wimp, runtimeMeta.meta.fields, continuation?.fieldInits)
  wimp.mass = continuation?.mass

  const parentKey = wimp.parent?.id ?? "root"
  const position = nextPosition(positionByParent, parentKey)
  await emitActorPatches(wimp, {position, store: options.store, identifiers: runtimeMeta.identifiers})
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
      await processMatterParticle(entry, wimp.fields, nextFrontier, levelWimps, options.store, positionByParent)
    }

    await options.onMaterializedStep?.({kind: "layer", layerWimps: levelWimps, wimp})
    yield levelWimps
  }
}

/**
 * Внутренний рекурсивный обход одной particle. Снаружи использовать `matter(src, options)`.
 */
async function materializeWimp(
  wimp: Wimp,
  continuation: MatterContinuation | undefined,
  options: MatterOptions,
): Promise<void> {
  const shouldEmitGravityBarrier = options.suppressGravityBarrier !== true
  const positionByParent = options.positionByParent ?? new Map<string, number>()

  const generator = matterMeta(wimp, continuation, {...options, positionByParent})

  for await (const wimps of generator) {
    for (const [childWimp, childContinuation] of wimps) {
      await materializeWimp(childWimp, childContinuation, {
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

/**
 * Публичный entrypoint Dark.
 *
 * Принимает канонический `src` меты, создаёт корневой `Wimp` и разворачивает её дерево:
 * - канонизирует мету через эмиттер graviton-патчей в `store.update`,
 * - рекурсивно материализует дочерние Wimp/Fuzzy/Axion/Macho,
 * - один раз публикует gravity barrier на верхнем вызове.
 *
 * @param src канонический адрес меты (например, `"zavx0z/git"`).
 * @param options содержит обязательный `store` и опциональные хуки наблюдения.
 * @returns корневой `Wimp` со всем object-graph дочерних particle (для traversal в тестах/наблюдении).
 */
export async function matter(src: string, options: MatterOptions): Promise<Wimp> {
  const root = new Wimp({src, parent: null})
  await materializeWimp(root, undefined, options)
  return root
}
