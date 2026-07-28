import type {
  BulkDarkParticleActivity,
  BulkDarkParticleInput,
  BulkDarkParticleKind,
  BulkFieldParticleInput,
  BulkFieldParticleKind,
  BulkFieldProxy,
  BulkManifest,
  BulkOrbitalParticle,
  BulkOrbitalParticleKind,
  BulkRelationChannel,
  BulkRootPromotionReceipt,
  BulkTransitionChannel,
} from "@metafor/types/bulk/manifest"
import {
  createBulkManifestFromDarkParticleInputs,
  scaleBulkManifestToRootOuterDiameter,
} from "@bulk/gravity/layout"
import type { BulkRuntimeField, BulkRuntimeMatterBindingPath, BulkRuntimeMatterChildBindingPath, BulkRuntimeMatterParticle, BulkRuntimeProjection, BulkRuntimeValue } from "@metafor/types/bulk/runtime"
import type { BulkLayoutSettings } from "@metafor/types/bulk/settings"
import type { AtomRecord } from "@metafor/types/boundary/atom"
import type { FieldEnumVariantRecord, ValueItemRecord } from "@metafor/types/boundary/value"
import type { TopologyRecord } from "@metafor/types/boundary/topology"

const atomDarkParticleColor = {colorR: 0.4, colorG: 0.45, colorB: 0.98}
const connectivityDarkParticleColors: Record<BulkDarkParticleKind, {colorR: number; colorG: number; colorB: number}> = {
  atom: atomDarkParticleColor,
  fuzzy: {colorR: 0.52, colorG: 0.88, colorB: 1},
  axion: {colorR: 1, colorG: 0.66, colorB: 0.36},
  macho: {colorR: 1, colorG: 0.38, colorB: 0.48},
}

const fieldParticleColor = (kind: BulkFieldParticleKind): {colorR: number; colorG: number; colorB: number} => {
  if (kind === "string") return {colorR: 1, colorG: 0.08, colorB: 0.58}
  if (kind === "number") return {colorR: 1, colorG: 0.88, colorB: 0}
  if (kind === "boolean") return {colorR: 0, colorG: 0.9, colorB: 1}
  if (kind === "enum") return {colorR: 0.58, colorG: 0.32, colorB: 1}
  if (kind === "array") return {colorR: 1, colorG: 0.42, colorB: 0}
  return {colorR: 1, colorG: 0.16, colorB: 0.16}
}

const fieldParticleKind = (type: BulkRuntimeField["type"]): BulkFieldParticleKind => {
  if (type === "string") return "string"
  if (type === "number") return "number"
  if (type === "boolean") return "boolean"
  if (type === "array") return "array"
  if (type === "enum") return "enum"
  return "other"
}

const processFieldDependencies = (descriptor: Record<string, unknown>): {read: number[]; write: number[]} => {
  const read = new Set<number>()
  const write = new Set<number>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== "object" || value === null) return
    for (const [key, child] of Object.entries(value)) {
      if ((key === "readFields" || key === "writeFields") && Array.isArray(child)) {
        const target = key === "readFields" ? read : write
        for (const item of child) {
          const fieldId = Array.isArray(item) ? item[0] : item
          if (typeof fieldId === "number" && Number.isSafeInteger(fieldId)) target.add(fieldId)
        }
      } else visit(child)
    }
  }
  visit(descriptor)
  return {read: [...read], write: [...write]}
}

const stableAngle = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const causalAttachmentPosition = (
  stateParticle: BulkOrbitalParticle,
  attachmentRadius: number,
  slotIndex: number,
): {localX: number; localY: number; localZ: number} => {
  const stateOrbitRadius = Math.hypot(stateParticle.localX, stateParticle.localY)
  if (stateOrbitRadius <= 0.001) {
    return {
      localX: stateParticle.localX,
      localY: stateParticle.localY,
      localZ: stateParticle.localZ,
    }
  }
  const direction = slotIndex % 2 === 0 ? 1 : -1
  const distance = Math.floor(slotIndex / 2) + 1
  const centreGap = stateParticle.sphereRadius + attachmentRadius * 1.25
  const angularOffset = direction * distance * centreGap / stateOrbitRadius
  const stateAngle = Math.atan2(stateParticle.localY, stateParticle.localX)
  const angle = stateAngle + angularOffset
  return {
    localX: Math.cos(angle) * stateOrbitRadius,
    localY: Math.sin(angle) * stateOrbitRadius,
    localZ: stateParticle.localZ,
  }
}

const group = <T, K extends string | number>(entries: T[], key: (entry: T) => K | null): Map<K, T[]> => {
  const map = new Map<K, T[]>()
  for (const entry of entries) {
    const groupKey = key(entry)
    if (groupKey === null) continue
    const bucket = map.get(groupKey)
    if (bucket) bucket.push(entry)
    else map.set(groupKey, [entry])
  }
  return map
}

const matterParentKey = (wimp: string, parentMatterParticle: number | null): string =>
  `${wimp}\0${parentMatterParticle ?? ""}`

const darkParticleNamespaceId = (id: number, offset: 0 | 1, label: string): number => {
  const darkParticleId = id * 2 + offset
  if (!Number.isSafeInteger(darkParticleId)) {
    throw new Error(`${label} dark particle id is not safe: ${id}`)
  }
  return darkParticleId
}

const atomDarkParticleIdFromAtomId = (id: number): number => darkParticleNamespaceId(id, 0, "Atom")
const connectivityDarkParticleIdFromTopologyId = (id: number): number => darkParticleNamespaceId(id, 1, "Topology")

const fieldParticleIdFromAtomField = (atomId: number, fieldId: number): string =>
  `atom:${atomId}:field:${fieldId}`

const valueText = (
  valueId: number | undefined,
  valuesById: Map<number, BulkRuntimeValue>,
  valueItemsById: Map<number, ValueItemRecord[]>,
): string | null => {
  if (valueId === undefined) return null
  const value = valuesById.get(valueId)
  if (!value) return null

  if (value.kind === "boolean") return value.booleanValue === 1 ? "true" : "false"
  if (value.kind === "number") return value.numberValue === null ? null : String(value.numberValue)
  if (value.kind === "string") return value.textValue
  if (value.kind === "enum") return value.enumValue
  if (value.kind === "list") return (valueItemsById.get(value.id) ?? []).map((item) => item.itemValue).join(", ")
  return null
}

const sortByPosition = <T extends {position: number}>(entries: T[]): T[] =>
  [...entries].sort((left, right) => left.position - right.position)

const matterEdgeSlotOrder: Record<BulkRuntimeMatterParticle["edgeSlot"], number> = {
  root: 0,
  branch: 0,
  child: 0,
  then: 0,
  else: 1,
}

const sortMatterParticles = (entries: BulkRuntimeMatterParticle[]): BulkRuntimeMatterParticle[] =>
  [...entries].sort((left, right) =>
    matterEdgeSlotOrder[left.edgeSlot] - matterEdgeSlotOrder[right.edgeSlot] ||
    left.particleOrder - right.particleOrder,
  )

const sortBindingPaths = <T extends {depOrder: number; childOrder?: number}>(entries: T[]): T[] =>
  [...entries].sort((left, right) => (left.childOrder ?? 0) - (right.childOrder ?? 0) || left.depOrder - right.depOrder)

const fieldKeyFromMatterPath = (path: string): string | null => {
  if (path.startsWith("/") || path.startsWith("[") || path.startsWith(".")) return null
  return path
}

const verifiedRootPromotion = (
  projection: BulkRuntimeProjection,
  requestedRootSrc: string,
  receipt: BulkRootPromotionReceipt | null,
): BulkRootPromotionReceipt | null => {
  if (receipt === null || receipt.verified !== true || receipt.kind !== "root-promotion" || receipt.version !== 1) {
    return null
  }
  if (
    receipt.removedRootSrc !== requestedRootSrc ||
    receipt.removedRootAtomId === receipt.promotedAtomId ||
    !Number.isSafeInteger(receipt.removedRootAtomId) ||
    !Number.isSafeInteger(receipt.promotedAtomId) ||
    receipt.removedRootAtomId <= 0 ||
    receipt.promotedAtomId <= 0
  ) return null
  const frame = receipt.formerRootFrame
  if (
    !Number.isFinite(frame.localX) ||
    !Number.isFinite(frame.localY) ||
    !Number.isFinite(frame.localZ) ||
    !Number.isFinite(frame.outerDiameterMm) ||
    frame.outerDiameterMm <= 0
  ) return null
  if (projection.atoms.some((atom) => atom.id === receipt.removedRootAtomId)) return null
  const promoted = projection.atoms.find((atom) => atom.id === receipt.promotedAtomId)
  if (
    !promoted ||
    promoted.wimp !== receipt.promotedRootSrc ||
    promoted.parentAtom !== null ||
    promoted.parentTopology !== null
  ) return null
  return receipt
}

export function buildBulkManifestation(
  projection: BulkRuntimeProjection,
  rootSrc: string,
  settings: Partial<BulkLayoutSettings> = {},
  promotionReceipt: BulkRootPromotionReceipt | null = null,
): BulkManifest {
  const {
    atoms,
    topologies,
    wimps,
    fields,
    states,
    transitions,
    conditions,
    processes,
    reactions,
    atomStates,
    atomValues,
    values,
    valueItems,
    matterParticles,
    matterTopologyBindingPaths,
    matterChildWimpBindingPaths,
  } = projection

  const atomById = new Map(atoms.map((atom) => [atom.id, atom] as const))
  const topologyById = new Map(topologies.map((topology) => [topology.id, topology] as const))
  const wimpBySrc = new Map(wimps.map((wimp) => [wimp.src, wimp] as const))
  const fieldsByWimp = group(fields, (field) => field.wimp)
  const statesByWimp = group(states, (state) => state.wimp)
  const transitionsByWimp = group(transitions, (transition) => transition.wimp)
  const conditionsByTransition = group(conditions, (condition) => condition.transition)
  const processesByWimp = group(processes, (process) => process.wimp)
  const reactionsByWimp = group(reactions, (reaction) => reaction.wimp)
  const fieldByWimpKey = new Map(fields.map((field) => [`${field.wimp}\0${field.key}`, field] as const))
  const enumVariantsByField = group(projection.fieldEnumVariants, (variant) => variant.field)
  const atomValueByAtomField = new Map(atomValues.map((entry) => [`${entry.atom}\0${entry.field}`, entry.value] as const))
  const valuesById = new Map(values.map((value) => [value.id, value] as const))
  const valueItemsById = group(valueItems, (item) => item.value)
  const atomsByParentAtom = group(atoms, (atom) => atom.parentAtom)
  const atomsByParentTopology = group(atoms, (atom) => atom.parentTopology)
  const topologiesByParentAtom = group(topologies, (topology) => topology.parentAtom)
  const topologiesByParentTopology = group(topologies, (topology) => topology.parentTopology)
  const matterParticlesByWimpParent = group(
    matterParticles,
    (particle) => matterParentKey(particle.wimp, particle.parentParticle),
  )
  const matterTopologyBindingPathsByParticle = group(matterTopologyBindingPaths, (entry) => entry.particle)
  const matterChildWimpBindingPathsByParticle = group(matterChildWimpBindingPaths, (entry) => entry.particle)
  const topologyLabelById = new Map<number, string>()
  const topologyPlanById = new Map<number, BulkRuntimeMatterParticle>()
  const topologyAtomById = new Map<number, AtomRecord>()
  const activityByDarkParticleId = new Map<number, BulkDarkParticleActivity>()

  const matterTopologyChildren = (wimp: string, parentMatterParticle: number | null): BulkRuntimeMatterParticle[] =>
    sortMatterParticles(matterParticlesByWimpParent.get(matterParentKey(wimp, parentMatterParticle)) ?? [])
      .filter((particle) => particle.particleKind !== "wimp")

  const fieldLabelFromPath = (wimp: string, path: string): string | null => {
    const key = fieldKeyFromMatterPath(path)
    if (!key) return null
    const field = fieldByWimpKey.get(`${wimp}\0${key}`)
    const label = field?.label?.trim()
    return label && label.length > 0 ? label : field?.key ?? key
  }

  const firstFieldLabelFromPaths = (wimp: string, paths: string[]): string | null => {
    for (const path of paths) {
      const label = fieldLabelFromPath(wimp, path)
      if (label !== null) return label
    }
    return null
  }

  const topologyPlanLabel = (wimp: string, plan: BulkRuntimeMatterParticle): string | null => {
    const childPaths = sortBindingPaths(matterChildWimpBindingPathsByParticle.get(plan.id) ?? [])
      .map((entry) => entry.path)
    const predicatePaths = plan.predicateBinding === undefined
      ? []
      : Array.isArray(plan.predicateBinding.data)
        ? plan.predicateBinding.data
        : [plan.predicateBinding.data]
    const fieldLabel = firstFieldLabelFromPaths(wimp, [
      ...sortBindingPaths(matterTopologyBindingPathsByParticle.get(plan.id) ?? []).map((entry) => entry.path),
      ...predicatePaths,
      ...childPaths,
    ])
    if (fieldLabel !== null) return fieldLabel
    if (plan.particleKind !== "axion" || !predicatePaths.includes("/state")) return null
    const stateMatch = /===\s*["']([^"']+)["']/.exec(plan.predicateBinding?.expr ?? "")
    if (!stateMatch) return "Axion · State"
    let stateName = stateMatch[1]!
    if (stateName.includes("\\u")) {
      try {
        stateName = JSON.parse(`"${stateName.replaceAll('"', '\\"')}"`) as string
      } catch {
        // Keep the declared predicate text when it is not a JSON string escape sequence.
      }
    }
    return `Axion · ${stateName}`
  }

  const atomFieldValueText = (atom: AtomRecord, fieldKey: string): string | null => {
    const field = fieldByWimpKey.get(`${atom.wimp}\0${fieldKey}`)
    if (!field) return null
    return valueText(atomValueByAtomField.get(`${atom.id}\0${field.id}`), valuesById, valueItemsById)
  }

  const enumValuePosition = (field: BulkRuntimeField, value: string | null): number | null => {
    if (value === null) return null
    return enumVariantsByField.get(field.id)?.find((variant: FieldEnumVariantRecord) => variant.itemValue === value)?.position ?? null
  }

  const assignTopologyLabels = (atom: AtomRecord, runtimeTopologies: TopologyRecord[], parentMatterParticle: number | null): void => {
    const wimp = atom.wimp
    const plans = matterTopologyChildren(wimp, parentMatterParticle)
    const runtime = sortByPosition(runtimeTopologies)
    for (let index = 0; index < runtime.length; index++) {
      const topology = runtime[index]!
      const plan = plans[index]
      if (!plan) continue
      topologyPlanById.set(topology.id, plan)
      topologyAtomById.set(topology.id, atom)
      const label = topologyPlanLabel(wimp, plan)
      if (label !== null) topologyLabelById.set(topology.id, label)
      assignTopologyLabels(atom, topologiesByParentTopology.get(topology.id) ?? [], plan.id)
    }
  }

  for (const atom of atoms) {
    assignTopologyLabels(atom, topologiesByParentAtom.get(atom.id) ?? [], null)
  }

  for (const topology of topologies) {
    if (topology.kind !== "fuzzy") continue
    const plan = topologyPlanById.get(topology.id)
    const atom = topologyAtomById.get(topology.id)
    if (!plan || !atom) continue
    const branchPlans = sortMatterParticles(matterParticlesByWimpParent.get(matterParentKey(plan.wimp, plan.id)) ?? [])
      .filter((particle) => particle.edgeSlot === "branch" && particle.particleKind === "wimp")
    if (branchPlans.length === 0) continue
    const fieldKey = sortBindingPaths(matterTopologyBindingPathsByParticle.get(plan.id) ?? [])
      .map((entry) => fieldKeyFromMatterPath(entry.path))
      .find((key): key is string => key !== null)
    if (!fieldKey) continue
    const field = fieldByWimpKey.get(`${atom.wimp}\0${fieldKey}`)
    const activeIndex = field?.type === "enum" ? enumValuePosition(field, atomFieldValueText(atom, fieldKey)) : null
    const branchAtoms = sortByPosition(atomsByParentTopology.get(topology.id) ?? [])
    branchAtoms.forEach((branchAtom, index) => {
      const darkParticleId = atomDarkParticleIdFromAtomId(branchAtom.id)
      activityByDarkParticleId.set(darkParticleId, activeIndex !== null && index === activeIndex ? "active" : "inactive")
    })
  }

  const fieldParticleInputFromBoundaryField = (atom: AtomRecord, field: BulkRuntimeField): BulkFieldParticleInput => {
    const kind = fieldParticleKind(field.type)
    return {
      fieldParticleId: fieldParticleIdFromAtomField(atom.id, field.id),
      fieldId: field.id,
      fieldKey: field.key,
      fieldLabel: field.label ?? field.key,
      fieldParticleKind: kind,
      valueText: valueText(atomValueByAtomField.get(`${atom.id}\0${field.id}`), valuesById, valueItemsById),
      ...fieldParticleColor(kind),
    }
  }

  const childDarkParticleInputs = (
    parent: {kind: "atom"; id: number} | {kind: "topology"; id: number},
    visited: Set<string>,
    inheritedActivity: BulkDarkParticleActivity,
  ): BulkDarkParticleInput[] => {
    const childAtoms = parent.kind === "atom" ? atomsByParentAtom.get(parent.id) ?? [] : atomsByParentTopology.get(parent.id) ?? []
    const childTopologies = parent.kind === "atom"
      ? topologiesByParentAtom.get(parent.id) ?? []
      : topologiesByParentTopology.get(parent.id) ?? []

    return [
      ...sortByPosition(childTopologies).map((topology) => connectivityDarkParticleInputFromTopology(topology, visited, inheritedActivity)),
      ...sortByPosition(childAtoms).map((atom) => atomDarkParticleInputFromAtom(atom, visited, inheritedActivity)),
    ]
  }

  const atomDarkParticleInputFromAtom = (atom: AtomRecord, visited: Set<string>, inheritedActivity: BulkDarkParticleActivity = "neutral"): BulkDarkParticleInput => {
    const key = `atom:${atom.id}`
    const darkParticleId = atomDarkParticleIdFromAtomId(atom.id)
    const activity = activityByDarkParticleId.get(darkParticleId) ?? inheritedActivity
    if (visited.has(key)) {
      return {
        darkParticleId,
        darkParticleKind: "atom",
        src: atom.wimp,
        metaSrc: atom.wimp,
        label: wimpBySrc.get(atom.wimp)?.name ?? atom.wimp,
        ...atomDarkParticleColor,
        activity,
        fieldParticles: [],
        children: [],
      }
    }

    visited.add(key)
    return {
      darkParticleId,
      darkParticleKind: "atom",
      src: atom.wimp,
      metaSrc: atom.wimp,
      label: wimpBySrc.get(atom.wimp)?.name ?? atom.wimp,
      ...atomDarkParticleColor,
      activity,
      fieldParticles: (fieldsByWimp.get(atom.wimp) ?? [])
        .map((field) => fieldParticleInputFromBoundaryField(atom, field)),
      children: childDarkParticleInputs({kind: "atom", id: atom.id}, visited, activity),
    }
  }

  const connectivityDarkParticleInputFromTopology = (topology: TopologyRecord, visited: Set<string>, inheritedActivity: BulkDarkParticleActivity = "neutral"): BulkDarkParticleInput => {
    const key = `topology:${topology.id}`
    const label = topologyLabelById.get(topology.id) ?? ""
    const darkParticleId = connectivityDarkParticleIdFromTopologyId(topology.id)
    const activity = activityByDarkParticleId.get(darkParticleId) ?? inheritedActivity
    if (visited.has(key)) {
      return {
        darkParticleId,
        darkParticleKind: topology.kind,
        src: null,
        metaSrc: null,
        label,
        ...connectivityDarkParticleColors[topology.kind],
        activity,
        fieldParticles: [],
        children: [],
      }
    }

    visited.add(key)
    return {
      darkParticleId,
      darkParticleKind: topology.kind,
      src: null,
      metaSrc: null,
      label,
      ...connectivityDarkParticleColors[topology.kind],
      activity,
      fieldParticles: [],
      children: childDarkParticleInputs({kind: "topology", id: topology.id}, visited, activity),
    }
  }

  const promotion = verifiedRootPromotion(projection, rootSrc, promotionReceipt)
  const manifestedRootSrc = promotion?.promotedRootSrc ?? rootSrc
  const rootAtoms = atoms.filter((atom) => atom.parentAtom === null && atom.parentTopology === null)
  const selectedRoots = promotion
    ? rootAtoms.filter((atom) => atom.id === promotion.promotedAtomId)
    : rootAtoms.filter((atom) => atom.wimp === rootSrc)
  const inputs = sortByPosition(selectedRoots)
    .filter((atom) => atomById.has(atom.id))
    .map((atom) => atomDarkParticleInputFromAtom(atom, new Set()))

  const manifest = scaleBulkManifestToRootOuterDiameter(
    createBulkManifestFromDarkParticleInputs(manifestedRootSrc, inputs, settings),
    promotion?.formerRootFrame.outerDiameterMm,
    settings,
  )
  if (promotion) {
    const promotedRootId = atomDarkParticleIdFromAtomId(promotion.promotedAtomId)
    const promotedRoot = manifest.darkParticles.find((particle) => particle.darkParticleId === promotedRootId)
    if (promotedRoot) {
      promotedRoot.localX = promotion.formerRootFrame.localX
      promotedRoot.localY = promotion.formerRootFrame.localY
      promotedRoot.localZ = promotion.formerRootFrame.localZ
    }
  }

  const darkParticleById = new Map(manifest.darkParticles.map((particle) => [particle.darkParticleId, particle] as const))
  const atomStateByAtom = new Map(atomStates.map((state) => [state.atom, state.state] as const))
  const orbitalParticles: BulkOrbitalParticle[] = []
  const transitionChannels: BulkTransitionChannel[] = []
  const fieldProxies: BulkFieldProxy[] = []
  const relationChannels: BulkRelationChannel[] = []

  const materializeAtomVisual = (boundaryAtom: AtomRecord): void => {
    const parentDarkParticleId = atomDarkParticleIdFromAtomId(boundaryAtom.id)
    const manifestedAtom = darkParticleById.get(parentDarkParticleId)
    if (!manifestedAtom) return
    const atomStates = sortByPosition(statesByWimp.get(boundaryAtom.wimp) ?? [])
    const atomTransitions = sortByPosition(transitionsByWimp.get(boundaryAtom.wimp) ?? [])
    const outgoing = group(atomTransitions, (transition) => transition.fromState)
    const stateById = new Map(atomStates.map((state) => [state.id, state] as const))
    const currentStateId = atomStateByAtom.get(boundaryAtom.id) ?? null
    const maxSleeveDepth = (stateId: number, path: Set<number>): number => {
      if (path.has(stateId)) return 0
      const nextPath = new Set(path).add(stateId)
      return (outgoing.get(stateId) ?? []).reduce(
        (maxDepth, transition) => Math.max(maxDepth, 1 + maxSleeveDepth(transition.toState, nextPath)),
        0,
      )
    }
    const countSleeveDepths = (stateId: number, path: Set<number>, depth: number, counts: Map<number, number>): void => {
      if (path.has(stateId)) return
      counts.set(depth, (counts.get(depth) ?? 0) + 1)
      const nextPath = new Set(path).add(stateId)
      for (const transition of outgoing.get(stateId) ?? []) countSleeveDepths(transition.toState, nextPath, depth + 1, counts)
    }
    const stateInnerRadius = manifestedAtom.torusRadius
    const atomOuterRadius = manifestedAtom.torusRadius + manifestedAtom.torusTube
    const atomFieldParticles = manifest.fieldParticles.filter(
      (field) => field.parentDarkParticleId === parentDarkParticleId,
    )
    const fieldRadius = atomFieldParticles[0]?.sphereRadius
      ?? Math.max(1, Math.min(manifestedAtom.torusTube * 0.115, manifestedAtom.torusRadius * 0.06))
    const radiusCap = fieldRadius
    const layoutMargin = radiusCap * 1.45
    const sleeveStats = atomStates.map((state) => {
      const depthCounts = new Map<number, number>()
      countSleeveDepths(state.id, new Set(), 0, depthCounts)
      return {
        depthCounts,
        maxDepth: Math.max(1, maxSleeveDepth(state.id, new Set())),
      }
    })
    let densityRadius = radiusCap
    sleeveStats.forEach((stats) => {
      const sleeveAngleSpan = Math.min((Math.PI * 2 / Math.max(1, atomStates.length)) * 0.78, 1.15)
      const radialSpan = Math.max(1, atomOuterRadius - stateInnerRadius - layoutMargin * 2)
      const bandWidth = radialSpan / (stats.maxDepth + 1)
      for (const [depth, count] of stats.depthCounts) {
        const midRadius = stateInnerRadius + layoutMargin + (depth + 0.5) * bandWidth
        const arcWidth = Math.max(1, midRadius * sleeveAngleSpan)
        const columns = Math.max(1, Math.ceil(Math.sqrt(count * arcWidth / Math.max(1, bandWidth))))
        const rows = Math.max(1, Math.ceil(count / columns))
        densityRadius = Math.min(densityRadius, arcWidth / columns / 2.8, bandWidth / rows / 2.8)
      }
    })
    const radius = Math.min(
      fieldRadius,
      Math.max(Math.min(0.8, fieldRadius), Math.min(radiusCap, densityRadius)),
    )
    if (atomStates.length > 0 && atomFieldParticles.length > 0 && fieldRadius > 0) {
      const fieldScale = radius / fieldRadius
      for (const field of atomFieldParticles) {
        field.localX *= fieldScale
        field.localY *= fieldScale
        field.localZ *= fieldScale
        field.sphereRadius = radius
      }
    }
    const stateOccurrencesByStateId = new Map<number, BulkOrbitalParticle[]>()
    const stateOccurrenceById = new Map<string, BulkOrbitalParticle>()
    const fieldProxyByOccurrenceField = new Map<string, BulkFieldProxy>()
    const ensureFieldProxy = (stateParticle: BulkOrbitalParticle, fieldId: number): BulkFieldProxy | null => {
      const field = fields.find((candidate) => candidate.id === fieldId && candidate.wimp === boundaryAtom.wimp)
      if (!field) return null
      const key = `${stateParticle.orbitalParticleId}/field/${fieldId}`
      const existing = fieldProxyByOccurrenceField.get(key)
      if (existing) return existing
      const angle = stableAngle(key)
      const elevation = Math.sin(stableAngle(`${key}/elevation`)) * 0.58
      const radial = Math.sqrt(Math.max(0, 1 - elevation * elevation))
      const color = fieldParticleColor(fieldParticleKind(field.type))
      const proxy: BulkFieldProxy = {
        fieldProxyId: key,
        fieldParticleId: fieldParticleIdFromAtomField(boundaryAtom.id, field.id),
        fieldId,
        parentDarkParticleId,
        stateOrbitalParticleId: stateParticle.orbitalParticleId,
        localX: stateParticle.localX + Math.cos(angle) * radial * stateParticle.sphereRadius * 0.93,
        localY: stateParticle.localY + Math.sin(angle) * radial * stateParticle.sphereRadius * 0.93,
        localZ: stateParticle.localZ + elevation * stateParticle.sphereRadius * 0.93,
        ringRadius: Math.max(1.5, stateParticle.sphereRadius * 0.2),
        ...color,
      }
      fieldProxies.push(proxy)
      fieldProxyByOccurrenceField.set(key, proxy)
      relationChannels.push({
        relationChannelId: `${key}/projection`,
        parentDarkParticleId,
        relationKind: "field-projection",
        fromKind: "field",
        fromId: proxy.fieldParticleId,
        toKind: "field-proxy",
        toId: proxy.fieldProxyId,
        active: stateParticle.active,
        ...color,
      })
      return proxy
    }

    atomStates.forEach((rootState, rootIndex) => {
      const rootAngle = (Math.PI * 2 * rootIndex) / Math.max(1, atomStates.length)
      const sleeveAngleSpan = Math.min((Math.PI * 2 / Math.max(1, atomStates.length)) * 0.78, 1.15)
      const stats = sleeveStats[rootIndex]!
      const sleeveRadialSpan = Math.max(1, atomOuterRadius - stateInnerRadius - layoutMargin * 2)
      const sleeveBandWidth = sleeveRadialSpan / (stats.maxDepth + 1)
      const depthIndexes = new Map<number, number>()
      const occurrenceByPathState = new Map<number, string>()

      const visit = (
        stateId: number,
        pathStates: number[],
        pathTransitions: number[],
      ): string => {
        const state = stateById.get(stateId)
        if (!state) return ""
        const occurrenceId = `atom/${boundaryAtom.id}/sleeve/${rootState.id}/state/${state.id}/path/${pathTransitions.join("-") || "root"}`
        const depth = pathTransitions.length
        const depthCount = stats.depthCounts.get(depth) ?? 1
        const depthIndex = depthIndexes.get(depth) ?? 0
        depthIndexes.set(depth, depthIndex + 1)
        const midRadius = stateInnerRadius + layoutMargin + (depth + 0.5) * sleeveBandWidth
        const arcWidth = Math.max(1, midRadius * sleeveAngleSpan)
        const columns = Math.max(1, Math.ceil(Math.sqrt(depthCount * arcWidth / Math.max(1, sleeveBandWidth))))
        const rows = Math.max(1, Math.ceil(depthCount / columns))
        const column = depthIndex % columns
        const row = Math.floor(depthIndex / columns)
        const angle = rootAngle + ((column + 0.5) / columns - 0.5) * sleeveAngleSpan
        const distance = stateInnerRadius + layoutMargin + depth * sleeveBandWidth + (row + 0.5) / rows * sleeveBandWidth
        const stateOutgoing = outgoing.get(state.id) ?? []
        const terminal = stateOutgoing.length === 0
        const activeSleeve = rootState.id === currentStateId
        const stateParticle: BulkOrbitalParticle = {
          orbitalParticleId: occurrenceId,
          sourceId: state.id,
          parentDarkParticleId,
          orbitalParticleKind: "state",
          label: state.name,
          current: activeSleeve && depth === 0,
          active: activeSleeve,
          anchorStateOrbitalParticleId: null,
          sleeveRootStateId: rootState.id,
          relatedStateIds: [state.id],
          localX: Math.cos(angle) * distance,
          localY: Math.sin(angle) * distance,
          localZ: terminal ? 0 : (rootIndex % 2 === 0 ? 1 : -1) * Math.min(manifestedAtom.torusTube * 0.58, radius * (2.1 + depth * 0.25)),
          sphereRadius: radius,
          colorR: activeSleeve ? 0.62 : 0.2,
          colorG: activeSleeve ? 0.96 : 0.68,
          colorB: 1,
        }
        orbitalParticles.push(stateParticle)
        stateOccurrenceById.set(stateParticle.orbitalParticleId, stateParticle)
        const stateOccurrences = stateOccurrencesByStateId.get(state.id)
        if (stateOccurrences) stateOccurrences.push(stateParticle)
        else stateOccurrencesByStateId.set(state.id, [stateParticle])
        occurrenceByPathState.set(state.id, occurrenceId)

        stateOutgoing.forEach((transition) => {
          const cycleTarget = occurrenceByPathState.get(transition.toState)
          const nextOccurrenceId = cycleTarget ?? visit(
            transition.toState,
            [...pathStates, transition.toState],
            [...pathTransitions, transition.id],
          )
          if (!nextOccurrenceId) return
          const transitionConditions = sortByPosition(conditionsByTransition.get(transition.id) ?? [])
          transitionConditions.forEach((condition) => ensureFieldProxy(stateParticle, condition.field))
          transitionChannels.push({
            transitionChannelId: `${occurrenceId}/transition/${transition.id}/to/${nextOccurrenceId}`,
            sourceId: transition.id,
            parentDarkParticleId,
            fromOrbitalParticleId: occurrenceId,
            toOrbitalParticleId: nextOccurrenceId,
            conditionIds: transitionConditions.map((condition) => condition.id),
            conditionFieldIds: transitionConditions.map((condition) => condition.field),
            active: activeSleeve,
            colorR: activeSleeve ? 0.48 : 0.2,
            colorG: activeSleeve ? 0.9 : 0.48,
            colorB: 1,
          })
        })
        occurrenceByPathState.delete(state.id)
        return occurrenceId
      }

      visit(rootState.id, [rootState.id], [])
    })

    const stateIdByName = new Map(atomStates.map((state) => [state.name, state.id] as const))
    const causalSlotByStateOccurrence = new Map<string, number>()
    const appendCausalOccurrence = (input: {
      baseId: string
      sourceId: number
      orbitalParticleKind: Exclude<BulkOrbitalParticleKind, "state">
      label: string
      active: boolean
      relatedStateIds: number[]
      radiusScale: number
      colorR: number
      colorG: number
      colorB: number
    }): BulkOrbitalParticle[] => {
      const relatedStateIds = [...new Set(input.relatedStateIds)]
      const orderedStateIds = currentStateId !== null && relatedStateIds.includes(currentStateId)
        ? [currentStateId, ...relatedStateIds.filter((stateId) => stateId !== currentStateId)]
        : relatedStateIds
      let stateOccurrence: BulkOrbitalParticle | undefined
      for (const relatedStateId of orderedStateIds) {
        const occurrences = stateOccurrencesByStateId.get(relatedStateId) ?? []
        stateOccurrence = occurrences.find((occurrence) =>
          occurrence.sleeveRootStateId === relatedStateId &&
          occurrence.orbitalParticleId.endsWith("/root"))
          ?? occurrences[0]
        if (stateOccurrence) break
      }
      if (!stateOccurrence) return []

      const slotIndex = causalSlotByStateOccurrence.get(stateOccurrence.orbitalParticleId) ?? 0
      causalSlotByStateOccurrence.set(stateOccurrence.orbitalParticleId, slotIndex + 1)
      const sphereRadius = radius * input.radiusScale
      const particle: BulkOrbitalParticle = {
        orbitalParticleId: input.baseId,
        sourceId: input.sourceId,
        parentDarkParticleId,
        orbitalParticleKind: input.orbitalParticleKind,
        label: input.label,
        current: false,
        active: input.active,
        anchorStateOrbitalParticleId: stateOccurrence.orbitalParticleId,
        sleeveRootStateId: stateOccurrence.sleeveRootStateId,
        relatedStateIds,
        ...causalAttachmentPosition(stateOccurrence, sphereRadius, slotIndex),
        sphereRadius,
        colorR: input.colorR,
        colorG: input.colorG,
        colorB: input.colorB,
      }
      orbitalParticles.push(particle)
      return [particle]
    }

    const atomAxions = sortByPosition((topologiesByParentAtom.get(boundaryAtom.id) ?? []).filter((topology) => topology.kind === "axion"))
    atomAxions.forEach((topology) => {
      const label = topologyLabelById.get(topology.id) ?? "Axion · State"
      const stateName = label.startsWith("Axion · ") ? label.slice("Axion · ".length) : null
      const relatedState = stateName === null ? undefined : stateIdByName.get(stateName)
      if (relatedState === undefined) return
      const axionParticles = appendCausalOccurrence({
        baseId: `atom/${boundaryAtom.id}/axion/${topology.id}`,
        sourceId: topology.id,
        orbitalParticleKind: "axion",
        label,
        active: (atomsByParentTopology.get(topology.id)?.length ?? 0) > 0,
        relatedStateIds: [relatedState],
        radiusScale: 0.72,
        colorR: 1,
        colorG: 0.66,
        colorB: 0.36,
      })
      const plan = topologyPlanById.get(topology.id)
      if (!plan) return
      const fieldIds = new Set<number>()
      for (const child of matterParticlesByWimpParent.get(matterParentKey(plan.wimp, plan.id)) ?? []) {
        if (child.particleKind !== "wimp" || child.fieldsBinding === undefined) continue
        const paths = Array.isArray(child.fieldsBinding.data) ? child.fieldsBinding.data : [child.fieldsBinding.data]
        for (const path of paths) {
          const fieldKey = fieldKeyFromMatterPath(path)
          if (fieldKey === null) continue
          const field = fieldByWimpKey.get(`${boundaryAtom.wimp}\0${fieldKey}`)
          if (field) fieldIds.add(field.id)
        }
      }
      for (const axionParticle of axionParticles) {
        const occurrence = axionParticle.anchorStateOrbitalParticleId === null
          ? undefined
          : stateOccurrenceById.get(axionParticle.anchorStateOrbitalParticleId)
        if (!occurrence) continue
        for (const fieldId of fieldIds) {
          const proxy = ensureFieldProxy(occurrence, fieldId)
          if (!proxy) continue
          relationChannels.push({
            relationChannelId: `${proxy.fieldProxyId}/${axionParticle.orbitalParticleId}/read`,
            parentDarkParticleId,
            relationKind: "axion-read",
            fromKind: "field-proxy",
            fromId: proxy.fieldProxyId,
            toKind: "orbital",
            toId: axionParticle.orbitalParticleId,
            active: axionParticle.active,
            colorR: 1,
            colorG: 0.66,
            colorB: 0.36,
          })
        }
      }
    })
    sortByPosition((processesByWimp.get(boundaryAtom.wimp) ?? []).map((process, position) => ({...process, position}))).forEach((process) => {
      const relatedState = stateIdByName.get(process.state)
      if (relatedState === undefined) return
      const processParticles = appendCausalOccurrence({
        baseId: `atom/${boundaryAtom.id}/${process.descriptor.type}/${process.id}`,
        sourceId: process.id,
        orbitalParticleKind: process.descriptor.type === "finally" ? "finally" : "process",
        label: String(process.descriptor.label ?? process.descriptor.key ?? process.state),
        active: relatedState === currentStateId,
        relatedStateIds: [relatedState],
        radiusScale: 0.72,
        colorR: process.descriptor.type === "finally" ? 1 : 0.72,
        colorG: process.descriptor.type === "finally" ? 0.22 : 0.46,
        colorB: process.descriptor.type === "finally" ? 0.2 : 1,
      })
      const dependencies = processFieldDependencies(process.descriptor)
      for (const processParticle of processParticles) {
        const occurrence = processParticle.anchorStateOrbitalParticleId === null
          ? undefined
          : stateOccurrenceById.get(processParticle.anchorStateOrbitalParticleId)
        if (!occurrence) continue
        for (const fieldId of dependencies.read) {
          const proxy = ensureFieldProxy(occurrence, fieldId)
          if (!proxy) continue
          relationChannels.push({
            relationChannelId: `${proxy.fieldProxyId}/${processParticle.orbitalParticleId}/read`,
            parentDarkParticleId,
            relationKind: "process-read",
            fromKind: "field-proxy",
            fromId: proxy.fieldProxyId,
            toKind: "orbital",
            toId: processParticle.orbitalParticleId,
            active: processParticle.active,
            colorR: 0.36,
            colorG: 0.88,
            colorB: 1,
          })
        }
        for (const fieldId of dependencies.write) {
          const proxy = ensureFieldProxy(occurrence, fieldId)
          if (!proxy) continue
          relationChannels.push({
            relationChannelId: `${processParticle.orbitalParticleId}/${proxy.fieldProxyId}/write`,
            parentDarkParticleId,
            relationKind: "process-write",
            fromKind: "orbital",
            fromId: processParticle.orbitalParticleId,
            toKind: "field-proxy",
            toId: proxy.fieldProxyId,
            active: processParticle.active,
            colorR: 1,
            colorG: 0.58,
            colorB: 0.18,
          })
        }
      }
    })

    const atomReactions = reactionsByWimp.get(boundaryAtom.wimp) ?? []
    atomReactions.forEach((reaction) => {
      const relatedStates = reaction.states.length > 0 ? reaction.states : atomStates.map((state) => state.id)
      const reactionParticles = appendCausalOccurrence({
        baseId: `atom/${boundaryAtom.id}/reaction/${reaction.id}`,
        sourceId: reaction.id,
        orbitalParticleKind: "reaction",
        label: reaction.label?.trim() || reaction.key,
        active: reaction.states.length === 0 || (currentStateId !== null && reaction.states.includes(currentStateId)),
        relatedStateIds: relatedStates,
        radiusScale: 0.72,
        colorR: 1,
        colorG: 0.3,
        colorB: 0.68,
      })
      for (const reactionParticle of reactionParticles) {
        const occurrence = reactionParticle.anchorStateOrbitalParticleId === null
          ? undefined
          : stateOccurrenceById.get(reactionParticle.anchorStateOrbitalParticleId)
        if (!occurrence) continue
        for (const fieldId of reaction.read) {
          const proxy = ensureFieldProxy(occurrence, fieldId)
          if (!proxy) continue
          relationChannels.push({
            relationChannelId: `${proxy.fieldProxyId}/${reactionParticle.orbitalParticleId}/read`,
            parentDarkParticleId,
            relationKind: "reaction-read",
            fromKind: "field-proxy",
            fromId: proxy.fieldProxyId,
            toKind: "orbital",
            toId: reactionParticle.orbitalParticleId,
            active: reactionParticle.active,
            colorR: 0.38,
            colorG: 0.9,
            colorB: 1,
          })
        }
        for (const fieldId of reaction.write) {
          const proxy = ensureFieldProxy(occurrence, fieldId)
          if (!proxy) continue
          relationChannels.push({
            relationChannelId: `${reactionParticle.orbitalParticleId}/${proxy.fieldProxyId}/write`,
            parentDarkParticleId,
            relationKind: "reaction-write",
            fromKind: "orbital",
            fromId: reactionParticle.orbitalParticleId,
            toKind: "field-proxy",
            toId: proxy.fieldProxyId,
            active: reactionParticle.active,
            colorR: 1,
            colorG: 0.5,
            colorB: 0.16,
          })
        }
      }
    })
  }

  const atomByDarkParticleId = new Map(
    atoms.map((atom) => [atomDarkParticleIdFromAtomId(atom.id), atom] as const),
  )
  const darkChildrenByParent = new Map<number, typeof manifest.darkParticles>()
  for (const particle of manifest.darkParticles) {
    if (particle.parentDarkParticleId === null) continue
    const children = darkChildrenByParent.get(particle.parentDarkParticleId)
    if (children) children.push(particle)
    else darkChildrenByParent.set(particle.parentDarkParticleId, [particle])
  }
  const materializeDarkSubtree = (particle: (typeof manifest.darkParticles)[number]): void => {
    const boundaryAtom = atomByDarkParticleId.get(particle.darkParticleId)
    if (boundaryAtom) materializeAtomVisual(boundaryAtom)
    for (const child of darkChildrenByParent.get(particle.darkParticleId) ?? []) {
      materializeDarkSubtree(child)
    }
  }
  for (const root of manifest.darkParticles.filter((particle) => particle.parentDarkParticleId === null)) {
    materializeDarkSubtree(root)
  }

  return {...manifest, orbitalParticles, transitionChannels, fieldProxies, relationChannels}
}
