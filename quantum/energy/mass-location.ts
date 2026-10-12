/**
Trusted installer-only native location. Paths never enter Graph/Fields/Force.
Presence does not establish writer closure; the caller confirms Meta stopping
and Quantum close before packaging private data. No creation, lease or write.
@packageDocumentation
*/
import {isAbsolute} from "node:path"
import type {BoundaryInitialProjection} from "shared/protocol/boundary/initial"
import {validateMetaRuntimeAtomLocator, type MetaRuntimeAtomLocator} from "shared/protocol/metafor/observation"
import {EnergyCatalogStore} from "./graph/catalog"
import {EnergyMassCatalog} from "./mass"

export interface DirectoryMassLocationInput {
  massRoot: string
  projection: BoundaryInitialProjection
  atom: MetaRuntimeAtomLocator
  key: string
}

/** Resolves one declared directory against its canonical Atom. Rejects ambiguous/corrupt envelopes and unsafe/missing paths. */
export async function locateDirectoryMass(input: DirectoryMassLocationInput): Promise<{directory: string}> {
  if (!isAbsolute(input.massRoot) || !validateMetaRuntimeAtomLocator(input.atom, "/atom").ok
    || typeof input.key !== "string" || !input.key || input.projection.version !== 1 || !Array.isArray(input.projection.entries))
    throw new Error("Invalid directory Mass location request")
  const catalog = new EnergyCatalogStore()
  for (const entry of input.projection.entries) catalog.apply({...entry, by: "boundary", ts: 0})
  if ([...catalog.atoms.values()].filter(atom => atom.wimp === input.atom.root && atom.parentAtom === null && atom.parentTopology === null).length !== 1)
    throw new Error("Directory Mass root is not unique")
  const atom = catalog.resolveAtom(input.atom)
  if (!atom) throw new Error("Directory Mass Atom locator does not match canonical identity")
  const envelopes = input.projection.entries.filter(entry => typeof entry.path === "string" && entry.path.replace(/^\/+/, "") === `atom/${atom.id}`)
  if (envelopes.length !== 1) throw new Error("Directory Mass Atom projection is ambiguous")
  const value = envelopes[0]!.value
  if (!value || typeof value !== "object" || Array.isArray(value) || !("mass" in value) || !Array.isArray(value.mass))
    throw new Error("Directory Mass declaration is missing")
  const declarations = value.mass.filter(item => item && typeof item === "object" && item.key === input.key)
  if (declarations.length !== 1 || declarations[0].format !== "directory") throw new Error("Directory Mass key is missing, ambiguous or has another format")
  const artifact = catalog.mass(atom.id).find(item => item.key === input.key)
  if (!artifact || artifact.format !== "directory") throw new Error("Invalid canonical directory Mass declaration")
  return {directory: await new EnergyMassCatalog(input.massRoot).locateDirectory(artifact.keyId)}
}
