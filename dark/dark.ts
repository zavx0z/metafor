import {MetaFor} from ".."
import type {Field} from "@boundary/wimp/sqlite/fields/field"
import type { ActorValueRecord, ValueItemRecord, ValueRecord } from "@metafor/types/boundary/value"
import type { BfsEntry, Continuation, MatterParticle, ParticleRef, PendingChildWimp } from "@metafor/types/metafor/matter"
import {Force} from "force"
import {loadMeta, loadMetaVersion} from "./load.ts"
import {dark$} from "./store.ts"
import {finalizeFieldValues, resolveFieldInits} from "./continuation.ts"

;(globalThis as unknown as {MetaFor: typeof MetaFor}).MetaFor = MetaFor

const force = new Force("dark")
force.onImpulse = async (impulse) => {
  for (const part of impulse.parts) {
    switch (part.part) {
      case "inflaton":
        switch (part.op) {
          case "test":
            if (typeof part.path === "string") {
              await matter(part.path)
            }
            break
        }
        break
    }
  }
}


export async function matter(
  src: string,
  parent: ParticleRef | null = null,
  continuation: Continuation | undefined = undefined,
): Promise<void> {
  const generator = matterWimp(src, parent, continuation)

  while (true) {
    const result = await generator.next()
    if (result.done) return
    for (const pending of result.value) {
      await matter(pending.src, pending.parent, pending.continuation)
    }
  }
}

async function* matterWimp(
  src: string,
  parent: ParticleRef | null,
  continuation: Continuation | undefined,
): AsyncGenerator<PendingChildWimp[], void, void> {
  const version = await loadMetaVersion(src)
  if (dark$.hasVersion(src, version)) return
  dark$.versions.set(src, version)
  const dsl = await loadMeta(src)
  force.impulse({
    parts: [{
      part: "inflaton",
      op: "add",
      path: src,
      value: {wimp: {src, version}},
    }],
  })
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
