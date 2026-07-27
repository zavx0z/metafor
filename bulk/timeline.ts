import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {HudTimelineDocument, HudTimelineTrack} from "@ui/hud"

type Atom = BulkRuntimeProjection["atoms"][number]
type Topology = BulkRuntimeProjection["topologies"][number]

/**
 * Adapts the exact current Bulk observer cut. It does not claim historical
 * samples: every real materialized Atom is marked only at the shared cut.
 */
export function buildBulkTimeline(
  projection: BulkRuntimeProjection,
  rootSrc: string,
  throughTs: number | null,
): HudTimelineDocument {
  const roots = projection.atoms
    .filter((atom) => atom.wimp === rootSrc && atom.parentAtom === null && atom.parentTopology === null)
    .sort(byPosition)
  const root = roots.at(-1)
  if (!root) throw new Error(`Bulk timeline root is not materialized: ${rootSrc}`)

  const atomsByParent = group(projection.atoms, (atom) => atom.parentAtom)
  const atomsByTopology = group(projection.atoms, (atom) => atom.parentTopology)
  const topologiesByParent = group(projection.topologies, (topology) => topology.parentAtom)
  const topologiesByTopology = group(projection.topologies, (topology) => topology.parentTopology)
  const ordered: Atom[] = []
  const seenAtoms = new Set<number>()
  const seenTopologies = new Set<number>()

  const visitTopology = (topology: Topology): void => {
    if (seenTopologies.has(topology.id)) return
    seenTopologies.add(topology.id)
    for (const child of [...(atomsByTopology.get(topology.id) ?? [])].sort(byPosition)) visitAtom(child)
    for (const child of [...(topologiesByTopology.get(topology.id) ?? [])].sort(byPosition)) visitTopology(child)
  }
  const visitAtom = (atom: Atom): void => {
    if (seenAtoms.has(atom.id)) return
    seenAtoms.add(atom.id)
    ordered.push(atom)
    for (const topology of [...(topologiesByParent.get(atom.id) ?? [])].sort(byPosition)) visitTopology(topology)
    for (const child of [...(atomsByParent.get(atom.id) ?? [])].sort(byPosition)) visitAtom(child)
  }
  visitAtom(root)

  const stateByAtom = new Map(projection.atomStates.map((state) => [state.atom, state.state] as const))
  const stateName = new Map(projection.states.map((state) => [state.id, state.name] as const))
  const wimpName = new Map(projection.wimps.map((wimp) => [wimp.src, wimp.name] as const))
  const cut = throughTs ?? 0
  const resolution = throughTs === null ? "unknown" : "exact"
  const tracks: HudTimelineTrack[] = ordered.map((atom) => {
    const currentState = stateByAtom.get(atom.id)
    return {
      id: `atom:${atom.id}`,
      label: wimpName.get(atom.wimp) ?? atom.wimp.split("/").at(-1) ?? atom.wimp,
      markers: [{
        tick: cut,
        resolution,
        selected: true,
        ...(currentState === undefined || currentState === null
          ? {}
          : {label: stateName.get(currentState) ?? `state:${currentState}`}),
      }],
    }
  })

  return {
    title: `${wimpName.get(root.wimp) ?? root.wimp} · текущий observer cut`,
    minTick: cut - 1,
    maxTick: cut + 1,
    playheadTick: cut,
    tracks,
  }
}

function group<T, K extends number | null>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>()
  for (const item of items) {
    const value = key(item)
    const groupItems = result.get(value) ?? []
    groupItems.push(item)
    result.set(value, groupItems)
  }
  return result
}

function byPosition<T extends {id: number; position: number}>(left: T, right: T): number {
  return left.position - right.position || left.id - right.id
}
