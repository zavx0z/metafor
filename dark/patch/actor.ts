import type {MetaIdentifiers} from "@store/meta/sqlite"
import type {Wimp} from "../strong/Wimp.ts"
import {Fuzzy, Macho, Axion} from "../strong"
import type {InstanceField} from "../strong/Field.ts"
import {emit, path, type Updater} from "./_common.ts"

/**
 * Возвращает дискриминированный ref на ближайшего непосредственного parent-particle.
 * `actor` означает «родитель — другой Wimp», `topology` — родитель — Fuzzy/Axion/Macho.
 */
const resolveParentRef = (wimp: Wimp): {kind: "actor" | "topology"; uuid: string} | null => {
  const parent = wimp.parent
  if (!parent) return null
  if (parent instanceof Fuzzy || parent instanceof Macho || parent instanceof Axion) {
    return {kind: "topology", uuid: parent.id}
  }
  // иначе считаем что родитель — Wimp (single non-topology kind в DarkParticle)
  return {kind: "actor", uuid: parent.id}
}

const emitValueRecord = async (
  store: Updater,
  valueUuid: string,
  field: InstanceField,
  variantsByValue: Map<string, string> | undefined,
): Promise<void> => {
  const raw = field.value
  if (raw === null || raw === undefined) {
    await emit(store, "gluon", path("value", valueUuid), {kind: "null"})
    return
  }
  const fieldType: string = field.schema.type
  switch (fieldType) {
    case "boolean":
      await emit(store, "gluon", path("value", valueUuid), {kind: "boolean", boolean: Boolean(raw)})
      return
    case "number":
      await emit(store, "gluon", path("value", valueUuid), {kind: "number", number: Number(raw)})
      return
    case "string":
      await emit(store, "gluon", path("value", valueUuid), {kind: "string", text: String(raw)})
      return
    case "enum": {
      const variantUuid = variantsByValue?.get(String(raw))
      if (!variantUuid) {
        throw new Error(`Unknown enum variant "${String(raw)}" for field "${field.key}"`)
      }
      await emit(store, "gluon", path("value", valueUuid), {kind: "enum", variant: variantUuid})
      return
    }
    case "array": {
      await emit(store, "gluon", path("value", valueUuid), {kind: "list"})
      if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
          await emit(store, "gluon", path("value", valueUuid, "item", i), {text: String(raw[i])})
        }
      }
      return
    }
  }
  throw new Error(`Unsupported field type for value emission: ${fieldType}`)
}

export interface ActorEmitContext {
  position: number
  store: Updater
  identifiers: MetaIdentifiers
}

export const emitActorPatches = async (wimp: Wimp, ctx: ActorEmitContext): Promise<void> => {
  if (!wimp.fields) {
    throw new Error(`Wimp ${wimp.id} cannot be emitted: fields are not materialized`)
  }
  if (ctx.identifiers.src !== wimp.src) {
    throw new Error(`Meta identifiers src "${ctx.identifiers.src}" does not match wimp src "${wimp.src}"`)
  }

  const parent = resolveParentRef(wimp)

  // 1. graviton: actor row
  await emit(ctx.store, "graviton", path("actor", wimp.id), {
    parentActor: parent?.kind === "actor" ? parent.uuid : null,
    parentTopology: parent?.kind === "topology" ? parent.uuid : null,
    meta: wimp.src,
    position: ctx.position,
  })

  // 2. gluon: value record + actor_value link для каждого поля
  for (const field of Object.values(wimp.fields)) {
    const fieldUuid = ctx.identifiers.fieldUuids.get(field.key)
    if (!fieldUuid) {
      throw new Error(`Field "${field.key}" is not registered in meta identifiers for "${wimp.src}"`)
    }
    const valueUuid = crypto.randomUUID()
    const variants = ctx.identifiers.variantUuids.get(field.key)
    await emitValueRecord(ctx.store, valueUuid, field, variants)
    await emit(ctx.store, "gluon", path("actor", wimp.id, "value", fieldUuid), {value: valueUuid})
  }

  // 3. photon: actor_state
  await emit(ctx.store, "photon", path("actor", wimp.id, "state"), {
    metaState: ctx.identifiers.initialState,
  })
}
