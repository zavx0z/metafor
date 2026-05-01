import type {MetaDSL, ParsedDestroy, ParsedProcess, ReactionsSchema} from "../../index.ts"
import type {MatterRelationParticle, MatterRelationChild, BindingValue} from "../../store/meta/sqlite/matter.t.ts"
import type {MetaIdentifiers} from "@store/meta/sqlite"
import {projectTemplateMatterRelations} from "../matter.ts"
import {emit as emitRaw, path, type Updater} from "./_common.ts"

/**
 * `MetaIdentifiers` нужен потребителям сразу после эмита (чтобы строить actor-патчи
 * без отдельного SQL-чтения). Поэтому собираем его inline в момент emit'а.
 */
type MetaIndex = MetaIdentifiers

const emit = (store: Updater, p: string, value: unknown): Promise<void> =>
  emitRaw(store, "graviton", p, value)

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

// =============================================================================
// mass
// =============================================================================

const emitMassNode = async (
  store: Updater,
  src: string,
  value: unknown,
  parent: string | null,
  entryKey: string | null,
  entryOrder: number | null,
): Promise<string> => {
  const uuid = crypto.randomUUID()
  const base: Record<string, unknown> = {kind: "null"}
  if (parent !== null) base.parent = parent
  if (entryKey !== null) base.key = entryKey
  if (entryOrder !== null) base.order = entryOrder

  if (Array.isArray(value)) {
    await emit(store, path("meta", src, "mass", uuid), {...base, kind: "array"})
    for (let i = 0; i < value.length; i++) {
      await emitMassNode(store, src, value[i], uuid, null, i)
    }
    return uuid
  }
  if (isRecord(value)) {
    await emit(store, path("meta", src, "mass", uuid), {...base, kind: "object"})
    for (const [k, v] of Object.entries(value)) {
      await emitMassNode(store, src, v, uuid, k, null)
    }
    return uuid
  }
  if (typeof value === "string") {
    await emit(store, path("meta", src, "mass", uuid), {...base, kind: "string", text: value})
    return uuid
  }
  if (typeof value === "number") {
    await emit(store, path("meta", src, "mass", uuid), {...base, kind: "number", number: value})
    return uuid
  }
  if (typeof value === "boolean") {
    await emit(store, path("meta", src, "mass", uuid), {...base, kind: "boolean", boolean: value})
    return uuid
  }
  await emit(store, path("meta", src, "mass", uuid), base)
  return uuid
}

// =============================================================================
// fields
// =============================================================================

const emitFields = async (store: Updater, src: string, dsl: MetaDSL, index: MetaIndex): Promise<void> => {
  for (const [key, def] of Object.entries(dsl.fields)) {
    const fieldUuid = crypto.randomUUID()
    index.fieldUuids.set(key, fieldUuid)

    await emit(store, path("meta", src, "field", fieldUuid), {
      key,
      type: def.type,
      ...(def.required === true ? {required: true} : {}),
      ...(def.label !== undefined ? {label: def.label} : {}),
    })

    if (def.type === "enum" && "values" in def && Array.isArray(def.values)) {
      const variantMap = new Map<string, string>()
      index.variantUuids.set(key, variantMap)
      const values = def.values as Array<string | number>
      for (let i = 0; i < values.length; i++) {
        const variantUuid = crypto.randomUUID()
        const itemValue = String(values[i])
        variantMap.set(itemValue, variantUuid)
        await emit(store, path("meta", src, "field", fieldUuid, "variant", variantUuid), {
          position: i,
          item_value: itemValue,
        })
      }
    }

    const hasDefault = "default" in def && (def as {default?: unknown}).default !== undefined
    if (!hasDefault) continue

    await emit(store, path("meta", src, "field", fieldUuid, "default"), {})
    const defValue = (def as {default: unknown}).default

    if (def.type === "string") {
      await emit(store, path("meta", src, "field", fieldUuid, "default", "scalar"), {
        kind: "string",
        text: String(defValue),
      })
    } else if (def.type === "number") {
      await emit(store, path("meta", src, "field", fieldUuid, "default", "scalar"), {
        kind: "number",
        number: Number(defValue),
      })
    } else if (def.type === "boolean") {
      await emit(store, path("meta", src, "field", fieldUuid, "default", "scalar"), {
        kind: "boolean",
        boolean: Boolean(defValue),
      })
    } else if (def.type === "array" && Array.isArray(defValue)) {
      for (let i = 0; i < defValue.length; i++) {
        const itemUuid = crypto.randomUUID()
        await emit(store, path("meta", src, "field", fieldUuid, "default", "item", itemUuid), {
          position: i,
          text: String(defValue[i]),
        })
      }
    } else if (def.type === "enum") {
      const variantUuid = index.variantUuids.get(key)?.get(String(defValue))
      if (variantUuid) {
        await emit(store, path("meta", src, "field", fieldUuid, "default", "variant"), {variant: variantUuid})
      }
    }
  }
}

// =============================================================================
// superposition + transition + condition + predicate
// =============================================================================

const normalizePredicate = (predicate: unknown): Record<string, unknown> | undefined => {
  if (predicate === null) return {null: true}
  if (typeof predicate === "boolean" || typeof predicate === "number" || typeof predicate === "string") {
    return {eq: predicate}
  }
  if (predicate && typeof predicate === "object") return predicate as Record<string, unknown>
  return undefined
}

const decodePredicateOperator = (op: string): {operator: string; value_kind?: string} => {
  if (op === "notEq") return {operator: "neq"}
  if (op === "null") return {operator: ""} // handled separately
  return {operator: op}
}

const emitSuperposition = async (store: Updater, src: string, dsl: MetaDSL, index: MetaIndex): Promise<void> => {
  const states = Object.keys(dsl.superposition ?? {})

  for (let i = 0; i < states.length; i++) {
    const name = states[i]!
    const uuid = crypto.randomUUID()
    index.superpositionUuids.set(name, uuid)
    if (i === 0) index.initialState = uuid
    await emit(store, path("meta", src, "superposition", uuid), {name, position: i})
  }

  for (const [fromName, transitions] of Object.entries(dsl.superposition ?? {})) {
    if (!transitions) continue
    const fromUuid = index.superpositionUuids.get(fromName)
    if (!fromUuid) continue

    let transitionPos = 0
    for (const [toName, cond] of Object.entries(transitions as Record<string, unknown>)) {
      const toUuid = index.superpositionUuids.get(toName)
      if (!toUuid) continue
      const transitionUuid = crypto.randomUUID()

      await emit(store, path("meta", src, "transition", transitionUuid), {
        from: fromUuid,
        to: toUuid,
        position: transitionPos++,
      })

      if (!cond || typeof cond !== "object") continue

      let condPos = 0
      for (const [fieldKey, predicate] of Object.entries(cond as Record<string, unknown>)) {
        const fieldUuid = index.fieldUuids.get(fieldKey)
        if (!fieldUuid) continue

        const condUuid = crypto.randomUUID()
        await emit(store, path("meta", src, "transition", transitionUuid, "condition", condUuid), {
          field: fieldUuid,
          position: condPos++,
        })

        const normalized = normalizePredicate(predicate)
        if (!normalized) continue

        let predOrder = 0
        for (const [op, val] of Object.entries(normalized)) {
          const predUuid = crypto.randomUUID()
          let operator = decodePredicateOperator(op).operator
          let valueKind = "null"
          let valueBoolean: boolean | null = null
          let valueNumber: number | null = null
          let valueText: string | null = null
          const valueVariant: string | null = null

          if (op === "null") {
            operator = val === false ? "neq" : "eq"
            valueKind = "null"
          } else if (typeof val === "boolean") {
            valueKind = "boolean"
            valueBoolean = val
          } else if (typeof val === "number") {
            valueKind = "number"
            valueNumber = val
          } else if (typeof val === "string") {
            valueKind = "string"
            valueText = val
          }

          await emit(
            store,
            path("meta", src, "transition", transitionUuid, "condition", condUuid, "predicate", predUuid),
            {
              predicate_order: predOrder++,
              subject_kind: "value",
              operator,
              value_kind: valueKind,
              ...(valueBoolean !== null ? {value_boolean: valueBoolean} : {}),
              ...(valueNumber !== null ? {value_number: valueNumber} : {}),
              ...(valueText !== null ? {value_text: valueText} : {}),
              ...(valueVariant !== null ? {value_variant: valueVariant} : {}),
            },
          )
        }
      }
    }
  }
}

// =============================================================================
// processes
// =============================================================================

const emitProcessReads = async (
  store: Updater,
  src: string,
  processUuid: string,
  phase: "action" | "success" | "error",
  fieldKeys: string[] | undefined,
  index: MetaIndex,
): Promise<void> => {
  for (const fk of fieldKeys ?? []) {
    const fieldUuid = index.fieldUuids.get(fk)
    if (!fieldUuid) continue
    await emit(store, path("meta", src, "process", processUuid, "read", phase, fieldUuid), {})
  }
}

const emitProcessWrites = async (
  store: Updater,
  src: string,
  processUuid: string,
  phase: "success" | "error",
  fieldKeys: string[] | undefined,
  index: MetaIndex,
): Promise<void> => {
  for (const fk of fieldKeys ?? []) {
    const fieldUuid = index.fieldUuids.get(fk)
    if (!fieldUuid) continue
    await emit(store, path("meta", src, "process", processUuid, "write", phase, fieldUuid), {})
  }
}

const emitProcesses = async (store: Updater, src: string, dsl: MetaDSL, index: MetaIndex): Promise<void> => {
  if (!dsl.processes) return

  for (const [key, p] of Object.entries(dsl.processes)) {
    const uuid = crypto.randomUUID()
    const process = p as ParsedProcess | ParsedDestroy

    await emit(store, path("meta", src, "process", uuid), {
      key,
      type: process.type || "action",
      ...(process.label !== undefined ? {label: process.label} : {}),
      ...(process.desc !== undefined ? {desc: process.desc} : {}),
    })

    if (process.env) {
      for (const env of process.env) {
        await emit(store, path("meta", src, "process", uuid, "env", env), {})
      }
    }

    if (process.type === "finally") {
      await emit(store, path("meta", src, "process", uuid, "finally"), {before: process.before.src})
      for (const fk of process.before.read ?? []) {
        const fieldUuid = index.fieldUuids.get(fk)
        if (!fieldUuid) continue
        await emit(store, path("meta", src, "process", uuid, "finally-read", fieldUuid), {})
      }
      continue
    }

    await emit(store, path("meta", src, "process", uuid, "action"), {
      action: process.action.src,
      ...(process.action.importSpecifier !== undefined ? {importSpecifier: process.action.importSpecifier} : {}),
      ...(process.action.wrapperSrc !== undefined ? {wrapperSrc: process.action.wrapperSrc} : {}),
      ...(process.success?.src !== undefined ? {success: process.success.src} : {}),
      ...(process.error?.src !== undefined ? {error: process.error.src} : {}),
    })

    await emitProcessReads(store, src, uuid, "action", process.action.read, index)
    await emitProcessReads(store, src, uuid, "success", process.success?.read, index)
    await emitProcessReads(store, src, uuid, "error", process.error?.read, index)
    await emitProcessWrites(store, src, uuid, "success", process.success?.write, index)
    await emitProcessWrites(store, src, uuid, "error", process.error?.write, index)
  }
}

// =============================================================================
// reactions
// =============================================================================

const emitReactions = async (store: Updater, src: string, dsl: MetaDSL, index: MetaIndex): Promise<void> => {
  if (!dsl.reactions) return
  const rs = dsl.reactions as ReactionsSchema

  for (const [id, r] of Object.entries(rs.reactions)) {
    const uuid = crypto.randomUUID()
    await emit(store, path("meta", src, "reaction", uuid), {
      key: id,
      label: r.label,
      ...(r.desc !== undefined ? {desc: r.desc} : {}),
      cond_source: r.cond,
      update_source: r.src,
    })

    for (const fk of r.read ?? []) {
      const fieldUuid = index.fieldUuids.get(fk)
      if (!fieldUuid) continue
      await emit(store, path("meta", src, "reaction", uuid, "read", fieldUuid), {})
    }
    for (const fk of r.write ?? []) {
      const fieldUuid = index.fieldUuids.get(fk)
      if (!fieldUuid) continue
      await emit(store, path("meta", src, "reaction", uuid, "write", fieldUuid), {})
    }

    for (const [stateName, reactionIds] of Object.entries(rs.superposition)) {
      if (!reactionIds.includes(id)) continue
      const stateUuid = index.superpositionUuids.get(stateName)
      if (!stateUuid) continue
      await emit(store, path("meta", src, "reaction", uuid, "superposition", stateUuid), {})
    }
  }
}

// =============================================================================
// matter — bindings (pass 1) + particles (pass 2)
// =============================================================================

const collectBindingsFromParticle = (particle: MatterRelationParticle, sink: BindingValue[]): void => {
  if (particle.kind === "wimp") {
    if (particle.fieldsBinding !== undefined) sink.push(particle.fieldsBinding)
    if (particle.massBinding !== undefined) sink.push(particle.massBinding)
  } else if (particle.kind === "fuzzy") {
    if (particle.predicateBinding !== undefined) sink.push(particle.predicateBinding)
  } else if (particle.kind === "axion") {
    sink.push(particle.predicateBinding)
  } else {
    sink.push(particle.collectionBinding)
  }
  for (const child of particle.children ?? []) collectBindingsFromParticle(child.particle, sink)
}

const toBindingPaths = (value: BindingValue): string[] => {
  if (typeof value === "string") return []
  if (value.data === undefined) return []
  return Array.isArray(value.data) ? value.data : [value.data]
}

const emitBinding = async (store: Updater, src: string, value: BindingValue): Promise<string> => {
  const uuid = crypto.randomUUID()
  if (typeof value === "string") {
    await emit(store, path("meta", src, "binding", uuid), {
      binding_kind: "static",
      literal_kind: "text",
      literal_text: value,
    })
    return uuid
  }
  if (value.expr !== undefined) {
    await emit(store, path("meta", src, "binding", uuid), {
      binding_kind: "dynamic",
      expr: value.expr,
    })
  } else {
    await emit(store, path("meta", src, "binding", uuid), {binding_kind: "variable"})
  }
  const paths = toBindingPaths(value)
  for (let i = 0; i < paths.length; i++) {
    await emit(store, path("meta", src, "binding", uuid, "dep", i), {path: paths[i]!})
  }
  return uuid
}

const emitParticleRow = async (
  store: Updater,
  src: string,
  parentUuid: string | null,
  particleKind: "wimp" | "fuzzy" | "axion" | "macho",
  edgeSlot: "root" | "child" | "then" | "else" | "branch",
  particleOrder: number,
): Promise<string> => {
  const uuid = crypto.randomUUID()
  await emit(store, path("meta", src, "particle", uuid), {
    ...(parentUuid !== null ? {parent: parentUuid} : {}),
    particle_kind: particleKind,
    edge_slot: edgeSlot,
    particle_order: particleOrder,
  })
  return uuid
}

const emitParticleAndChildren = async (
  store: Updater,
  src: string,
  particle: MatterRelationParticle,
  parentUuid: string | null,
  edgeSlot: "root" | "child" | "then" | "else" | "branch",
  particleOrder: number,
): Promise<void> => {
  if (particle.kind === "wimp") {
    const fieldsBinding =
      particle.fieldsBinding !== undefined ? await emitBinding(store, src, particle.fieldsBinding) : undefined
    const massBinding =
      particle.massBinding !== undefined ? await emitBinding(store, src, particle.massBinding) : undefined
    const particleUuid = await emitParticleRow(store, src, parentUuid, "wimp", edgeSlot, particleOrder)
    await emit(store, path("meta", src, "particle", particleUuid, "wimp"), {
      src: particle.src,
      ...(fieldsBinding !== undefined ? {fields_binding: fieldsBinding} : {}),
      ...(massBinding !== undefined ? {mass_binding: massBinding} : {}),
    })
    await emitParticleChildren(store, src, particle.children, particleUuid)
    return
  }

  if (particle.kind === "fuzzy") {
    const predicateBinding =
      particle.predicateBinding !== undefined ? await emitBinding(store, src, particle.predicateBinding) : undefined
    const particleUuid = await emitParticleRow(store, src, parentUuid, "fuzzy", edgeSlot, particleOrder)
    await emit(store, path("meta", src, "particle", particleUuid, "fuzzy"), {
      fuzzy_kind: particle.fuzzyKind,
      ...(predicateBinding !== undefined ? {predicate_binding: predicateBinding} : {}),
    })
    await emitParticleChildren(store, src, particle.children, particleUuid)
    return
  }

  if (particle.kind === "axion") {
    const predicateBinding = await emitBinding(store, src, particle.predicateBinding)
    const particleUuid = await emitParticleRow(store, src, parentUuid, "axion", edgeSlot, particleOrder)
    await emit(store, path("meta", src, "particle", particleUuid, "axion"), {
      predicate_binding: predicateBinding,
    })
    await emitParticleChildren(store, src, particle.children, particleUuid)
    return
  }

  const collectionBinding = await emitBinding(store, src, particle.collectionBinding)
  const particleUuid = await emitParticleRow(store, src, parentUuid, "macho", edgeSlot, particleOrder)
  await emit(store, path("meta", src, "particle", particleUuid, "macho"), {
    collection_binding: collectionBinding,
  })
  await emitParticleChildren(store, src, particle.children, particleUuid)
}

const emitParticleChildren = async (
  store: Updater,
  src: string,
  children: MatterRelationChild[] | undefined,
  parentUuid: string,
): Promise<void> => {
  if (!Array.isArray(children) || children.length === 0) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    await emitParticleAndChildren(store, src, child.particle, parentUuid, child.edgeSlot, i)
  }
}

const emitMatter = async (store: Updater, src: string, particles: MatterRelationParticle[]): Promise<void> => {
  for (let i = 0; i < particles.length; i++) {
    await emitParticleAndChildren(store, src, particles[i]!, null, "root", i)
  }
}

// =============================================================================
// public entry
// =============================================================================

export const emitMetaPatches = async (
  src: string,
  dsl: MetaDSL,
  store: Updater,
): Promise<MetaIndex> => {
  const index: MetaIndex = {
    src,
    fieldUuids: new Map(),
    variantUuids: new Map(),
    superpositionUuids: new Map(),
    initialState: null,
  }

  await emit(store, path("meta", src), {
    name: dsl.name,
    ...(dsl.desc !== undefined ? {desc: dsl.desc} : {}),
    ...(dsl.bulk?.view !== undefined ? {view_css: dsl.bulk.view} : {}),
  })

  if (dsl.mass !== undefined) {
    if (!isRecord(dsl.mass)) {
      throw new Error(`Meta mass for "${src}" must be an object to be stored in relational form`)
    }
    await emitMassNode(store, src, dsl.mass, null, null, null)
  }

  await emitFields(store, src, dsl, index)
  await emitSuperposition(store, src, dsl, index)
  await emitProcesses(store, src, dsl, index)
  await emitReactions(store, src, dsl, index)
  await emitMatter(store, src, projectTemplateMatterRelations(dsl))

  return index
}
