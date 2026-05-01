import type {FieldDefinition, FieldKey} from "../index.ts"
import type {MetaIdentifiers} from "@store/meta/sqlite"
import type {ActorRows, ActorValueRecord, AnyValue, ValueItemRecord, ValueRecord} from "@store/actor"
import type {Actor, ActorRecord} from "@store/actor"
import type {Store} from "../store/index.ts"
import type {MatterParticlePlan} from "@dark/types/dark"
import {emitAdd, emitBarrier} from "@dark/gravity/channel.ts"
import {loadMeta} from "./load.ts"
import {projectStoreMatterParticles} from "./matter.ts"
import {finalizeFieldValues, resolveFieldInits, type Continuation, type FieldInit} from "./continuation.ts"

export type ParticleRef = {kind: "actor"; uuid: string} | {kind: "topology"; uuid: string}

export interface MatterMaterializationStep {
  kind: "actor" | "topology"
  particle: ParticleRef
  /** Для `actor` — meta src; для topology — undefined. */
  src?: string
}

interface MatterOptions {
  store: Store
  onMaterializedStep?: (step: MatterMaterializationStep) => Promise<void> | void
  suppressGravityBarrier?: boolean
}

const nextPosition = (counter: Map<string, number>, parentKey: string): number => {
  const next = counter.get(parentKey) ?? 0
  counter.set(parentKey, next + 1)
  return next
}

/**
 * Извлекает raw runtime-значение из ORM Value (для snapshot и default-сравнения).
 */
const decodeValue = async (value: AnyValue, variantText: Map<string, string>): Promise<unknown> => {
  switch (value.kind) {
    case "null":
      return null
    case "boolean":
      return await value.boolean()
    case "number":
      return await value.number()
    case "string":
      return await value.text()
    case "enum": {
      const variantUuid = await value.variant()
      return variantText.get(variantUuid) ?? null
    }
    case "list": {
      const items = await value.items()
      return items.map((item) => item.itemValue)
    }
  }
}

const buildVariantTextMap = (identifiers: MetaIdentifiers): Map<string, string> => {
  const map = new Map<string, string>()
  for (const [, sub] of identifiers.variantUuids) {
    for (const [text, variantUuid] of sub) {
      map.set(variantUuid, text)
    }
  }
  return map
}

const buildValueRecord = (
  uuid: string,
  raw: unknown,
  fieldType: string,
  variantsByText: Map<string, string> | undefined,
  fieldKey: FieldKey,
): {record: ValueRecord; items: ValueItemRecord[]} => {
  if (raw === null || raw === undefined) return {record: {uuid, kind: "null"}, items: []}
  switch (fieldType) {
    case "boolean":
      return {record: {uuid, kind: "boolean", boolean: Boolean(raw)}, items: []}
    case "number":
      return {record: {uuid, kind: "number", number: Number(raw)}, items: []}
    case "string":
      return {record: {uuid, kind: "string", text: String(raw)}, items: []}
    case "enum": {
      const variantUuid = variantsByText?.get(String(raw))
      if (!variantUuid) {
        throw new Error(`Unknown enum variant "${String(raw)}" for field "${fieldKey}"`)
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
 * Резолвит value uuid поля родителя через store-чтение (для entanglement через shared row).
 * Делает 2 SQL запроса: head(actor) → meta.identifiers() → link.get → value.uuid.
 */
const resolveSourceValueUuid = async (
  parentActorUuid: string,
  parentFieldKey: FieldKey,
  store: Store,
): Promise<string> => {
  const head = await store.actor.head(parentActorUuid)
  if (!head) throw new Error(`parent actor ${parentActorUuid} not found`)
  const parentMeta = await store.meta.get(head.meta)
  if (!parentMeta) throw new Error(`parent meta ${head.meta} not found`)
  const parentIds = await parentMeta.identifiers()
  const parentFieldUuid = parentIds.fieldUuids.get(parentFieldKey)
  if (!parentFieldUuid) throw new Error(`parent field "${parentFieldKey}" missing in identifiers`)
  const link = await store.actor.link.get(parentActorUuid, parentFieldUuid)
  if (!link) throw new Error(`parent actor_value missing for (${parentActorUuid}, ${parentFieldKey})`)
  const value = await link.value()
  return value.uuid
}

/**
 * Строит `ActorRows` из готового набора финальных field values + identifiers.
 * Source-fields share value.uuid с родителем через store-чтение.
 */
const buildActorRows = async (params: {
  actorUuid: string
  parent: ParticleRef | null
  src: string
  position: number
  finalValues: Map<FieldKey, FieldInit>
  fieldSchemas: Record<FieldKey, FieldDefinition>
  identifiers: MetaIdentifiers
  store: Store
}): Promise<ActorRows> => {
  const {actorUuid, parent, src, position, finalValues, fieldSchemas, identifiers, store} = params
  const values: ActorValueRecord[] = []
  const valueRecords: ValueRecord[] = []
  const valueItems: ValueItemRecord[] = []

  for (const [key, init] of finalValues) {
    const fieldUuid = identifiers.fieldUuids.get(key)
    if (!fieldUuid) {
      throw new Error(`Field "${key}" is not registered in meta identifiers for "${src}"`)
    }
    const schema = fieldSchemas[key]
    if (!schema) throw new Error(`Field schema "${key}" missing in DSL for "${src}"`)

    let valueUuid: string
    if (init.source) {
      valueUuid = await resolveSourceValueUuid(init.source.parentActorUuid, init.source.parentFieldKey, store)
    } else {
      valueUuid = crypto.randomUUID()
      const variants = identifiers.variantUuids.get(key)
      const built = buildValueRecord(valueUuid, init.value, schema.type, variants, key)
      valueRecords.push(built.record)
      valueItems.push(...built.items)
    }
    values.push({actor: actorUuid, field: fieldUuid, value: valueUuid})
  }

  return {
    actor: {
      uuid: actorUuid,
      parentActor: parent?.kind === "actor" ? parent.uuid : null,
      parentTopology: parent?.kind === "topology" ? parent.uuid : null,
      meta: src,
      position,
    },
    values,
    valueRecords,
    valueItems,
    state: {actor: actorUuid, metaState: identifiers.initialState},
  }
}

interface BfsEntry {
  plan: MatterParticlePlan
  parent: ParticleRef
}

interface PendingChildWimp {
  src: string
  parent: ParticleRef
  continuation: Continuation
}

/**
 * Материализует одну мету: пишет actor row, обходит её топологический план (BFS),
 * создаёт topology rows для Fuzzy/Axion/Macho и рекурсивно входит в child wimp meta'ы.
 *
 * @returns uuid созданного actor.
 */
const materializeMeta = async (
  src: string,
  parent: ParticleRef | null,
  continuation: Continuation | undefined,
  options: MatterOptions,
  positionByParent: Map<string, number>,
): Promise<string> => {
  const identifiers = await loadMeta(src, options.store)
  const particleModel = await options.store.meta.readDarkParticleModel(src)
  if (!particleModel) {
    throw new Error(`Dark runtime meta "${src}" is not canonicalized in store after loadMeta`)
  }

  const fieldSchemas = particleModel.meta.fieldSchemas ?? {}
  const finalValues = finalizeFieldValues(fieldSchemas, continuation?.fieldInits)

  const actorUuid = crypto.randomUUID()
  const parentKey = parent?.uuid ?? "root"
  const position = nextPosition(positionByParent, parentKey)

  const rows = await buildActorRows({
    actorUuid,
    parent,
    src,
    position,
    finalValues,
    fieldSchemas,
    identifiers,
    store: options.store,
  })
  await options.store.actor.create(rows)
  emitAdd(actorUuid)

  await options.onMaterializedStep?.({kind: "actor", particle: {kind: "actor", uuid: actorUuid}, src})

  // Snapshot для построения continuation дочерних wimp.
  const fieldValuesSnapshot = new Map<FieldKey, unknown>()
  const fieldTypesSnapshot = new Map<FieldKey, string>()
  for (const [key, init] of finalValues) {
    fieldValuesSnapshot.set(key, init.value)
    fieldTypesSnapshot.set(key, fieldSchemas[key]!.type)
  }

  const plans = projectStoreMatterParticles(particleModel.particles)
  if (plans.length === 0) return actorUuid

  const pendingChildren: PendingChildWimp[] = []
  let frontier: BfsEntry[] = plans.map((plan) => ({plan, parent: {kind: "actor", uuid: actorUuid}}))

  while (frontier.length > 0) {
    const next: BfsEntry[] = []
    for (const entry of frontier) {
      switch (entry.plan.kind) {
        case "wimp": {
          const childContinuation: Continuation = {}
          if (entry.plan.fieldsBinding !== undefined) {
            const inits = resolveFieldInits(entry.plan.fieldsBinding, {
              actorUuid,
              fieldValues: fieldValuesSnapshot,
              fieldTypes: fieldTypesSnapshot,
            })
            if (inits) childContinuation.fieldInits = inits
          }
          if (entry.plan.massBinding !== undefined) {
            childContinuation.mass = entry.plan.massBinding
          }
          pendingChildren.push({src: entry.plan.src, parent: entry.parent, continuation: childContinuation})
          break
        }
        case "fuzzy":
        case "axion":
        case "macho": {
          const topologyUuid = crypto.randomUUID()
          const topologyPos = nextPosition(positionByParent, entry.parent.uuid)
          await options.store.topology.create({
            uuid: topologyUuid,
            parentActor: entry.parent.kind === "actor" ? entry.parent.uuid : null,
            parentTopology: entry.parent.kind === "topology" ? entry.parent.uuid : null,
            kind: entry.plan.kind,
            position: topologyPos,
          })
          await options.onMaterializedStep?.({
            kind: "topology",
            particle: {kind: "topology", uuid: topologyUuid},
          })
          for (const child of entry.plan.children ?? []) {
            next.push({plan: child, parent: {kind: "topology", uuid: topologyUuid}})
          }
          break
        }
      }
    }
    frontier = next
  }

  // Рекурсивно материализуем дочерние wimp meta после завершения BFS topology.
  for (const pending of pendingChildren) {
    await materializeMeta(pending.src, pending.parent, pending.continuation, options, positionByParent)
  }

  return actorUuid
}

/**
 * Публичный entrypoint Dark.
 *
 * Принимает канонический `src` меты, разворачивает её дерево через store ORM:
 * - канонизирует meta через `store.meta.create`,
 * - создаёт actor + topology rows через `store.actor.create` / `store.topology.create`,
 * - рекурсивно материализует дочерние wimp,
 * - один раз публикует gravity barrier на верхнем вызове.
 *
 * @returns корневой `Actor` ORM (для дальнейшего read-обхода через `actor.children`/`topology.childrenOfActor`).
 */
export async function matter(src: string, options: MatterOptions): Promise<Actor> {
  const positionByParent = new Map<string, number>()
  const rootUuid = await materializeMeta(src, null, undefined, options, positionByParent)

  if (options.suppressGravityBarrier !== true) emitBarrier()

  const root = await options.store.actor.get(rootUuid)
  if (!root) throw new Error(`Root actor ${rootUuid} missing after materialization`)
  return root
}

// Re-exports для consumers (типы)
export type {Continuation, FieldInit} from "./continuation.ts"
