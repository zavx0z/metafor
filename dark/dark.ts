import type {MatterContinuation, MatterEntry, MatterLayerResult, MatterParticlePlan, MatterWimpResult} from "@dark/types/dark"
import type {DarkParticle} from "@dark/types"
import type {MetaIdentifiers} from "@store/meta/sqlite"
import type {ActorRows, ActorValueRecord, ValueRecord, ValueItemRecord} from "@store/actor"
import type {Store} from "../store/index.ts"
import {emitAdd, emitBarrier} from "@dark/gravity/channel.ts"
import {Axion, Fuzzy, materializeFields, Macho, Meta, resolveWimpContinuation, Wimp} from "@dark/strong"
import type {InstanceField} from "@dark/strong/Field.ts"
import {loadMeta} from "./load.ts"
import {projectStoreMatterParticles} from "./matter.ts"

interface MatterOptions {
  store: Store
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
  store: Pick<Store, "meta">,
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

const resolveParentRef = (
  wimp: Wimp,
): {kind: "actor" | "topology"; uuid: string} | null => {
  const parent = wimp.parent
  if (!parent) return null
  if (parent instanceof Fuzzy || parent instanceof Macho || parent instanceof Axion) {
    return {kind: "topology", uuid: parent.id}
  }
  return {kind: "actor", uuid: parent.id}
}

/**
 * Резолвит value uuid поля родителя из БД. Используется при entanglement: дочерний `actor_value`
 * указывает на тот же `value.uuid`, что и родительский — share через FK.
 */
const resolveSourceValueUuid = async (
  source: InstanceField,
  store: Store,
): Promise<string> => {
  const parentMeta = await store.meta.get(source.owner.src)
  if (!parentMeta) throw new Error(`parent meta "${source.owner.src}" missing in store`)
  const parentIds = await parentMeta.identifiers()
  const parentFieldUuid = parentIds.fieldUuids.get(source.key)
  if (!parentFieldUuid) throw new Error(`parent field "${source.key}" missing in identifiers`)
  const link = await store.actor.link.get(source.owner.id, parentFieldUuid)
  if (!link) throw new Error(`parent actor_value missing for (${source.owner.id}, ${source.key})`)
  const value = await link.value()
  return value.uuid
}

/**
 * Кодирует runtime-значение `InstanceField` в `ValueRecord` для записи в `value` table.
 */
const buildValueRecord = (
  uuid: string,
  field: InstanceField,
  variantsByValue: Map<string, string> | undefined,
): {record: ValueRecord; items: ValueItemRecord[]} => {
  const raw = field.value
  if (raw === null || raw === undefined) return {record: {uuid, kind: "null"}, items: []}
  const fieldType: string = field.schema.type
  switch (fieldType) {
    case "boolean":
      return {record: {uuid, kind: "boolean", boolean: Boolean(raw)}, items: []}
    case "number":
      return {record: {uuid, kind: "number", number: Number(raw)}, items: []}
    case "string":
      return {record: {uuid, kind: "string", text: String(raw)}, items: []}
    case "enum": {
      const variantUuid = variantsByValue?.get(String(raw))
      if (!variantUuid) {
        throw new Error(`Unknown enum variant "${String(raw)}" for field "${field.key}"`)
      }
      return {record: {uuid, kind: "enum", variant: variantUuid}, items: []}
    }
    case "array": {
      const items: ValueItemRecord[] = Array.isArray(raw)
        ? raw.map((item, position) => ({value: uuid, position, itemValue: String(item)}))
        : []
      return {record: {uuid, kind: "list"}, items}
    }
  }
  throw new Error(`Unsupported field type for value emission: ${fieldType}`)
}

/**
 * Строит `ActorRows` для записи через `store.actor.create`.
 * Для полей с заданным `source` переиспользует value uuid родителя (entanglement через shared row).
 */
const buildActorRows = async (
  wimp: Wimp,
  position: number,
  identifiers: MetaIdentifiers,
  store: Store,
): Promise<ActorRows> => {
  if (!wimp.fields) throw new Error(`Wimp ${wimp.id} cannot be persisted: fields are not materialized`)

  const parent = resolveParentRef(wimp)
  const values: ActorValueRecord[] = []
  const valueRecords: ValueRecord[] = []
  const valueItems: ValueItemRecord[] = []

  for (const field of Object.values(wimp.fields)) {
    const fieldUuid = identifiers.fieldUuids.get(field.key)
    if (!fieldUuid) {
      throw new Error(`Field "${field.key}" is not registered in meta identifiers for "${wimp.src}"`)
    }
    let valueUuid: string
    if (field.source) {
      // entanglement: share parent's value.uuid
      valueUuid = await resolveSourceValueUuid(field.source, store)
    } else {
      valueUuid = crypto.randomUUID()
      const variants = identifiers.variantUuids.get(field.key)
      const built = buildValueRecord(valueUuid, field, variants)
      valueRecords.push(built.record)
      valueItems.push(...built.items)
    }
    values.push({actor: wimp.id, field: fieldUuid, value: valueUuid})
  }

  return {
    actor: {
      uuid: wimp.id,
      parentActor: parent?.kind === "actor" ? parent.uuid : null,
      parentTopology: parent?.kind === "topology" ? parent.uuid : null,
      meta: wimp.src,
      position,
    },
    values,
    valueRecords,
    valueItems,
    state: {actor: wimp.id, metaState: identifiers.initialState},
  }
}

const appendChildEntries = (frontier: MatterEntry[], plan: MatterParticlePlan, parent: DarkParticle): void => {
  if (!Array.isArray(plan.children) || plan.children.length === 0) return
  frontier.push(...plan.children.map((child) => ({plan: child, parent})))
}

const topologyParentRefOf = (parent: DarkParticle): {parentActor: string | null; parentTopology: string | null} => {
  if (parent instanceof Wimp) return {parentActor: parent.id, parentTopology: null}
  return {parentActor: null, parentTopology: parent.id}
}

/**
 * Обрабатывает узел текущего топологического слоя:
 * - для wimp — создаёт пустой `Wimp` и кладёт в результат для последующего материализующего прохода;
 * - для fuzzy/axion/macho — создаёт runtime-инстанс и записывает topology row через `store.topology.create`.
 */
const processMatterParticle = async (
  entry: MatterEntry,
  fields: Wimp["fields"],
  nextFrontier: MatterEntry[],
  wimps: MatterWimpResult[],
  store: Store,
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
      const parentRef = topologyParentRefOf(entry.parent)
      await store.topology.create({uuid: fuzzy.id, ...parentRef, kind: "fuzzy", position})
      appendChildEntries(nextFrontier, entry.plan, fuzzy)
      return
    }
    case "axion": {
      const axion = new Axion({parent: entry.parent})
      linkToParent(axion, entry.parent)
      const position = nextPosition(positionByParent, entry.parent.id)
      const parentRef = topologyParentRefOf(entry.parent)
      await store.topology.create({uuid: axion.id, ...parentRef, kind: "axion", position})
      appendChildEntries(nextFrontier, entry.plan, axion)
      return
    }
    case "macho": {
      const macho = new Macho({parent: entry.parent})
      linkToParent(macho, entry.parent)
      const position = nextPosition(positionByParent, entry.parent.id)
      const parentRef = topologyParentRefOf(entry.parent)
      await store.topology.create({uuid: macho.id, ...parentRef, kind: "macho", position})
      appendChildEntries(nextFrontier, entry.plan, macho)
      return
    }
  }
}

/**
 * Явный послойный проход одной меты. Yields массив pending дочерних wimp на каждом шаге BFS.
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
  const rows = await buildActorRows(wimp, position, runtimeMeta.identifiers, options.store)
  await options.store.actor.create(rows)
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
 * Публичный entrypoint Dark.
 *
 * - канонизирует мету через `store.meta.create`,
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
