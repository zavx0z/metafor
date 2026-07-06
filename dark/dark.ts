import {MetaFor} from ".."
import type {Field} from "@boundary/wimp/sqlite/fields/field"
import type { ActorValueRecord, ValueItemRecord, ValueRecord } from "@metafor/types/boundary/value"
import type { ForceMessage } from "@metafor/types/force/message"
import type { BfsEntry, Continuation, MatterParticle, ParticleRef, PendingChildWimp } from "@metafor/types/metafor/matter"
import {Force} from "force"
import {loadMeta} from "./load.ts"
import {finalizeFieldValues, resolveFieldInits} from "./continuation.ts"

const force = new Force("dark")
force.onImpulse = async (impulse) => {
  for (const part of impulse.parts) {
    switch (part.part) {
      case "inflaton":
        switch (part.op) {
          case "test":
            if (part.path === "wimp" && typeof part.value === "string") {
              await matter(part.value)
            }
            break
        }
        break
    }
  }
}

;(globalThis as unknown as {MetaFor: typeof MetaFor}).MetaFor = MetaFor

let observedBoundary: typeof globalThis.boundary | null = null
let boundaryObserver: {close(): void} | null = null

export const ensureBoundaryObserver = (): void => {
  // const current = globalThis.boundary
  // if (!current) return
  // if (observedBoundary === current) return

  // boundaryObserver?.close()
  // observedBoundary = current
  // boundaryObserver = current.observe(async (event: MessageEvent<ForceMessage>) => {
  //   for (const part of event.data.parts) {
  //     if (part.part !== "inflaton") continue
  //     if (part.op !== "test") continue
  //     if (part.path !== "wimp") continue
  //     if (typeof part.value !== "string") continue
  //     if (await current.wimp.exists(part.value)) continue
  //     await matter(part.value)
  //   }
  // })
}

ensureBoundaryObserver()

/**
 * Публичный entrypoint Dark.
 *
 * Использует `globalThis.boundary`, установленный в `dark/server.ts` либо в `dark/web.ts`.
 * Вызовы всегда передают только `string`; `Wimp` ORM создаётся внутри `matterWimp`
 * уже с декларационными matter-связями и разворачивает дерево через boundary ORM: создаёт actor + topology rows,
 * рекурсивно материализует дочерние wimps.
 *
 * Внутренняя рекурсия тоже передаёт только `string`: декларация WIMP создаётся один раз,
 * а runtime actor пропускается только если такой WIMP уже стоит под тем же parent.
 *
 * Обход дерева — послойный: на каждом BFS-слое топологии родительской wimp сначала
 * создаются все topology-узлы слоя, затем рекурсивно материализуются child wimps этого
 * же слоя, и только потом обход переходит к следующему слою.
 *
 * `parent`/`continuation` — внутренние параметры рекурсии, caller'ам передавать не нужно.
 */
export async function matter(
  src: string,
  parent: ParticleRef | null = null,
  continuation: Continuation | undefined = undefined,
): Promise<void> {
  ensureBoundaryObserver()
  // if (await boundary.actor.findByParent({wimp: src, parent})) return
  return

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
 * Создаёт WIMP-декларацию с matter plan, root actor, эмитит actor part, затем BFS по plan-tree:
 * на каждой итерации обрабатывает все entries текущего фронтира — для topology-узлов
 * пишет topology particle, для wimp-узлов накапливает pending. По завершении слоя — yield-ит
 * накопленные pending child wimps наружу. Внешний оркестратор обязан рекурсивно
 * материализовать их перед `next()`, чтобы дочерние actors встали в БД до того,
 * как BFS перейдёт к следующему слою топологии.
 */
async function* matterWimp(
  src: string,
  parent: ParticleRef | null,
  continuation: Continuation | undefined,
): AsyncGenerator<PendingChildWimp[], void, void> {
  const dsl = await loadMeta(src)
  // const wimp = (await boundary.wimp.get(src)) ?? (await boundary.wimp.create(src, dsl))
  // const matterRelations = await wimp.matter.all()
  return

  // ACTOR: переходим от Wimp-декларации к runtime-экземпляру.
  // fieldSchemas — схема полей Wimp; finalValues — значения полей Actor.
  const fieldSchemas = dsl.fields ?? []
  const fieldSchemaByKey = new Map(fieldSchemas.map((field) => [field.key, field]))
  const finalValues = finalizeFieldValues(fieldSchemas, continuation?.fieldInits)

  let tempId = -1
  const nextTempId = (): number => tempId--
  const actorTempId = nextTempId()

  const values: ActorValueRecord[] = []
  const valueRecords: ValueRecord[] = []
  const valueItems: ValueItemRecord[] = []

  for (const [key, init] of finalValues) {
    // const field = await wimp.fields.get({key})
    // if (!field) throw new Error(`Field "${key}" is not registered for "${src}"`)
    // const fieldId = await field.id()
    const schema = fieldSchemaByKey.get(key)
    if (!schema) throw new Error(`Field schema "${key}" missing in DSL for "${src}"`)

    let valueId: number
    if (init.source) {
      // valueId = await resolveSourceValueId(init.source.parentActorId, init.source.parentFieldKey)
      valueId = nextTempId()
    } else {
      valueId = nextTempId()
      const built = await buildValueRecord(valueId, init.value, schema.type, null as never, key)
      valueRecords.push(built.record)
      valueItems.push(...built.items)
    }
    // values.push({actor: actorTempId, field: fieldId, value: valueId})
  }

  const actorData = {
    actor: {
      id: actorTempId,
      parentActor: parent?.kind === "actor" ? parent.id : null,
      parentTopology: parent?.kind === "topology" ? parent.id : null,
      wimp: src,
    },
    values,
    valueRecords,
    valueItems,
    state: {actor: actorTempId, metaState: null},
  }
  // const actor = await boundary.actor.create(actorData)
  // const actorId = actor.id
  const actorId = actorTempId

  const fieldValuesSnapshot = new Map<string, unknown>()
  const fieldTypesSnapshot = new Map<string, string>()
  for (const [key, init] of finalValues) {
    fieldValuesSnapshot.set(key, init.value)
    fieldTypesSnapshot.set(key, fieldSchemaByKey.get(key)!.type)
  }

  const plans: MatterParticle[] = []
  if (plans.length === 0) return

  let frontier: BfsEntry[] = plans.map((plan) => ({plan, parent: {kind: "actor", id: actorId}}))

  while (frontier.length > 0) {
    const next: BfsEntry[] = []
    const layerPendingChildren: PendingChildWimp[] = []

    for (const entry of frontier) {
      switch (entry.plan.kind) {
        case "wimp": {
          const childContinuation: Continuation = {}
          if (entry.plan.fieldsBinding !== undefined) {
            const inits = resolveFieldInits(entry.plan.fieldsBinding, {
              actorId: actorId,
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
          // const topology = await boundary.topology.create({
          //   parentActor: entry.parent.kind === "actor" ? entry.parent.id : null,
          //   parentTopology: entry.parent.kind === "topology" ? entry.parent.id : null,
          //   kind: entry.plan.kind,
          // })
          for (const child of entry.plan.children ?? []) {
            // next.push({plan: child.particle, parent: {kind: "topology", id: topology.id}})
            next.push({plan: child.particle, parent: entry.parent})
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
  id: number,
  raw: unknown,
  fieldType: string,
  field: Field,
  fieldKey: string,
): Promise<{ record: ValueRecord; items: ValueItemRecord[] }> => {
  if (raw === null || raw === undefined) return {record: {id, kind: "null"}, items: []}
  switch (fieldType) {
    case "boolean":
      return {record: {id, kind: "boolean", boolean: Boolean(raw)}, items: []}
    case "number":
      return {record: {id, kind: "number", number: Number(raw)}, items: []}
    case "string":
      return {record: {id, kind: "string", text: String(raw)}, items: []}
    case "enum": {
      if (field.type !== "enum") throw new Error(`expected enum field for "${fieldKey}"`)
      const variantId = await (field as unknown as {variantId(value: string): Promise<number | null>}).variantId(String(raw))
      if (!variantId) {
        throw new Error(`Unknown enum variant "${String(raw)}" for field "${fieldKey}"`)
      }
      return {record: {id, kind: "enum", variant: variantId}, items: []}
    }
    case "array": {
      const items: ValueItemRecord[] = Array.isArray(raw)
        ? raw.map((item, position) => ({value: id, position, itemValue: String(item)}))
        : []
      return {record: {id, kind: "list"}, items}
    }
  }
  throw new Error(`Unsupported field type for value emission: ${fieldType}`)
}

const resolveSourceValueId = async (
  parentActorId: number,
  parentFieldKey: string,
): Promise<number> => {
  // const head = await boundary.actor.head(parentActorId)
  // if (!head) throw new Error(`parent actor ${parentActorId} not found`)
  // const parentWimp = await boundary.wimp.get(head.wimp)
  // if (!parentWimp) throw new Error(`parent wimp ${head.wimp} not found`)
  // const parentField = await parentWimp.fields.get({key: parentFieldKey})
  // if (!parentField) throw new Error(`parent field "${parentFieldKey}" missing in wimp ${head.wimp}`)
  // const parentFieldId = await parentField.id()
  // const link = await boundary.actor.link.get(parentActorId, parentFieldId)
  // if (!link) throw new Error(`parent actor_value missing for (${parentActorId}, ${parentFieldKey})`)
  // const value = await link.value()
  // return value.id
  throw new Error(`Boundary is disabled in dark.resolveSourceValueId(${parentActorId}, ${parentFieldKey})`)
}
