import type {BulkStore} from "@metafor/types/bulk/store"
import {BULK_STORE_FLAG_REMOVED} from "@metafor/types/bulk/store"
import {
  layoutFieldsInPseudoCircle,
  resolveContentTorusForm,
  TORUS_LAYOUT_BASELINE,
  torusFieldRadiusAtLevel,
  torusLevelScale,
} from "@metafor/visual/layout/centered-nested"

type StoreNode = {
  children: StoreNode[]
  depth: number
  id: number
  order: number
  parent: StoreNode | null
}

type StoreFieldEntry = {
  affinity: StoreNode
  aliases: number[]
  deepestDepth: number
  owner: StoreNode
  owners: StoreNode[]
  representative: number
  shared: boolean
}

export type BulkStoreFieldPlacement = Readonly<{
  aliasSlots: readonly number[]
  fieldIds: readonly number[]
  fieldKeys: readonly string[]
  fieldKind: number
  orbitIndex: number
  ownerDarkParticleId: number
  radius: number
  valueId: number
  valueText: string | null
  x: number
  y: number
  z: number
}>

export type BulkStoreFieldLayoutContext = Readonly<{
  componentRootDarkParticleId?: number
  componentRootDepth?: number
  initialOrbitIndex?: number
  rootIsComponentRoot?: boolean
  darkFormSink?: (
    darkParticleId: number,
    form: Readonly<{radius: number; tube: number}>,
  ) => void
  darkPositionSink?: (
    darkParticleId: number,
    position: Readonly<{x: number; y: number; z: number}>,
  ) => void
  ownStateOuterExtentResolver?: (
    darkParticleId: number,
    childOuterExtent: number,
    scale: number,
  ) => number
}>

const compareNode = (left: StoreNode, right: StoreNode): number =>
  left.depth - right.depth || left.order - right.order || left.id - right.id

const aliasIdentity = (store: BulkStore, slot: number): string =>
  `atom:${store.fieldAlias.atom[slot]}:field:${store.fieldAlias.field[slot]}`

const compareAlias = (store: BulkStore, left: number, right: number): number =>
  (store.fieldAlias.value[left] || Number.MAX_SAFE_INTEGER) -
    (store.fieldAlias.value[right] || Number.MAX_SAFE_INTEGER) ||
  store.fieldAlias.atom[left]! * 2 - store.fieldAlias.atom[right]! * 2 ||
  store.fieldAlias.field[left]! - store.fieldAlias.field[right]! ||
  aliasIdentity(store, left).localeCompare(aliasIdentity(store, right))

const buildTree = (
  store: BulkStore,
  root: number,
  darkIds: ReadonlySet<number>,
): Readonly<{nodeById: ReadonlyMap<number, StoreNode>; root: StoreNode}> => {
  const darkSlotById = new Map<number, number>()
  for (let slot = 0; slot < store.dark.id.length; slot++) {
    darkSlotById.set(store.dark.id[slot]!, slot)
  }
  let rootDepth = 0
  let ancestor = store.dark.parent[darkSlotById.get(root)!] ?? 0
  while (ancestor !== 0) {
    rootDepth++
    ancestor = store.dark.parent[darkSlotById.get(ancestor)!] ?? 0
  }
  const nodeById = new Map<number, StoreNode>()
  for (let slot = 0; slot < store.dark.id.length; slot++) {
    const id = store.dark.id[slot]!
    if (!darkIds.has(id)) continue
    nodeById.set(id, {
      children: [],
      depth: 0,
      id,
      order: store.dark.order[slot]!,
      parent: null,
    })
  }
  const rootNode = nodeById.get(root)
  if (!rootNode) throw new Error(`Bulk Store centered root ${root} is absent`)
  for (let slot = 0; slot < store.dark.id.length; slot++) {
    const id = store.dark.id[slot]!
    const node = nodeById.get(id)
    if (!node || id === root) continue
    const parent = nodeById.get(store.dark.parent[slot]!)
    if (!parent) throw new Error(`Bulk Store centered parent is absent for ${id}`)
    node.parent = parent
    parent.children.push(node)
  }
  const visiting = new Set<number>()
  const visited = new Set<number>()
  const assignDepth = (node: StoreNode, depth: number): void => {
    if (visiting.has(node.id)) throw new Error(`Bulk Store centered topology contains a cycle at ${node.id}`)
    if (visited.has(node.id)) return
    visiting.add(node.id)
    node.depth = depth
    node.children.sort(compareNode)
    for (const child of node.children) assignDepth(child, depth + 1)
    visiting.delete(node.id)
    visited.add(node.id)
  }
  assignDepth(rootNode, rootDepth)
  if (visited.size !== nodeById.size) {
    throw new Error("Bulk Store centered topology contains a disconnected node")
  }
  return {nodeById, root: rootNode}
}

const highestCommonOwner = (
  owners: readonly StoreNode[],
  root: StoreNode,
): StoreNode => {
  if (owners.length === 0) return root
  const paths = owners.map((owner) => {
    const path: StoreNode[] = []
    let cursor: StoreNode | null = owner
    while (cursor) {
      path.push(cursor)
      cursor = cursor.parent
    }
    return path.reverse()
  })
  let common = paths[0]?.[0] ?? root
  for (let index = 0; index < Math.min(...paths.map((path) => path.length)); index++) {
    const candidate = paths[0]?.[index]
    if (!candidate || !paths.every((path) => path[index]?.id === candidate.id)) break
    common = candidate
  }
  return common
}

const groupEntries = (
  store: BulkStore,
  root: StoreNode,
  nodeById: ReadonlyMap<number, StoreNode>,
  aliasSlots: ReadonlySet<number>,
  componentRootDepth: number,
): ReadonlyMap<number, readonly StoreFieldEntry[]> => {
  const groups = new Map<string, number[]>()
  for (const slot of aliasSlots) {
    if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const value = store.fieldAlias.value[slot]!
    const key = value === 0 ? `field:${aliasIdentity(store, slot)}` : `value:${value}`
    const held = groups.get(key)
    if (held) held.push(slot)
    else groups.set(key, [slot])
  }
  const byOwner = new Map<number, StoreFieldEntry[]>()
  const append = (entry: StoreFieldEntry): void => {
    const held = byOwner.get(entry.owner.id)
    if (held) held.push(entry)
    else byOwner.set(entry.owner.id, [entry])
  }
  for (const aliases of groups.values()) {
    aliases.sort((left, right) => compareAlias(store, left, right))
    const owners = [...new Set(aliases.map((slot) =>
      store.fieldAlias.atom[slot]! * 2))]
      .flatMap((id) => {
        const node = nodeById.get(id)
        return node ? [node] : []
      })
      .sort(compareNode)
    const deepestDepth = Math.max(componentRootDepth, ...owners.map((owner) => owner.depth))
    const affinity = owners.find((owner) => owner.depth === deepestDepth) ?? root
    const shared = owners.length > 1 && store.fieldAlias.value[aliases[0]!] !== 0
    if (shared) {
      const owner = highestCommonOwner(owners, root)
      append({
        affinity,
        aliases,
        deepestDepth,
        owner,
        owners,
        representative: aliases.find((slot) =>
          store.fieldAlias.atom[slot]! * 2 === owner.id) ?? aliases[0]!,
        shared: true,
      })
      continue
    }
    for (const alias of aliases) {
      const owner = nodeById.get(store.fieldAlias.atom[alias]! * 2) ?? root
      append({
        affinity: owner,
        aliases: [alias],
        deepestDepth: owner.depth,
        owner,
        owners: [owner],
        representative: alias,
        shared: false,
      })
    }
  }
  for (const entries of byOwner.values()) {
    entries.sort((left, right) =>
      (left.shared === right.shared ? 0 : left.shared ? 1 : -1) ||
      right.deepestDepth - left.deepestDepth ||
      compareNode(left.affinity, right.affinity) ||
      compareAlias(store, left.representative, right.representative))
  }
  return byOwner
}

const stablePhase = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const fieldOrbitCapacity = (orbitRadius: number, markerRadius: number): number => {
  if (markerRadius <= 0 || orbitRadius <= markerRadius) return 1
  const halfAngle = Math.asin(Math.min(1, markerRadius / orbitRadius))
  return Math.max(1, Math.floor(Math.PI / Math.max(halfAngle, 1e-9) + 1e-9))
}

const proportionalOrbitCounts = (
  count: number,
  capacities: readonly number[],
): number[] => {
  if (count <= 0 || capacities.length === 0) return []
  const allocations = capacities.map(() => 1)
  let remaining = count - allocations.length
  if (remaining <= 0) return allocations
  const available = capacities.map((capacity, index) =>
    Math.max(0, capacity - allocations[index]!))
  const totalAvailable = available.reduce((sum, value) => sum + value, 0)
  const quotas = available.map((value) => totalAvailable === 0 ? 0 : remaining * value / totalAvailable)
  allocations.forEach((_, index) => {
    const addition = Math.min(available[index]!, Math.floor(quotas[index]!))
    allocations[index]! += addition
    remaining -= addition
  })
  for (const {index} of quotas
    .map((quota, index) => ({fraction: quota - Math.floor(quota), index}))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)) {
    if (remaining === 0) break
    if (allocations[index]! >= capacities[index]!) continue
    allocations[index]! += 1
    remaining -= 1
  }
  return allocations
}

const placement = (
  store: BulkStore,
  fieldSourceById: ReadonlyMap<number, number>,
  entry: StoreFieldEntry,
  orbitIndex: number,
  radius: number,
  point: Readonly<{x: number; y: number; z: number}>,
): BulkStoreFieldPlacement => ({
  aliasSlots: entry.aliases,
  fieldIds: entry.aliases.map((slot) => store.fieldAlias.field[slot]!),
  fieldKeys: entry.aliases.map((slot) => {
    const source = fieldSourceById.get(store.fieldAlias.field[slot]!)
    return source === undefined ? "" : store.text[store.fieldSource.key[source]!]!
  }),
  fieldKind: (() => {
    const source = fieldSourceById.get(store.fieldAlias.field[entry.representative]!)
    return source === undefined ? 0 : store.fieldSource.kind[source]!
  })(),
  orbitIndex,
  ownerDarkParticleId: entry.owner.id,
  radius,
  valueId: store.fieldAlias.value[entry.representative]!,
  valueText: store.text[store.fieldAlias.valueText[entry.representative]!] || null,
  ...point,
})

const placeOrbitGroup = (
  store: BulkStore,
  fieldSourceById: ReadonlyMap<number, number>,
  entries: readonly StoreFieldEntry[],
  occupied: number,
  gap: number,
  phaseKey: string,
  orbitCursor: {value: number},
): Readonly<{outer: number; placements: readonly BulkStoreFieldPlacement[]}> => {
  if (entries.length === 0) return {outer: occupied, placements: []}
  const radii = entries.map((entry) => torusFieldRadiusAtLevel(entry.owner.depth))
  const maximumRadius = Math.max(0, ...radii)
  const first = occupied + gap + maximumRadius
  const orbitRadii: number[] = []
  const capacities: number[] = []
  let capacity = 0
  while (capacity < entries.length) {
    const radius = first + orbitRadii.length * maximumRadius * 2
    const next = fieldOrbitCapacity(radius, maximumRadius)
    orbitRadii.push(radius)
    capacities.push(next)
    capacity += next
  }
  const result: BulkStoreFieldPlacement[] = []
  let cursor = 0
  proportionalOrbitCounts(entries.length, capacities).forEach((count, localOrbit) => {
    const orbitRadius = orbitRadii[localOrbit]!
    const orbitIndex = orbitCursor.value
    const phase = stablePhase(`${phaseKey}:${orbitIndex}`)
    for (let index = 0; index < count; index++) {
      const entryIndex = cursor + index
      const angle = phase + index * Math.PI * 2 / count
      result.push(placement(store, fieldSourceById, entries[entryIndex]!, orbitIndex, radii[entryIndex]!, {
        x: Math.cos(angle) * orbitRadius,
        y: Math.sin(angle) * orbitRadius,
        z: 0,
      }))
    }
    cursor += count
    orbitCursor.value++
  })
  return {outer: orbitRadii.at(-1)! + maximumRadius, placements: result}
}

/** Exact centered-nested Field law over the final Store columns. */
export const layoutCenteredNestedStoreFields = (
  store: BulkStore,
  root: number,
  darkIds: ReadonlySet<number>,
  aliasSlots: ReadonlySet<number>,
  minimumRootCoreExtent = 0,
  context: BulkStoreFieldLayoutContext = {},
): readonly BulkStoreFieldPlacement[] => {
  const fieldSourceById = new Map(Array.from(
    {length: store.fieldSource.id.length},
    (_, slot) => [store.fieldSource.id[slot]!, slot] as const,
  ))
  const tree = buildTree(store, root, darkIds)
  const componentRootDepth = context.componentRootDepth ?? 0
  const byOwner = groupEntries(store, tree.root, tree.nodeById, aliasSlots, componentRootDepth)
  const markerRadius = TORUS_LAYOUT_BASELINE.rootFieldRadius
  const localGap = markerRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
  const orbitCursor = {value: context.initialOrbitIndex ?? 0}
  const maximumDepth = new Map<number, number>()
  const indexDepth = (node: StoreNode): number => {
    const depth = Math.max(node.depth, ...node.children.map(indexDepth))
    maximumDepth.set(node.id, depth)
    return depth
  }
  indexDepth(tree.root)
  const all: BulkStoreFieldPlacement[] = []
  const resolve = (node: StoreNode, minimumCoreExtent: number): number => {
    const entries = byOwner.get(node.id) ?? []
    const privateEntries = entries.filter((entry) => !entry.shared)
    const sharedEntries = entries.filter((entry) => entry.shared)
    let occupied = minimumCoreExtent
    if (node === tree.root && (context.rootIsComponentRoot ?? true)) {
      const radii = privateEntries.map((entry) => torusFieldRadiusAtLevel(entry.owner.depth))
      const maximumRadius = Math.max(0, ...radii)
      const centered = layoutFieldsInPseudoCircle(privateEntries.length, maximumRadius)
      privateEntries.forEach((entry, index) => {
        const point = centered.points[index] ?? {x: 0, y: 0, z: 0}
        const radius = radii[index] ?? maximumRadius
        all.push(placement(store, fieldSourceById, entry, orbitCursor.value, radius, point))
        occupied = Math.max(occupied, Math.hypot(point.x, point.y, point.z) + radius)
      })
    } else {
      const placed = placeOrbitGroup(
        store,
        fieldSourceById,
        privateEntries,
        occupied,
        0,
        `${context.componentRootDarkParticleId ?? root}:${node.id}:private`,
        orbitCursor,
      )
      all.push(...placed.placements)
      occupied = placed.outer
    }
    const sharedByDepth = Map.groupBy(sharedEntries, (entry) => entry.deepestDepth)
    const depths = [...sharedByDepth.keys()].sort((left, right) => right - left)
    let first = true
    for (const depth of depths) {
      const depthEntries = sharedByDepth.get(depth) ?? []
      const maximumRadius = Math.max(0, ...depthEntries.map((entry) =>
        torusFieldRadiusAtLevel(entry.owner.depth)))
      const placed = placeOrbitGroup(
        store,
        fieldSourceById,
        depthEntries,
        occupied,
        first && privateEntries.length > 0 ? maximumRadius * 2 : 0,
        `${context.componentRootDarkParticleId ?? root}:${node.id}:shared:${depth}`,
        orbitCursor,
      )
      all.push(...placed.placements)
      occupied = placed.outer
      first = false
    }
    const scale = torusLevelScale(node.depth)
    const emptyOuterRadius = TORUS_LAYOUT_BASELINE.rootOuterRadius * scale
    const gap = localGap * scale
    const coreForm = resolveContentTorusForm({coreExtent: occupied, emptyOuterRadius, gap})
    let childOuterExtent = coreForm.innerRadius
    const orderedChildren = [...node.children].sort((left, right) =>
      (maximumDepth.get(right.id) ?? right.depth) - (maximumDepth.get(left.id) ?? left.depth) ||
      compareNode(left, right))
    for (const child of orderedChildren) childOuterExtent = resolve(child, childOuterExtent)
    const ownStateOuterExtent = context.ownStateOuterExtentResolver?.(
      node.id,
      childOuterExtent,
      scale,
    ) ?? 0
    const form = resolveContentTorusForm({
      coreExtent: occupied,
      emptyOuterRadius,
      gap,
      occupiedOuterExtent: Math.max(childOuterExtent, ownStateOuterExtent),
    })
    context.darkFormSink?.(node.id, form)
    return form.outerRadius
  }
  resolve(tree.root, minimumRootCoreExtent)
  return all
}

const outsideInChildPhase = (children: readonly StoreNode[]): number => {
  const identity = children.map((child) => child.id).join(":")
  return identity.length === 0 ? 0 : stablePhase(identity)
}

const outsideInSiblingOrbitRadius = (
  count: number,
  maximumExtent: number,
  gap: number,
): number => count <= 1
  ? 0
  : (maximumExtent + gap * 0.5) / Math.sin(Math.PI / count)

/** Exact outside-in Field/Matter/State bands over the final Store columns. */
export const layoutOutsideInStoreFields = (
  store: BulkStore,
  root: number,
  darkIds: ReadonlySet<number>,
  aliasSlots: ReadonlySet<number>,
  context: BulkStoreFieldLayoutContext = {},
): readonly BulkStoreFieldPlacement[] => {
  const fieldSourceById = new Map(Array.from(
    {length: store.fieldSource.id.length},
    (_, slot) => [store.fieldSource.id[slot]!, slot] as const,
  ))
  const tree = buildTree(store, root, darkIds)
  const aliasesByOwner = new Map<number, number[]>()
  for (const slot of aliasSlots) {
    if ((store.fieldAlias.flags[slot]! & BULK_STORE_FLAG_REMOVED) !== 0) continue
    const owner = store.fieldAlias.atom[slot]! * 2
    if (!tree.nodeById.has(owner)) continue
    const held = aliasesByOwner.get(owner)
    if (held) held.push(slot)
    else aliasesByOwner.set(owner, [slot])
  }
  for (const aliases of aliasesByOwner.values()) aliases.sort((left, right) =>
    store.fieldAlias.field[left]! - store.fieldAlias.field[right]! ||
    store.fieldAlias.order[left]! - store.fieldAlias.order[right]! ||
    store.fieldAlias.id[left]! - store.fieldAlias.id[right]!)

  const all: BulkStoreFieldPlacement[] = []
  const resolve = (node: StoreNode): number => {
    const scale = torusLevelScale(node.depth)
    const markerRadius = TORUS_LAYOUT_BASELINE.rootFieldRadius * scale
    const gap = markerRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
    const aliases = aliasesByOwner.get(node.id) ?? []
    const fieldLayout = layoutFieldsInPseudoCircle(aliases.length, markerRadius)
    aliases.forEach((alias, index) => {
      const entry: StoreFieldEntry = {
        affinity: node,
        aliases: [alias],
        deepestDepth: node.depth,
        owner: node,
        owners: [node],
        representative: alias,
        shared: false,
      }
      all.push(placement(
        store,
        fieldSourceById,
        entry,
        0,
        markerRadius,
        fieldLayout.points[index] ?? {x: 0, y: 0, z: 0},
      ))
    })
    const coreExtent = fieldLayout.radius
    const coreForm = resolveContentTorusForm({
      coreExtent,
      emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius * scale,
      gap,
    })
    const children = [...node.children].sort(compareNode)
    const childOuterRadius = new Map<number, number>()
    for (const child of children) childOuterRadius.set(child.id, resolve(child))
    const maximumChildExtent = Math.max(0, ...childOuterRadius.values())
    const matterOrbitRadius = children.length === 0
      ? 0
      : Math.max(
        coreForm.innerRadius + gap + maximumChildExtent,
        outsideInSiblingOrbitRadius(children.length, maximumChildExtent, gap),
      )
    const childPhase = outsideInChildPhase(children)
    children.forEach((child, index) => {
      const angle = childPhase + index * Math.PI * 2 / children.length
      context.darkPositionSink?.(child.id, {
        x: Math.cos(angle) * matterOrbitRadius,
        y: Math.sin(angle) * matterOrbitRadius,
        z: 0,
      })
    })
    const matterOuterRadius = children.length === 0
      ? coreForm.innerRadius
      : matterOrbitRadius + maximumChildExtent
    const stateOuterRadius = context.ownStateOuterExtentResolver?.(
      node.id,
      matterOuterRadius,
      scale,
    ) ?? 0
    const form = resolveContentTorusForm({
      coreExtent,
      emptyOuterRadius: TORUS_LAYOUT_BASELINE.rootOuterRadius * scale,
      gap,
      occupiedOuterExtent: Math.max(matterOuterRadius, stateOuterRadius),
    })
    context.darkFormSink?.(node.id, form)
    return form.outerRadius
  }
  context.darkPositionSink?.(tree.root.id, {x: 0, y: 0, z: 0})
  resolve(tree.root)
  return all
}
