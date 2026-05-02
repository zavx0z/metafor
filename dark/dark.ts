import type {FieldDefinition, FieldKey} from "../index.ts"
import type {Meta, MetaIdentifiers} from "@store/meta/sqlite"
import type {ActorRows, ActorValueRecord, ValueItemRecord, ValueRecord, Actor} from "@store/actor"
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

export interface MatterOptions {
  onMaterializedStep?: (step: MatterMaterializationStep) => Promise<void> | void
  suppressGravityBarrier?: boolean
}

const nextPosition = (counter: Map<string, number>, parentKey: string): number => {
  const next = counter.get(parentKey) ?? 0
  counter.set(parentKey, next + 1)
  return next
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
 */
const resolveSourceValueUuid = async (
  parentActorUuid: string,
  parentFieldKey: FieldKey,
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

const buildActorRows = async (params: {
  actorUuid: string
  parent: ParticleRef | null
  src: string
  position: number
  finalValues: Map<FieldKey, FieldInit>
  fieldSchemas: Record<FieldKey, FieldDefinition>
  identifiers: MetaIdentifiers
}): Promise<ActorRows> => {
  const {actorUuid, parent, src, position, finalValues, fieldSchemas, identifiers} = params
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
      valueUuid = await resolveSourceValueUuid(init.source.parentActorUuid, init.source.parentFieldKey)
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

const materializeMeta = async (
  meta: Meta,
  parent: ParticleRef | null,
  continuation: Continuation | undefined,
  options: MatterOptions,
  positionByParent: Map<string, number>,
): Promise<string> => {
  const src = meta.src
  const identifiers = await meta.identifiers()
  const particleModel = await store.meta.readDarkParticleModel(src)
  if (!particleModel) {
    throw new Error(`Dark runtime meta "${src}" is not canonicalized in store`)
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
  })
  await store.actor.create(rows)
  emitAdd(actorUuid)

  await options.onMaterializedStep?.({kind: "actor", particle: {kind: "actor", uuid: actorUuid}, src})

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
          await store.topology.create({
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

  for (const pending of pendingChildren) {
    const childMeta = await loadMeta(pending.src)
    await materializeMeta(childMeta, pending.parent, pending.continuation, options, positionByParent)
  }

  return actorUuid
}

/**
 * Публичный entrypoint Dark.
 *
 * Использует `globalThis.store`, установленный в `dark/server.ts` либо в `dark/index.ts`.
 * Принимает уже канонизированный `Meta` ORM (получить через `loadMeta(src)`) и разворачивает дерево
 * через store ORM: создаёт actor + topology rows, рекурсивно материализует дочерние wimp meta.
 *
 * @returns корневой `Actor` ORM.
 */
export async function matter(meta: Meta, options: MatterOptions = {}): Promise<Actor> {
  const positionByParent = new Map<string, number>()
  const rootUuid = await materializeMeta(meta, null, undefined, options, positionByParent)

  if (options.suppressGravityBarrier !== true) emitBarrier()

  const root = await store.actor.get(rootUuid)
  if (!root) throw new Error(`Root actor ${rootUuid} missing after materialization`)
  return root
}

export type {Continuation, FieldInit} from "./continuation.ts"
