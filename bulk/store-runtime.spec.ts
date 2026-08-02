import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {
  BULK_STORE_FLAG_ACTIVE,
  BULK_STORE_FLAG_CURRENT,
  BULK_STORE_FLAG_REMOVED,
  BULK_STORE_LAYOUT_OUTSIDE_IN,
  BULK_STORE_LINE_MATERIAL_STRIDE,
  type BulkStore,
} from "@metafor/types/bulk/store"
import {
  CenteredNested,
  buildStateGraph,
  buildStateGraphBranchLayoutFromIndex,
  buildVisualScenePayload,
  indexStateGraphLayout,
  STATE_GRAPH_PRODUCTION_SIZING,
} from "@metafor/visual/layout/centered-nested"
import {OutsideIn} from "@metafor/visual/layout"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {Particle} from "shared/protocol/force/particle"
import snapshotJson from "./fixture/monad-snapshot.json"
import {buildDirectBulkStore} from "./store-direct.ts"
import {buildBulkStore} from "./store.ts"
import {
  BULK_STORE_ENDPOINT_KIND,
  BULK_STORE_ORBITAL_KIND,
} from "./store.ts"
import {BulkVisualSceneLifecycle} from "./visual.ts"
import {prepareBulkInitialVisual} from "./visual-initial.ts"
import {
  activateBulkStore,
  applyBulkGluonReplace,
  applyBulkGluonRemove,
  applyBulkPhotonReplace,
  applyBulkStoreMessage,
  type BulkStoreRenderer,
} from "./store-runtime.ts"
import {bulkStoreRenderManifest} from "./store-render.ts"

const dark = (
  id: number,
  parent: number | null,
  order: number,
  depth: number,
): BulkManifest["darkParticles"][number] => ({
  darkParticleId: id,
  parentDarkParticleId: parent,
  darkParticleKind: "atom",
  src: `test/${id}`,
  metaSrc: `test/${id}`,
  label: `Atom ${id}`,
  depth,
  darkParticleOrder: order,
  activity: "active",
})

const field = (
  atom: number,
  id: number,
  valueId: number,
): BulkManifest["fieldParticles"][number] => ({
  fieldParticleId: `atom/${atom}/field/${id}`,
  fieldId: id,
  valueId,
  parentDarkParticleId: atom * 2,
  fieldKey: `field-${id}`,
  fieldLabel: `Field ${id}`,
  fieldParticleKind: "number",
  valueText: String(valueId),
})

const baseManifest = (): BulkManifest => ({
  rootSrc: "test/root",
  darkParticles: [
    dark(2, null, 0, 0),
    dark(4, 2, 0, 1),
    dark(8, 4, 0, 2),
    dark(6, 2, 1, 1),
  ],
  fieldParticles: [
    field(1, 101, 11),
    field(1, 105, 50),
    field(2, 102, 20),
    field(4, 104, 20),
    field(3, 103, 30),
  ],
  orbitalParticles: [],
  transitionChannels: [],
  fieldProxies: [],
  relationChannels: [],
})

const structuralProjection = (): BulkRuntimeProjection => ({
  atoms: [
    {id: 1, parentAtom: null, parentTopology: null, wimp: "test/root", position: 0},
    {id: 2, parentAtom: null, parentTopology: 1, wimp: "test/source", position: 0},
  ],
  topologies: [
    {id: 1, parentAtom: 1, parentTopology: null, kind: "fuzzy", position: 0},
    {id: 2, parentAtom: 1, parentTopology: null, kind: "macho", position: 1},
  ],
  wimps: [
    {src: "test/root", name: "Root"},
    {src: "test/source", name: "Source"},
    {src: "test/target", name: "Target"},
  ],
  fields: [
    {id: 101, wimp: "test/source", key: "source", type: "number", label: "Source"},
    {id: 201, wimp: "test/target", key: "target", type: "number", label: "Target"},
  ],
  states: [
    {id: 301, wimp: "test/source", name: "source-idle", position: 0},
    {id: 302, wimp: "test/source", name: "source-ready", position: 1},
    {id: 401, wimp: "test/target", name: "target-idle", position: 0},
    {id: 402, wimp: "test/target", name: "target-ready", position: 1},
  ],
  transitions: [
    {id: 501, wimp: "test/source", fromState: 301, toState: 302, position: 0},
    {id: 502, wimp: "test/target", fromState: 401, toState: 402, position: 0},
  ],
  conditions: [
    {id: 601, wimp: "test/source", transition: 501, field: 101, position: 0, predicate: null},
    {id: 602, wimp: "test/target", transition: 502, field: 201, position: 0, predicate: null},
  ],
  processes: [], reactions: [],
  atomStates: [{atom: 1, state: null}, {atom: 2, state: 301}],
  fieldEnumVariants: [],
  atomValues: [{atom: 2, field: 101, value: 701}],
  values: [{
    id: 701, kind: "number", booleanValue: null, numberValue: 7,
    textValue: null, enumValue: null,
  }],
  valueItems: [], matterParticles: [], matterTopologyBindingPaths: [],
  matterChildWimpBindingPaths: [],
})

const storeFor = (manifest: BulkManifest): BulkStore => activateBulkStore(
  buildBulkStore(
    manifest,
    buildVisualScenePayload(CenteredNested, {manifest, owners: []}),
  ),
)

const outsideStoreFor = (manifest: BulkManifest): BulkStore => activateBulkStore(
  buildBulkStore(
    manifest,
    buildVisualScenePayload(OutsideIn, {manifest, owners: []}),
  ),
)

const outsideProjectionStore = (
  projection: BulkRuntimeProjection,
  rootAtomId = 1,
): BulkStore => activateBulkStore(
  buildDirectBulkStore(projection, rootAtomId, BULK_STORE_LAYOUT_OUTSIDE_IN),
)

const groups = (store: BulkStore) => {
  const result = new Map<string, Readonly<{owner: number; position: number[]}>>()
  const members = new Map<number, string[]>()
  for (let slot = 0; slot < store.fieldAlias.id.length; slot++) {
    const marker = store.fieldAlias.marker[slot]!
    const group = members.get(marker) ?? []
    group.push(`${store.fieldAlias.atom[slot]}:${store.fieldAlias.field[slot]}`)
    members.set(marker, group)
  }
  for (const [marker, aliases] of members) {
    const slot = marker - 1
    if ((store.field.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    result.set(aliases.toSorted().join("|"), {
      owner: store.field.owner[slot]!,
      position: Array.from(store.field.position.slice(slot * 3, slot * 3 + 3)),
    })
  }
  return result
}

const oracleGroups = (manifest: BulkManifest) => {
  const visual = buildVisualScenePayload(CenteredNested, {manifest, owners: []})
  const fieldById = new Map(visual.fields.map((entry) => [entry.fieldParticleId, entry] as const))
  const result = new Map<string, Readonly<{owner: number; position: number[]}>>()
  for (const [marker, aliases] of Map.groupBy(
    visual.fieldAliases,
    (entry) => entry.visualFieldParticleId,
  )) {
    const entry = fieldById.get(marker)!
    result.set(aliases.map((alias) =>
      `${alias.sourceParentDarkParticleId / 2}:${alias.sourceFieldId}`).toSorted().join("|"), {
      owner: entry.ownerDarkParticleId,
      position: [entry.localX, entry.localY, entry.localZ],
    })
  }
  return result
}

const visualGroups = (
  visual: ReturnType<typeof prepareBulkInitialVisual>["payload"],
) => {
  const fieldById = new Map(visual.fields.map((entry) => [entry.fieldParticleId, entry] as const))
  const result = new Map<string, Readonly<{owner: number; position: number[]}>>()
  for (const [marker, aliases] of Map.groupBy(
    visual.fieldAliases,
    (entry) => entry.visualFieldParticleId,
  )) {
    const entry = fieldById.get(marker)!
    result.set(aliases.map((alias) =>
      `${alias.sourceParentDarkParticleId / 2}:${alias.sourceFieldId}`).toSorted().join("|"), {
      owner: entry.ownerDarkParticleId,
      position: [entry.localX, entry.localY, entry.localZ],
    })
  }
  return result
}

const expectVisualParity = (
  store: BulkStore,
  expected: ReturnType<typeof visualGroups>,
): void => {
  const actual = groups(store)
  expect([...actual.keys()].toSorted()).toEqual([...expected.keys()].toSorted())
  for (const [key, right] of expected) {
    const left = actual.get(key)!
    expect(left.owner).toBe(right.owner)
    right.position.forEach((value, index) => {
      if (Math.abs(left.position[index]! - value) > 1e-4) {
        throw new Error(
          `Visual Field group ${key} coordinate ${index}: ${left.position[index]} != ${value}`,
        )
      }
    })
  }
}

const expectNumericParity = (
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  label: string,
): void => {
  expect(actual.length).toBe(expected.length)
  for (let index = 0; index < expected.length; index++) {
    const tolerance = Math.max(1e-3, Math.abs(expected[index]!) * 64 * 2 ** -23)
    if (Math.abs(actual[index]! - expected[index]!) > tolerance) {
      throw new Error(`${label}[${index}]: ${actual[index]} != ${expected[index]}`)
    }
  }
}

const expectActiveDarkParity = (actual: BulkStore, expected: BulkStore): void => {
  const rows = (store: BulkStore) => new Map(Array.from(
    {length: store.dark.id.length},
    (_, slot) => slot,
  ).filter((slot) =>
    (store.dark.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0
  ).map((slot) => [store.dark.id[slot]!, [
    store.dark.parent[slot]!,
    store.dark.kind[slot]!,
    store.dark.wimp[slot]!,
    store.dark.order[slot]!,
    ...store.dark.position.slice(slot * 3, slot * 3 + 3),
    ...store.dark.form.slice(slot * 2, slot * 2 + 2),
  ]] as const))
  const left = rows(actual)
  const right = rows(expected)
  expect([...left.keys()].toSorted((a, b) => a - b)).toEqual(
    [...right.keys()].toSorted((a, b) => a - b),
  )
  for (const [id, row] of right) expectNumericParity(left.get(id)!, row, `dark.${id}`)
}

const occurrenceKeys = (
  projection: BulkRuntimeProjection,
  atom: number,
): string[] => {
  const graph = buildStateGraph(projection, atom)
  const index = indexStateGraphLayout(graph)
  return graph.states.flatMap((root) =>
    buildStateGraphBranchLayoutFromIndex(index, root.id, STATE_GRAPH_PRODUCTION_SIZING)
      .nodes
      .filter((node) => node.end !== "missing-state")
      .map((node) => {
        const prefix = `root/${root.id}/path/`
        const suffix = `/state/${node.stateId}`
        const path = node.id.slice(prefix.length, node.id.length - suffix.length)
        return `atom/${atom}/sleeve/${root.id}/state/${node.stateId}/path/${path}`
      }),
  )
}

const directStateIds = (
  store: BulkStore,
  projection: BulkRuntimeProjection,
  atom: number,
): Map<string, number> => {
  const owner = atom * 2
  const ids = Array.from({length: store.orbital.id.length}, (_, slot) => slot)
    .filter((slot) => store.orbital.owner[slot] === owner &&
      store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state &&
      (store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0)
    .toSorted((left, right) => store.orbital.id[left]! - store.orbital.id[right]!)
    .map((slot) => store.orbital.id[slot]!)
  const keys = occurrenceKeys(projection, atom)
  expect(ids).toHaveLength(keys.length)
  return new Map(keys.map((key, index) => [key, ids[index]!] as const))
}

const updatedStateIds = (
  store: BulkStore,
  projection: BulkRuntimeProjection,
  atom: number,
  before: ReadonlyMap<string, number>,
): Map<string, number> => {
  const owner = atom * 2
  const active = new Set(Array.from({length: store.orbital.id.length}, (_, slot) => slot)
    .filter((slot) => store.orbital.owner[slot] === owner &&
      store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state &&
      (store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0)
    .map((slot) => store.orbital.id[slot]!))
  const keys = occurrenceKeys(projection, atom)
  const result = new Map<string, number>()
  const used = new Set<number>()
  for (const key of keys) {
    const held = before.get(key)
    if (held !== undefined && active.has(held)) {
      result.set(key, held)
      used.add(held)
    }
  }
  const appended = [...active].filter((id) => !used.has(id)).toSorted((a, b) => a - b)
  let cursor = 0
  for (const key of keys) {
    if (result.has(key)) continue
    result.set(key, appended[cursor++]!)
  }
  expect(result.size).toBe(keys.length)
  return result
}

const ownerSemanticGeometry = (
  store: BulkStore,
  owner: number,
  stateIds: ReadonlyMap<string, number>,
): Map<string, number[]> => {
  const stateKeyById = new Map([...stateIds].map(([key, id]) => [id, key] as const))
  const result = new Map<string, number[]>()
  for (const [key, id] of stateIds) {
    const slot = Array.from(store.orbital.id).indexOf(id)
    result.set(`state:${key}`, [
      ...store.orbital.position.slice(slot * 3, slot * 3 + 3),
      ...store.orbital.form.slice(slot * 2, slot * 2 + 2),
      ...store.orbital.material.slice(slot * 6, slot * 6 + 6),
    ])
  }
  const orbitalKeyById = new Map(stateKeyById)
  for (let slot = 0; slot < store.orbital.id.length; slot++) {
    if (store.orbital.owner[slot] !== owner ||
        store.orbital.kind[slot] === BULK_STORE_ORBITAL_KIND.state ||
        (store.orbital.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const anchor = stateKeyById.get(store.orbital.anchor[slot]!)
    if (!anchor) continue
    const key = `causal:${store.orbital.kind[slot]}:${store.orbital.source[slot]}:${anchor}`
    orbitalKeyById.set(store.orbital.id[slot]!, key)
    result.set(key, [
      ...store.orbital.position.slice(slot * 3, slot * 3 + 3),
      ...store.orbital.form.slice(slot * 2, slot * 2 + 2),
      ...store.orbital.material.slice(slot * 6, slot * 6 + 6),
    ])
  }
  const proxyKeyById = new Map<number, string>()
  for (let slot = 0; slot < store.proxy.id.length; slot++) {
    if (store.proxy.owner[slot] !== owner ||
        (store.proxy.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const stateKey = stateKeyById.get(store.proxy.state[slot]!)
    if (!stateKey) continue
    const key = `proxy:${stateKey}:${store.proxy.sourceField[slot]}`
    proxyKeyById.set(store.proxy.id[slot]!, key)
    result.set(key, [
      ...store.proxy.position.slice(slot * 3, slot * 3 + 3),
      ...store.proxy.form.slice(slot * 2, slot * 2 + 2),
      ...store.proxy.material.slice(slot * 6, slot * 6 + 6),
    ])
  }
  for (let slot = 0; slot < store.transition.id.length; slot++) {
    if (store.transition.owner[slot] !== owner ||
        (store.transition.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const from = stateKeyById.get(store.transition.from[slot]!)
    const to = stateKeyById.get(store.transition.to[slot]!)
    if (!from || !to) continue
    result.set(`transition:${store.transition.source[slot]}:${from}:${to}`, [
      ...store.transition.control.slice(slot * 12, slot * 12 + 12),
    ])
  }
  const endpoint = (kind: number, id: number): string | null => {
    if (kind === BULK_STORE_ENDPOINT_KIND.field) {
      const slot = id - 1
      return store.fieldAlias.atom[slot]! * 2 === owner
        ? `field:${store.fieldAlias.field[slot]}`
        : null
    }
    if (kind === BULK_STORE_ENDPOINT_KIND["field-proxy"]) return proxyKeyById.get(id) ?? null
    return orbitalKeyById.get(id) ?? null
  }
  for (let slot = 0; slot < store.relation.id.length; slot++) {
    if (store.relation.owner[slot] !== owner ||
        (store.relation.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0 ||
        store.relation.batch[slot] === 0) continue
    const a = endpoint(store.relation.aKind[slot]!, store.relation.a[slot]!)
    const b = endpoint(store.relation.bKind[slot]!, store.relation.b[slot]!)
    const start = store.relation.controlStart[slot]!
    if (!a || !b || start < 0) continue
    result.set(`relation:${store.relation.kind[slot]}:${a}:${b}`, [
      ...store.relation.control.slice(start, start + 24),
    ])
  }
  return result
}

const expectSemanticGeometryParity = (
  actual: ReadonlyMap<string, number[]>,
  expected: ReadonlyMap<string, number[]>,
): void => {
  expect([...actual.keys()].toSorted()).toEqual([...expected.keys()].toSorted())
  for (const [key, values] of expected) {
    expectNumericParity(actual.get(key)!, values, key)
  }
}

const expectParity = (store: BulkStore, manifest: BulkManifest): void => {
  const actual = groups(store)
  const expected = oracleGroups(manifest)
  expect([...actual.keys()].toSorted()).toEqual([...expected.keys()].toSorted())
  for (const [key, right] of expected) {
    const left = actual.get(key)!
    expect(left.owner).toBe(right.owner)
    right.position.forEach((value, index) => {
      if (Math.abs(left.position[index]! - value) > 1e-5) {
        throw new Error(
          `Field group ${key} coordinate ${index}: ${left.position[index]} != ${value}`,
        )
      }
    })
  }
}

const recorder = () => {
  const calls = {
    aliases: [] as number[][],
    fields: [] as number[][],
    removed: [] as number[][],
    relationBatches: [] as number[],
  }
  const renderer: BulkStoreRenderer = {
    fieldAliasesRegrouped(aliases, fields, removed) {
      calls.aliases.push([...aliases])
      calls.fields.push([...fields])
      calls.removed.push([...removed])
    },
    orbitalMaterialChanged() {},
    proxyMaterialChanged() {},
    transitionBatchChanged() {},
    relationBatchChanged(batch) { calls.relationBatches.push(batch) },
    force() {},
  }
  return {calls, renderer}
}

const gluon = (atom: number, fieldId: number, valueId: number): Particle => ({
  part: "gluon",
  op: "replace",
  path: atom,
  ts: 1,
  value: {fields: {[String(fieldId)]: {valueId, value: valueId}}},
})

describe("Bulk Store local centered-nested regroup", () => {
  test("applies canonical Field copy/remove to exact Store slots and hides tombstones", () => {
    const store = storeFor(baseManifest())
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton",
      op: "copy",
      path: "field",
      from: 101,
      ts: 1,
      value: {
        id: 106,
        wimp: "test/2",
        localId: 6,
        key: "copied",
        type: "number",
        required: false,
        label: "Copied",
      },
    }]})
    const copied = Array.from({length: store.fieldAlias.id.length}, (_, slot) => slot)
      .filter((slot) => store.fieldAlias.field[slot] === 106 &&
        (store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0)
    expect(copied).toHaveLength(1)
    expect(store.fieldAlias.atom[copied[0]!]).toBe(1)
    expect(groups(store).has("1:106")).toBe(true)

    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton",
      op: "remove",
      path: "field",
      ts: 2,
      value: {
        id: 106,
        wimp: "test/2",
        localId: 6,
        key: "copied",
        type: "number",
        required: false,
        label: "Copied",
      },
    }]})
    const rendered = bulkStoreRenderManifest(store)
    expect(rendered.fieldAliases.some((alias) => alias.sourceFieldId === 106)).toBe(false)
    expect(rendered.manifest.fieldParticles.some((field) => field.fieldId === 106)).toBe(false)
  })

  test("moves a canonical WIMP dictionary key without changing Atom-local identity", () => {
    const store = storeFor(baseManifest())
    const {renderer} = recorder()
    const before = Array.from(store.dark.id)
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton",
      op: "move",
      path: "wimp",
      from: "test/2",
      ts: 1,
      value: {src: "test/renamed", name: "Renamed", desc: null},
    }]})
    expect(store.wimp.src).toContain("test/renamed")
    expect(store.wimp.src).not.toContain("test/2")
    expect(Array.from(store.dark.id)).toEqual(before)
    const rootSlot = Array.from(store.dark.id).indexOf(2)
    expect(store.text[store.dark.label[rootSlot]!]).toBe("Renamed")
  })

  test("keeps distinct canonical Conditions addressable after initial", () => {
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
    const projection = lifecycle.state().projection
    const root = projection.atoms.find((atom) =>
      atom.parentAtom === null && atom.parentTopology === null)
    const source = projection.conditions[0]
    if (!root || !source) throw new Error("Condition fixture is absent")
    const store = activateBulkStore(buildDirectBulkStore(projection, root.id))
    const {renderer} = recorder()
    const addedId = Math.max(...projection.conditions.map(({id}) => id)) + 1
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton",
      op: "copy",
      path: "condition",
      from: source.id,
      ts: 1,
      value: {
        id: addedId,
        wimp: source.wimp,
        localId: addedId,
        transition: source.transition,
        field: source.field,
        position: source.position + 1,
        predicate: {test: true},
      },
    }]})
    const originalSlot = Array.from(store.conditionSource.id).indexOf(source.id)
    const addedSlot = Array.from(store.conditionSource.id).indexOf(addedId)
    expect(originalSlot).toBeGreaterThanOrEqual(0)
    expect(addedSlot).toBeGreaterThanOrEqual(0)
    expect(store.conditionSource.transition[addedSlot]).toBe(source.transition)
    expect(store.conditionSource.field[addedSlot]).toBe(source.field)

    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton",
      op: "remove",
      path: "condition",
      ts: 2,
      value: {
        id: source.id,
        wimp: source.wimp,
        localId: source.id,
        transition: source.transition,
        field: source.field,
        position: source.position,
        predicate: source.predicate,
      },
    }]})
    expect(store.conditionSource.flags[originalSlot]! & BULK_STORE_FLAG_REMOVED).not.toBe(0)
    expect(store.conditionSource.flags[addedSlot]! & BULK_STORE_FLAG_REMOVED).toBe(0)
  })

  test("locally adds a Condition field with exact centered-nested parity", () => {
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
    const projection = lifecycle.state().projection
    const root = projection.atoms.find((atom) =>
      atom.parentAtom === null && atom.parentTopology === null)
    const source = projection.conditions[0]
    if (!root || !source) throw new Error("Condition fixture is absent")
    const field = projection.fields.find((candidate) =>
      candidate.wimp === source.wimp && !projection.conditions.some((condition) =>
        condition.transition === source.transition && condition.field === candidate.id))
    const atom = projection.atoms.find((candidate) => candidate.wimp === source.wimp)
    if (!field || !atom) throw new Error("Condition parity field/Atom is absent")
    const store = activateBulkStore(buildDirectBulkStore(projection, root.id))
    const before = directStateIds(store, projection, atom.id)
    const id = Math.max(...projection.conditions.map((condition) => condition.id)) + 1
    const row = {
      id,
      wimp: source.wimp,
      localId: id,
      transition: source.transition,
      field: field.id,
      position: source.position + 100,
      predicate: null,
    }
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "add", path: "condition", ts: 1, value: row,
    }]})
    const next = structuredClone(projection)
    next.conditions.push(row)
    const expected = activateBulkStore(buildDirectBulkStore(next, root.id))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, atom.id * 2, updatedStateIds(store, next, atom.id, before)),
      ownerSemanticGeometry(expected, atom.id * 2, directStateIds(expected, next, atom.id)),
    )
  })

  test("locally copies a Transition branch including causal occurrences", () => {
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
    const projection = lifecycle.state().projection
    const root = projection.atoms.find((atom) =>
      atom.parentAtom === null && atom.parentTopology === null)
    const source = projection.transitions.find((transition) =>
      projection.states.filter((state) => state.wimp === transition.wimp).length > 1)
    if (!root || !source) throw new Error("Transition fixture is absent")
    const atom = projection.atoms.find((candidate) => candidate.wimp === source.wimp)
    if (!atom) throw new Error("Transition parity Atom is absent")
    const store = activateBulkStore(buildDirectBulkStore(projection, root.id))
    const before = directStateIds(store, projection, atom.id)
    const id = Math.max(...projection.transitions.map((transition) => transition.id)) + 1
    const row = {...source, id, localId: id, position: source.position + 100}
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "copy", path: "transition", from: source.id, ts: 1, value: row,
    }]})
    const next = structuredClone(projection)
    next.transitions.push(row)
    const expected = activateBulkStore(buildDirectBulkStore(next, root.id))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, atom.id * 2, updatedStateIds(store, next, atom.id, before)),
      ownerSemanticGeometry(expected, atom.id * 2, directStateIds(expected, next, atom.id)),
    )
  })

  test("locally copies a State sleeve without replacing the Store", () => {
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
    const projection = lifecycle.state().projection
    const root = projection.atoms.find((atom) =>
      atom.parentAtom === null && atom.parentTopology === null)
    const source = projection.states[0]
    if (!root || !source) throw new Error("State fixture is absent")
    const atom = projection.atoms.find((candidate) => candidate.wimp === source.wimp)
    if (!atom) throw new Error("State parity Atom is absent")
    const store = activateBulkStore(buildDirectBulkStore(projection, root.id))
    const storeIdentity = store
    const before = directStateIds(store, projection, atom.id)
    const id = Math.max(...projection.states.map((state) => state.id)) + 1
    const row = {
      ...source,
      id,
      localId: id,
      name: `${source.name} copy`,
      position: source.position + 1,
    }
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "copy", path: "state", from: source.id, ts: 1, value: row,
    }]})
    const next = structuredClone(projection)
    next.states.push(row)
    const expected = activateBulkStore(buildDirectBulkStore(next, root.id))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, atom.id * 2, updatedStateIds(store, next, atom.id, before)),
      ownerSemanticGeometry(expected, atom.id * 2, directStateIds(expected, next, atom.id)),
    )
    expect(store).toBe(storeIdentity)
  })

  test("locally adds a Process from canonical source facts with exact parity", () => {
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
    const projection = lifecycle.state().projection
    const root = projection.atoms.find((atom) =>
      atom.parentAtom === null && atom.parentTopology === null)
    const atom = projection.atoms.find((candidate) => {
      const states = projection.states.filter((state) => state.wimp === candidate.wimp)
      const fields = projection.fields.filter((field) => field.wimp === candidate.wimp)
      return states.length > 0 && fields.length > 1
    })
    if (!root || !atom) throw new Error("Process parity Atom is absent")
    const states = projection.states.filter((state) => state.wimp === atom.wimp)
    const fields = projection.fields.filter((field) => field.wimp === atom.wimp)
    const id = Math.max(0, ...projection.processes.map((process) => process.id)) + 100
    const row = {
      id,
      wimp: atom.wimp,
      localId: id,
      state: states[0]!.name,
      descriptor: {
        type: "action" as const,
        key: `process-${id}`,
        label: `Process ${id}`,
        success: {
          readFields: [[fields[0]!.id, fields[0]!.key]],
          writeFields: [[fields[1]!.id, fields[1]!.key]],
        },
      },
    }
    const store = activateBulkStore(buildDirectBulkStore(projection, root.id))
    const before = directStateIds(store, projection, atom.id)
    const storeIdentity = store
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "add", path: "process", ts: 1, value: row,
    }]})
    const next = structuredClone(projection)
    next.processes.push(row)
    const expected = activateBulkStore(buildDirectBulkStore(next, root.id))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, atom.id * 2, updatedStateIds(store, next, atom.id, before)),
      ownerSemanticGeometry(expected, atom.id * 2, directStateIds(expected, next, atom.id)),
    )
    expect(store).toBe(storeIdentity)
  })

  test("locally adds an all-State Reaction from canonical incidence slices", () => {
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
    const projection = lifecycle.state().projection
    const root = projection.atoms.find((atom) =>
      atom.parentAtom === null && atom.parentTopology === null)
    const atom = projection.atoms.find((candidate) => {
      const states = projection.states.filter((state) => state.wimp === candidate.wimp)
      const fields = projection.fields.filter((field) => field.wimp === candidate.wimp)
      return states.length > 1 && fields.length > 1
    })
    if (!root || !atom) throw new Error("Reaction parity Atom is absent")
    const fields = projection.fields.filter((field) => field.wimp === atom.wimp)
    const id = Math.max(0, ...projection.reactions.map((reaction) => reaction.id)) + 100
    const row = {
      id,
      wimp: atom.wimp,
      localId: id,
      key: `reaction-${id}`,
      label: `Reaction ${id}`,
      read: [fields[0]!.id],
      write: [fields[1]!.id],
      states: [],
    }
    const store = activateBulkStore(buildDirectBulkStore(projection, root.id))
    const before = directStateIds(store, projection, atom.id)
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "add", path: "reaction", ts: 1, value: row,
    }]})
    const next = structuredClone(projection)
    next.reactions.push(row)
    const expected = activateBulkStore(buildDirectBulkStore(next, root.id))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, atom.id * 2, updatedStateIds(store, next, atom.id, before)),
      ownerSemanticGeometry(expected, atom.id * 2, directStateIds(expected, next, atom.id)),
    )
  })

  test("moves and copies Process and Reaction rows by persisted table PK", () => {
    const projection = structuralProjection()
    const process = {
      id: 701,
      wimp: "test/source",
      localId: 1,
      state: "source-idle",
      descriptor: {
        type: "action" as const,
        key: "source-process",
        success: {readFields: [[101, "source"]], writeFields: [[101, "source"]]},
      },
    }
    const reaction = {
      id: 702,
      wimp: "test/source",
      localId: 1,
      key: "source-reaction",
      label: "Source reaction",
      read: [101], write: [101], states: [301],
    }
    projection.processes.push(process)
    projection.reactions.push(reaction)
    const store = activateBulkStore(buildDirectBulkStore(projection, 1))
    const {renderer} = recorder()

    const processCopy = {
      ...process,
      id: 711,
      wimp: "test/target",
      localId: 2,
      state: "target-idle",
      descriptor: {...process.descriptor, key: "target-process-copy"},
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "copy", path: "process", from: process.id, ts: 1,
      value: processCopy,
    }]})
    const processMove = {
      ...process,
      wimp: "test/target",
      localId: 3,
      state: "target-idle",
      descriptor: {...process.descriptor, key: "target-process-move"},
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "move", path: "process", from: process.id, ts: 2,
      value: processMove,
    }]})

    const reactionCopy = {
      ...reaction,
      id: 712,
      wimp: "test/target",
      localId: 2,
      key: "target-reaction-copy",
      read: [201], write: [201], states: [401],
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "copy", path: "reaction", from: reaction.id, ts: 3,
      value: reactionCopy,
    }]})
    const reactionMove = {
      ...reaction,
      wimp: "test/target",
      localId: 3,
      key: "target-reaction-move",
      read: [201], write: [201], states: [401],
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "move", path: "reaction", from: reaction.id, ts: 4,
      value: reactionMove,
    }]})

    const next = structuralProjection()
    next.processes.push(processCopy, processMove)
    next.reactions.push(reactionCopy, reactionMove)
    const expected = activateBulkStore(buildDirectBulkStore(next, 1))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, 4, updatedStateIds(store, next, 2, new Map())),
      ownerSemanticGeometry(expected, 4, directStateIds(expected, next, 2)),
    )
    expect(Array.from(store.processSource.id).filter((id) => id === 701)).toHaveLength(1)
    expect(Array.from(store.processSource.id)).toContain(711)
    expect(Array.from(store.reactionSource.id).filter((id) => id === 702)).toHaveLength(1)
    expect(Array.from(store.reactionSource.id)).toContain(712)
  })

  test("materializes a new Atom from source tables when its WIMP has no visual template", () => {
    const projection: BulkRuntimeProjection = {
      atoms: [{
        id: 1, parentAtom: null, parentTopology: null,
        wimp: "test/root", position: 0,
      }],
      topologies: [],
      wimps: [
        {src: "test/root", name: "Root"},
        {src: "test/child", name: "Child"},
      ],
      fields: [
        {id: 101, wimp: "test/child", key: "input", type: "number", label: "Input"},
        {id: 102, wimp: "test/child", key: "output", type: "number", label: "Output"},
      ],
      states: [
        {id: 201, wimp: "test/child", name: "idle", position: 0},
        {id: 202, wimp: "test/child", name: "ready", position: 1},
      ],
      transitions: [{
        id: 301, wimp: "test/child", fromState: 201, toState: 202, position: 0,
      }],
      conditions: [{
        id: 401, wimp: "test/child", transition: 301, field: 101,
        position: 0, predicate: null,
      }],
      processes: [{
        id: 501, wimp: "test/child", state: "ready",
        descriptor: {
          type: "action", key: "prepare", label: "Prepare",
          success: {readFields: [[101, "input"]], writeFields: [[102, "output"]]},
        },
      }],
      reactions: [{
        id: 601, wimp: "test/child", key: "observe", label: "Observe",
        read: [101], write: [102], states: [],
      }],
      atomStates: [{atom: 1, state: null}],
      fieldEnumVariants: [], atomValues: [], values: [], valueItems: [],
      matterParticles: [], matterTopologyBindingPaths: [], matterChildWimpBindingPaths: [],
    }
    const store = activateBulkStore(buildDirectBulkStore(projection, 1))
    const storeIdentity = store
    const {renderer} = recorder()
    const payload = {
      atom: {
        id: 2, parentAtom: 1, parentTopology: null,
        wimp: "test/child", position: 0,
      },
      state: {metaState: 201},
      values: [{atom: 2, field: 101, value: 701}],
      valueRecords: [{id: 701, kind: "number", number: 7}],
      valueItems: [],
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "add", path: "atom/2", ts: 1, value: payload,
    }]})
    const next = structuredClone(projection)
    next.atoms.push(payload.atom)
    next.atomStates.push({atom: 2, state: 201})
    next.atomValues.push({atom: 2, field: 101, value: 701})
    next.values.push({
      id: 701, kind: "number", booleanValue: null, numberValue: 7,
      textValue: null, enumValue: null,
    })
    const expected = activateBulkStore(buildDirectBulkStore(next, 1))
    expectVisualParity(store, groups(expected))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, 4, updatedStateIds(store, next, 2, new Map())),
      ownerSemanticGeometry(expected, 4, directStateIds(expected, next, 2)),
    )
    expect(store).toBe(storeIdentity)
  })

  test("replaces an Atom WIMP and bindings from the resulting full entity only", () => {
    const projection = structuralProjection()
    const store = activateBulkStore(buildDirectBulkStore(projection, 1))
    const storeIdentity = store
    const before = directStateIds(store, projection, 2)
    const payload = {
      atom: {
        id: 2, parentAtom: null, parentTopology: 1,
        wimp: "test/target", position: 0,
      },
      state: {metaState: 401},
      values: [{atom: 2, field: 201, value: 801}],
      valueRecords: [{id: 801, kind: "number", number: 8}],
      valueItems: [],
    }
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "replace", path: "atom/2", ts: 1, value: payload,
    }]})
    const next = structuralProjection()
    next.atoms[1] = payload.atom
    next.atomStates[1] = {atom: 2, state: 401}
    next.atomValues.splice(0, next.atomValues.length, {atom: 2, field: 201, value: 801})
    next.values.splice(0, next.values.length, {
      id: 801, kind: "number", booleanValue: null, numberValue: 8,
      textValue: null, enumValue: null,
    })
    const expected = activateBulkStore(buildDirectBulkStore(next, 1))
    expectVisualParity(store, groups(expected))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, 4, updatedStateIds(store, next, 2, before)),
      ownerSemanticGeometry(expected, 4, directStateIds(expected, next, 2)),
    )
    expect(store).toBe(storeIdentity)
  })

  test("replaces Topology owner, kind and position by local subtree updates", () => {
    const projection = structuralProjection()
    const store = activateBulkStore(buildDirectBulkStore(projection, 1))
    const storeIdentity = store
    const before = directStateIds(store, projection, 2)
    const row = {
      id: 1,
      parentAtom: null,
      parentTopology: 2,
      kind: "macho" as const,
      position: 0,
    }
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "replace", path: "topology/1", ts: 1, value: row,
    }]})
    const next = structuralProjection()
    next.topologies[0] = row
    const expected = activateBulkStore(buildDirectBulkStore(next, 1))
    expectVisualParity(store, groups(expected))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, 4, updatedStateIds(store, next, 2, before)),
      ownerSemanticGeometry(expected, 4, directStateIds(expected, next, 2)),
    )
    const actualTopology = Array.from(store.dark.id).indexOf(3)
    const expectedTopology = Array.from(expected.dark.id).indexOf(3)
    expect(store.dark.parent[actualTopology]).toBe(expected.dark.parent[expectedTopology])
    expect(store.dark.kind[actualTopology]).toBe(expected.dark.kind[expectedTopology])
    expectNumericParity(
      store.dark.form.slice(actualTopology * 2, actualTopology * 2 + 2),
      expected.dark.form.slice(expectedTopology * 2, expectedTopology * 2 + 2),
      "topology.form",
    )
    expect(store).toBe(storeIdentity)
  })

  test("moves and copies runtime Atoms without replacing the Store", () => {
    const projection = structuralProjection()
    const store = activateBulkStore(buildDirectBulkStore(projection, 1))
    const storeIdentity = store
    const {renderer} = recorder()
    const moved = {
      atom: {
        id: 3, parentAtom: null, parentTopology: 1,
        wimp: "test/source", position: 0,
      },
      state: {metaState: 301},
      values: [{atom: 3, field: 101, value: 701}],
      valueRecords: [{id: 701, kind: "number", number: 7}],
      valueItems: [],
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "move", path: "atom/3", from: "atom/2", ts: 1,
      value: moved,
    }]})
    const afterMove = structuralProjection()
    afterMove.atoms[1] = moved.atom
    afterMove.atomStates[1] = {atom: 3, state: 301}
    afterMove.atomValues[0] = {atom: 3, field: 101, value: 701}
    const expectedMove = activateBulkStore(buildDirectBulkStore(afterMove, 1))
    expectVisualParity(store, groups(expectedMove))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, 6, updatedStateIds(store, afterMove, 3, new Map())),
      ownerSemanticGeometry(expectedMove, 6, directStateIds(expectedMove, afterMove, 3)),
    )

    const copied = {
      atom: {
        id: 4, parentAtom: null, parentTopology: 1,
        wimp: "test/source", position: 1,
      },
      state: {metaState: 301},
      values: [{atom: 4, field: 101, value: 702}],
      valueRecords: [{id: 702, kind: "number", number: 9}],
      valueItems: [],
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "copy", path: "atom/4", from: "atom/3", ts: 2,
      value: copied,
    }]})
    const afterCopy = structuredClone(afterMove)
    afterCopy.atoms.push(copied.atom)
    afterCopy.atomStates.push({atom: 4, state: 301})
    afterCopy.atomValues.push({atom: 4, field: 101, value: 702})
    afterCopy.values.push({
      id: 702, kind: "number", booleanValue: null, numberValue: 9,
      textValue: null, enumValue: null,
    })
    const expectedCopy = activateBulkStore(buildDirectBulkStore(afterCopy, 1))
    expectVisualParity(store, groups(expectedCopy))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, 8, updatedStateIds(store, afterCopy, 4, new Map())),
      ownerSemanticGeometry(expectedCopy, 8, directStateIds(expectedCopy, afterCopy, 4)),
    )
    expect(store).toBe(storeIdentity)
  })

  test("moves and copies runtime Topology rows with exact parent relations", () => {
    const projection = structuralProjection()
    const store = activateBulkStore(buildDirectBulkStore(projection, 1))
    const storeIdentity = store
    const {renderer} = recorder()
    const moved = {
      id: 3, parentAtom: 1, parentTopology: null,
      kind: "fuzzy" as const, position: 0,
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "move", path: "topology/3", from: "topology/1", ts: 1,
      value: moved,
    }]})
    const afterMove = structuralProjection()
    afterMove.topologies[0] = moved
    afterMove.atoms[1] = {...afterMove.atoms[1]!, parentTopology: 3}
    const expectedMove = activateBulkStore(buildDirectBulkStore(afterMove, 1))
    expectVisualParity(store, groups(expectedMove))
    const movedAtomSlot = Array.from(store.dark.id).indexOf(4)
    expect(store.dark.parent[movedAtomSlot]).toBe(7)

    const copied = {
      id: 4, parentAtom: 1, parentTopology: null,
      kind: "macho" as const, position: 2,
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "copy", path: "topology/4", from: "topology/2", ts: 2,
      value: copied,
    }]})
    const afterCopy = structuredClone(afterMove)
    afterCopy.topologies.push(copied)
    const expectedCopy = activateBulkStore(buildDirectBulkStore(afterCopy, 1))
    const actualRoot = Array.from(store.dark.id).indexOf(2)
    const expectedRoot = Array.from(expectedCopy.dark.id).indexOf(2)
    expectNumericParity(
      store.dark.form.slice(actualRoot * 2, actualRoot * 2 + 2),
      expectedCopy.dark.form.slice(expectedRoot * 2, expectedRoot * 2 + 2),
      "topology-copy.root-form",
    )
    expect(store).toBe(storeIdentity)
  })

  test("activates the same Store and applies a multi-Field canonical payload once", () => {
    const store = storeFor(baseManifest())
    expect(store.field.position).toBeInstanceOf(Float32Array)
    expect(store.fieldAlias.value).toBeInstanceOf(Uint32Array)
    const {calls, renderer} = recorder()
    applyBulkGluonReplace(store, renderer, {
      part: "gluon",
      op: "replace",
      path: 1,
      ts: 1,
      value: {fields: {
        101: {valueId: 71, value: 71},
        105: {valueId: 72, value: 72},
      }},
    })
    const values = new Map(Array.from({length: store.fieldAlias.id.length}, (_, slot) => [
      store.fieldAlias.field[slot]!,
      store.fieldAlias.value[slot]!,
    ]))
    expect(values.get(101)).toBe(71)
    expect(values.get(105)).toBe(72)
    expect(calls.aliases).toHaveLength(1)
  })

  test("requires the previous canonical Value identity on remove", () => {
    const store = storeFor(baseManifest())
    const {renderer} = recorder()
    expect(() => applyBulkGluonRemove(store, renderer, {
      part: "gluon",
      op: "remove",
      path: 1,
      ts: 1,
      value: {fields: {101: {valueId: 999, value: null}}},
    })).toThrow("does not match")
    applyBulkGluonRemove(store, renderer, {
      part: "gluon",
      op: "remove",
      path: 1,
      ts: 1,
      value: {fields: {101: {valueId: 11, value: null}}},
    })
    const slot = Array.from(store.fieldAlias.field).indexOf(101)
    expect(store.fieldAlias.value[slot]).toBe(0)
  })

  test("splits one shared Value and preserves exact marker placement", () => {
    const manifest = baseManifest()
    const store = storeFor(manifest)
    const {calls, renderer} = recorder()

    applyBulkGluonReplace(store, renderer, gluon(4, 104, 40))
    const next = structuredClone(manifest)
    next.fieldParticles.find((entry) => entry.fieldId === 104)!.valueId = 40
    next.fieldParticles.find((entry) => entry.fieldId === 104)!.valueText = "40"
    next.relationChannels = []

    expectParity(store, next)
    expect(calls.aliases).toHaveLength(1)
    expect(calls.fields[0]!.length).toBeGreaterThan(0)
  })

  test("merges private markers and moves the group to its highest common owner", () => {
    const manifest = baseManifest()
    manifest.fieldParticles.find((entry) => entry.fieldId === 104)!.valueId = 40
    manifest.fieldParticles.find((entry) => entry.fieldId === 104)!.valueText = "40"
    manifest.relationChannels = []
    const store = storeFor(manifest)
    const {calls, renderer} = recorder()

    applyBulkGluonReplace(store, renderer, gluon(4, 104, 20))
    const next = structuredClone(manifest)
    next.fieldParticles.find((entry) => entry.fieldId === 104)!.valueId = 20
    next.fieldParticles.find((entry) => entry.fieldId === 104)!.valueText = "20"
    next.relationChannels = []

    expectParity(store, next)
    expect(groups(store).get("2:102|4:104")?.owner).toBe(4)
    expect(calls.removed[0]!.length).toBeGreaterThan(0)
  })

  test("widens only to the highest common owner when a sibling joins", () => {
    const manifest = baseManifest()
    const store = storeFor(manifest)
    const {renderer} = recorder()

    applyBulkGluonReplace(store, renderer, gluon(3, 103, 20))
    const next = structuredClone(manifest)
    next.fieldParticles.find((entry) => entry.fieldId === 103)!.valueId = 20
    next.fieldParticles.find((entry) => entry.fieldId === 103)!.valueText = "20"
    next.relationChannels = manifest.relationChannels ?? []

    expectParity(store, next)
    expect(groups(store).get("2:102|3:103|4:104")?.owner).toBe(2)
  })

  test("keeps real Lada Field split parity without a full browser rebuild", () => {
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
    const state = lifecycle.state()
    const initialVisual = prepareBulkInitialVisual(state.manifest, state.projection).payload
    const store = activateBulkStore(buildBulkStore(state.manifest, initialVisual))
    const shared = [...Map.groupBy(
      state.manifest.fieldParticles.filter((entry) => entry.valueId !== null),
      (entry) => entry.valueId!,
    ).values()].find((entries) =>
      new Set(entries.map((entry) => entry.parentDarkParticleId)).size > 1)
    if (!shared || shared.length < 2) throw new Error("Lada fixture has no shared Value")
    const target = shared.toSorted((left, right) =>
      right.parentDarkParticleId - left.parentDarkParticleId)[0]!
    const nextValue = Math.max(...state.manifest.fieldParticles.map((entry) => entry.valueId ?? 0)) + 1000
    const {renderer} = recorder()

    applyBulkGluonReplace(
      store,
      renderer,
      gluon(target.parentDarkParticleId / 2, target.fieldId, nextValue),
    )
    const nextManifest = structuredClone(state.manifest)
    const nextTarget = nextManifest.fieldParticles.find((entry) =>
      entry.parentDarkParticleId === target.parentDarkParticleId &&
      entry.fieldId === target.fieldId)
    if (!nextTarget) throw new Error("Lada target Field disappeared")
    nextTarget.valueId = nextValue
    nextTarget.valueText = String(nextValue)
    nextManifest.relationChannels = (nextManifest.relationChannels ?? []).filter(
      (channel) =>
        channel.relationKind !== "field-entanglement" ||
        (channel.fromId !== target.fieldParticleId &&
          channel.toId !== target.fieldParticleId),
    )
    const nextVisual = prepareBulkInitialVisual(nextManifest, state.projection).payload
    const expected = visualGroups(nextVisual)

    expectVisualParity(store, expected)
    const expectedStore = activateBulkStore(buildBulkStore(nextManifest, nextVisual))
    expectNumericParity(store.dark.form, expectedStore.dark.form, "dark.form")
    expectNumericParity(store.orbital.position, expectedStore.orbital.position, "orbital.position")
    expectNumericParity(store.proxy.position, expectedStore.proxy.position, "proxy.position")
    expectNumericParity(store.transition.control, expectedStore.transition.control, "transition.control")
    const relationControls = (source: BulkStore): Map<string, number[]> => {
      const endpointKey = (kind: number, id: number): string => {
        if (kind !== BULK_STORE_ENDPOINT_KIND.field) return `${kind}:${id}`
        const alias = id - 1
        return `field:${source.fieldAlias.atom[alias]}:${source.fieldAlias.field[alias]}`
      }
      return new Map(Array.from(
        {length: source.relation.id.length},
        (_, slot) => slot,
      ).filter((slot) =>
        (source.relation.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0 &&
        source.relation.controlStart[slot]! >= 0
      ).map((slot) => {
        const start = source.relation.controlStart[slot]!
        return [
          [
            source.relation.owner[slot],
            source.relation.kind[slot],
            endpointKey(source.relation.aKind[slot]!, source.relation.a[slot]!),
            endpointKey(source.relation.bKind[slot]!, source.relation.b[slot]!),
          ].join(":"),
          Array.from(source.relation.control.slice(start, start + 24)),
        ] as const
      }))
    }
    const actualRelations = relationControls(store)
    const expectedRelations = relationControls(expectedStore)
    expect([...actualRelations.keys()].toSorted())
      .toEqual([...expectedRelations.keys()].toSorted())
    for (const [key, expectedControls] of expectedRelations) {
      expectNumericParity(
        actualRelations.get(key)!,
        expectedControls,
        `relation.control.${key}`,
      )
    }
  })

  test("keeps real Lada Photon material parity without geometry or full-scene work", () => {
    const lifecycle = new BulkVisualSceneLifecycle()
    lifecycle.prepare(structuredClone(snapshotJson) as BulkObserverSnapshot)
    const initial = lifecycle.state()
    const visual = prepareBulkInitialVisual(initial.manifest, initial.projection).payload
    const store = activateBulkStore(buildBulkStore(initial.manifest, visual))
    const byOwner = Map.groupBy(
      (initial.manifest.orbitalParticles ?? []).filter((entry) =>
        entry.orbitalParticleKind === "state" && entry.sourceId === entry.sleeveRootStateId),
      (entry) => entry.parentDarkParticleId,
    )
    const states = [...byOwner.values()].find((entries) =>
      entries.some((entry) => entry.current) && entries.some((entry) => !entry.current))
    const target = states?.find((entry) => !entry.current)
    if (!target) throw new Error("Lada fixture has no alternate State")
    const before = {
      dark: Array.from(store.dark.form),
      field: Array.from(store.field.position),
      orbital: Array.from(store.orbital.position),
      proxy: Array.from(store.proxy.position),
      transition: Array.from(store.transition.control),
      relation: Array.from(store.relation.control),
    }
    const calls = {orbital: 0, proxy: 0, transition: 0, relation: 0}
    const renderer: BulkStoreRenderer = {
      fieldAliasesRegrouped() { throw new Error("Photon must not regroup Fields") },
      orbitalMaterialChanged() { calls.orbital += 1 },
      proxyMaterialChanged() { calls.proxy += 1 },
      transitionBatchChanged() { calls.transition += 1 },
      relationBatchChanged() { calls.relation += 1 },
      force() {},
    }
    const photon: Particle = {
      part: "photon",
      op: "replace",
      path: target.parentDarkParticleId / 2,
      ts: 1,
      value: target.label,
    }

    applyBulkPhotonReplace(store, renderer, photon)
    const oracleUpdate = lifecycle.apply(photon)
    const patch = oracleUpdate.application?.patch
    if (!patch) throw new Error("legacy parity oracle did not produce a Photon patch")
    const next = lifecycle.state()
    const orbitalSlot = new Map(visual.orbitals.map((entry, slot) => [entry.orbitalParticleId, slot] as const))
    for (const entry of patch.orbitalParticles) {
      const slot = orbitalSlot.get(entry.orbitalParticleId)
      if (slot === undefined) continue
      const actual = store.orbital.flags[slot]!
      expect((actual & BULK_STORE_FLAG_CURRENT) !== 0).toBe(entry.current)
      expect((actual & BULK_STORE_FLAG_ACTIVE) !== 0).toBe(entry.active)
    }
    for (const entry of patch.orbitalMaterials) {
      const slot = orbitalSlot.get(entry.orbitalParticleId)
      if (slot === undefined) continue
      expectNumericParity(
        store.orbital.material.slice(slot * 6, slot * 6 + 6),
        [...entry.material.color, entry.material.opacity, entry.material.glowIntensity, entry.material.highlightSize],
        `photon.orbital.material.${slot}`,
      )
    }
    const proxySlot = new Map(visual.fieldProxies.map((entry, slot) => [entry.fieldProxyId, slot] as const))
    for (const entry of patch.fieldProxyMaterials) {
      const slot = proxySlot.get(entry.fieldProxyId)
      if (slot === undefined) continue
      expectNumericParity(
        store.proxy.material.slice(slot * 6, slot * 6 + 6),
        [...entry.material.color, entry.material.opacity, entry.material.glowIntensity, entry.material.highlightSize],
        `photon.proxy.material.${slot}`,
      )
    }
    const transitionSlot = new Map((initial.manifest.transitionChannels ?? []).map((entry, slot) =>
      [entry.transitionChannelId, slot] as const))
    for (const entry of next.manifest.transitionChannels ?? []) {
      const slot = transitionSlot.get(entry.transitionChannelId)
      if (slot === undefined) continue
      expect((store.transition.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0).toBe(entry.active)
    }
    const relationSlot = new Map((initial.manifest.relationChannels ?? []).map((entry, slot) =>
      [entry.relationChannelId, slot] as const))
    for (const entry of next.manifest.relationChannels ?? []) {
      const slot = relationSlot.get(entry.relationChannelId)
      if (slot === undefined || store.relation.batch[slot] === 0) continue
      const active = (store.relation.flags[slot]! & BULK_STORE_FLAG_ACTIVE) !== 0
      if (active !== entry.active) {
        throw new Error(`Photon relation ${entry.relationChannelId} (${entry.relationKind}) active ${active} != ${entry.active}`)
      }
    }
    const lineValues = (material: (typeof patch.transitionPaths)[number]["material"]): number[] => [
      ...material.color,
      ...material.glowColor,
      material.glowIntensity,
      material.opacity,
    ]
    for (const entry of patch.transitionPaths) {
      const slot = transitionSlot.get(entry.transitionChannelId)
      if (slot === undefined) continue
      const batch = store.transition.batch[slot]! - 1
      expectNumericParity(
        store.batch.material.slice(batch * BULK_STORE_LINE_MATERIAL_STRIDE, (batch + 1) * BULK_STORE_LINE_MATERIAL_STRIDE),
        lineValues(entry.material),
        `photon.transition.material.${slot}`,
      )
    }
    for (const entry of patch.relationPaths) {
      const slot = relationSlot.get(entry.relationChannelId)
      if (slot === undefined) continue
      const batch = store.relation.batch[slot]! - 1
      expectNumericParity(
        store.batch.material.slice(batch * BULK_STORE_LINE_MATERIAL_STRIDE, (batch + 1) * BULK_STORE_LINE_MATERIAL_STRIDE),
        lineValues(entry.material),
        `photon.relation.material.${slot}`,
      )
    }
    expect(Array.from(store.dark.form)).toEqual(before.dark)
    expect(Array.from(store.field.position)).toEqual(before.field)
    expect(Array.from(store.orbital.position)).toEqual(before.orbital)
    expect(Array.from(store.proxy.position)).toEqual(before.proxy)
    expect(Array.from(store.transition.control)).toEqual(before.transition)
    expect(Array.from(store.relation.control)).toEqual(before.relation)
    expect(calls.orbital).toBeGreaterThan(0)
    expect(calls.proxy).toBeGreaterThan(0)
    expect(calls.transition).toBeGreaterThan(0)
    expect(calls.relation).toBeGreaterThan(0)
  })
})

describe("Bulk Store local outside-in updates", () => {
  test("rebinds Value and incident entanglement without moving outside-in geometry", () => {
    const source = baseManifest()
    const store = outsideStoreFor(source)
    expect(store.layout).toBe(BULK_STORE_LAYOUT_OUTSIDE_IN)
    const before = {
      darkPosition: Array.from(store.dark.position),
      darkForm: Array.from(store.dark.form),
      fieldPosition: Array.from(store.field.position),
      orbitalPosition: Array.from(store.orbital.position),
    }
    const {calls, renderer} = recorder()

    applyBulkGluonReplace(store, renderer, gluon(2, 102, 11))

    expect(Array.from(store.dark.position)).toEqual(before.darkPosition)
    expect(Array.from(store.dark.form)).toEqual(before.darkForm)
    expect(Array.from(store.field.position)).toEqual(before.fieldPosition)
    expect(Array.from(store.orbital.position)).toEqual(before.orbitalPosition)
    const alias = Array.from(store.fieldAlias.id).findIndex((_, slot) =>
      store.fieldAlias.atom[slot] === 2 && store.fieldAlias.field[slot] === 102)
    expect(store.fieldAlias.value[alias]).toBe(11)
    expect(calls.fields.flat()).toContain(store.fieldAlias.marker[alias]! - 1)
    const activeEntanglements = Array.from(
      {length: store.relation.id.length},
      (_, slot) => slot,
    ).filter((slot) =>
      store.relation.kind[slot] === 0 &&
      (store.relation.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0
    )
    expect(activeEntanglements).toHaveLength(1)
    const relationSlot = activeEntanglements[0]!
    const batch = store.relation.batch[relationSlot]!
    const start = store.relation.controlStart[relationSlot]!
    expect(batch).toBeGreaterThan(0)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(calls.relationBatches).toContain(batch)

    const next = structuredClone(source)
    next.fieldParticles.find((entry) =>
      entry.parentDarkParticleId === 4 && entry.fieldId === 102
    )!.valueId = 11
    next.relationChannels = [{
      relationChannelId: "entanglement/root/to/child",
      parentDarkParticleId: 2,
      relationKind: "field-entanglement",
      fromKind: "field",
      fromId: "atom/1/field/101",
      toKind: "field",
      toId: "atom/2/field/102",
      active: true,
    }]
    const expected = outsideStoreFor(next)
    const expectedSlot = Array.from(
      {length: expected.relation.id.length},
      (_, slot) => slot,
    ).find((slot) => expected.relation.kind[slot] === 0)!
    const expectedStart = expected.relation.controlStart[expectedSlot]!
    expectNumericParity(
      store.relation.control.slice(start, start + 24),
      expected.relation.control.slice(expectedStart, expectedStart + 24),
      "outside-in entanglement controls",
    )
  })

  test("removes an outside-in entanglement from its exact renderer batch", () => {
    const source = baseManifest()
    source.fieldParticles.find((entry) =>
      entry.parentDarkParticleId === 4 && entry.fieldId === 102
    )!.valueId = 11
    source.relationChannels = [{
      relationChannelId: "entanglement/root/to/child",
      parentDarkParticleId: 2,
      relationKind: "field-entanglement",
      fromKind: "field",
      fromId: "atom/1/field/101",
      toKind: "field",
      toId: "atom/2/field/102",
      active: true,
    }]
    const store = outsideStoreFor(source)
    const relationSlot = Array.from(
      {length: store.relation.id.length},
      (_, slot) => slot,
    ).find((slot) => store.relation.kind[slot] === 0)!
    const previousBatch = store.relation.batch[relationSlot]!
    const before = Array.from(store.field.position)
    const {calls, renderer} = recorder()

    applyBulkGluonReplace(store, renderer, gluon(2, 102, 999))

    expect(Array.from(store.field.position)).toEqual(before)
    expect(Array.from(
      {length: store.relation.id.length},
      (_, slot) => slot,
    ).filter((slot) =>
      store.relation.kind[slot] === 0 &&
      (store.relation.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0
    )).toHaveLength(0)
    expect(calls.relationBatches).toContain(previousBatch)
  })

  test("adds and removes one declaration occurrence with rebuilt outside-in parity", () => {
    const source = baseManifest()
    const store = outsideStoreFor(source)
    const {renderer} = recorder()
    const added = {
      ...field(1, 106, 0),
      valueId: null,
      valueText: null,
    }
    const row = {
      id: 106,
      wimp: "test/2",
      localId: 106,
      key: "field-106",
      type: "number",
      required: false,
      label: "Field 106",
    }

    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton",
      op: "add",
      path: "field",
      ts: 1,
      value: row,
    }]})
    const expected = outsideStoreFor({...source, fieldParticles: [...source.fieldParticles, added]})
    const activeFields = (value: BulkStore): number[] => Array.from(
      {length: value.field.id.length},
      (_, slot) => slot,
    ).filter((slot) => (value.field.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0)
    const actualSlots = activeFields(store)
    const expectedSlots = activeFields(expected)
    const fieldPositions = (value: BulkStore, slots: readonly number[]) => new Map(
      slots.map((slot) => [
        `${value.field.owner[slot]}:${value.field.field[slot]}`,
        Array.from(value.field.position.slice(slot * 3, slot * 3 + 3)),
      ] as const),
    )
    const actualFields = fieldPositions(store, actualSlots)
    const expectedFields = fieldPositions(expected, expectedSlots)
    expect([...actualFields.keys()].toSorted()).toEqual([...expectedFields.keys()].toSorted())
    for (const [key, position] of expectedFields) {
      expectNumericParity(actualFields.get(key)!, position, `outside-in.add.field.${key}`)
    }
    expectNumericParity(store.dark.position, expected.dark.position, "outside-in.add.dark.position")
    expectNumericParity(store.dark.form, expected.dark.form, "outside-in.add.dark.form")

    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton",
      op: "remove",
      path: "field",
      from: 106,
      ts: 2,
      value: row,
    }]})
    expect(activeFields(store).map((slot) => store.field.field[slot])).not.toContain(106)
    expectNumericParity(store.dark.position, outsideStoreFor(source).dark.position, "outside-in.remove.dark.position")
    expectNumericParity(store.dark.form, outsideStoreFor(source).dark.form, "outside-in.remove.dark.form")
  })

  test("replaces an Atom WIMP and bindings with exact outside-in owner geometry", () => {
    const projection = structuralProjection()
    const store = outsideProjectionStore(projection)
    const before = directStateIds(store, projection, 2)
    const payload = {
      atom: {
        id: 2, parentAtom: null, parentTopology: 1,
        wimp: "test/target", position: 0,
      },
      state: {metaState: 401},
      values: [{atom: 2, field: 201, value: 801}],
      valueRecords: [{id: 801, kind: "number", number: 8}],
      valueItems: [],
    }
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "replace", path: "atom/2", ts: 1, value: payload,
    }]})

    const next = structuralProjection()
    next.atoms[1] = payload.atom
    next.atomStates[1] = {atom: 2, state: 401}
    next.atomValues.splice(0, next.atomValues.length, {atom: 2, field: 201, value: 801})
    next.values.splice(0, next.values.length, {
      id: 801, kind: "number", booleanValue: null, numberValue: 8,
      textValue: null, enumValue: null,
    })
    const expected = outsideProjectionStore(next)
    expectActiveDarkParity(store, expected)
    expectVisualParity(store, groups(expected))
    expectSemanticGeometryParity(
      ownerSemanticGeometry(store, 4, updatedStateIds(store, next, 2, before)),
      ownerSemanticGeometry(expected, 4, directStateIds(expected, next, 2)),
    )
  })

  test("replaces Topology owner, kind and position with exact outside-in parent geometry", () => {
    const projection = structuralProjection()
    const store = outsideProjectionStore(projection)
    const row = {
      id: 1,
      parentAtom: null,
      parentTopology: 2,
      kind: "macho" as const,
      position: 0,
    }
    const {renderer} = recorder()
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "replace", path: "topology/1", ts: 1, value: row,
    }]})

    const next = structuralProjection()
    next.topologies[0] = row
    const expected = outsideProjectionStore(next)
    expectActiveDarkParity(store, expected)
    expectVisualParity(store, groups(expected))
  })

  test("moves and copies runtime Atoms through local outside-in updates", () => {
    const projection = structuralProjection()
    const store = outsideProjectionStore(projection)
    const {renderer} = recorder()
    const moved = {
      atom: {
        id: 3, parentAtom: null, parentTopology: 1,
        wimp: "test/source", position: 0,
      },
      state: {metaState: 301},
      values: [{atom: 3, field: 101, value: 701}],
      valueRecords: [{id: 701, kind: "number", number: 7}],
      valueItems: [],
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "move", path: "atom/3", from: "atom/2", ts: 1,
      value: moved,
    }]})
    const afterMove = structuralProjection()
    afterMove.atoms[1] = moved.atom
    afterMove.atomStates[1] = {atom: 3, state: 301}
    afterMove.atomValues[0] = {atom: 3, field: 101, value: 701}
    const expectedMove = outsideProjectionStore(afterMove)
    expectActiveDarkParity(store, expectedMove)
    expectVisualParity(store, groups(expectedMove))

    const copied = {
      atom: {
        id: 4, parentAtom: null, parentTopology: 1,
        wimp: "test/source", position: 1,
      },
      state: {metaState: 301},
      values: [{atom: 4, field: 101, value: 702}],
      valueRecords: [{id: 702, kind: "number", number: 9}],
      valueItems: [],
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "copy", path: "atom/4", from: "atom/3", ts: 2,
      value: copied,
    }]})
    const afterCopy = structuredClone(afterMove)
    afterCopy.atoms.push(copied.atom)
    afterCopy.atomStates.push({atom: 4, state: 301})
    afterCopy.atomValues.push({atom: 4, field: 101, value: 702})
    afterCopy.values.push({
      id: 702, kind: "number", booleanValue: null, numberValue: 9,
      textValue: null, enumValue: null,
    })
    const expectedCopy = outsideProjectionStore(afterCopy)
    expectActiveDarkParity(store, expectedCopy)
    expectVisualParity(store, groups(expectedCopy))
  })

  test("moves and copies runtime Topology rows with exact outside-in relations", () => {
    const projection = structuralProjection()
    const store = outsideProjectionStore(projection)
    const {renderer} = recorder()
    const moved = {
      id: 3, parentAtom: 1, parentTopology: null,
      kind: "fuzzy" as const, position: 0,
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "move", path: "topology/3", from: "topology/1", ts: 1,
      value: moved,
    }]})
    const afterMove = structuralProjection()
    afterMove.topologies[0] = moved
    afterMove.atoms[1] = {...afterMove.atoms[1]!, parentTopology: 3}
    const expectedMove = outsideProjectionStore(afterMove)
    expectActiveDarkParity(store, expectedMove)
    expectVisualParity(store, groups(expectedMove))

    const copied = {
      id: 4, parentAtom: 1, parentTopology: null,
      kind: "macho" as const, position: 2,
    }
    applyBulkStoreMessage(store, renderer, {parts: [{
      part: "graviton", op: "copy", path: "topology/4", from: "topology/2", ts: 2,
      value: copied,
    }]})
    const afterCopy = structuredClone(afterMove)
    afterCopy.topologies.push(copied)
    const expectedCopy = outsideProjectionStore(afterCopy)
    expectActiveDarkParity(store, expectedCopy)
    expectVisualParity(store, groups(expectedCopy))
  })
})
