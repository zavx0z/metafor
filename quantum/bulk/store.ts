import type {BulkManifest, BulkRelationChannel} from "@metafor/types/bulk/manifest"
import {
  BULK_STORE_ENTITY_FORM_STRIDE,
  BULK_STORE_ENTITY_POSITION_STRIDE,
  BULK_STORE_FLAG_ACTIVE,
  BULK_STORE_FLAG_CURRENT,
  BULK_STORE_FLAG_OVERLAY,
  BULK_STORE_FLAG_RETURNING,
  BULK_STORE_FLAG_TORUS,
  BULK_STORE_LINE_MATERIAL_STRIDE,
  BULK_STORE_LAYOUT_CENTERED_NESTED,
  BULK_STORE_LAYOUT_OUTSIDE_IN,
  BULK_STORE_QUANTUM_MATERIAL_STRIDE,
  BULK_STORE_RELATION_CONTROL_STRIDE,
  BULK_STORE_TRANSITION_CONTROL_STRIDE,
  type BulkStore,
  type BulkStoreInitial,
  type BulkStoreNumericArray,
} from "shared/protocol/bulk/store"
import type {VisualScenePayload} from "@metafor/visual/payload"
import {layoutCenteredNestedFields} from "@metafor/visual/layout/centered-nested"

export const BULK_STORE_DARK_KIND = Object.freeze({
  atom: 0,
  fuzzy: 1,
  macho: 2,
  axion: 3,
} as const)

export const BULK_STORE_FIELD_KIND = Object.freeze({
  string: 0,
  number: 1,
  boolean: 2,
  enum: 3,
  array: 4,
  other: 5,
} as const)

export const BULK_STORE_ORBITAL_KIND = Object.freeze({
  state: 0,
  process: 1,
  reaction: 2,
  finally: 3,
} as const)

export const BULK_STORE_RELATION_KIND = Object.freeze({
  "field-entanglement": 0,
  "field-projection": 1,
  "process-read": 2,
  "process-write": 3,
  "reaction-read": 4,
  "reaction-write": 5,
  "axion-read": 6,
} as const)

export const BULK_STORE_ENDPOINT_KIND = Object.freeze({
  field: 0,
  "field-proxy": 1,
  orbital: 2,
} as const)

export const BULK_STORE_BATCH_KIND = Object.freeze({
  transition: 0,
  relation: 1,
} as const)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const integer = (value: number): boolean => Number.isSafeInteger(value)
const positive = (value: number): boolean => integer(value) && value > 0
const numericArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((entry) =>
    typeof entry === "number" && Number.isFinite(entry))
const integerArray = (value: unknown): value is number[] =>
  numericArray(value) && value.every(integer)

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value)

const uniquePositiveIds = (value: number[]): boolean =>
  value.every(positive) && new Set(value).size === value.length

const textIndex = (value: number, count: number): boolean =>
  integer(value) && value >= 0 && value < count

const pushQuantumMaterial = (
  target: number[],
  material: Readonly<{
    color: readonly [number, number, number]
    opacity: number
    glowIntensity: number
    highlightSize: number
  }>,
): void => {
  target.push(
    material.color[0],
    material.color[1],
    material.color[2],
    material.opacity,
    material.glowIntensity,
    material.highlightSize,
  )
}

const pushLineMaterial = (
  target: number[],
  material: Readonly<{
    color: readonly [number, number, number, number]
    glowColor: readonly [number, number, number, number]
    glowIntensity: number
    opacity: number
  }>,
): void => {
  target.push(
    ...material.color,
    ...material.glowColor,
    material.glowIntensity,
    material.opacity,
  )
}

const pushPosition = (
  target: number[],
  value: Readonly<{localX: number; localY: number; localZ: number}>,
): void => {
  target.push(value.localX, value.localY, value.localZ)
}

const pushForm = (
  target: number[],
  form: Readonly<{kind: "sphere"; radius: number} | {kind: "torus"; radius: number; tube: number}>,
): void => {
  target.push(form.radius, form.kind === "torus" ? form.tube : 0)
}

const endpointOrder = (
  aKind: number,
  a: number,
  bKind: number,
  b: number,
): readonly [number, number, number, number] =>
  aKind < bKind || (aKind === bKind && a <= b)
    ? [aKind, a, bKind, b]
    : [bKind, b, aKind, a]

/**
 * Builds the wire form of one Bulk Store. The existing full visual path is an
 * input oracle during the migration; its object identities do not cross this
 * boundary and are not retained by the returned Store.
 */
export const buildBulkStore = (
  manifest: BulkManifest,
  visual: VisualScenePayload,
): BulkStore => {
  const text = [""]
  const textSlot = new Map<string, number>()
  const intern = (value: string | null): number => {
    if (value === null) return 0
    const held = textSlot.get(value)
    if (held !== undefined) return held
    const slot = text.length
    text.push(value)
    textSlot.set(value, slot)
    return slot
  }

  const dark = {
    id: [] as number[], parent: [] as number[], wimp: [] as number[], kind: [] as number[],
    order: [] as number[], flags: [] as number[], label: [] as number[], position: [] as number[],
    form: [] as number[], material: [] as number[],
  }
  const darkSemantic = new Map(manifest.darkParticles.map((entry) =>
    [entry.darkParticleId, entry] as const))
  const wimp = {src: [] as string[], name: [] as number[], flags: [] as number[]}
  const wimpSlotBySrc = new Map<string, number>()
  for (const entry of manifest.darkParticles) {
    if (entry.darkParticleKind !== "atom") continue
    const src = entry.metaSrc
    if (src === null) throw new Error(`Bulk Store Atom ${entry.darkParticleId} has no WIMP src`)
    if (wimpSlotBySrc.has(src)) continue
    const slot = wimp.src.length
    wimp.src.push(src)
    wimp.name.push(intern(entry.label))
    wimp.flags.push(0)
    wimpSlotBySrc.set(src, slot)
  }
  for (const entry of visual.tori) {
    const semantic = darkSemantic.get(entry.darkParticleId)
    if (!semantic) throw new Error(`Bulk Store Dark ${entry.darkParticleId} has no semantic row`)
    dark.id.push(entry.darkParticleId)
    dark.parent.push(entry.parentDarkParticleId ?? 0)
    dark.wimp.push(
      entry.darkParticleKind === "atom"
        ? (wimpSlotBySrc.get(semantic.metaSrc ?? "") ?? -1) + 1
        : 0,
    )
    dark.order.push(semantic.darkParticleOrder)
    dark.kind.push(BULK_STORE_DARK_KIND[entry.darkParticleKind])
    dark.flags.push(
      semantic.activity === "active"
        ? BULK_STORE_FLAG_ACTIVE
        : semantic.activity === "inactive" ? 0 : BULK_STORE_FLAG_ACTIVE,
    )
    dark.label.push(intern(entry.label))
    pushPosition(dark.position, entry)
    dark.form.push(entry.radius, entry.tube)
    pushQuantumMaterial(dark.material, entry.material)
  }
  const roots = visual.tori.filter((entry) => entry.parentDarkParticleId === null)
  if (roots.length !== 1) throw new Error(`Bulk Store requires one Dark root; received ${roots.length}`)

  const field = {
    id: [] as number[], field: [] as number[], owner: [] as number[],
    kind: [] as number[], flags: [] as number[], key: [] as number[],
    label: [] as number[], value: [] as number[], valueText: [] as number[],
    position: [] as number[], form: [] as number[], material: [] as number[],
  }
  const fieldIdByVisual = new Map<string, number>()
  visual.fields.forEach((entry, index) => {
    const id = index + 1
    if (fieldIdByVisual.has(entry.fieldParticleId)) {
      throw new Error(`Bulk Store visual Field ${entry.fieldParticleId} is duplicated`)
    }
    fieldIdByVisual.set(entry.fieldParticleId, id)
    field.id.push(id)
    field.field.push(entry.fieldId)
    field.owner.push(entry.ownerDarkParticleId)
    field.kind.push(BULK_STORE_FIELD_KIND[entry.fieldParticleKind])
    field.flags.push(BULK_STORE_FLAG_ACTIVE)
    field.key.push(intern(entry.fieldKey))
    field.label.push(intern(entry.fieldLabel))
    field.value.push(entry.valueId ?? 0)
    field.valueText.push(intern(entry.valueText))
    pushPosition(field.position, entry)
    field.form.push(entry.radius, 0)
    pushQuantumMaterial(field.material, entry.material)
  })

  const fieldAlias = {
    id: [] as number[], flags: [] as number[], atom: [] as number[], field: [] as number[], value: [] as number[],
    marker: [] as number[], order: [] as number[], orbit: [] as number[], valueText: [] as number[],
  }
  const fieldSource = {
    id: [] as number[], wimp: [] as number[], localId: [] as number[],
    kind: [] as number[], key: [] as number[],
    label: [] as number[], flags: [] as number[],
  }
  const fieldSourceSlotById = new Map<number, number>()
  for (const semantic of manifest.fieldParticles) {
    if (fieldSourceSlotById.has(semantic.fieldId)) continue
    const owner = darkSemantic.get(semantic.parentDarkParticleId)
    const wimpSlot = owner?.metaSrc === null || owner?.metaSrc === undefined
      ? undefined
      : wimpSlotBySrc.get(owner.metaSrc)
    if (wimpSlot === undefined) {
      throw new Error(`Bulk Store Field ${semantic.fieldId} WIMP is absent`)
    }
    const slot = fieldSource.id.length
    fieldSourceSlotById.set(semantic.fieldId, slot)
    fieldSource.id.push(semantic.fieldId)
    fieldSource.wimp.push(wimpSlot + 1)
    fieldSource.localId.push(semantic.fieldId)
    fieldSource.kind.push(BULK_STORE_FIELD_KIND[semantic.fieldParticleKind])
    fieldSource.key.push(intern(semantic.fieldKey))
    fieldSource.label.push(intern(semantic.fieldLabel))
    fieldSource.flags.push(0)
  }
  const fieldIdBySource = new Map<string, number>()
  const semanticFieldBySource = new Map(manifest.fieldParticles.map((entry) =>
    [entry.fieldParticleId, entry] as const))
  const sourceOrder = new Map(
    manifest.fieldParticles
      .map((entry) => entry.fieldParticleId)
      .toSorted((left, right) => left.localeCompare(right))
      .map((id, index) => [id, index + 1] as const),
  )
  const sourceOrbit = new Map<string, number>()
  for (const placement of layoutCenteredNestedFields(manifest)) {
    for (const id of placement.fieldParticleIds) sourceOrbit.set(id, placement.orbitIndex)
  }
  for (const entry of visual.fieldAliases) {
    const marker = fieldIdByVisual.get(entry.visualFieldParticleId)
    const owner = darkSemantic.get(entry.sourceParentDarkParticleId)
    if (marker === undefined || owner?.darkParticleKind !== "atom") {
      throw new Error(`Bulk Store Field alias ${entry.sourceFieldParticleId} is unresolved`)
    }
    const aliasId = fieldAlias.id.length + 1
    fieldAlias.id.push(aliasId)
    fieldAlias.flags.push(0)
    fieldAlias.atom.push(entry.sourceParentDarkParticleId / 2)
    fieldAlias.field.push(entry.sourceFieldId)
    const semantic = semanticFieldBySource.get(entry.sourceFieldParticleId)
    if (!semantic) throw new Error(`Bulk Store Field alias ${entry.sourceFieldParticleId} has no source row`)
    fieldAlias.value.push(semantic.valueId ?? 0)
    fieldAlias.marker.push(marker)
    fieldAlias.order.push(sourceOrder.get(entry.sourceFieldParticleId)!)
    fieldAlias.orbit.push(sourceOrbit.get(entry.sourceFieldParticleId) ?? 0)
    fieldAlias.valueText.push(intern(semantic.valueText))
    fieldIdBySource.set(entry.sourceFieldParticleId, aliasId)
  }

  const orbital = {
    id: [] as number[], source: [] as number[], owner: [] as number[],
    kind: [] as number[], flags: [] as number[], anchor: [] as number[],
    sleeve: [] as number[], relatedStart: [] as number[],
    relatedCount: [] as number[], label: [] as number[], position: [] as number[],
    form: [] as number[], material: [] as number[],
  }
  const orbitalRelatedState: number[] = []
  const orbitalIdByVisual = new Map<string, number>()
  visual.orbitals.forEach((entry, index) => orbitalIdByVisual.set(entry.orbitalParticleId, index + 1))
  const orbitalSemantic = new Map((manifest.orbitalParticles ?? []).map((entry) =>
    [entry.orbitalParticleId, entry] as const))
  for (const entry of visual.orbitals) {
    const id = orbitalIdByVisual.get(entry.orbitalParticleId)!
    const semantic = orbitalSemantic.get(entry.orbitalParticleId)
    if (!semantic || semantic.orbitalParticleKind === "axion") {
      throw new Error(`Bulk Store orbital ${entry.orbitalParticleId} has no semantic row`)
    }
    orbital.id.push(id)
    orbital.source.push(entry.sourceId)
    orbital.owner.push(entry.ownerDarkParticleId)
    orbital.kind.push(BULK_STORE_ORBITAL_KIND[entry.orbitalParticleKind])
    orbital.flags.push(
      (entry.current ? BULK_STORE_FLAG_CURRENT : 0) |
      (entry.active ? BULK_STORE_FLAG_ACTIVE : 0) |
      (entry.form.kind === "torus" ? BULK_STORE_FLAG_TORUS : 0),
    )
    orbital.anchor.push(
      entry.anchorStateOrbitalParticleId === null
        ? 0
        : orbitalIdByVisual.get(entry.anchorStateOrbitalParticleId) ?? 0,
    )
    orbital.sleeve.push(entry.sleeveRootStateId ?? 0)
    orbital.relatedStart.push(orbitalRelatedState.length)
    orbital.relatedCount.push(semantic.relatedStateIds.length)
    orbitalRelatedState.push(...semantic.relatedStateIds)
    orbital.label.push(intern(entry.label))
    pushPosition(orbital.position, entry)
    pushForm(orbital.form, entry.form)
    pushQuantumMaterial(orbital.material, entry.material)
  }

  const proxy = {
    id: [] as number[], field: [] as number[], sourceField: [] as number[],
    owner: [] as number[], state: [] as number[], paint: [] as number[],
    kind: [] as number[], flags: [] as number[], label: [] as number[],
    position: [] as number[], form: [] as number[], material: [] as number[],
  }
  const proxyIdByVisual = new Map<string, number>()
  visual.fieldProxies.forEach((entry, index) => proxyIdByVisual.set(entry.fieldProxyId, index + 1))
  for (const entry of visual.fieldProxies) {
    const marker = fieldIdByVisual.get(entry.visualFieldParticleId)
    const state = orbitalIdByVisual.get(entry.stateOrbitalParticleId)
    if (marker === undefined || state === undefined) {
      throw new Error(`Bulk Store Field proxy ${entry.fieldProxyId} is unresolved`)
    }
    proxy.id.push(proxyIdByVisual.get(entry.fieldProxyId)!)
    proxy.field.push(marker)
    proxy.sourceField.push(entry.fieldId)
    proxy.owner.push(entry.ownerDarkParticleId)
    proxy.state.push(state)
    proxy.paint.push(
      entry.paintOrbitalParticleId === null
        ? 0
        : orbitalIdByVisual.get(entry.paintOrbitalParticleId) ?? 0,
    )
    proxy.kind.push(entry.form.kind === "torus" ? 1 : 0)
    proxy.flags.push(entry.form.kind === "torus" ? BULK_STORE_FLAG_TORUS : 0)
    proxy.label.push(0)
    pushPosition(proxy.position, entry)
    pushForm(proxy.form, entry.form)
    pushQuantumMaterial(proxy.material, entry.material)
  }

  const batch = {
    id: [] as number[], owner: [] as number[], kind: [] as number[],
    flags: [] as number[], material: [] as number[],
  }
  const batchIdByVisual = new Map<string, number>()
  const appendBatch = (
    entry: VisualScenePayload["relationBatches"][number] |
      VisualScenePayload["transitionBatches"][number],
    kind: number,
    returning: boolean,
  ): void => {
    const id = batch.id.length + 1
    if (batchIdByVisual.has(entry.batchId)) {
      throw new Error(`Bulk Store line batch ${entry.batchId} is duplicated`)
    }
    batchIdByVisual.set(entry.batchId, id)
    batch.id.push(id)
    batch.owner.push(entry.ownerDarkParticleId)
    batch.kind.push(kind)
    batch.flags.push(
      (returning ? BULK_STORE_FLAG_RETURNING : 0) |
      (entry.material.visibilityMode === "overlay" ? BULK_STORE_FLAG_OVERLAY : 0),
    )
    pushLineMaterial(batch.material, entry.material)
  }
  for (const entry of visual.transitionBatches) {
    appendBatch(entry, BULK_STORE_BATCH_KIND.transition, entry.returning)
  }
  for (const entry of visual.relationBatches) {
    appendBatch(entry, BULK_STORE_BATCH_KIND.relation, false)
  }

  const transitionPath = new Map<string, Readonly<{batch: number; curves: readonly (readonly number[])[]}>>()
  for (const entry of visual.transitionBatches) {
    const numericBatch = batchIdByVisual.get(entry.batchId)!
    for (const path of entry.paths) {
      transitionPath.set(path.channelId, {batch: numericBatch, curves: path.curves})
    }
  }
  const transition = {
    id: [] as number[], source: [] as number[], owner: [] as number[],
    from: [] as number[], to: [] as number[], flags: [] as number[],
    batch: [] as number[], control: [] as number[],
  }
  for (const entry of manifest.transitionChannels ?? []) {
    const path = transitionPath.get(entry.transitionChannelId)
    const from = orbitalIdByVisual.get(entry.fromOrbitalParticleId)
    const to = orbitalIdByVisual.get(entry.toOrbitalParticleId)
    if (!path || from === undefined || to === undefined || path.curves.length !== 1) {
      throw new Error(`Bulk Store Transition ${entry.transitionChannelId} is unresolved`)
    }
    transition.id.push(transition.id.length + 1)
    transition.source.push(entry.sourceId)
    transition.owner.push(entry.parentDarkParticleId)
    transition.from.push(from)
    transition.to.push(to)
    transition.flags.push(entry.active ? BULK_STORE_FLAG_ACTIVE : 0)
    transition.batch.push(path.batch)
    transition.control.push(...path.curves[0]!)
  }

  const relationPath = new Map<string, Readonly<{batch: number; curves: readonly (readonly number[])[]}>>()
  for (const entry of visual.relationBatches) {
    const numericBatch = batchIdByVisual.get(entry.batchId)!
    for (const path of entry.paths) {
      relationPath.set(path.channelId, {batch: numericBatch, curves: path.curves})
    }
  }
  const relation = {
    id: [] as number[], owner: [] as number[], kind: [] as number[],
    flags: [] as number[], aKind: [] as number[], a: [] as number[],
    bKind: [] as number[], b: [] as number[], batch: [] as number[],
    controlStart: [] as number[], control: [] as number[],
  }
  const endpoint = (kind: BulkRelationChannel["fromKind"], value: string): number => {
    if (kind === "field") return fieldIdBySource.get(value) ?? 0
    if (kind === "field-proxy") return proxyIdByVisual.get(value) ?? 0
    return orbitalIdByVisual.get(value) ?? 0
  }
  for (const entry of manifest.relationChannels ?? []) {
    const path = relationPath.get(entry.relationChannelId)
    const fromKind = BULK_STORE_ENDPOINT_KIND[entry.fromKind]
    const toKind = BULK_STORE_ENDPOINT_KIND[entry.toKind]
    const from = endpoint(entry.fromKind, entry.fromId)
    const to = endpoint(entry.toKind, entry.toId)
    if (from === 0 || to === 0) {
      throw new Error(`Bulk Store Relation ${entry.relationChannelId} is unresolved`)
    }
    const [aKind, a, bKind, b] = entry.relationKind === "field-entanglement"
      ? endpointOrder(fromKind, from, toKind, to)
      : [fromKind, from, toKind, to]
    relation.id.push(relation.id.length + 1)
    relation.owner.push(entry.parentDarkParticleId)
    relation.kind.push(BULK_STORE_RELATION_KIND[entry.relationKind])
    relation.flags.push(entry.active ? BULK_STORE_FLAG_ACTIVE : 0)
    relation.aKind.push(aKind)
    relation.a.push(a)
    relation.bKind.push(bKind)
    relation.b.push(b)
    relation.batch.push(path?.batch ?? 0)
    relation.controlStart.push(path === undefined ? -1 : relation.control.length)
    if (path !== undefined) {
      if (path.curves.length !== 2) {
        throw new Error(`Bulk Store Relation ${entry.relationChannelId} must have two curves`)
      }
      relation.control.push(...path.curves[0]!, ...path.curves[1]!)
    }
  }

  const store: BulkStore = {
    root: roots[0]!.darkParticleId,
    layout: visual.layoutSlug === "outside-in"
      ? BULK_STORE_LAYOUT_OUTSIDE_IN
      : BULK_STORE_LAYOUT_CENTERED_NESTED,
    text,
    wimp,
    fieldSource,
    stateSource: {id: [], wimp: [], position: [], name: [], flags: []},
    transitionSource: {
      id: [], wimp: [], fromState: [], toState: [], position: [], flags: [],
    },
    conditionSource: {
      id: [], wimp: [], transition: [], field: [], position: [], flags: [],
    },
    processSource: {
      id: [], wimp: [], state: [], kind: [], label: [], readStart: [], readCount: [],
      writeStart: [], writeCount: [], flags: [],
    },
    processField: [],
    reactionSource: {
      id: [], wimp: [], label: [], readStart: [], readCount: [], writeStart: [],
      writeCount: [], stateStart: [], stateCount: [], allStates: [], flags: [],
    },
    reactionField: [],
    reactionState: [],
    dark,
    field,
    fieldAlias,
    orbital,
    orbitalRelatedState,
    proxy,
    transition,
    relation,
    batch,
  }
  if (!isBulkStore(store)) throw new Error("Bulk Store builder produced an invalid Store")
  return store
}

const shapeColumns = ["id", "kind", "flags", "label", "position", "form", "material"] as const

const validateShape = (
  value: unknown,
  extra: readonly string[],
  textCount: number,
): value is Record<string, number[]> => {
  if (!isRecord(value) || !exactKeys(value, [...shapeColumns, ...extra])) return false
  const id = value.id
  if (!integerArray(id) || !uniquePositiveIds(id)) return false
  const count = id.length
  for (const key of ["kind", "flags", "label", ...extra]) {
    if (!integerArray(value[key]) || (value[key] as number[]).length !== count) return false
  }
  if (!(value.label as number[]).every((entry) => textIndex(entry, textCount))) return false
  return numericArray(value.position) && value.position.length === count * BULK_STORE_ENTITY_POSITION_STRIDE &&
    numericArray(value.form) && value.form.length === count * BULK_STORE_ENTITY_FORM_STRIDE &&
    numericArray(value.material) && value.material.length === count * BULK_STORE_QUANTUM_MATERIAL_STRIDE
}

/** Validates the inert JSON form before browser Store activation. */
export const isBulkStore = (value: unknown): value is BulkStore => {
  if (!isRecord(value) || !exactKeys(value, [
    "root", "layout", "text", "wimp", "fieldSource", "stateSource", "transitionSource", "conditionSource",
    "processSource", "processField", "reactionSource", "reactionField", "reactionState",
    "dark", "field", "fieldAlias", "orbital",
    "orbitalRelatedState", "proxy", "transition", "relation", "batch",
  ])) return false
  if (!positive(Number(value.root)) ||
      (value.layout !== BULK_STORE_LAYOUT_CENTERED_NESTED &&
        value.layout !== BULK_STORE_LAYOUT_OUTSIDE_IN) ||
      !Array.isArray(value.text) ||
      !value.text.every((entry) => typeof entry === "string") || value.text[0] !== "") return false
  const textCount = value.text.length
  if (!isRecord(value.wimp) || !exactKeys(value.wimp, ["src", "name", "flags"]) ||
      !Array.isArray(value.wimp.src) || !value.wimp.src.every((entry) =>
        typeof entry === "string" && entry.length > 0) ||
      new Set(value.wimp.src).size !== value.wimp.src.length ||
      !integerArray(value.wimp.name) || !integerArray(value.wimp.flags) ||
      value.wimp.name.length !== value.wimp.src.length ||
      value.wimp.flags.length !== value.wimp.src.length ||
      !value.wimp.name.every((entry) => textIndex(entry, textCount)) ||
      !isRecord(value.fieldSource) || !exactKeys(value.fieldSource, [
        "id", "wimp", "localId", "kind", "key", "label", "flags",
      ]) ||
      !isRecord(value.stateSource) || !exactKeys(value.stateSource, [
        "id", "wimp", "position", "name", "flags",
      ]) ||
      !isRecord(value.transitionSource) || !exactKeys(value.transitionSource, [
        "id", "wimp", "fromState", "toState", "position", "flags",
      ]) ||
      !isRecord(value.conditionSource) || !exactKeys(value.conditionSource, [
        "id", "wimp", "transition", "field", "position", "flags",
      ]) ||
      !isRecord(value.processSource) || !exactKeys(value.processSource, [
        "id", "wimp", "state", "kind", "label", "readStart", "readCount",
        "writeStart", "writeCount", "flags",
      ]) ||
      !isRecord(value.reactionSource) || !exactKeys(value.reactionSource, [
        "id", "wimp", "label", "readStart", "readCount", "writeStart", "writeCount",
        "stateStart", "stateCount", "allStates", "flags",
      ]) ||
      !validateShape(value.dark, ["parent", "wimp", "order"], textCount) ||
      !validateShape(value.field, ["owner", "field", "key", "value", "valueText"], textCount) ||
      !validateShape(value.orbital, ["owner", "source", "anchor", "sleeve", "relatedStart", "relatedCount"], textCount) ||
      !validateShape(value.proxy, ["owner", "field", "sourceField", "state", "paint"], textCount)) return false

  const candidate = value as unknown as BulkStore
  const fieldSource = candidate.fieldSource
  const stateSource = candidate.stateSource
  const transitionSource = candidate.transitionSource
  const conditionSource = candidate.conditionSource
  const processSource = candidate.processSource
  const reactionSource = candidate.reactionSource
  for (const table of [stateSource, transitionSource, conditionSource]) {
    if (!integerArray(table.id) || !uniquePositiveIds(Array.from(table.id)) ||
        !integerArray(table.wimp) || !integerArray(table.position) ||
        !integerArray(table.flags) || table.id.length !== table.wimp.length ||
        table.id.length !== table.position.length || table.id.length !== table.flags.length ||
        !table.wimp.every((slot) => slot > 0 && slot <= candidate.wimp.src.length) ||
        !table.position.every((position) => position >= 0)) return false
  }
  if (!integerArray(fieldSource.id) || !uniquePositiveIds(Array.from(fieldSource.id)) ||
      !integerArray(fieldSource.wimp) || !integerArray(fieldSource.localId) ||
      !integerArray(fieldSource.kind) ||
      !integerArray(fieldSource.key) || !integerArray(fieldSource.label) ||
      !integerArray(fieldSource.flags) ||
      [fieldSource.wimp, fieldSource.localId, fieldSource.kind, fieldSource.key,
        fieldSource.label, fieldSource.flags]
        .some((column) => column.length !== fieldSource.id.length) ||
      !fieldSource.wimp.every((slot) => slot > 0 && slot <= candidate.wimp.src.length) ||
      !fieldSource.localId.every(positive) ||
      !fieldSource.key.every((entry) => textIndex(entry, textCount)) ||
      !fieldSource.label.every((entry) => textIndex(entry, textCount))) return false
  const validateSlices = (
    table: Record<string, BulkStoreNumericArray>,
    columns: readonly string[],
    values: BulkStoreNumericArray,
  ): boolean => columns.every((prefix) => {
    const starts = table[`${prefix}Start`]
    const counts = table[`${prefix}Count`]
    return integerArray(starts) && integerArray(counts) &&
      starts.length === table.id!.length && counts.length === table.id!.length &&
      starts.every((start, slot) => start >= 0 && counts[slot]! >= 0 &&
        start + counts[slot]! <= values.length)
  })
  for (const table of [processSource, reactionSource]) {
    if (!integerArray(table.id) || !uniquePositiveIds(Array.from(table.id)) ||
        !integerArray(table.wimp) || !integerArray(table.label) || !integerArray(table.flags) ||
        table.id.length !== table.wimp.length || table.id.length !== table.label.length ||
        table.id.length !== table.flags.length ||
        !table.wimp.every((slot) => slot > 0 && slot <= candidate.wimp.src.length) ||
        !table.label.every((entry) => textIndex(entry, textCount))) return false
  }
  if (!integerArray(candidate.processField) || !candidate.processField.every(positive) ||
      !integerArray(processSource.state) || !integerArray(processSource.kind) ||
      processSource.state.length !== processSource.id.length ||
      processSource.kind.length !== processSource.id.length ||
      !processSource.state.every((entry) => textIndex(entry, textCount)) ||
      !validateSlices(processSource as unknown as Record<string, BulkStoreNumericArray>,
        ["read", "write"], candidate.processField) ||
      !integerArray(candidate.reactionField) || !candidate.reactionField.every(positive) ||
      !integerArray(candidate.reactionState) || !candidate.reactionState.every(positive) ||
      !integerArray(reactionSource.allStates) ||
      reactionSource.allStates.length !== reactionSource.id.length ||
      !reactionSource.allStates.every((entry) => entry === 0 || entry === 1) ||
      !validateSlices(reactionSource as unknown as Record<string, BulkStoreNumericArray>,
        ["read", "write"], candidate.reactionField) ||
      !validateSlices(reactionSource as unknown as Record<string, BulkStoreNumericArray>,
        ["state"], candidate.reactionState)) return false
  if (!integerArray(stateSource.name) || stateSource.name.length !== stateSource.id.length ||
      !stateSource.name.every((entry) => textIndex(entry, textCount)) ||
      !integerArray(transitionSource.fromState) || !integerArray(transitionSource.toState) ||
      transitionSource.fromState.length !== transitionSource.id.length ||
      transitionSource.toState.length !== transitionSource.id.length ||
      !transitionSource.fromState.every(positive) || !transitionSource.toState.every(positive) ||
      !integerArray(conditionSource.transition) || !integerArray(conditionSource.field) ||
      conditionSource.transition.length !== conditionSource.id.length ||
      conditionSource.field.length !== conditionSource.id.length ||
      !conditionSource.transition.every(positive) || !conditionSource.field.every(positive)) return false
  const stateSourceIds = new Set(stateSource.id)
  const transitionSourceIds = new Set(transitionSource.id)
  const fieldSourceIds = new Set(fieldSource.id)
  if (!transitionSource.fromState.every((id) => stateSourceIds.has(id)) ||
      !transitionSource.toState.every((id) => stateSourceIds.has(id)) ||
      !conditionSource.transition.every((id) => transitionSourceIds.has(id)) ||
      !conditionSource.field.every((id) => fieldSourceIds.has(id))) return false
  const dark = candidate.dark
  const field = candidate.field
  const orbital = candidate.orbital
  const proxy = candidate.proxy
  const darkIds = new Set(dark.id)
  const fieldIds = new Set(field.id)
  const orbitalIds = new Set(orbital.id)
  const proxyIds = new Set(proxy.id)
  if (!darkIds.has(candidate.root) || !dark.parent.every((id) => id === 0 || darkIds.has(id)) ||
      !dark.wimp.every((id, slot) => dark.kind[slot] === BULK_STORE_DARK_KIND.atom
        ? id > 0 && id <= candidate.wimp.src.length
        : id === 0) ||
      !field.owner.every((id) => darkIds.has(id)) ||
      !orbital.owner.every((id) => darkIds.has(id)) ||
      !orbital.anchor.every((id) => id === 0 || orbitalIds.has(id)) ||
      !proxy.owner.every((id) => darkIds.has(id)) ||
      !proxy.field.every((id) => fieldIds.has(id)) ||
      !proxy.state.every((id) => orbitalIds.has(id)) ||
      !proxy.paint.every((id) => id === 0 || orbitalIds.has(id)) ||
      !field.key.every((id) => textIndex(id, textCount)) ||
      !field.valueText.every((id) => textIndex(id, textCount))) return false

  if (!integerArray(value.orbitalRelatedState)) return false
  for (let slot = 0; slot < orbital.id.length; slot++) {
    const start = orbital.relatedStart[slot]!
    const count = orbital.relatedCount[slot]!
    if (start < 0 || count < 0 || start + count > value.orbitalRelatedState.length) return false
  }

  const alias = candidate.fieldAlias
  if (!isRecord(alias) || !exactKeys(alias, [
      "id", "flags", "atom", "field", "value", "marker", "order", "orbit", "valueText",
    ]) ||
      !integerArray(alias.id) || !uniquePositiveIds(Array.from(alias.id)) ||
      !integerArray(alias.flags) ||
      !integerArray(alias.atom) || !integerArray(alias.field) ||
      !integerArray(alias.value) || !integerArray(alias.marker) || !integerArray(alias.order) ||
      !integerArray(alias.orbit) ||
      !integerArray(alias.valueText) ||
      alias.id.length !== alias.atom.length || alias.atom.length !== alias.field.length ||
      alias.atom.length !== alias.value.length ||
      [alias.flags, alias.marker, alias.order, alias.orbit, alias.valueText]
        .some((column) => column.length !== alias.atom.length) ||
      !alias.atom.every(positive) || !alias.field.every((id) => fieldSourceIds.has(id)) ||
      !alias.order.every(positive) ||
      !alias.orbit.every((value) => value >= 0) ||
      !alias.valueText.every((id) => textIndex(id, textCount)) ||
      !alias.marker.every((id) => fieldIds.has(id))) return false
  const aliasIds = new Set(alias.id)

  const batch = candidate.batch
  if (!isRecord(batch) || !exactKeys(batch, ["id", "owner", "kind", "flags", "material"]) ||
      !integerArray(batch.id) || !uniquePositiveIds(Array.from(batch.id)) ||
      !integerArray(batch.owner) || !integerArray(batch.kind) || !integerArray(batch.flags) ||
      batch.owner.length !== batch.id.length || batch.kind.length !== batch.id.length ||
      batch.flags.length !== batch.id.length || !batch.owner.every((id) => darkIds.has(id)) ||
      !numericArray(batch.material) || batch.material.length !== batch.id.length * BULK_STORE_LINE_MATERIAL_STRIDE) return false
  const batchIds = new Set(batch.id)

  const transition = candidate.transition
  if (!isRecord(transition) || !exactKeys(transition, ["id", "source", "owner", "from", "to", "flags", "batch", "control"])) return false
  for (const key of ["id", "source", "owner", "from", "to", "flags", "batch"] as const) {
    if (!integerArray(transition[key])) return false
  }
  const transitionCount = transition.id.length
  if (!uniquePositiveIds(Array.from(transition.id)) ||
      ![transition.source, transition.owner, transition.from, transition.to, transition.flags, transition.batch]
        .every((column) => column.length === transitionCount) ||
      !transition.owner.every((id) => darkIds.has(id)) ||
      !transition.from.every((id) => orbitalIds.has(id)) ||
      !transition.to.every((id) => orbitalIds.has(id)) ||
      !transition.batch.every((id) => batchIds.has(id)) ||
      !numericArray(transition.control) ||
      transition.control.length !== transitionCount * BULK_STORE_TRANSITION_CONTROL_STRIDE) return false

  const relation = candidate.relation
  if (!isRecord(relation) || !exactKeys(relation, [
    "id", "owner", "kind", "flags", "aKind", "a", "bKind", "b",
    "batch", "controlStart", "control",
  ])) return false
  for (const key of ["id", "owner", "kind", "flags", "aKind", "a", "bKind", "b", "batch", "controlStart"] as const) {
    if (!integerArray(relation[key])) return false
  }
  const relationCount = relation.id.length
  if (!uniquePositiveIds(Array.from(relation.id)) || ![
    relation.owner, relation.kind, relation.flags, relation.aKind, relation.a,
    relation.bKind, relation.b, relation.batch, relation.controlStart,
  ].every((column) => column.length === relationCount) ||
      !relation.owner.every((id) => darkIds.has(id)) ||
      !relation.batch.every((id) => id === 0 || batchIds.has(id)) ||
      !numericArray(relation.control)) return false
  const endpointExists = (kind: number, id: number): boolean =>
    kind === BULK_STORE_ENDPOINT_KIND.field
      ? aliasIds.has(id)
      : kind === BULK_STORE_ENDPOINT_KIND["field-proxy"]
        ? proxyIds.has(id)
        : kind === BULK_STORE_ENDPOINT_KIND.orbital && orbitalIds.has(id)
  for (let slot = 0; slot < relationCount; slot++) {
    if (!endpointExists(relation.aKind[slot]!, relation.a[slot]!) ||
        !endpointExists(relation.bKind[slot]!, relation.b[slot]!)) return false
    const start = relation.controlStart[slot]!
    if (start !== -1 && (start < 0 || start + BULK_STORE_RELATION_CONTROL_STRIDE > relation.control.length)) return false
    if (relation.kind[slot] === BULK_STORE_RELATION_KIND["field-entanglement"] &&
        endpointOrder(
          relation.aKind[slot]!, relation.a[slot]!,
          relation.bKind[slot]!, relation.b[slot]!,
        ).some((entry, index) => entry !== [relation.aKind[slot], relation.a[slot], relation.bKind[slot], relation.b[slot]][index])) return false
  }
  return true
}

export const isBulkStoreInitial = (value: unknown): value is BulkStoreInitial =>
  isRecord(value) && exactKeys(value, ["session", "store"]) &&
  typeof value.session === "string" && value.session.length > 0 &&
  isBulkStore(value.store)
