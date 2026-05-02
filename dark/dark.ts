import type {FieldDefinition, FieldKey} from "../index.ts"
import type {AnyField, Wimp} from "@store/wimp/sqlite"
import type {ActorRows, ActorValueRecord, ValueItemRecord, ValueRecord} from "@store/actor"
import type {MatterParticlePlan} from "@dark/types/dark"
import {emitAdd} from "@dark/gravity/channel.ts"
import {projectStoreMatterParticles, fillGravityMatter} from "@dark/gravity"
import {fillStrongStructure} from "@dark/strong"
import {fillWeakDynamics} from "@dark/weak"
import {readWimpDsl} from "./dsl.ts"
import {finalizeFieldValues, resolveFieldInits, type Continuation, type FieldInit} from "./continuation.ts"

export type ParticleRef = {kind: "actor"; uuid: string} | {kind: "topology"; uuid: string}

export interface MatterMaterializationStep {
  kind: "actor" | "topology"
  particle: ParticleRef
  /** Для `actor` — wimp src; для topology — undefined. */
  src?: string
}

export interface MatterOptions {
  onMaterializedStep?: (step: MatterMaterializationStep) => Promise<void> | void
}

const buildValueRecord = async (
  uuid: string,
  raw: unknown,
  fieldType: string,
  field: AnyField,
  fieldKey: FieldKey,
): Promise<{record: ValueRecord; items: ValueItemRecord[]}> => {
  if (raw === null || raw === undefined) return {record: {uuid, kind: "null"}, items: []}
  switch (fieldType) {
    case "boolean":
      return {record: {uuid, kind: "boolean", boolean: Boolean(raw)}, items: []}
    case "number":
      return {record: {uuid, kind: "number", number: Number(raw)}, items: []}
    case "string":
      return {record: {uuid, kind: "string", text: String(raw)}, items: []}
    case "enum": {
      if (field.type !== "enum") throw new Error(`expected enum field for "${fieldKey}"`)
      const variantUuid = await field.variantUuid(String(raw))
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

const resolveSourceValueUuid = async (
  parentActorUuid: string,
  parentFieldKey: FieldKey,
): Promise<string> => {
  const head = await store.actor.head(parentActorUuid)
  if (!head) throw new Error(`parent actor ${parentActorUuid} not found`)
  const parentWimp = await store.wimp.get(head.wimp)
  if (!parentWimp) throw new Error(`parent wimp ${head.wimp} not found`)
  const parentField = await parentWimp.fields.get({key: parentFieldKey})
  if (!parentField) throw new Error(`parent field "${parentFieldKey}" missing in wimp ${head.wimp}`)
  const parentFieldUuid = await parentField.uuid()
  const link = await store.actor.link.get(parentActorUuid, parentFieldUuid)
  if (!link) throw new Error(`parent actor_value missing for (${parentActorUuid}, ${parentFieldKey})`)
  const value = await link.value()
  return value.uuid
}

const buildActorRows = async (params: {
  actorUuid: string
  parent: ParticleRef | null
  wimp: Wimp
  finalValues: Map<FieldKey, FieldInit>
  fieldSchemas: Record<FieldKey, FieldDefinition>
}): Promise<ActorRows> => {
  const {actorUuid, parent, wimp, finalValues, fieldSchemas} = params
  const src = wimp.src
  const values: ActorValueRecord[] = []
  const valueRecords: ValueRecord[] = []
  const valueItems: ValueItemRecord[] = []

  for (const [key, init] of finalValues) {
    const field = await wimp.fields.get({key})
    if (!field) throw new Error(`Field "${key}" is not registered for "${src}"`)
    const fieldUuid = await field.uuid()
    const schema = fieldSchemas[key]
    if (!schema) throw new Error(`Field schema "${key}" missing in DSL for "${src}"`)

    let valueUuid: string
    if (init.source) {
      valueUuid = await resolveSourceValueUuid(init.source.parentActorUuid, init.source.parentFieldKey)
    } else {
      valueUuid = crypto.randomUUID()
      const built = await buildValueRecord(valueUuid, init.value, schema.type, field, key)
      valueRecords.push(built.record)
      valueItems.push(...built.items)
    }
    values.push({actor: actorUuid, field: fieldUuid, value: valueUuid})
  }

  const initial = await wimp.superposition.initial()
  const initialState = initial ? await initial.uuid() : null

  return {
    actor: {
      uuid: actorUuid,
      parentActor: parent?.kind === "actor" ? parent.uuid : null,
      parentTopology: parent?.kind === "topology" ? parent.uuid : null,
      wimp: src,
    },
    values,
    valueRecords,
    valueItems,
    state: {actor: actorUuid, metaState: initialState},
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
 * Послойный проход одной wimp.
 *
 * Создаёт root actor, эмитит `kind: "actor"` step, затем BFS по plan-tree:
 * на каждой итерации обрабатывает все entries текущего фронтира — для topology-узлов
 * пишет row + emit, для wimp-узлов накапливает pending. По завершении слоя — yield-ит
 * накопленные pending child wimps наружу. Внешний оркестратор обязан рекурсивно
 * материализовать их перед `next()`, чтобы дочерние actors встали в БД до того,
 * как BFS перейдёт к следующему слою топологии.
 */
async function* matterWimp(
  wimp: Wimp,
  parent: ParticleRef | null,
  continuation: Continuation | undefined,
  options: MatterOptions,
): AsyncGenerator<PendingChildWimp[], void, void> {
  const src = wimp.src
  const dsl = await readWimpDsl(src)

  let matterRelations: Awaited<ReturnType<typeof fillGravityMatter>>
  if (await wimp.fields.exists()) {
    matterRelations = await wimp.matter.all()
  } else {
    await fillStrongStructure(wimp, dsl)
    await fillWeakDynamics(wimp, dsl)
    matterRelations = await fillGravityMatter(wimp, dsl)
  }

  const fieldSchemas = dsl.fields ?? {}
  const finalValues = finalizeFieldValues(fieldSchemas, continuation?.fieldInits)

  const actorUuid = crypto.randomUUID()

  const rows = await buildActorRows({
    actorUuid,
    parent,
    wimp,
    finalValues,
    fieldSchemas,
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

  const plans = projectStoreMatterParticles(matterRelations)
  if (plans.length === 0) return

  let frontier: BfsEntry[] = plans.map((plan) => ({plan, parent: {kind: "actor", uuid: actorUuid}}))

  while (frontier.length > 0) {
    const next: BfsEntry[] = []
    const layerPendingChildren: PendingChildWimp[] = []

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
          layerPendingChildren.push({src: entry.plan.src, parent: entry.parent, continuation: childContinuation})
          break
        }
        case "fuzzy":
        case "axion":
        case "macho": {
          const topologyUuid = crypto.randomUUID()
          await store.topology.create({
            uuid: topologyUuid,
            parentActor: entry.parent.kind === "actor" ? entry.parent.uuid : null,
            parentTopology: entry.parent.kind === "topology" ? entry.parent.uuid : null,
            kind: entry.plan.kind,
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

    yield layerPendingChildren
    frontier = next
  }
}

/**
 * Публичный entrypoint Dark.
 *
 * Использует `globalThis.store`, установленный в `dark/server.ts` либо в `dark/index.ts`.
 * Принимает уже созданный (минимальный) `Wimp` ORM и наполняет его доменными слоями
 * через тонкие fill-функции (strong/weak/gravity), затем разворачивает дерево через
 * store ORM: создаёт actor + topology rows, рекурсивно материализует дочерние wimps.
 *
 * Обход дерева — послойный: на каждом BFS-слое топологии родительской wimp сначала
 * создаются все topology-узлы слоя, затем рекурсивно материализуются child wimps этого
 * же слоя, и только потом обход переходит к следующему слою.
 *
 * `parent`/`continuation` — внутренние параметры рекурсии, caller'ам передавать не нужно.
 */
export async function matter(
  wimp: Wimp,
  options: MatterOptions = {},
  parent: ParticleRef | null = null,
  continuation: Continuation | undefined = undefined,
): Promise<void> {
  const generator = matterWimp(wimp, parent, continuation, options)

  while (true) {
    const result = await generator.next()
    if (result.done) return
    for (const pending of result.value) {
      let childWimp = await store.wimp.get(pending.src)
      if (!childWimp) childWimp = await store.wimp.create(pending.src)
      await matter(childWimp, options, pending.parent, pending.continuation)
    }
  }
}

export type {Continuation, FieldInit} from "./continuation.ts"
