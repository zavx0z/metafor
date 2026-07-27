import {
  validateMetaJSONV1,
  type MetaJSONV1,
} from "@metafor/types/metafor/meta-json"
import {
  executeBoundaryDissolveProof,
  type BoundaryDissolveMassEvidenceReader,
  type BoundaryDissolveProof,
  type BoundaryMassFenceIdentity,
} from "./dissolve.ts"
import {
  DetachedBoundaryDissolveCandidateStaging,
  type BoundaryDissolveCandidateStageReceiptV1,
} from "./dissolve-candidate-staging.ts"
import type {
  BoundaryDissolveMetaJSONReader,
} from "./dissolve.ts"
import type {BoundaryDatabase} from "./sqlite.ts"

export type DetachedBoundaryDissolveAcceptanceV1 = Readonly<{
  stage: BoundaryDissolveCandidateStageReceiptV1
  proof: BoundaryDissolveProof
  postMetaJSON: MetaJSONV1
  localFenceProof: Readonly<{
    fenced: readonly BoundaryMassFenceIdentity[]
    released: readonly BoundaryMassFenceIdentity[]
    effects: "none"
  }>
}>

export type DetachedBoundaryDissolveAcceptanceHooks = Readonly<{
  massEvidence: BoundaryDissolveMassEvidenceReader
  readMetaJSON: BoundaryDissolveMetaJSONReader
}>

const sameIdentity = (
  left: BoundaryMassFenceIdentity,
  right: BoundaryMassFenceIdentity,
): boolean =>
  left.atom === right.atom &&
  left.declaration === right.declaration &&
  left.key === right.key

/**
 * Executes one exact durable plan inside a caller-owned detached candidate.
 *
 * Fence hooks are deliberately local evidence only: this module has no Energy,
 * Monad, Force, source or runtime dependency and is absent from package exports.
 */
export const executeDetachedBoundaryDissolveCandidate = async (
  boundary: BoundaryDatabase,
  staging: DetachedBoundaryDissolveCandidateStaging,
  proposalId: string,
  hooks: DetachedBoundaryDissolveAcceptanceHooks,
): Promise<DetachedBoundaryDissolveAcceptanceV1> => {
  if (!staging.owns(boundary)) {
    throw new Error(
      "Detached dissolve stage and execution Boundary must be the same candidate",
    )
  }
  const exact = await staging.exactPlan(proposalId, hooks)
  const fenced: BoundaryMassFenceIdentity[] = []
  const released: BoundaryMassFenceIdentity[] = []
  const proof = await executeBoundaryDissolveProof(
    boundary,
    exact.proposal.request,
    exact.plan,
    {
      massEvidence: hooks.massEvidence,
      readMetaJSON: hooks.readMetaJSON,
      async fence(identity) {
        fenced.push(Object.freeze({...identity}))
      },
      async release(identity) {
        released.push(Object.freeze({...identity}))
      },
    },
  )
  if (
    proof.sourceAtom !== exact.receipt.sourceAtom ||
    proof.targetAtom !== exact.receipt.targetAtom ||
    proof.planSha256 !== exact.receipt.planSha256 ||
    proof.structuralSha256 !== exact.receipt.structuralSha256 ||
    proof.privateManifestSha256 !== exact.receipt.privateManifestSha256 ||
    proof.transferredGlobalKeys.length !== exact.receipt.fenceCount ||
    fenced.length !== exact.receipt.fenceCount ||
    released.length !== exact.receipt.fenceCount ||
    !released.every((identity, index) =>
      sameIdentity(identity, fenced[fenced.length - 1 - index]!)
    )
  ) {
    throw new Error(
      "Detached dissolve proof does not match its exact candidate stage",
    )
  }

  const postMetaJSON = await hooks.readMetaJSON(
    exact.proposal.request.target,
    "planned",
  )
  if (
    !validateMetaJSONV1(postMetaJSON) ||
    postMetaJSON.root !== exact.receipt.target ||
    postMetaJSON.template[exact.receipt.source] !== undefined ||
    postMetaJSON.runtime.roots.length !== 1 ||
    postMetaJSON.runtime.roots[0]?.kind !== "atom" ||
    postMetaJSON.runtime.roots[0].meta !== exact.receipt.target
  ) {
    throw new Error(
      "Detached dissolve post-MetaJSON does not prove the promoted target root",
    )
  }
  const sourceAtoms = await boundary.projection.sql<unknown[]>`
    SELECT 1 FROM atom WHERE id = ${exact.receipt.sourceAtom} LIMIT 1
  `
  const targetRoots = await boundary.projection.sql<Array<{
    id: number
    wimp: string
    parentAtom: number | null
    parentTopology: number | null
  }>>`
    SELECT id, wimp, parent_atom AS parentAtom,
           parent_topology AS parentTopology
      FROM atom WHERE id = ${exact.receipt.targetAtom}
  `
  if (
    sourceAtoms.length !== 0 ||
    targetRoots.length !== 1 ||
    targetRoots[0]?.wimp !== exact.receipt.target ||
    targetRoots[0]?.parentAtom !== null ||
    targetRoots[0]?.parentTopology !== null
  ) {
    throw new Error(
      "Detached dissolve candidate did not remove Inference and promote Lada",
    )
  }

  return Object.freeze({
    stage: exact.receipt,
    proof,
    postMetaJSON,
    localFenceProof: Object.freeze({
      fenced: Object.freeze(fenced),
      released: Object.freeze(released),
      effects: "none",
    }),
  })
}
