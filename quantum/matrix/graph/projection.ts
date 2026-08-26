/**
Локальная причинная проекция канонических сущностей Boundary.

Индексы позволяют определить только затронутые Atom, связанные значения и
WIMP. Проекция не вычисляет State и не заменяет Boundary как владельца мира.

@see [Локальное добавление и удаление Atom](https://github.com/zavx0z/metafor/blob/main/quantum/tests/graph/matrix-projection.spec.ts#L138-L188)

@packageDocumentation
*/

import type {
  BoundaryInitialAtom,
  BoundaryInitialDeclaration,
  BoundaryInitialState,
  BoundaryInitialVariantRef,
} from "shared/protocol/boundary/initial"
import type {MatrixRuntimeAtomEntity} from "@matrix/types/runtime"
import {
  resolveCanonicalForceFieldsPayload,
  resolveForceFieldsPayload,
} from "shared/protocol/force/fields"
import type {Particle} from "shared/protocol/force/particle"
import {REACTION_RELATION_PATH, isReactionRelation} from "shared/protocol/force/reaction"

type JsonRecord = Record<string, unknown>

const declarationSection = {
  field: "fields",
  variant: "variants",
  state: "states",
  transition: "transitions",
  condition: "conditions",
  process: "processes",
} as const satisfies Record<string, BoundaryInitialDeclaration["section"]>

let projection: BoundaryInitialState | null = null
let nextSyntheticValueId = -1
const atomById = new Map<number, BoundaryInitialAtom>()
const atomArrayIndexById = new Map<number, number>()
const atomIdsByWimp = new Map<string, Set<number>>()
const atomIdsByValueId = new Map<number, Set<number>>()
const declarationsBySrc = new Map<string, BoundaryInitialDeclaration[]>()
const declarationArrayIndexByKey = new Map<string, number>()
const enumFieldIds = new Set<number>()
const variantsByFieldId = new Map<number, Array<{id: number; value: unknown}>>()

/** Сводка локального влияния одной Particle на причинную проекцию Matrix. */
export type MatrixProjectionChange = {
  structural: boolean
  affectedAtomIds: number[]
  invalidatedProcessWimps: string[]
  invalidatedProcessAtomIds: number[]
}

const unchanged = (): MatrixProjectionChange => ({
  structural: false,
  affectedAtomIds: [],
  invalidatedProcessWimps: [],
  invalidatedProcessAtomIds: [],
})

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const clone = <T>(value: T): T => structuredClone(value)
const declarationKey = (src: string, section: BoundaryInitialDeclaration["section"], localId: string): string =>
  `${src}\0${section}\0${localId}`

const same = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => same(item, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => key in right && same(left[key], right[key]))
}

const requireProjection = (): BoundaryInitialState => {
  if (!projection) throw new Error("Matrix canonical projection is not hydrated")
  return projection
}

const isVariantRef = (value: unknown): value is BoundaryInitialVariantRef =>
  isRecord(value) && value.kind === "enum" && Number.isSafeInteger(value.variant)

const normalizeEnumValueRef = (fieldId: number, value: unknown): unknown => {
  if (value === null || isVariantRef(value)) return clone(value)
  const variant = (variantsByFieldId.get(fieldId) ?? []).find((candidate) => same(candidate.value, value))
  return variant ? {kind: "enum", variant: variant.id} satisfies BoundaryInitialVariantRef : clone(value)
}

const normalizeDeclarationVariantRefs = (declaration: BoundaryInitialDeclaration): void => {
  const fieldId = Number(declaration.value.id)
  if (
    declaration.section === "fields" && declaration.value.type === "enum" &&
    Number.isSafeInteger(fieldId) && Object.hasOwn(declaration.value, "default")
  ) declaration.value.default = normalizeEnumValueRef(fieldId, declaration.value.default)
  if (declaration.section !== "conditions") return
  const conditionFieldId = Number(declaration.value.field)
  if (!enumFieldIds.has(conditionFieldId) || !isRecord(declaration.value.predicate)) return
  declaration.value.predicate = Object.fromEntries(
    Object.entries(declaration.value.predicate).map(([operator, value]) => [
      operator,
      Array.isArray(value)
        ? value.map((item) => normalizeEnumValueRef(conditionFieldId, item))
        : normalizeEnumValueRef(conditionFieldId, value),
    ]),
  )
}

const rebuildVariantIndexes = (): void => {
  enumFieldIds.clear()
  variantsByFieldId.clear()
  for (const declaration of requireProjection().declarations) {
    if (declaration.section === "fields" && declaration.value.type === "enum") {
      const fieldId = Number(declaration.value.id)
      if (Number.isSafeInteger(fieldId)) enumFieldIds.add(fieldId)
      continue
    }
    if (declaration.section !== "variants") continue
    const variantId = Number(declaration.value.id)
    const fieldId = Number(declaration.value.field)
    if (!Number.isSafeInteger(variantId) || !Number.isSafeInteger(fieldId)) continue
    const value = clone(declaration.value.itemValue ?? declaration.value.value ?? null)
    const variants = variantsByFieldId.get(fieldId)
    if (variants) variants.push({id: variantId, value})
    else variantsByFieldId.set(fieldId, [{id: variantId, value}])
  }
}

const indexEnumDeclaration = (declaration: BoundaryInitialDeclaration): void => {
  if (declaration.section === "fields" && declaration.value.type === "enum") {
    const fieldId = Number(declaration.value.id)
    if (Number.isSafeInteger(fieldId)) enumFieldIds.add(fieldId)
    return
  }
  if (declaration.section !== "variants") return
  const variantId = Number(declaration.value.id)
  const fieldId = Number(declaration.value.field)
  if (!Number.isSafeInteger(variantId) || !Number.isSafeInteger(fieldId)) return
  const variant = {id: variantId, value: clone(declaration.value.itemValue ?? declaration.value.value ?? null)}
  const variants = variantsByFieldId.get(fieldId)
  if (variants) variants.push(variant)
  else variantsByFieldId.set(fieldId, [variant])
}

const unindexEnumDeclaration = (declaration: BoundaryInitialDeclaration): void => {
  if (declaration.section === "fields" && declaration.value.type === "enum") {
    const fieldId = Number(declaration.value.id)
    if (Number.isSafeInteger(fieldId)) enumFieldIds.delete(fieldId)
    return
  }
  if (declaration.section !== "variants") return
  const variantId = Number(declaration.value.id)
  const fieldId = Number(declaration.value.field)
  if (!Number.isSafeInteger(variantId) || !Number.isSafeInteger(fieldId)) return
  const remaining = (variantsByFieldId.get(fieldId) ?? []).filter((variant) => variant.id !== variantId)
  if (remaining.length > 0) variantsByFieldId.set(fieldId, remaining)
  else variantsByFieldId.delete(fieldId)
}

const normalizeProjectionVariantRefs = (): void => {
  const current = requireProjection()
  for (const atom of current.atoms) {
    for (const value of atom.values) {
      if (enumFieldIds.has(value.field)) value.value = normalizeEnumValueRef(value.field, value.value)
    }
  }
  for (const declaration of current.declarations) normalizeDeclarationVariantRefs(declaration)
}

/** Заменяет локальную Matrix-проекцию одним согласованным начальным срезом. */
export function hydrateMatrixProjection(initial: BoundaryInitialState): void {
  projection = clone(initial)
  nextSyntheticValueId = -1
  rebuildIndexes()
  normalizeProjectionVariantRefs()
}

/** Возвращает detached fragment только для явно выбранных Atom и их WIMP declarations. */
export function readMatrixProjectionFragment(atomIds: Iterable<number>): BoundaryInitialState {
  requireProjection()
  const atoms = [...new Set(atomIds)]
    .map((atomId) => atomById.get(atomId))
    .filter((atom): atom is BoundaryInitialAtom => atom !== undefined)
    .sort((left, right) => left.id - right.id)
  const sources = new Set(atoms.map((atom) => atom.wimp))
  const declarations = [...sources]
    .flatMap((src) => declarationsBySrc.get(src) ?? [])
  const selected = new Set(atoms.map((atom) => atom.id))
  return {
    version: 2,
    atoms: clone(atoms),
    declarations: clone(declarations),
    pendingProcessExecutions: [],
    reactionRelations: clone(requireProjection().reactionRelations.filter((relation) =>
      selected.has(relation.source.atomId) && selected.has(relation.target.atomId))),
  }
}

const addToIndex = <K>(index: Map<K, Set<number>>, key: K, atomId: number): void => {
  const values = index.get(key)
  if (values) values.add(atomId)
  else index.set(key, new Set([atomId]))
}

const removeFromIndex = <K>(index: Map<K, Set<number>>, key: K, atomId: number): void => {
  const values = index.get(key)
  if (!values) return
  values.delete(atomId)
  if (values.size === 0) index.delete(key)
}

const indexAtom = (atom: BoundaryInitialAtom): void => {
  atomById.set(atom.id, atom)
  addToIndex(atomIdsByWimp, atom.wimp, atom.id)
  for (const value of atom.values) addToIndex(atomIdsByValueId, value.valueId, atom.id)
}

const unindexAtom = (atom: BoundaryInitialAtom): void => {
  atomById.delete(atom.id)
  removeFromIndex(atomIdsByWimp, atom.wimp, atom.id)
  for (const value of atom.values) removeFromIndex(atomIdsByValueId, value.valueId, atom.id)
}

const rebuildIndexes = (): void => {
  atomById.clear()
  atomArrayIndexById.clear()
  atomIdsByWimp.clear()
  atomIdsByValueId.clear()
  declarationsBySrc.clear()
  declarationArrayIndexByKey.clear()
  const current = requireProjection()
  current.atoms.forEach((atom, index) => {
    atomArrayIndexById.set(atom.id, index)
    indexAtom(atom)
  })
  current.declarations.forEach((declaration, index) => {
    declarationArrayIndexByKey.set(declarationKey(declaration.src, declaration.section, declaration.localId), index)
    const records = declarationsBySrc.get(declaration.src)
    if (records) records.push(declaration)
    else declarationsBySrc.set(declaration.src, [declaration])
  })
  rebuildVariantIndexes()
}

const affectedByValueIds = (valueIds: Iterable<number>): Set<number> => {
  const affected = new Set<number>()
  for (const valueId of valueIds) {
    for (const atomId of atomIdsByValueId.get(valueId) ?? []) affected.add(atomId)
  }
  return affected
}

const affectedByWimp = (src: string): number[] => {
  const own = [...(atomIdsByWimp.get(src) ?? [])]
  const valueIds = new Set(
    own.flatMap((atomId) => atomById.get(atomId)?.values.map((value) => value.valueId) ?? []),
  )
  const affected = affectedByValueIds(valueIds)
  for (const atomId of own) affected.add(atomId)
  return [...affected]
}

const decodeAtomEntity = (value: JsonRecord, expectedId: number): BoundaryInitialAtom | null => {
  if (!isRecord(value.atom) || Number(value.atom.id) !== expectedId || typeof value.atom.wimp !== "string") return null
  if (!Array.isArray(value.values) || !Array.isArray(value.valueRecords)) return null
  const entity = value as unknown as MatrixRuntimeAtomEntity
  const records = new Map(entity.valueRecords.map((record) => [record.id, record]))
  const items = new Map<number, Array<{position: number; itemValue: number}>>()
  for (const item of entity.valueItems ?? []) {
    const bucket = items.get(item.value)
    if (bucket) bucket.push({position: item.position, itemValue: item.itemValue})
    else items.set(item.value, [{position: item.position, itemValue: item.itemValue}])
  }
  const decoded = (valueId: number): unknown => {
    const record = records.get(valueId)
    if (!record || record.kind === "null") return null
    if (record.kind === "boolean") return record.boolean === true
    if (record.kind === "number") return Number(record.number ?? 0)
    if (record.kind === "string") return record.text ?? ""
    if (record.kind === "enum") return {kind: "enum", variant: Number(record.variant)} satisfies BoundaryInitialVariantRef
    return [...(items.get(valueId) ?? [])]
      .sort((left, right) => left.position - right.position)
      .map((item) => item.itemValue)
  }
  const stateRecord = isRecord(value.state) ? value.state : null
  const metaState = stateRecord?.metaState
  const state = metaState === null || Number.isSafeInteger(metaState)
    ? metaState as number | null
    : null
  return {
    id: expectedId,
    wimp: value.atom.wimp,
    values: entity.values.map((binding) => ({
      field: Number(binding.field),
      valueId: Number(binding.value),
      value: clone(decoded(Number(binding.value))),
    })),
    state,
  }
}

const synchronizeFieldSources = (
  payload: JsonRecord,
  child: BoundaryInitialAtom,
): {changed: boolean; parentAtomIds: Set<number>; valueIds: Set<number>} => {
  const parentAtomIds = new Set<number>()
  const valueIds = new Set<number>()
  if (!Array.isArray(payload.fieldSources)) return {changed: false, parentAtomIds, valueIds}
  requireProjection()
  let changed = false
  for (const raw of payload.fieldSources) {
    if (!isRecord(raw)) continue
    const childField = Number(raw.childField)
    const parentAtom = Number(raw.parentAtom)
    const parentField = Number(raw.parentField)
    const childValue = child.values.find((value) => value.field === childField)
    const parent = atomById.get(parentAtom)
    const parentValue = parent?.values.find((value) => value.field === parentField)
    if (!childValue || !parentValue) continue
    parentAtomIds.add(parentAtom)
    valueIds.add(parentValue.valueId)
    valueIds.add(childValue.valueId)
    const fieldChanged = parentValue.valueId !== childValue.valueId || !same(parentValue.value, childValue.value)
    if (fieldChanged) changed = true
    if (fieldChanged && parent) unindexAtom(parent)
    parentValue.valueId = childValue.valueId
    parentValue.value = clone(childValue.value)
    if (fieldChanged && parent) indexAtom(parent)
  }
  return {changed, parentAtomIds, valueIds}
}

const applyAtomGraviton = (part: Particle, atomId: number): MatrixProjectionChange => {
  const current = requireProjection()
  const index = atomArrayIndexById.get(atomId) ?? -1
  const previous = index < 0 ? undefined : current.atoms[index]
  const valueIds = new Set(previous?.values.map((value) => value.valueId) ?? [])
  if (part.op === "remove") {
    if (index < 0 || !previous) return unchanged()
    unindexAtom(previous)
    const last = current.atoms.pop()
    if (last && last.id !== atomId) {
      current.atoms[index] = last
      atomArrayIndexById.set(last.id, index)
    }
    atomArrayIndexById.delete(atomId)
    const affected = affectedByValueIds(valueIds)
    affected.add(atomId)
    return {
      structural: true,
      affectedAtomIds: [...affected],
      invalidatedProcessWimps: [],
      invalidatedProcessAtomIds: [atomId],
    }
  }
  if ((part.op !== "add" && part.op !== "replace") || !isRecord(part.value)) return unchanged()
  const atom = decodeAtomEntity(part.value, atomId)
  if (!atom) return unchanged()
  for (const value of atom.values) valueIds.add(value.valueId)
  const sourceChange = synchronizeFieldSources(part.value, atom)
  for (const valueId of sourceChange.valueIds) valueIds.add(valueId)
  if (previous && same(previous, atom) && !sourceChange.changed) {
    return part.op === "replace"
      ? {
          structural: true,
          affectedAtomIds: [atomId],
          invalidatedProcessWimps: [],
          invalidatedProcessAtomIds: [atomId],
        }
      : unchanged()
  }
  if (previous) unindexAtom(previous)
  if (index < 0) {
    atomArrayIndexById.set(atom.id, current.atoms.length)
    current.atoms.push(atom)
  } else current.atoms[index] = atom
  indexAtom(atom)
  const affected = affectedByValueIds(valueIds)
  affected.add(atomId)
  for (const parentAtomId of sourceChange.parentAtomIds) affected.add(parentAtomId)
  return {
    structural: true,
    affectedAtomIds: [...affected],
    invalidatedProcessWimps: [],
    invalidatedProcessAtomIds: previous && part.op === "replace" ? [atomId] : [],
  }
}

const applyDeclarationGraviton = (part: Particle): MatrixProjectionChange => {
  if (typeof part.path !== "string") return unchanged()
  if (part.path === "wimp" && isRecord(part.value) && typeof part.value.src === "string") {
    return {
      structural: true,
      affectedAtomIds: affectedByWimp(part.value.src),
      invalidatedProcessWimps: [part.value.src],
      invalidatedProcessAtomIds: [],
    }
  }
  if (part.path === "matter" && isRecord(part.value) && typeof part.value.wimp === "string") {
    const src = part.value.wimp
    return {
      structural: true,
      affectedAtomIds: affectedByWimp(src),
      invalidatedProcessWimps: [src],
      invalidatedProcessAtomIds: [],
    }
  }
  const section = declarationSection[part.path as keyof typeof declarationSection]
  if (!section || !isRecord(part.value) || typeof part.value.wimp !== "string") return unchanged()
  const value = part.value
  const src = String(value.wimp)
  const localId = Number(value.localId ?? value.id)
  if (!Number.isSafeInteger(localId) || localId <= 0) return unchanged()
  const current = requireProjection()
  const localIdKey = String(localId)
  const key = declarationKey(src, section, localIdKey)
  const index = declarationArrayIndexByKey.get(key) ?? -1
  if (part.op === "remove") {
    if (index < 0) return unchanged()
    const removed = current.declarations[index]!
    unindexEnumDeclaration(removed)
    const last = current.declarations.pop()
    if (last && last !== removed) {
      current.declarations[index] = last
      declarationArrayIndexByKey.set(declarationKey(last.src, last.section, last.localId), index)
    }
    declarationArrayIndexByKey.delete(key)
    const records = (declarationsBySrc.get(src) ?? []).filter((item) => item !== removed)
    if (records.length > 0) declarationsBySrc.set(src, records)
    else declarationsBySrc.delete(src)
    return {
      structural: true,
      affectedAtomIds: affectedByWimp(src),
      invalidatedProcessWimps: [src],
      invalidatedProcessAtomIds: [],
    }
  }
  if (part.op !== "add" && part.op !== "replace") return unchanged()
  const declaration: BoundaryInitialDeclaration = {
    src,
    section,
    localId: localIdKey,
    value: clone(value),
  }
  const previous = index < 0 ? null : current.declarations[index]!
  if (previous) unindexEnumDeclaration(previous)
  normalizeDeclarationVariantRefs(declaration)
  if (previous && same(previous, declaration)) {
    indexEnumDeclaration(previous)
    return unchanged()
  }
  if (index < 0) {
    declarationArrayIndexByKey.set(key, current.declarations.length)
    current.declarations.push(declaration)
    const records = declarationsBySrc.get(src)
    if (records) records.push(declaration)
    else declarationsBySrc.set(src, [declaration])
  } else {
    current.declarations[index] = declaration
    const records = declarationsBySrc.get(src) ?? []
    const recordIndex = records.indexOf(previous!)
    if (recordIndex >= 0) records[recordIndex] = declaration
    else records.push(declaration)
    declarationsBySrc.set(src, records)
  }
  indexEnumDeclaration(declaration)
  return {
    structural: true,
    affectedAtomIds: affectedByWimp(src),
    invalidatedProcessWimps: [src],
    invalidatedProcessAtomIds: [],
  }
}

const applyFieldParticle = (part: Particle): void => {
  if (typeof part.path !== "number") return
  const fields = resolveForceFieldsPayload(part.value)
  const canonical = resolveCanonicalForceFieldsPayload(part.value)
  if (!fields) return
  const atom = atomById.get(part.path)
  if (!atom) return
  for (const [address, value] of Object.entries(fields)) {
    const field = Number(address)
    if (!Number.isSafeInteger(field) || field <= 0) continue
    const index = atom.values.findIndex((item) => item.field === field)
    if (part.op === "remove") {
      if (index >= 0) {
        removeFromIndex(atomIdsByValueId, atom.values[index]!.valueId, atom.id)
        atom.values.splice(index, 1)
      }
      continue
    }
    if (part.op !== "add" && part.op !== "replace") continue
    const normalized = enumFieldIds.has(field) ? normalizeEnumValueRef(field, value) : clone(value)
    const valueId = canonical?.[address]?.valueId ??
      (index >= 0 ? atom.values[index]!.valueId : nextSyntheticValueId--)
    if (index >= 0) {
      const previousValueId = atom.values[index]!.valueId
      if (previousValueId !== valueId) {
        removeFromIndex(atomIdsByValueId, previousValueId, atom.id)
        addToIndex(atomIdsByValueId, valueId, atom.id)
      }
      atom.values[index] = {field, valueId, value: normalized}
    } else {
      atom.values.push({field, valueId, value: normalized})
      addToIndex(atomIdsByValueId, valueId, atom.id)
    }
  }
}

/** Синхронизирует сохранённый State одного Atom после канонического подтверждения. */
export function recordMatrixProjectionState(atomId: number, metaState: number | null): void {
  requireProjection()
  const atom = atomById.get(atomId)
  if (atom) atom.state = metaState
}

/** Применяет одну ordered Particle и перечисляет только затронутые Matrix scopes. */
export function applyMatrixProjectionParticle(part: Particle): MatrixProjectionChange {
  requireProjection()
  if (part.part === "gluon" || part.part === "higgs") {
    applyFieldParticle(part)
    return unchanged()
  }
  if (part.part !== "graviton") return unchanged()
  if (part.path === REACTION_RELATION_PATH && isReactionRelation(part.value)) {
    const current = requireProjection()
    const relation = part.value
    const index = current.reactionRelations.findIndex((candidate) => candidate.key === relation.key)
    if (part.op === "remove") {
      if (index >= 0) current.reactionRelations.splice(index, 1)
    } else if (part.op === "add" || part.op === "replace") {
      if (index >= 0) current.reactionRelations[index] = clone(relation)
      else current.reactionRelations.push(clone(relation))
    }
    return unchanged()
  }
  if (typeof part.path === "string") {
    const atom = /^atom\/(\d+)$/.exec(part.path)
    if (atom) return applyAtomGraviton(part, Number(atom[1]))
  }
  return applyDeclarationGraviton(part)
}
