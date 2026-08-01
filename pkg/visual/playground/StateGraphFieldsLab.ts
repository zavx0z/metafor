import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import {BulkVisualSceneLifecycle} from "bulk/visual"
import type {StateGraph} from "../src/StateGraph.ts"

export type StateGraphFieldsStand = Readonly<{
  graph: StateGraph
  manifest: BulkManifest
  rootDarkParticleId: number
  visual: BulkVisualRenderManifest
}>

export const isolateRootAtomManifest = (
  source: BulkManifest,
  rootSrc: string,
): BulkManifest => {
  const roots = source.darkParticles.filter((particle) =>
    particle.parentDarkParticleId === null &&
    particle.darkParticleKind === "atom" &&
    particle.src === rootSrc
  )
  if (roots.length !== 1) {
    throw new Error(
      `State Graph Fields stand expected one root Atom ${rootSrc}, got ${roots.length}`,
    )
  }
  const rootDarkParticleId = roots[0]!.darkParticleId
  const ownedByRoot = <Value extends {parentDarkParticleId: number}>(
    values: readonly Value[] | undefined,
  ): Value[] =>
    (values ?? []).filter((value) =>
      value.parentDarkParticleId === rootDarkParticleId
    )

  return {
    rootSrc,
    darkParticles: [roots[0]!],
    fieldParticles: ownedByRoot(source.fieldParticles),
    orbitalParticles: ownedByRoot(source.orbitalParticles),
    transitionChannels: ownedByRoot(source.transitionChannels),
    fieldProxies: ownedByRoot(source.fieldProxies),
    relationChannels: ownedByRoot(source.relationChannels),
  }
}

export const buildStateGraphFieldsStand = (
  lifecycle: BulkVisualSceneLifecycle,
): StateGraphFieldsStand => {
  const state = lifecycle.state()
  const {projection, rootSrc} = state
  const rootAtoms = projection.atoms.filter((atom) =>
    atom.wimp === rootSrc &&
    atom.parentAtom === null &&
    atom.parentTopology === null
  )
  if (rootAtoms.length !== 1) {
    throw new Error(
      `State Graph Fields stand expected one projection root ${rootSrc}, got ${rootAtoms.length}`,
    )
  }

  const manifest = isolateRootAtomManifest(
    state.manifest,
    rootSrc,
  )
  const rootDarkParticleId = manifest.darkParticles[0]!.darkParticleId
  const input = lifecycle.layoutInput(manifest)
  const owner = input.owners.find((candidate) =>
    candidate.ownerDarkParticleId === rootDarkParticleId
  )
  if (!owner) {
    throw new Error(
      `State Graph Fields stand expected Visual owner ${rootDarkParticleId}`,
    )
  }
  return {
    graph: owner.graph,
    manifest,
    rootDarkParticleId,
    visual: lifecycle.compose({manifest}).renderManifest,
  }
}
