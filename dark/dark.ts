import {MetaFor, type FieldDefinition, type FieldKey, type SRC} from ".."
import type {AnyField} from "@store/wimp/sqlite"
import type {ActorValueRecord, ValueItemRecord, ValueRecord} from "@store/actor"
import type {BfsEntry, ParticleRef, PendingChildWimp} from "@dark/types/dark"
import {projectStoreMatterParticles, fillGravityMatter} from "@dark/gravity"
import {fillWeakDynamics} from "@dark/weak"
import {loadMeta} from "./load.ts"
import {finalizeFieldValues, resolveFieldInits, type Continuation} from "./continuation.ts"

;(globalThis as unknown as {MetaFor: typeof MetaFor}).MetaFor = MetaFor

store.onmessage = (event) => {
  for (const part of event.data.parts) {
    if (part.part !== "graviton") continue
    if (part.op !== "add") continue
    if (part.path.startsWith("/")) continue
    if (part.value !== undefined) continue
    void matter(part.path).catch(() => {})
  }
}

/**
 * Публичный entrypoint Dark.
 *
 * Использует `globalThis.store`, установленный в `dark/server.ts` либо в `dark/web.ts`.
 * Вызовы всегда передают только `SRC`; `Wimp` ORM создаётся внутри `matterWimp`,
 * затем наполняется доменными слоями через тонкие fill-функции (strong/weak/gravity)
 * и разворачивает дерево через store ORM: создаёт actor + topology rows,
 * рекурсивно материализует дочерние wimps.
 *
 * Внутренняя рекурсия тоже передаёт только `SRC`: если декларация уже есть,
 * `matter` выходит до `matterWimp`.
 *
 * Обход дерева — послойный: на каждом BFS-слое топологии родительской wimp сначала
 * создаются все topology-узлы слоя, затем рекурсивно материализуются child wimps этого
 * же слоя, и только потом обход переходит к следующему слою.
 *
 * `parent`/`continuation` — внутренние параметры рекурсии, caller'ам передавать не нужно.
 */
export async function matter(src: SRC): Promise<void>
export async function matter(
  src: SRC,
  parent: ParticleRef | null = null,
  continuation: Continuation | undefined = undefined,
): Promise<void> {
  if (await store.wimp.exists(src)) return

  const generator = matterWimp(src, parent, continuation)

  while (true) {
    const result = await generator.next()
    if (result.done) return
    for (const pending of result.value) {
      await matter(pending.src, pending.parent, pending.continuation)
    }
  }
}

/**
 * Послойный проход одной wimp.
 *
 * Создаёт root actor, эмитит actor part, затем BFS по plan-tree:
 * на каждой итерации обрабатывает все entries текущего фронтира — для topology-узлов
 * пишет row + emit, для wimp-узлов накапливает pending. По завершении слоя — yield-ит
 * накопленные pending child wimps наружу. Внешний оркестратор обязан рекурсивно
 * материализовать их перед `next()`, чтобы дочерние actors встали в БД до того,
 * как BFS перейдёт к следующему слою топологии.
 */
async function* matterWimp(
  src: SRC,
  parent: ParticleRef | null,
  continuation: Continuation | undefined,
): AsyncGenerator<PendingChildWimp[], void, void> {
  const dsl = await loadMeta(src)
  const wimp = await store.wimp.create(src, {
    name: dsl.name ?? null,
    desc: dsl.desc ?? null,
    bulk: dsl.bulk ?? null,
    mass: dsl.mass,
    fields: dsl.fields,
  })

  // WIMP: наполняем декларацию сущности в Store.
  await fillWeakDynamics(wimp, dsl)
  const matterRelations = await fillGravityMatter(wimp, dsl)

  // ACTOR: переходим от Wimp-декларации к runtime-экземпляру.
  // fieldSchemas — схема полей Wimp; finalValues — значения полей Actor.
  const fieldSchemas = dsl.fields ?? {}
  const finalValues = finalizeFieldValues(fieldSchemas, continuation?.fieldInits)

  const actorUuid = crypto.randomUUID()

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

  const initial = await wimp.states.initial()
  const initialState = initial ? await initial.uuid() : null
  const actorData = {
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
  await store.actor.create(actorData)

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

const buildValueRecord = async (
  uuid: string,
  raw: unknown,
  fieldType: string,
  field: AnyField,
  fieldKey: FieldKey,
): Promise<{ record: ValueRecord; items: ValueItemRecord[] }> => {
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

export type {Continuation, FieldInit} from "./continuation.ts"
