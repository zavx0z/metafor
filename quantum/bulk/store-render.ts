import {
  BULK_STORE_FLAG_OVERLAY,
  BULK_STORE_FLAG_REMOVED,
  BULK_STORE_FLAG_RETURNING,
  BULK_STORE_FLAG_TORUS,
  BULK_STORE_LAYOUT_OUTSIDE_IN,
  BULK_STORE_LINE_MATERIAL_STRIDE,
  BULK_STORE_QUANTUM_MATERIAL_STRIDE,
  BULK_STORE_TRANSITION_CONTROL_STRIDE,
  type BulkStore,
} from "shared/protocol/bulk/store"
import type {BulkStoreCaptureProof} from "shared/protocol/bulk/capture"
import type {
  BulkReadyRenderDarkParticle,
  BulkReadyRenderFieldParticle,
  BulkReadyRenderFieldProxy,
  BulkReadyRenderOrbitalParticle,
  BulkReadyRenderRelationChannel,
  BulkReadyRenderTransitionChannel,
  BulkReadyVisualRenderManifest,
  BulkVisualFieldAlias,
  BulkVisualFieldProxyMaterial,
  BulkVisualLineMaterial,
  BulkVisualOrbitalMaterial,
  BulkVisualQuantumMaterial,
  BulkVisualRelationPath,
  BulkVisualTransitionPath,
} from "@bulk/types/visual"
import {
  DARK_TORUS_MESH_DETAIL,
  EMBEDDED_TORUS_MESH_DETAIL,
  SPHERE_MESH_DETAIL,
  VISUAL_PAYLOAD_CURVE_LAW,
} from "@metafor/visual/layout/centered-nested"
import type {Particle} from "shared/protocol/force/particle"
import type {BulkVisualViewport} from "./web"
import {
  BULK_STORE_DARK_KIND,
  BULK_STORE_FIELD_KIND,
  BULK_STORE_ORBITAL_KIND,
  BULK_STORE_RELATION_KIND,
} from "./store.ts"
import {
  bulkStoreRelationSlotsForBatch,
  bulkStoreTransitionSlotsForBatch,
  bulkStoreDarkDepth,
  type BulkStoreRenderer,
} from "./store-runtime.ts"

const reverse = <Key extends string>(value: Readonly<Record<Key, number>>): Key[] => {
  const result: Key[] = []
  for (const [key, id] of Object.entries(value) as Array<[Key, number]>) result[id] = key
  return result
}

const darkKinds = reverse(BULK_STORE_DARK_KIND)
const fieldKinds = reverse(BULK_STORE_FIELD_KIND)
const orbitalKinds = reverse(BULK_STORE_ORBITAL_KIND)
const relationKinds = reverse(BULK_STORE_RELATION_KIND)

const fieldId = (id: number): string => `f${id}`
const orbitalId = (id: number): string => `o${id}`
const proxyId = (id: number): string => `p${id}`
const transitionId = (id: number): string => `t${id}`
const relationId = (id: number): string => `r${id}`
const transitionBatchId = (id: number): string => `tb${id}`
const relationBatchId = (id: number): string => `rb${id}`

const rowView = <Value extends object>(
  keys: readonly string[],
  read: (key: string) => unknown,
): Value => new Proxy({} as Value, {
  get: (_target, key) => typeof key === "string" ? read(key) : undefined,
  has: (_target, key) => typeof key === "string" && keys.includes(key),
  ownKeys: () => [...keys],
  getOwnPropertyDescriptor: (_target, key) =>
    typeof key === "string" && keys.includes(key)
      ? {configurable: true, enumerable: true}
      : undefined,
})

const fingerprint16 = (value: string): string => {
  let left = 0x811c9dc5
  let right = 0x9e3779b9
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    left = Math.imul(left ^ code, 0x01000193)
    right = Math.imul(right ^ code, 0x85ebca6b)
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`
}

const quantumMaterial = (
  store: BulkStore,
  column: BulkStore["dark"]["material"],
  slot: number,
  torus: boolean,
): BulkVisualQuantumMaterial => rowView([
  "color", "form", "glowIntensity", "highlightSize", "kind", "opacity",
], (key) => {
  const start = slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE
  if (key === "color") return [column[start]!, column[start + 1]!, column[start + 2]!] as const
  if (key === "form") return torus ? "torus" : "sphere"
  if (key === "opacity") return column[start + 3]!
  if (key === "glowIntensity") return column[start + 4]!
  if (key === "highlightSize") return column[start + 5]!
  if (key === "kind") return "quantum"
  return undefined
})

const batchSlot = (store: BulkStore, id: number): number => {
  const slot = Array.prototype.indexOf.call(store.batch.id, id) as number
  if (slot < 0) throw new Error(`Bulk Store line batch ${id} is absent`)
  return slot
}

const lineMaterial = (store: BulkStore, id: number): BulkVisualLineMaterial =>
  rowView([
    "color", "glowColor", "glowIntensity", "kind", "opacity", "visibilityMode",
  ], (key) => {
    const start = batchSlot(store, id) * BULK_STORE_LINE_MATERIAL_STRIDE
    if (key === "color") return [
      store.batch.material[start]!, store.batch.material[start + 1]!,
      store.batch.material[start + 2]!, store.batch.material[start + 3]!,
    ] as const
    if (key === "glowColor") return [
      store.batch.material[start + 4]!, store.batch.material[start + 5]!,
      store.batch.material[start + 6]!, store.batch.material[start + 7]!,
    ] as const
    if (key === "glowIntensity") return store.batch.material[start + 8]!
    if (key === "opacity") return store.batch.material[start + 9]!
    if (key === "kind") return "line-glow"
    if (key === "visibilityMode") {
      return (store.batch.flags[batchSlot(store, id)]! & BULK_STORE_FLAG_OVERLAY) !== 0
        ? "overlay"
        : "scene"
    }
    return undefined
  })

const controls = (
  values: BulkStore["transition"]["control"],
  start: number,
  stride: number,
): readonly number[] => {
  if (values instanceof Float32Array) return values.subarray(start, start + stride) as unknown as readonly number[]
  return values.slice(start, start + stride) as unknown as readonly number[]
}

const depthIndex = (store: BulkStore): Map<number, number> => {
  const parent = new Map<number, number>()
  for (let slot = 0; slot < store.dark.id.length; slot++) {
    if ((store.dark.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    parent.set(store.dark.id[slot]!, store.dark.parent[slot]!)
  }
  const depth = new Map<number, number>()
  const read = (id: number): number => {
    const held = depth.get(id)
    if (held !== undefined) return held
    const owner = parent.get(id) ?? 0
    const value = owner === 0 ? 0 : read(owner) + 1
    depth.set(id, value)
    return value
  }
  for (const id of parent.keys()) read(id)
  return depth
}

const fieldAliasAt = (store: BulkStore, slot: number): BulkVisualFieldAlias => rowView([
    "sourceFieldId", "sourceFieldParticleId", "sourceParentDarkParticleId",
    "visualFieldParticleId",
  ], (key) => {
    if (key === "sourceFieldId") return store.fieldAlias.field[slot]!
    if (key === "sourceFieldParticleId") {
      return `a${store.fieldAlias.atom[slot]}:f${store.fieldAlias.field[slot]}:x${store.fieldAlias.id[slot]}`
    }
    if (key === "sourceParentDarkParticleId") return store.fieldAlias.atom[slot]! * 2
    if (key === "visualFieldParticleId") return fieldId(store.fieldAlias.marker[slot]!)
    return undefined
  })

const fieldAliases = (store: BulkStore): readonly BulkVisualFieldAlias[] =>
  Array.from({length: store.fieldAlias.id.length}, (_, slot) => slot)
    .filter((slot) => (store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0)
    .map((slot) => fieldAliasAt(store, slot))

const fieldParticleAt = (
  store: BulkStore,
  slot: number,
): BulkReadyRenderFieldParticle => rowView([
  "fieldParticleId", "fieldId", "parentDarkParticleId", "fieldKey",
  "fieldLabel", "fieldParticleKind", "localX", "localY", "localZ",
  "sphereRadius", "colorR", "colorG", "colorB",
], (key) => {
  const position = slot * 3
  const material = slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE
  if (key === "fieldParticleId") return fieldId(store.field.id[slot]!)
  if (key === "fieldId") return store.field.field[slot]!
  if (key === "parentDarkParticleId") return store.field.owner[slot]!
  if (key === "fieldKey") return store.text[store.field.key[slot]!]!
  if (key === "fieldLabel") return store.text[store.field.label[slot]!]!
  if (key === "fieldParticleKind") return fieldKinds[store.field.kind[slot]!]!
  if (key === "localX") return store.field.position[position]!
  if (key === "localY") return store.field.position[position + 1]!
  if (key === "localZ") return store.field.position[position + 2]!
  if (key === "sphereRadius") return store.field.form[slot * 2]!
  if (key === "colorR") return store.field.material[material]!
  if (key === "colorG") return store.field.material[material + 1]!
  if (key === "colorB") return store.field.material[material + 2]!
  return undefined
})

const fieldMaterialAt = (store: BulkStore, slot: number) => ({
  fieldParticleId: fieldId(store.field.id[slot]!),
  material: quantumMaterial(store, store.field.material, slot, false),
})

const darkParticleAt = (
  store: BulkStore,
  slot: number,
  depth = bulkStoreDarkDepth(store, store.dark.id[slot]!),
): BulkReadyRenderDarkParticle => {
  const id = store.dark.id[slot]!
  const parent = store.dark.parent[slot]!
  return rowView([
    "darkParticleId", "parentDarkParticleId", "darkParticleKind", "label",
    "depth", "darkParticleOrder", "localX", "localY", "localZ",
    "torusRadius", "torusTube", "colorR", "colorG", "colorB",
  ], (key) => {
    const position = slot * 3
    const form = slot * 2
    const material = slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE
    if (key === "darkParticleId") return id
    if (key === "parentDarkParticleId") return parent === 0 ? null : parent
    if (key === "darkParticleKind") return darkKinds[store.dark.kind[slot]!]!
    if (key === "label") {
      const label = store.text[store.dark.label[slot]!]!
      const wimp = store.dark.wimp[slot]!
      return label.length > 0 || wimp === 0 ? label : store.wimp.src[wimp - 1]!
    }
    if (key === "depth") return depth
    if (key === "darkParticleOrder") return store.dark.order[slot]!
    if (key === "localX") return store.dark.position[position]!
    if (key === "localY") return store.dark.position[position + 1]!
    if (key === "localZ") return store.dark.position[position + 2]!
    if (key === "torusRadius") return store.dark.form[form]!
    if (key === "torusTube") return store.dark.form[form + 1]!
    if (key === "colorR") return store.dark.material[material]!
    if (key === "colorG") return store.dark.material[material + 1]!
    if (key === "colorB") return store.dark.material[material + 2]!
    return undefined
  })
}

const orbitalParticleAt = (
  store: BulkStore,
  slot: number,
): BulkReadyRenderOrbitalParticle => rowView([
  "orbitalParticleId", "sourceId", "parentDarkParticleId", "orbitalParticleKind",
  "label", "localX", "localY", "localZ", "colorR", "colorG", "colorB",
], (key) => {
  const position = slot * 3
  const material = slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE
  if (key === "orbitalParticleId") return orbitalId(store.orbital.id[slot]!)
  if (key === "sourceId") return store.orbital.source[slot]!
  if (key === "parentDarkParticleId") return store.orbital.owner[slot]!
  if (key === "orbitalParticleKind") return orbitalKinds[store.orbital.kind[slot]!]!
  if (key === "label") return store.text[store.orbital.label[slot]!]!
  if (key === "localX") return store.orbital.position[position]!
  if (key === "localY") return store.orbital.position[position + 1]!
  if (key === "localZ") return store.orbital.position[position + 2]!
  if (key === "colorR") return store.orbital.material[material]!
  if (key === "colorG") return store.orbital.material[material + 1]!
  if (key === "colorB") return store.orbital.material[material + 2]!
  return undefined
})

const proxyParticleAt = (
  store: BulkStore,
  slot: number,
): BulkReadyRenderFieldProxy => rowView([
  "fieldProxyId", "fieldParticleId", "fieldId", "parentDarkParticleId",
  "stateOrbitalParticleId", "localX", "localY", "localZ", "colorR", "colorG", "colorB",
], (key) => {
  const position = slot * 3
  const material = slot * BULK_STORE_QUANTUM_MATERIAL_STRIDE
  if (key === "fieldProxyId") return proxyId(store.proxy.id[slot]!)
  if (key === "fieldParticleId") return fieldId(store.proxy.field[slot]!)
  if (key === "fieldId") return store.proxy.sourceField[slot]!
  if (key === "parentDarkParticleId") return store.proxy.owner[slot]!
  if (key === "stateOrbitalParticleId") return orbitalId(store.proxy.state[slot]!)
  if (key === "localX") return store.proxy.position[position]!
  if (key === "localY") return store.proxy.position[position + 1]!
  if (key === "localZ") return store.proxy.position[position + 2]!
  if (key === "colorR") return store.proxy.material[material]!
  if (key === "colorG") return store.proxy.material[material + 1]!
  if (key === "colorB") return store.proxy.material[material + 2]!
  return undefined
})

const transitionPath = (store: BulkStore, slot: number): BulkVisualTransitionPath =>
  rowView([
    "batchId", "batchFingerprint", "material", "ownerDarkParticleId",
    "curves", "returning", "transitionChannelId",
  ], (key) => {
    const batch = store.transition.batch[slot]!
    if (key === "batchId") return transitionBatchId(batch)
    if (key === "batchFingerprint") {
      return fingerprint16(`${transitionBatchId(batch)}:${bulkStoreTransitionSlotsForBatch(store, batch).map((member) =>
        `${store.transition.id[member]}:${store.transition.flags[member]}`).join(",")}`)
    }
    if (key === "material") return lineMaterial(store, batch)
    if (key === "ownerDarkParticleId") return store.transition.owner[slot]!
    if (key === "curves") return [controls(
      store.transition.control,
      slot * BULK_STORE_TRANSITION_CONTROL_STRIDE,
      BULK_STORE_TRANSITION_CONTROL_STRIDE,
    )]
    if (key === "returning") {
      return (store.batch.flags[batchSlot(store, batch)]! & BULK_STORE_FLAG_RETURNING) !== 0
    }
    if (key === "transitionChannelId") return transitionId(store.transition.id[slot]!)
    return undefined
  })

const relationPath = (store: BulkStore, slot: number): BulkVisualRelationPath =>
  rowView([
    "batchId", "batchFingerprint", "material", "ownerDarkParticleId",
    "curves", "relationChannelId",
  ], (key) => {
    const batch = store.relation.batch[slot]!
    if (key === "batchId") return relationBatchId(batch)
    if (key === "batchFingerprint") {
      return fingerprint16(`${relationBatchId(batch)}:${bulkStoreRelationSlotsForBatch(store, batch).map((member) =>
        `${store.relation.id[member]}:${store.relation.flags[member]}`).join(",")}`)
    }
    if (key === "material") return lineMaterial(store, batch)
    if (key === "ownerDarkParticleId") return store.relation.owner[slot]!
    if (key === "curves") {
      const start = store.relation.controlStart[slot]!
      return [
        controls(store.relation.control, start, BULK_STORE_TRANSITION_CONTROL_STRIDE),
        controls(
          store.relation.control,
          start + BULK_STORE_TRANSITION_CONTROL_STRIDE,
          BULK_STORE_TRANSITION_CONTROL_STRIDE,
        ),
      ]
    }
    if (key === "relationChannelId") return relationId(store.relation.id[slot]!)
    return undefined
  })

export const bulkStoreRenderManifest = (
  store: BulkStore,
): BulkReadyVisualRenderManifest => {
  const depths = depthIndex(store)
  const active = (flags: ArrayLike<number>, slot: number): boolean =>
    (flags[slot]! & BULK_STORE_FLAG_REMOVED) === 0
  const darkSlots = Array.from({length: store.dark.id.length}, (_, slot) => slot)
    .filter((slot) => active(store.dark.flags, slot))
  const fieldSlots = Array.from({length: store.field.id.length}, (_, slot) => slot)
    .filter((slot) => active(store.field.flags, slot))
  const orbitalSlots = Array.from({length: store.orbital.id.length}, (_, slot) => slot)
    .filter((slot) => active(store.orbital.flags, slot))
  const proxySlots = Array.from({length: store.proxy.id.length}, (_, slot) => slot)
    .filter((slot) => active(store.proxy.flags, slot))
  const transitionSlots = Array.from({length: store.transition.id.length}, (_, slot) => slot)
    .filter((slot) => active(store.transition.flags, slot))
  const relationSlots = Array.from({length: store.relation.id.length}, (_, slot) => slot)
    .filter((slot) => active(store.relation.flags, slot) && store.relation.controlStart[slot]! >= 0)

  const darkParticles = darkSlots.map((slot) =>
    darkParticleAt(store, slot, depths.get(store.dark.id[slot]!) ?? 0))
  const fieldParticles = fieldSlots.map((slot) => fieldParticleAt(store, slot))
  const orbitalParticles = orbitalSlots.map((slot) => orbitalParticleAt(store, slot))
  const fieldProxies = proxySlots.map((slot) => proxyParticleAt(store, slot))
  const transitionChannels = transitionSlots.map((slot) =>
    rowView<BulkReadyRenderTransitionChannel>([
      "transitionChannelId", "parentDarkParticleId", "colorR", "colorG", "colorB",
    ], (key) => {
      if (key === "transitionChannelId") return transitionId(store.transition.id[slot]!)
      if (key === "parentDarkParticleId") return store.transition.owner[slot]!
      if (key === "colorR") return 0.48
      if (key === "colorG") return 0.9
      if (key === "colorB") return 1
      return undefined
    }))
  const relationChannels = relationSlots.map((slot) =>
    rowView<BulkReadyRenderRelationChannel>([
      "relationChannelId", "parentDarkParticleId", "colorR", "colorG", "colorB",
    ], (key) => {
      const kind = relationKinds[store.relation.kind[slot]!]!
      const color = kind.endsWith("-write")
        ? [1, 0.54, 0.17]
        : kind === "axion-read"
          ? [1, 0.66, 0.36]
          : kind === "field-projection"
            ? [0.58, 0.72, 1]
            : [0.37, 0.89, 1]
      if (key === "relationChannelId") return relationId(store.relation.id[slot]!)
      if (key === "parentDarkParticleId") return store.relation.owner[slot]!
      if (key === "colorR") return color[0]
      if (key === "colorG") return color[1]
      if (key === "colorB") return color[2]
      return undefined
    }))
  const darkMaterials = darkParticles.map((particle, index) => ({
    darkParticleId: particle.darkParticleId,
    material: quantumMaterial(store, store.dark.material, darkSlots[index]!, true),
  }))
  const fieldMaterials = fieldSlots.map((slot) => fieldMaterialAt(store, slot))
  const orbitalMaterials = orbitalParticles.map((particle, index) => ({
    orbitalParticleId: particle.orbitalParticleId,
    material: quantumMaterial(
      store,
      store.orbital.material,
      orbitalSlots[index]!,
      (store.orbital.flags[orbitalSlots[index]!]! & BULK_STORE_FLAG_TORUS) !== 0,
    ),
  }))
  const fieldProxyMaterials = fieldProxies.map((proxy, index) => ({
    fieldProxyId: proxy.fieldProxyId,
    material: quantumMaterial(
      store,
      store.proxy.material,
      proxySlots[index]!,
      (store.proxy.flags[proxySlots[index]!]! & BULK_STORE_FLAG_TORUS) !== 0,
    ),
  }))
  const transitionPaths = transitionSlots.map((slot) => transitionPath(store, slot))
  const relationPaths = relationSlots.map((slot) => relationPath(store, slot))
  const rootSrc = `atom:${store.root / 2}`
  return {
    curveLaw: VISUAL_PAYLOAD_CURVE_LAW,
    darkTorusMeshDetail: DARK_TORUS_MESH_DETAIL,
    darkMaterials,
    embeddedTorusMeshDetail: EMBEDDED_TORUS_MESH_DETAIL,
    fieldAliases: fieldAliases(store),
    fieldMaterials,
    fieldProxyMaterials,
    fieldProxySpheres: fieldProxies.flatMap((proxy, index) => {
      const slot = proxySlots[index]!
      return (store.proxy.flags[slot]! & BULK_STORE_FLAG_TORUS) === 0
        ? [{fieldProxyId: proxy.fieldProxyId, radius: store.proxy.form[slot * 2]!}]
        : []
    }),
    fieldProxyTori: fieldProxies.flatMap((proxy, index) => {
      const slot = proxySlots[index]!
      return (store.proxy.flags[slot]! & BULK_STORE_FLAG_TORUS) !== 0
        ? [{fieldProxyId: proxy.fieldProxyId, radius: store.proxy.form[slot * 2]!, tube: store.proxy.form[slot * 2 + 1]!}]
        : []
    }),
    layoutSlug: store.layout === BULK_STORE_LAYOUT_OUTSIDE_IN
      ? "outside-in"
      : "centered-nested",
    manifest: {
      rootSrc,
      darkParticles,
      fieldParticles,
      orbitalParticles,
      transitionChannels,
      fieldProxies,
      relationChannels,
    },
    orbitalMaterials,
    orbitalSpheres: orbitalParticles.flatMap((particle, index) => {
      const slot = orbitalSlots[index]!
      return (store.orbital.flags[slot]! & BULK_STORE_FLAG_TORUS) === 0
        ? [{orbitalParticleId: particle.orbitalParticleId, radius: store.orbital.form[slot * 2]!}]
        : []
    }),
    orbitalTori: orbitalParticles.flatMap((particle, index) => {
      const slot = orbitalSlots[index]!
      return (store.orbital.flags[slot]! & BULK_STORE_FLAG_TORUS) !== 0
        ? [{orbitalParticleId: particle.orbitalParticleId, radius: store.orbital.form[slot * 2]!, tube: store.orbital.form[slot * 2 + 1]!}]
        : []
    }),
    relationPaths,
    sourceStats: {
      darkParticleCount: darkParticles.length,
      fieldParticleCount: fieldAliases(store).length,
      orbitalParticleCount: orbitalParticles.length,
      rootSrc,
      transitionChannelCount: transitionChannels.length,
    },
    sphereMeshDetail: SPHERE_MESH_DETAIL,
    transitionPaths,
  }
}

export class BulkStoreViewportRenderer implements BulkStoreRenderer {
  readonly #manifest: BulkReadyVisualRenderManifest

  constructor(
    readonly store: BulkStore,
    readonly viewport: BulkVisualViewport,
  ) {
    this.#manifest = bulkStoreRenderManifest(store)
  }

  present(): void {
    this.viewport.applyBulkStoreInitialScene(this.#manifest)
  }

  darkAdded(slot: number): void {
    const particle = darkParticleAt(this.store, slot)
    this.viewport.applyBulkStoreDarkUpsert(particle, {
      darkParticleId: particle.darkParticleId,
      material: quantumMaterial(this.store, this.store.dark.material, slot, true),
    })
  }

  darkChanged(slot: number): void {
    this.darkAdded(slot)
  }

  darkRemoved(id: number): void {
    this.viewport.applyBulkStoreDarkRemove(id)
  }

  orbitalAdded(slot: number): void {
    const particle = orbitalParticleAt(this.store, slot)
    const torus = (this.store.orbital.flags[slot]! & BULK_STORE_FLAG_TORUS) !== 0
    this.viewport.applyBulkStoreOrbitalUpsert(
      particle,
      {
        orbitalParticleId: particle.orbitalParticleId,
        material: quantumMaterial(this.store, this.store.orbital.material, slot, torus),
      },
      torus
        ? {kind: "torus", radius: this.store.orbital.form[slot * 2]!, tube: this.store.orbital.form[slot * 2 + 1]!}
        : {kind: "sphere", radius: this.store.orbital.form[slot * 2]!},
    )
  }

  orbitalRemoved(id: number): void {
    this.viewport.applyBulkStoreOrbitalRemove(orbitalId(id))
  }

  proxyAdded(slot: number): void {
    const particle = proxyParticleAt(this.store, slot)
    const torus = (this.store.proxy.flags[slot]! & BULK_STORE_FLAG_TORUS) !== 0
    this.viewport.applyBulkStoreProxyUpsert(
      particle,
      {
        fieldProxyId: particle.fieldProxyId,
        material: quantumMaterial(this.store, this.store.proxy.material, slot, torus),
      },
      torus
        ? {kind: "torus", radius: this.store.proxy.form[slot * 2]!, tube: this.store.proxy.form[slot * 2 + 1]!}
        : {kind: "sphere", radius: this.store.proxy.form[slot * 2]!},
    )
  }

  proxyRemoved(id: number): void {
    this.viewport.applyBulkStoreProxyRemove(proxyId(id))
  }

  fieldAliasesRegrouped(
    aliasSlots: readonly number[],
    fieldSlots: readonly number[],
    removedFieldSlots: readonly number[],
    darkSlots: readonly number[],
    orbitalSlots: readonly number[],
    proxySlots: readonly number[],
  ): void {
    this.viewport.applyBulkStoreFieldRegroup({
      aliases: aliasSlots.map((slot) => fieldAliasAt(this.store, slot)),
      fields: fieldSlots.map((slot) => fieldParticleAt(this.store, slot)),
      fieldMaterials: fieldSlots.map((slot) => fieldMaterialAt(this.store, slot)),
      proxyIds: proxySlots.map((slot) => proxyId(this.store.proxy.id[slot]!)),
      removedFieldParticleIds: removedFieldSlots.map((slot) =>
        fieldId(this.store.field.id[slot]!)),
    })
    for (const slot of darkSlots) {
      this.viewport.applyBulkStoreDarkGeometry(
        darkParticleAt(this.store, slot),
      )
    }
    for (const slot of orbitalSlots) {
      this.viewport.applyBulkStoreOrbitalGeometry(
        orbitalParticleAt(this.store, slot),
      )
    }
    for (const slot of proxySlots) {
      this.viewport.applyBulkStoreProxyGeometry(
        proxyParticleAt(this.store, slot),
      )
    }
  }

  orbitalMaterialChanged(slot: number): void {
    this.viewport.applyBulkStoreOrbitalMaterial(
      {
        orbitalParticleId: orbitalId(this.store.orbital.id[slot]!),
        material: quantumMaterial(
          this.store, this.store.orbital.material, slot,
          (this.store.orbital.flags[slot]! & BULK_STORE_FLAG_TORUS) !== 0,
        ),
      } as BulkVisualOrbitalMaterial,
    )
  }

  proxyMaterialChanged(slot: number): void {
    this.viewport.applyBulkStoreProxyMaterial(
      {
        fieldProxyId: proxyId(this.store.proxy.id[slot]!),
        material: quantumMaterial(
          this.store, this.store.proxy.material, slot,
          (this.store.proxy.flags[slot]! & BULK_STORE_FLAG_TORUS) !== 0,
        ),
      } as BulkVisualFieldProxyMaterial,
    )
  }

  transitionBatchChanged(batchId: number): void {
    const slots = bulkStoreTransitionSlotsForBatch(this.store, batchId)
    this.viewport.rebuildBulkStoreTransitionBatch(
      transitionBatchId(batchId),
      slots.map((slot) => transitionPath(this.store, slot)),
    )
  }

  relationBatchChanged(batchId: number): void {
    const slots = bulkStoreRelationSlotsForBatch(this.store, batchId)
    this.viewport.rebuildBulkStoreRelationBatch(
      relationBatchId(batchId),
      slots.map((slot) => relationPath(this.store, slot)),
    )
  }

  force(part: Particle): void {
    this.viewport.handleForce(part.part, part)
  }
}

export const bulkStoreCaptureProof = (
  store: BulkStore,
): BulkStoreCaptureProof => {
  const manifest = bulkStoreRenderManifest(store)
  return {
    root: store.root,
    rows: {
      dark: store.dark.id.length,
      field: store.field.id.length,
      fieldAlias: store.fieldAlias.id.length,
      orbital: store.orbital.id.length,
      proxy: store.proxy.id.length,
      transition: store.transition.id.length,
      relation: store.relation.id.length,
      batch: store.batch.id.length,
    },
    transitionBatchFingerprints: [...new Set(
      manifest.transitionPaths.map((path) => path.batchFingerprint),
    )],
    relationBatchFingerprints: [...new Set(
      manifest.relationPaths.map((path) => path.batchFingerprint),
    )],
  }
}
