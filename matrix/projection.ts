import type {
  BoundaryInitialAtom,
  BoundaryInitialDeclaration,
  BoundaryInitialState,
} from "@metafor/types/boundary/initial"
import type {MatrixRuntimeAtomEntity} from "@metafor/types/matrix/runtime"
import {resolveForceFieldsPayload} from "shared/protocol/force/fields"
import type {Particle} from "shared/protocol/force/particle"

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

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const clone = <T>(value: T): T => structuredClone(value)

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

export function hydrateMatrixProjection(initial: BoundaryInitialState): void {
  projection = clone(initial)
  nextSyntheticValueId = -1
}

export function readMatrixProjection(): BoundaryInitialState {
  return clone(requireProjection())
}

const variantValue = (variantId: number): unknown => {
  const variant = requireProjection().declarations.find((item) =>
    item.section === "variants" && Number(item.value.id) === variantId,
  )
  return variant?.value.itemValue ?? null
}

const decodeAtomEntity = (value: JsonRecord, expectedId: number): BoundaryInitialAtom | null => {
  if (!isRecord(value.atom) || Number(value.atom.id) !== expectedId || typeof value.atom.wimp !== "string") return null
  if (!Array.isArray(value.values) || !Array.isArray(value.valueRecords)) return null
  const entity = value as unknown as MatrixRuntimeAtomEntity
  const records = new Map(entity.valueRecords.map((record) => [record.id, record]))
  const items = new Map<number, Array<{position: number; itemValue: string}>>()
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
    if (record.kind === "enum") return variantValue(Number(record.variant))
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

const synchronizeFieldSources = (payload: JsonRecord, child: BoundaryInitialAtom): boolean => {
  if (!Array.isArray(payload.fieldSources)) return false
  const current = requireProjection()
  let changed = false
  for (const raw of payload.fieldSources) {
    if (!isRecord(raw)) continue
    const childField = Number(raw.childField)
    const parentAtom = Number(raw.parentAtom)
    const parentField = Number(raw.parentField)
    const childValue = child.values.find((value) => value.field === childField)
    const parent = current.atoms.find((atom) => atom.id === parentAtom)
    const parentValue = parent?.values.find((value) => value.field === parentField)
    if (!childValue || !parentValue) continue
    if (parentValue.valueId !== childValue.valueId || !same(parentValue.value, childValue.value)) changed = true
    parentValue.valueId = childValue.valueId
    parentValue.value = clone(childValue.value)
  }
  return changed
}

const applyAtomGraviton = (part: Particle, atomId: number): boolean => {
  const current = requireProjection()
  const index = current.atoms.findIndex((atom) => atom.id === atomId)
  if (part.op === "remove") {
    if (index < 0) return false
    current.atoms.splice(index, 1)
    return true
  }
  if ((part.op !== "add" && part.op !== "replace") || !isRecord(part.value)) return false
  const atom = decodeAtomEntity(part.value, atomId)
  if (!atom) return false
  const sourceChanged = synchronizeFieldSources(part.value, atom)
  const previous = index < 0 ? undefined : current.atoms[index]
  if (previous && same(previous, atom)) return sourceChanged
  if (index < 0) current.atoms.push(atom)
  else current.atoms[index] = atom
  current.atoms.sort((left, right) => left.id - right.id)
  return true
}

const applyDeclarationGraviton = (part: Particle): boolean => {
  if (typeof part.path !== "string") return false
  const section = declarationSection[part.path as keyof typeof declarationSection]
  if (!section || !isRecord(part.value) || typeof part.value.wimp !== "string") return false
  const value = part.value
  const src = String(value.wimp)
  const localId = Number(value.localId ?? value.id)
  if (!Number.isSafeInteger(localId) || localId <= 0) return false
  const current = requireProjection()
  const index = current.declarations.findIndex((item) =>
    item.src === src && item.section === section && item.localId === String(localId),
  )
  if (part.op === "remove") {
    if (index < 0) return false
    current.declarations.splice(index, 1)
    return true
  }
  if (part.op !== "add" && part.op !== "replace") return false
  const declaration: BoundaryInitialDeclaration = {
    src,
    section,
    localId: String(localId),
    value: clone(value),
  }
  if (index >= 0 && same(current.declarations[index], declaration)) return false
  if (index < 0) current.declarations.push(declaration)
  else current.declarations[index] = declaration
  return true
}

const applyFieldParticle = (part: Particle): void => {
  if (typeof part.path !== "number") return
  const fields = resolveForceFieldsPayload(part.value)
  if (!fields) return
  const atom = requireProjection().atoms.find((item) => item.id === part.path)
  if (!atom) return
  for (const [address, value] of Object.entries(fields)) {
    const field = Number(address)
    if (!Number.isSafeInteger(field) || field <= 0) continue
    const index = atom.values.findIndex((item) => item.field === field)
    if (part.op === "remove") {
      if (index >= 0) atom.values.splice(index, 1)
      continue
    }
    if (part.op !== "add" && part.op !== "replace") continue
    if (index >= 0) atom.values[index]!.value = clone(value)
    else atom.values.push({field, valueId: nextSyntheticValueId--, value: clone(value)})
  }
}

export function recordMatrixProjectionState(atomId: number, metaState: number | null): void {
  const atom = requireProjection().atoms.find((item) => item.id === atomId)
  if (atom) atom.state = metaState
}

/** Applies one canonical realtime Particle to Matrix's local Boundary projection. */
export function applyMatrixProjectionParticle(part: Particle): {structural: boolean} {
  requireProjection()
  if (part.part === "gluon" || part.part === "higgs") {
    applyFieldParticle(part)
    return {structural: false}
  }
  if (part.part !== "graviton") return {structural: false}
  if (typeof part.path === "string") {
    const atom = /^atom\/(\d+)$/.exec(part.path)
    if (atom) return {structural: applyAtomGraviton(part, Number(atom[1]))}
  }
  return {structural: applyDeclarationGraviton(part)}
}
