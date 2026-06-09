import {SQL, type ReservedSQL} from "bun"
import {StoreWimpSqlite} from "@store/wimp/sqlite"
import {StoreActorSqlite} from "@store/actor/sqlite"
import {StoreTopologySqlite} from "@store/topology/sqlite"

import type {Store} from "./index.ts"
import type {Part} from "../protocol.ts"

export type StorePart = Part

export type StorePatch =
  | {part: StorePart; op: "add" | "replace" | "test"; path: string; value?: unknown}
  | {part: StorePart; op: "remove"; path: string}
  | {part: StorePart; op: "move" | "copy"; from: string; path: string}

export type StoreUpdateMessage = {
  patches: StorePatch[]
}

type Tx = SQL | ReservedSQL

const decodeSegment = (segment: string): string => segment.replace(/~1/g, "/").replace(/~0/g, "~")

const splitPath = (path: string): string[] => {
  if (path === "") return []
  if (!path.startsWith("/")) throw new Error(`Patch path must start with "/": "${path}"`)
  return path.slice(1).split("/").map(decodeSegment)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const requireRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`Patch ${path} requires object value`)
  return value
}

const optionalString = (value: unknown, key: string, path: string): string | null => {
  const v = (value as Record<string, unknown>)[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "string") throw new Error(`Patch ${path}: "${key}" must be string`)
  return v
}

const optionalNumber = (value: unknown, key: string, path: string): number | null => {
  const v = (value as Record<string, unknown>)[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "number") throw new Error(`Patch ${path}: "${key}" must be number`)
  return v
}

const optionalBoolean = (value: unknown, key: string, path: string): boolean | null => {
  const v = (value as Record<string, unknown>)[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "boolean") throw new Error(`Patch ${path}: "${key}" must be boolean`)
  return v
}

const requireString = (value: unknown, key: string, path: string): string => {
  const v = optionalString(value, key, path)
  if (v === null) throw new Error(`Patch ${path}: "${key}" is required`)
  return v
}

const requireNumber = (value: unknown, key: string, path: string): number => {
  const v = optionalNumber(value, key, path)
  if (v === null) throw new Error(`Patch ${path}: "${key}" is required`)
  return v
}

const notSupported = (op: string, path: string, part: StorePart): never => {
  throw new Error(`Patch op "${op}" is not supported for "${path}" (part=${part})`)
}

// =============================================================================
// graviton — declaration + actor structural row
// =============================================================================

const applyWimpRow = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>
  const src = segs[1]!
  if (op === "remove") {
    await tx`DELETE FROM wimp WHERE src = ${src}`
    return
  }
  if (op === "add") {
    const v = requireRecord(value, `/wimp/${src}`)
    await tx`
      INSERT INTO wimp (src, name, desc, view_css)
      VALUES (${src}, ${optionalString(v, "name", `/wimp/${src}`)},
              ${optionalString(v, "desc", `/wimp/${src}`)}, ${optionalString(v, "view_css", `/wimp/${src}`)})
    `
    return
  }
  if (op === "replace") {
    const v = requireRecord(value, `/wimp/${src}`)
    await tx`
      UPDATE wimp
      SET name = ${optionalString(v, "name", `/wimp/${src}`)},
          desc = ${optionalString(v, "desc", `/wimp/${src}`)},
          view_css = ${optionalString(v, "view_css", `/wimp/${src}`)}
      WHERE src = ${src}
    `
    return
  }
  notSupported(op, `/wimp/${src}`, "graviton")
}

const applyWimpMass = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/mass/<uuid>
  const [, src, , uuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/mass/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM wimp_mass_value WHERE uuid = ${uuid} AND wimp = ${src}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  const parent = optionalString(v, "parent", path)
  const entryKey = optionalString(v, "key", path)
  const entryOrder = optionalNumber(v, "order", path)
  const kind = requireString(v, "kind", path)
  const text = optionalString(v, "text", path)
  const number = optionalNumber(v, "number", path)
  const boolean = optionalBoolean(v, "boolean", path)
  await tx`
    INSERT INTO wimp_mass_value
      (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
    VALUES (${uuid}, ${src}, ${parent}, ${kind}, ${entryKey}, ${entryOrder},
            ${text}, ${number}, ${boolean === null ? null : boolean ? 1 : 0})
  `
}

const applyField = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/field/<uuid>
  const [, src, , uuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/field/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM field WHERE uuid = ${uuid} AND wimp = ${src}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  const key = requireString(v, "key", path)
  const type = requireString(v, "type", path)
  const required = optionalBoolean(v, "required", path) ?? false
  const label = optionalString(v, "label", path)
  await tx`
    INSERT INTO field (uuid, wimp, key, type, required, label)
    VALUES (${uuid}, ${src}, ${key}, ${type}, ${required ? 1 : 0}, ${label})
  `
}

const applyFieldDefaultMarker = async (tx: Tx, op: string, segs: string[]): Promise<void> => {
  // /wimp/<src>/field/<uuid>/default
  const [, src, , fieldUuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/field/${fieldUuid}/default`
  if (op === "remove") {
    await tx`DELETE FROM field_default WHERE field = ${fieldUuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  await tx`INSERT INTO field_default (field) VALUES (${fieldUuid})`
}

const applyFieldDefaultScalar = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/field/<uuid>/default/scalar
  const [, src, , fieldUuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/field/${fieldUuid}/default/scalar`
  if (op === "remove") {
    await tx`DELETE FROM field_string_default WHERE field = ${fieldUuid}`
    await tx`DELETE FROM field_number_default WHERE field = ${fieldUuid}`
    await tx`DELETE FROM field_boolean_default WHERE field = ${fieldUuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  const kind = requireString(v, "kind", path)
  if (kind === "string") {
    await tx`INSERT INTO field_string_default (field, default_value) VALUES (${fieldUuid}, ${requireString(v, "text", path)})`
    return
  }
  if (kind === "number") {
    await tx`INSERT INTO field_number_default (field, default_value) VALUES (${fieldUuid}, ${requireNumber(v, "number", path)})`
    return
  }
  if (kind === "boolean") {
    const b = optionalBoolean(v, "boolean", path)
    if (b === null) throw new Error(`Patch ${path}: "boolean" is required`)
    await tx`INSERT INTO field_boolean_default (field, default_value) VALUES (${fieldUuid}, ${b ? 1 : 0})`
    return
  }
  throw new Error(`Patch ${path}: unknown scalar default kind "${kind}"`)
}

const applyFieldDefaultItem = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/field/<fieldUuid>/default/item/<itemUuid>
  const [, src, , fieldUuid, , , itemUuid] = segs as [string, string, string, string, string, string, string]
  const path = `/wimp/${src}/field/${fieldUuid}/default/item/${itemUuid}`
  if (op === "remove") {
    await tx`DELETE FROM field_array_default_item WHERE uuid = ${itemUuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO field_array_default_item (uuid, field, position, item_value)
    VALUES (${itemUuid}, ${fieldUuid}, ${requireNumber(v, "position", path)}, ${requireString(v, "text", path)})
  `
}

const applyFieldDefaultVariant = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/field/<fieldUuid>/default/variant
  const [, src, , fieldUuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/field/${fieldUuid}/default/variant`
  if (op === "remove") {
    await tx`DELETE FROM field_enum_default WHERE field = ${fieldUuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`INSERT INTO field_enum_default (field, variant) VALUES (${fieldUuid}, ${requireString(v, "variant", path)})`
}

const applyFieldEnumVariant = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/field/<fieldUuid>/variant/<variantUuid>
  const [, src, , fieldUuid, , variantUuid] = segs as [string, string, string, string, string, string]
  const path = `/wimp/${src}/field/${fieldUuid}/variant/${variantUuid}`
  if (op === "remove") {
    await tx`DELETE FROM field_enum_variant WHERE uuid = ${variantUuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO field_enum_variant (uuid, field, position, item_value)
    VALUES (${variantUuid}, ${fieldUuid}, ${requireNumber(v, "position", path)}, ${requireString(v, "item_value", path)})
  `
}

const applyState = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/state/<uuid>
  const [, src, , uuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/state/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM state WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO state (uuid, wimp, name, position)
    VALUES (${uuid}, ${src}, ${requireString(v, "name", path)}, ${requireNumber(v, "position", path)})
  `
}

const applyTransition = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/transition/<uuid>
  const [, src, , uuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/transition/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM transition WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO transition (uuid, from_state, to_state, position)
    VALUES (${uuid}, ${requireString(v, "from", path)}, ${requireString(v, "to", path)}, ${requireNumber(v, "position", path)})
  `
}

const applyCondition = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/transition/<transitionUuid>/condition/<uuid>
  const [, src, , transitionUuid, , uuid] = segs as [string, string, string, string, string, string]
  const path = `/wimp/${src}/transition/${transitionUuid}/condition/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM condition WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO condition (uuid, transition, field, position)
    VALUES (${uuid}, ${transitionUuid}, ${requireString(v, "field", path)}, ${requireNumber(v, "position", path)})
  `
}

const applyConditionPredicate = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/transition/<transitionUuid>/condition/<conditionUuid>/predicate/<uuid>
  const [, src, , transitionUuid, , conditionUuid, , uuid] = segs as [string, string, string, string, string, string, string, string]
  const path = `/wimp/${src}/transition/${transitionUuid}/condition/${conditionUuid}/predicate/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM condition_predicate WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  const valueBoolean = optionalBoolean(v, "value_boolean", path)
  await tx`
    INSERT INTO condition_predicate
      (uuid, condition, predicate_order, subject_kind, operator,
       value_kind, value_boolean, value_number, value_text, value_variant)
    VALUES (${uuid}, ${conditionUuid}, ${requireNumber(v, "predicate_order", path)},
            ${requireString(v, "subject_kind", path)}, ${requireString(v, "operator", path)},
            ${requireString(v, "value_kind", path)},
            ${valueBoolean === null ? null : valueBoolean ? 1 : 0},
            ${optionalNumber(v, "value_number", path)},
            ${optionalString(v, "value_text", path)},
            ${optionalString(v, "value_variant", path)})
  `
}

const applyConditionListItem = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/transition/<t>/condition/<c>/predicate/<p>/item/<order>
  const [, src, , transitionUuid, , conditionUuid, , predicateUuid, , orderRaw] = segs as [
    string, string, string, string, string, string, string, string, string, string,
  ]
  const order = Number(orderRaw)
  const path = `/wimp/${src}/transition/${transitionUuid}/condition/${conditionUuid}/predicate/${predicateUuid}/item/${order}`
  if (op === "remove") {
    await tx`DELETE FROM condition_list_item WHERE predicate = ${predicateUuid} AND item_order = ${order}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  const valueBoolean = optionalBoolean(v, "value_boolean", path)
  await tx`
    INSERT INTO condition_list_item
      (predicate, item_order, value_kind, value_boolean, value_number, value_text, value_variant)
    VALUES (${predicateUuid}, ${order}, ${requireString(v, "value_kind", path)},
            ${valueBoolean === null ? null : valueBoolean ? 1 : 0},
            ${optionalNumber(v, "value_number", path)},
            ${optionalString(v, "value_text", path)},
            ${optionalString(v, "value_variant", path)})
  `
}

const applyProcess = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/process/<uuid>
  const [, src, , uuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/process/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM process WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO process (uuid, wimp, key, type, label, desc)
    VALUES (${uuid}, ${src}, ${requireString(v, "key", path)}, ${requireString(v, "type", path)},
            ${optionalString(v, "label", path)}, ${optionalString(v, "desc", path)})
  `
}

const applyProcessEnv = async (tx: Tx, op: string, segs: string[]): Promise<void> => {
  // /wimp/<src>/process/<uuid>/env/<env>
  const [, src, , processUuid, , env] = segs as [string, string, string, string, string, string]
  const path = `/wimp/${src}/process/${processUuid}/env/${env}`
  if (op === "remove") {
    await tx`DELETE FROM process_env WHERE process = ${processUuid} AND env = ${env}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  await tx`INSERT INTO process_env (process, env) VALUES (${processUuid}, ${env})`
}

const applyProcessAction = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/process/<uuid>/action
  const [, src, , processUuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/process/${processUuid}/action`
  if (op === "remove") {
    await tx`DELETE FROM process_action WHERE process = ${processUuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO process_action (process, action, action_import_specifier, action_wrapper_src, success, error)
    VALUES (${processUuid}, ${requireString(v, "action", path)},
            ${optionalString(v, "importSpecifier", path)}, ${optionalString(v, "wrapperSrc", path)},
            ${optionalString(v, "success", path)}, ${optionalString(v, "error", path)})
  `
}

const applyProcessFinally = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/process/<uuid>/finally
  const [, src, , processUuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/process/${processUuid}/finally`
  if (op === "remove") {
    await tx`DELETE FROM process_finally WHERE process = ${processUuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`INSERT INTO process_finally (process, before) VALUES (${processUuid}, ${requireString(v, "before", path)})`
}

const applyProcessActionField = async (
  tx: Tx,
  op: string,
  segs: string[],
  table: "process_action_read" | "process_action_write",
): Promise<void> => {
  // /wimp/<src>/process/<uuid>/(read|write)/<phase>/<fieldUuid>
  const [, src, , processUuid, , phase, fieldUuid] = segs as [
    string, string, string, string, string, string, string,
  ]
  const path = `/wimp/${src}/process/${processUuid}/${table === "process_action_read" ? "read" : "write"}/${phase}/${fieldUuid}`
  if (op === "remove") {
    if (table === "process_action_read") {
      await tx`DELETE FROM process_action_read WHERE process = ${processUuid} AND phase = ${phase} AND field = ${fieldUuid}`
    } else {
      await tx`DELETE FROM process_action_write WHERE process = ${processUuid} AND phase = ${phase} AND field = ${fieldUuid}`
    }
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  if (table === "process_action_read") {
    await tx`INSERT INTO process_action_read (process, field, phase) VALUES (${processUuid}, ${fieldUuid}, ${phase})`
  } else {
    await tx`INSERT INTO process_action_write (process, field, phase) VALUES (${processUuid}, ${fieldUuid}, ${phase})`
  }
}

const applyProcessFinallyRead = async (tx: Tx, op: string, segs: string[]): Promise<void> => {
  // /wimp/<src>/process/<uuid>/finally-read/<fieldUuid>
  const [, src, , processUuid, , fieldUuid] = segs as [string, string, string, string, string, string]
  const path = `/wimp/${src}/process/${processUuid}/finally-read/${fieldUuid}`
  if (op === "remove") {
    await tx`DELETE FROM process_finally_read WHERE process = ${processUuid} AND field = ${fieldUuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  await tx`INSERT INTO process_finally_read (process, field) VALUES (${processUuid}, ${fieldUuid})`
}

const applyReaction = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/reaction/<uuid>
  const [, src, , uuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/reaction/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM reaction WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO reaction (uuid, wimp, key, label, desc, cond_source, update_source)
    VALUES (${uuid}, ${src}, ${requireString(v, "key", path)}, ${requireString(v, "label", path)},
            ${optionalString(v, "desc", path)}, ${requireString(v, "cond_source", path)},
            ${requireString(v, "update_source", path)})
  `
}

const applyReactionLink = async (
  tx: Tx,
  op: string,
  segs: string[],
  table: "reaction_state" | "reaction_read" | "reaction_write",
  rightCol: "state" | "field",
): Promise<void> => {
  // /wimp/<src>/reaction/<uuid>/(state|read|write)/<id>
  const [, src, , reactionUuid, slot, rightId] = segs as [string, string, string, string, string, string]
  const path = `/wimp/${src}/reaction/${reactionUuid}/${slot}/${rightId}`
  if (op === "remove") {
    if (table === "reaction_state") {
      await tx`DELETE FROM reaction_state WHERE reaction = ${reactionUuid} AND state = ${rightId}`
    } else if (table === "reaction_read") {
      await tx`DELETE FROM reaction_read WHERE reaction = ${reactionUuid} AND field = ${rightId}`
    } else {
      await tx`DELETE FROM reaction_write WHERE reaction = ${reactionUuid} AND field = ${rightId}`
    }
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  if (table === "reaction_state") {
    await tx`INSERT INTO reaction_state (reaction, state) VALUES (${reactionUuid}, ${rightId})`
  } else if (table === "reaction_read") {
    await tx`INSERT INTO reaction_read (reaction, field) VALUES (${reactionUuid}, ${rightId})`
  } else {
    await tx`INSERT INTO reaction_write (reaction, field) VALUES (${reactionUuid}, ${rightId})`
  }
  void rightCol // structural marker — column is selected by table
}

const applyMatterBinding = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/binding/<uuid>
  const [, src, , uuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/binding/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM matter_binding WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  const literalBoolean = optionalBoolean(v, "literal_boolean", path)
  await tx`
    INSERT INTO matter_binding (uuid, wimp, binding_kind, literal_kind, literal_text, literal_boolean, expr)
    VALUES (${uuid}, ${src}, ${requireString(v, "binding_kind", path)},
            ${optionalString(v, "literal_kind", path)},
            ${optionalString(v, "literal_text", path)},
            ${literalBoolean === null ? null : literalBoolean ? 1 : 0},
            ${optionalString(v, "expr", path)})
  `
}

const applyMatterBindingDep = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/binding/<bindingUuid>/dep/<order>
  const [, src, , bindingUuid, , orderRaw] = segs as [string, string, string, string, string, string]
  const order = Number(orderRaw)
  const path = `/wimp/${src}/binding/${bindingUuid}/dep/${order}`
  if (op === "remove") {
    await tx`DELETE FROM matter_binding_dep WHERE binding = ${bindingUuid} AND dep_order = ${order}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO matter_binding_dep (binding, dep_order, path)
    VALUES (${bindingUuid}, ${order}, ${requireString(v, "path", path)})
  `
}

const applyMatterParticle = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/particle/<uuid>
  const [, src, , uuid] = segs as [string, string, string, string]
  const path = `/wimp/${src}/particle/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM matter_particle WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  await tx`
    INSERT INTO matter_particle (uuid, wimp, parent_particle, particle_kind, edge_slot, particle_order)
    VALUES (${uuid}, ${src}, ${optionalString(v, "parent", path)},
            ${requireString(v, "particle_kind", path)}, ${requireString(v, "edge_slot", path)},
            ${requireNumber(v, "particle_order", path)})
  `
}

const applyMatterParticleKind = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /wimp/<src>/particle/<uuid>/(wimp|fuzzy|axion|macho)
  const [, src, , particleUuid, kind] = segs as [string, string, string, string, string]
  const path = `/wimp/${src}/particle/${particleUuid}/${kind}`
  if (op === "remove") {
    if (kind === "wimp") await tx`DELETE FROM matter_particle_wimp WHERE particle = ${particleUuid}`
    else if (kind === "fuzzy") await tx`DELETE FROM matter_particle_fuzzy WHERE particle = ${particleUuid}`
    else if (kind === "axion") await tx`DELETE FROM matter_particle_axion WHERE particle = ${particleUuid}`
    else if (kind === "macho") await tx`DELETE FROM matter_particle_macho WHERE particle = ${particleUuid}`
    else throw new Error(`Patch ${path}: unknown particle kind`)
    return
  }
  if (op !== "add") return notSupported(op, path, "graviton")
  const v = requireRecord(value, path)
  if (kind === "wimp") {
    await tx`
      INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding)
      VALUES (${particleUuid}, ${requireString(v, "src", path)},
              ${optionalString(v, "fields_binding", path)}, ${optionalString(v, "mass_binding", path)})
    `
    return
  }
  if (kind === "fuzzy") {
    await tx`
      INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
      VALUES (${particleUuid}, ${requireString(v, "fuzzy_kind", path)}, ${optionalString(v, "predicate_binding", path)})
    `
    return
  }
  if (kind === "axion") {
    await tx`
      INSERT INTO matter_particle_axion (particle, predicate_binding)
      VALUES (${particleUuid}, ${requireString(v, "predicate_binding", path)})
    `
    return
  }
  if (kind === "macho") {
    await tx`
      INSERT INTO matter_particle_macho (particle, collection_binding)
      VALUES (${particleUuid}, ${requireString(v, "collection_binding", path)})
    `
    return
  }
  throw new Error(`Patch ${path}: unknown particle kind "${kind}"`)
}

const applyActorRow = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /actor/<uuid>
  const uuid = segs[1]!
  const path = `/actor/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM actor WHERE uuid = ${uuid}`
    return
  }
  if (op === "add") {
    const v = requireRecord(value, path)
    await tx`
      INSERT INTO actor (uuid, parent_actor, parent_topology, wimp, position)
      VALUES (${uuid},
              ${optionalString(v, "parentActor", path)},
              ${optionalString(v, "parentTopology", path)},
              ${requireString(v, "wimp", path)},
              ${requireNumber(v, "position", path)})
    `
    return
  }
  if (op === "replace") {
    const v = requireRecord(value, path)
    await tx`
      UPDATE actor
      SET parent_actor = ${optionalString(v, "parentActor", path)},
          parent_topology = ${optionalString(v, "parentTopology", path)},
          wimp = ${requireString(v, "wimp", path)},
          position = ${requireNumber(v, "position", path)}
      WHERE uuid = ${uuid}
    `
    return
  }
  notSupported(op, path, "graviton")
}

const applyTopologyRow = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /topology/<uuid>
  const uuid = segs[1]!
  const path = `/topology/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM topology WHERE uuid = ${uuid}`
    return
  }
  if (op === "add") {
    const v = requireRecord(value, path)
    const kind = requireString(v, "kind", path)
    if (kind !== "fuzzy" && kind !== "axion" && kind !== "macho") {
      throw new Error(`Patch ${path}: unknown topology kind "${kind}"`)
    }
    await tx`
      INSERT INTO topology (uuid, parent_actor, parent_topology, kind, position)
      VALUES (${uuid},
              ${optionalString(v, "parentActor", path)},
              ${optionalString(v, "parentTopology", path)},
              ${kind},
              ${requireNumber(v, "position", path)})
    `
    return
  }
  notSupported(op, path, "graviton")
}

const applyGravitonPatch = async (tx: Tx, patch: StorePatch): Promise<void> => {
  if (patch.op === "test") return
  if (patch.op === "move" || patch.op === "copy") {
    throw new Error(`Patch op "${patch.op}" is not supported by graviton`)
  }
  const segs = splitPath(patch.path)
  const value = "value" in patch ? patch.value : undefined

  if (segs[0] === "actor") {
    if (segs.length === 2) return applyActorRow(tx, patch.op, segs, value)
    throw new Error(`Unknown graviton path: ${patch.path}`)
  }

  if (segs[0] === "topology") {
    if (segs.length === 2) return applyTopologyRow(tx, patch.op, segs, value)
    throw new Error(`Unknown graviton path: ${patch.path}`)
  }

  if (segs[0] !== "wimp") throw new Error(`Unknown graviton path: ${patch.path}`)

  if (segs.length === 2) return applyWimpRow(tx, patch.op, segs, value)
  if (segs.length === 4 && segs[2] === "mass") return applyWimpMass(tx, patch.op, segs, value)
  if (segs.length === 4 && segs[2] === "field") return applyField(tx, patch.op, segs, value)
  if (segs.length === 5 && segs[2] === "field" && segs[4] === "default")
    return applyFieldDefaultMarker(tx, patch.op, segs)
  if (segs.length === 6 && segs[2] === "field" && segs[4] === "default" && segs[5] === "scalar")
    return applyFieldDefaultScalar(tx, patch.op, segs, value)
  if (segs.length === 6 && segs[2] === "field" && segs[4] === "default" && segs[5] === "variant")
    return applyFieldDefaultVariant(tx, patch.op, segs, value)
  if (segs.length === 7 && segs[2] === "field" && segs[4] === "default" && segs[5] === "item")
    return applyFieldDefaultItem(tx, patch.op, segs, value)
  if (segs.length === 6 && segs[2] === "field" && segs[4] === "variant")
    return applyFieldEnumVariant(tx, patch.op, segs, value)
  if (segs.length === 4 && segs[2] === "state") return applyState(tx, patch.op, segs, value)
  if (segs.length === 4 && segs[2] === "transition") return applyTransition(tx, patch.op, segs, value)
  if (segs.length === 6 && segs[2] === "transition" && segs[4] === "condition")
    return applyCondition(tx, patch.op, segs, value)
  if (segs.length === 8 && segs[2] === "transition" && segs[4] === "condition" && segs[6] === "predicate")
    return applyConditionPredicate(tx, patch.op, segs, value)
  if (segs.length === 10 && segs[2] === "transition" && segs[4] === "condition" && segs[6] === "predicate" && segs[8] === "item")
    return applyConditionListItem(tx, patch.op, segs, value)
  if (segs.length === 4 && segs[2] === "process") return applyProcess(tx, patch.op, segs, value)
  if (segs.length === 6 && segs[2] === "process" && segs[4] === "env")
    return applyProcessEnv(tx, patch.op, segs)
  if (segs.length === 5 && segs[2] === "process" && segs[4] === "action")
    return applyProcessAction(tx, patch.op, segs, value)
  if (segs.length === 5 && segs[2] === "process" && segs[4] === "finally")
    return applyProcessFinally(tx, patch.op, segs, value)
  if (segs.length === 7 && segs[2] === "process" && segs[4] === "read")
    return applyProcessActionField(tx, patch.op, segs, "process_action_read")
  if (segs.length === 7 && segs[2] === "process" && segs[4] === "write")
    return applyProcessActionField(tx, patch.op, segs, "process_action_write")
  if (segs.length === 6 && segs[2] === "process" && segs[4] === "finally-read")
    return applyProcessFinallyRead(tx, patch.op, segs)
  if (segs.length === 4 && segs[2] === "reaction") return applyReaction(tx, patch.op, segs, value)
  if (segs.length === 6 && segs[2] === "reaction" && segs[4] === "state")
    return applyReactionLink(tx, patch.op, segs, "reaction_state", "state")
  if (segs.length === 6 && segs[2] === "reaction" && segs[4] === "read")
    return applyReactionLink(tx, patch.op, segs, "reaction_read", "field")
  if (segs.length === 6 && segs[2] === "reaction" && segs[4] === "write")
    return applyReactionLink(tx, patch.op, segs, "reaction_write", "field")
  if (segs.length === 4 && segs[2] === "binding") return applyMatterBinding(tx, patch.op, segs, value)
  if (segs.length === 6 && segs[2] === "binding" && segs[4] === "dep")
    return applyMatterBindingDep(tx, patch.op, segs, value)
  if (segs.length === 4 && segs[2] === "particle") return applyMatterParticle(tx, patch.op, segs, value)
  if (segs.length === 5 && segs[2] === "particle") return applyMatterParticleKind(tx, patch.op, segs, value)

  throw new Error(`Unknown graviton path: ${patch.path}`)
}

// =============================================================================
// gluon — value records, value items, actor↔value links
// =============================================================================

const writeValueScalar = async (tx: Tx, uuid: string, kind: string, v: Record<string, unknown>, path: string): Promise<void> => {
  switch (kind) {
    case "null":
    case "list":
      return
    case "boolean": {
      const b = optionalBoolean(v, "boolean", path)
      if (b === null) throw new Error(`Patch ${path}: "boolean" is required for kind=boolean`)
      await tx`INSERT INTO value_boolean (value, boolean) VALUES (${uuid}, ${b ? 1 : 0})`
      return
    }
    case "number":
      await tx`INSERT INTO value_number (value, number) VALUES (${uuid}, ${requireNumber(v, "number", path)})`
      return
    case "string":
      await tx`INSERT INTO value_string (value, text) VALUES (${uuid}, ${requireString(v, "text", path)})`
      return
    case "enum":
      await tx`INSERT INTO value_enum (value, variant) VALUES (${uuid}, ${requireString(v, "variant", path)})`
      return
    default:
      throw new Error(`Patch ${path}: unknown value kind "${kind}"`)
  }
}

const clearValueScalarTables = async (tx: Tx, uuid: string): Promise<void> => {
  await tx`DELETE FROM value_boolean WHERE value = ${uuid}`
  await tx`DELETE FROM value_number WHERE value = ${uuid}`
  await tx`DELETE FROM value_string WHERE value = ${uuid}`
  await tx`DELETE FROM value_enum WHERE value = ${uuid}`
}

const applyValueRow = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /value/<uuid>
  const uuid = segs[1]!
  const path = `/value/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM value WHERE uuid = ${uuid}`
    return
  }
  if (op === "add") {
    const v = requireRecord(value, path)
    const kind = requireString(v, "kind", path)
    await tx`INSERT INTO value (uuid, kind) VALUES (${uuid}, ${kind})`
    await writeValueScalar(tx, uuid, kind, v, path)
    return
  }
  if (op === "replace") {
    const v = requireRecord(value, path)
    const kind = requireString(v, "kind", path)
    await tx`UPDATE value SET kind = ${kind} WHERE uuid = ${uuid}`
    await clearValueScalarTables(tx, uuid)
    await writeValueScalar(tx, uuid, kind, v, path)
    return
  }
  notSupported(op, path, "gluon")
}

const applyValueItem = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /value/<uuid>/item/<position>
  const valueUuid = segs[1]!
  const position = Number(segs[3])
  const path = `/value/${valueUuid}/item/${position}`
  if (op === "remove") {
    await tx`DELETE FROM value_list_item WHERE value = ${valueUuid} AND position = ${position}`
    return
  }
  if (op === "add") {
    const v = requireRecord(value, path)
    await tx`
      INSERT INTO value_list_item (value, position, item_value)
      VALUES (${valueUuid}, ${position}, ${requireString(v, "text", path)})
    `
    return
  }
  if (op === "replace") {
    const v = requireRecord(value, path)
    await tx`UPDATE value_list_item SET item_value = ${requireString(v, "text", path)} WHERE value = ${valueUuid} AND position = ${position}`
    return
  }
  notSupported(op, path, "gluon")
}

const applyActorValue = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /actor/<actorUuid>/value/<fieldUuid>
  const actorUuid = segs[1]!
  const fieldUuid = segs[3]!
  const path = `/actor/${actorUuid}/value/${fieldUuid}`
  if (op === "remove") {
    await tx`DELETE FROM actor_value WHERE actor = ${actorUuid} AND field = ${fieldUuid}`
    return
  }
  const v = requireRecord(value, path)
  const valueUuid = requireString(v, "value", path)
  if (op === "add") {
    await tx`INSERT INTO actor_value (actor, field, value) VALUES (${actorUuid}, ${fieldUuid}, ${valueUuid})`
    return
  }
  if (op === "replace") {
    await tx`UPDATE actor_value SET value = ${valueUuid} WHERE actor = ${actorUuid} AND field = ${fieldUuid}`
    return
  }
  notSupported(op, path, "gluon")
}

const applyGluonPatch = async (tx: Tx, patch: StorePatch): Promise<void> => {
  if (patch.op === "test") return
  if (patch.op === "move" || patch.op === "copy") {
    throw new Error(`Patch op "${patch.op}" is not supported by gluon`)
  }
  const segs = splitPath(patch.path)
  const value = "value" in patch ? patch.value : undefined

  if (segs[0] === "value" && segs.length === 2) return applyValueRow(tx, patch.op, segs, value)
  if (segs[0] === "value" && segs.length === 4 && segs[2] === "item")
    return applyValueItem(tx, patch.op, segs, value)
  if (segs[0] === "actor" && segs.length === 4 && segs[2] === "value")
    return applyActorValue(tx, patch.op, segs, value)

  throw new Error(`Unknown gluon path: ${patch.path}`)
}

// =============================================================================
// photon — actor state
// =============================================================================

const applyActorState = async (tx: Tx, op: string, segs: string[], value: unknown): Promise<void> => {
  // /actor/<uuid>/state
  const actorUuid = segs[1]!
  const path = `/actor/${actorUuid}/state`
  if (op === "remove") {
    await tx`DELETE FROM actor_state WHERE actor = ${actorUuid}`
    return
  }
  const v = requireRecord(value, path)
  const metaState = optionalString(v, "metaState", path)
  if (op === "add") {
    await tx`INSERT INTO actor_state (actor, metaState) VALUES (${actorUuid}, ${metaState})`
    return
  }
  if (op === "replace") {
    await tx`
      INSERT INTO actor_state (actor, metaState) VALUES (${actorUuid}, ${metaState})
      ON CONFLICT (actor) DO UPDATE SET metaState = excluded.metaState
    `
    return
  }
  notSupported(op, path, "photon")
}

const applyPhotonPatch = async (tx: Tx, patch: StorePatch): Promise<void> => {
  if (patch.op === "test") return
  if (patch.op === "move" || patch.op === "copy") {
    throw new Error(`Patch op "${patch.op}" is not supported by photon`)
  }
  const segs = splitPath(patch.path)
  const value = "value" in patch ? patch.value : undefined

  if (segs[0] === "actor" && segs.length === 3 && segs[2] === "state")
    return applyActorState(tx, patch.op, segs, value)

  throw new Error(`Unknown photon path: ${patch.path}`)
}

// =============================================================================
// dispatcher
// =============================================================================

const applyOnePatch = async (tx: Tx, patch: StorePatch): Promise<void> => {
  switch (patch.part) {
    case "graviton":
      return applyGravitonPatch(tx, patch)
    case "gluon":
      return applyGluonPatch(tx, patch)
    case "photon":
      return applyPhotonPatch(tx, patch)
    case "higgs":
      throw new Error(`Patch part "higgs" is not implemented yet`)
    case "w":
      throw new Error(`Patch part "w" is not implemented yet`)
    case "-z":
      throw new Error(`Patch part "-z" is not implemented yet`)
    case "+z":
      throw new Error(`Patch part "+z" is not implemented yet`)
  }
}

const buildApplyMessage = (sql: SQL) => async (message: StoreUpdateMessage): Promise<void> => {
  if (message.patches.length === 0) return
  await sql.begin(async (tx) => {
    for (const patch of message.patches) {
      await applyOnePatch(tx, patch)
    }
  })
}

export const open = async (filename?: string): Promise<Store> => {
  const fileBacked = filename !== undefined && filename !== ":memory:"

  const sql = new SQL(fileBacked ? `sqlite://${filename}` : "sqlite::memory:")
  await sql.unsafe("PRAGMA foreign_keys = ON;")
  if (fileBacked) {
    await sql.unsafe("PRAGMA journal_mode = WAL;")
    await sql.unsafe("PRAGMA synchronous = NORMAL;")
    await sql.unsafe("PRAGMA busy_timeout = 5000;")
  }

  // ВАЖНО: topology поднимаем ДО actor — у actor есть FK parent_topology → topology(uuid).
  // SQLite позволяет создавать circular FK при foreign_keys=ON, но table-target должна
  // существовать к моменту первого INSERT.
  const topology = await StoreTopologySqlite.open(sql)
  const actor = await StoreActorSqlite.open(sql)

  return {
    wimp: await StoreWimpSqlite.open(sql),
    actor,
    topology,
    update: buildApplyMessage(sql),
    async close() {
      try {
        if (fileBacked) await sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE);")
        await sql.close()
      } catch {
        // ignore double-close
      }
    },
  }
}
