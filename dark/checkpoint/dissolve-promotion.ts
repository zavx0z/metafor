import type {
  BulkRootPromotionReceipt,
} from "@metafor/types/bulk/manifest"
import {createHash} from "node:crypto"
import {
  BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
  BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1,
  type BoundaryDissolveCandidateStageReceiptV1,
  type BoundaryDissolveCheckpointBindingV1,
} from "../../boundary/dissolve-candidate-staging.ts"
import type {BoundaryDissolveProof} from "../../boundary/dissolve.ts"
import {
  DISSOLVE_CANDIDATE_BUNDLE_RECEIPT_V1,
  type DissolveCandidateBundleReceiptV1,
} from "./dissolve-candidate.ts"

export const DISSOLVE_CANDIDATE_ROOT_FRAME_CAPTURE_V1 =
  "metafor/dissolve-candidate-root-frame/v1" as const

type RootFrame = Readonly<
  BulkRootPromotionReceipt["formerRootFrame"]
>

/**
 * Explicit pre-dissolve frame evidence bound to one verified detached stage.
 *
 * This is capture metadata only. It does not authorize or claim a dissolve.
 */
export type DissolveCandidateRootFrameCaptureV1 = Readonly<{
  schema: typeof DISSOLVE_CANDIDATE_ROOT_FRAME_CAPTURE_V1
  captureId: string
  bundleId: string
  stageId: string
  stageReceiptId: string
  checkpoint: BoundaryDissolveCheckpointBindingV1
  removedRootAtomId: number
  removedRootSrc: string
  formerRootFrame: RootFrame
  effects: "none"
}>

export type DissolveCandidatePromotionEvidenceV1 = Readonly<{
  bundle: DissolveCandidateBundleReceiptV1
  stage: BoundaryDissolveCandidateStageReceiptV1
  frameCapture: DissolveCandidateRootFrameCaptureV1
  /** Null until the staged plan has completed successfully. */
  proof: BoundaryDissolveProof | null
}>

const digestPattern = /^[0-9a-f]{64}$/
const commitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex")

const utf16Compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => utf16Compare(left, right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    )
  }
  return value
}

const canonicalSha256 = (value: unknown): string =>
  sha256(JSON.stringify(canonicalValue(value)))

const validDigest = (value: unknown): value is string =>
  typeof value === "string" && digestPattern.test(value)

const sameCheckpoint = (
  left: BoundaryDissolveCheckpointBindingV1,
  right: BoundaryDissolveCheckpointBindingV1,
): boolean =>
  left.cutId === right.cutId &&
  left.sequence === right.sequence &&
  left.commit === right.commit &&
  left.boundarySha256 === right.boundarySha256 &&
  left.projectionSha256 === right.projectionSha256 &&
  left.massManifestSha256 === right.massManifestSha256

const validCheckpoint = (
  checkpoint: BoundaryDissolveCheckpointBindingV1,
): boolean =>
  typeof checkpoint.cutId === "string" &&
  checkpoint.cutId.length > 0 &&
  Number.isSafeInteger(checkpoint.sequence) &&
  checkpoint.sequence > 0 &&
  commitPattern.test(checkpoint.commit) &&
  validDigest(checkpoint.boundarySha256) &&
  validDigest(checkpoint.projectionSha256) &&
  validDigest(checkpoint.massManifestSha256)

const validFrame = (frame: RootFrame): boolean =>
  Number.isFinite(frame.localX) &&
  Number.isFinite(frame.localY) &&
  Number.isFinite(frame.localZ) &&
  Number.isFinite(frame.outerDiameterMm) &&
  frame.outerDiameterMm > 0

const verifiedCandidateBinding = (
  bundle: DissolveCandidateBundleReceiptV1,
  stage: BoundaryDissolveCandidateStageReceiptV1,
): boolean => {
  const {bundleId, ...bundleBody} = bundle
  const {receiptId, ...stageBody} = stage
  return (
    bundle.schema === DISSOLVE_CANDIDATE_BUNDLE_RECEIPT_V1 &&
    bundle.effects === "none" &&
    bundle.retention === BOUNDARY_DISSOLVE_CANDIDATE_RETENTION &&
    validDigest(bundleId) &&
    bundleId === canonicalSha256(bundleBody) &&
    validDigest(bundle.rollbackManifestSha256) &&
    validDigest(bundle.candidateBoundarySha256) &&
    validDigest(bundle.candidateMassManifestSha256) &&
    Number.isSafeInteger(bundle.rollbackFiles) &&
    bundle.rollbackFiles > 0 &&
    bundle.root === stage.source &&
    bundle.stage.stageId === stage.stageId &&
    bundle.stage.receiptId === receiptId &&
    bundle.rollbackManifestSha256 === stage.rollbackManifestSha256 &&
    sameCheckpoint(bundle.checkpoint, stage.checkpoint) &&
    stage.schema === BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1 &&
    stage.operation === "dissolve" &&
    stage.status === "staged" &&
    stage.effects === "none" &&
    stage.retention === BOUNDARY_DISSOLVE_CANDIDATE_RETENTION &&
    stage.fenceCount === 5 &&
    validDigest(stage.stageId) &&
    validDigest(receiptId) &&
    receiptId === sha256(JSON.stringify(stageBody)) &&
    stage.stageId === sha256(
      `${stage.checkpoint.commit}:${stage.proposalSha256}:${stage.planSha256}`,
    ) &&
    validDigest(stage.proposalSha256) &&
    validDigest(stage.planSha256) &&
    validDigest(stage.structuralSha256) &&
    validDigest(stage.privateManifestSha256) &&
    validDigest(stage.metaJSONSha256) &&
    validDigest(stage.rollbackManifestSha256) &&
    validCheckpoint(stage.checkpoint) &&
    Number.isSafeInteger(stage.sourceAtom) &&
    stage.sourceAtom > 0 &&
    Number.isSafeInteger(stage.targetAtom) &&
    stage.targetAtom > 0 &&
    stage.sourceAtom !== stage.targetAtom &&
    stage.source !== stage.target
  )
}

/**
 * Binds a caller-captured former-root frame to detached candidate evidence.
 *
 * The caller supplies the frame explicitly; this function never reads a
 * current Boundary or Bulk tree.
 */
export const captureDetachedDissolveRootFrame = (
  bundle: DissolveCandidateBundleReceiptV1,
  stage: BoundaryDissolveCandidateStageReceiptV1,
  frame: RootFrame,
): DissolveCandidateRootFrameCaptureV1 | null => {
  if (!verifiedCandidateBinding(bundle, stage) || !validFrame(frame)) return null
  const body = {
    schema: DISSOLVE_CANDIDATE_ROOT_FRAME_CAPTURE_V1,
    bundleId: bundle.bundleId,
    stageId: stage.stageId,
    stageReceiptId: stage.receiptId,
    checkpoint: Object.freeze({...stage.checkpoint}),
    removedRootAtomId: stage.sourceAtom,
    removedRootSrc: stage.source,
    formerRootFrame: Object.freeze({...frame}),
    effects: "none",
  } as const
  return Object.freeze({
    captureId: canonicalSha256(body),
    ...body,
  })
}

/**
 * Produces the read-only value accepted by buildBulkManifestation.
 *
 * Any absent, stale or mismatched evidence fails closed to null.
 */
export const produceBulkRootPromotionReceipt = (
  evidence: DissolveCandidatePromotionEvidenceV1 | null,
): BulkRootPromotionReceipt | null => {
  if (evidence === null || evidence.proof === null) return null
  const {bundle, stage, frameCapture, proof} = evidence
  const {captureId, ...captureBody} = frameCapture
  if (
    !verifiedCandidateBinding(bundle, stage) ||
    frameCapture.schema !== DISSOLVE_CANDIDATE_ROOT_FRAME_CAPTURE_V1 ||
    frameCapture.effects !== "none" ||
    !validDigest(captureId) ||
    captureId !== canonicalSha256(captureBody) ||
    frameCapture.bundleId !== bundle.bundleId ||
    frameCapture.stageId !== stage.stageId ||
    frameCapture.stageReceiptId !== stage.receiptId ||
    !sameCheckpoint(frameCapture.checkpoint, stage.checkpoint) ||
    frameCapture.removedRootAtomId !== stage.sourceAtom ||
    frameCapture.removedRootSrc !== stage.source ||
    !validFrame(frameCapture.formerRootFrame) ||
    proof.sourceAtom !== stage.sourceAtom ||
    proof.targetAtom !== stage.targetAtom ||
    proof.planSha256 !== stage.planSha256 ||
    proof.structuralSha256 !== stage.structuralSha256 ||
    proof.privateManifestSha256 !== stage.privateManifestSha256 ||
    proof.metaJSON.before !== stage.source ||
    proof.metaJSON.planned !== stage.target ||
    !proof.preservedRuntimeIds.includes(`atom/${stage.targetAtom}`) ||
    proof.transferredGlobalKeys.length !== 5
  ) {
    return null
  }
  return Object.freeze({
    version: 1,
    kind: "root-promotion",
    verified: true,
    removedRootAtomId: stage.sourceAtom,
    removedRootSrc: stage.source,
    promotedAtomId: stage.targetAtom,
    promotedRootSrc: stage.target,
    formerRootFrame: Object.freeze({...frameCapture.formerRootFrame}),
  })
}
