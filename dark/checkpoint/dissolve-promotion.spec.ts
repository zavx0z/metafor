import {describe, expect, test} from "bun:test"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import {createHash} from "node:crypto"
import {
  BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
  BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1,
  type BoundaryDissolveCandidateStageReceiptV1,
} from "../../boundary/dissolve-candidate-staging.ts"
import type {BoundaryDissolveProof} from "../../boundary/dissolve.ts"
import {
  DISSOLVE_CANDIDATE_BUNDLE_RECEIPT_V1,
  type DissolveCandidateBundleReceiptV1,
} from "./dissolve-candidate.ts"
import {
  captureDetachedDissolveRootFrame,
  produceBulkRootPromotionReceipt,
} from "./dissolve-promotion.ts"

const SOURCE = parseMetaAddress("synthetic/inference")!
const TARGET = parseMetaAddress("synthetic/lada")!
const digest = (character: string): string => character.repeat(64)
const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex")
const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    )
  }
  return value
}
const canonicalSha256 = (value: unknown): string =>
  sha256(JSON.stringify(canonicalValue(value)))

const checkpoint = Object.freeze({
  cutId: "candidate-cut",
  sequence: 2,
  commit: "a".repeat(40),
  boundarySha256: digest("b"),
  projectionSha256: digest("c"),
  massManifestSha256: digest("d"),
})

const stageBody = {
  schema: BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1,
  stageId: sha256(`${checkpoint.commit}:${digest("1")}:${digest("2")}`),
  proposalId: "candidate-dissolve-1",
  operation: "dissolve",
  status: "staged",
  source: SOURCE,
  target: TARGET,
  sourceAtom: 17,
  targetAtom: 18,
  fenceCount: 5,
  proposalSha256: digest("1"),
  planSha256: digest("2"),
  structuralSha256: digest("3"),
  privateManifestSha256: digest("4"),
  graphSha256: digest("5"),
  checkpoint,
  rollbackManifestSha256: digest("6"),
  retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
  effects: "none",
} as const
const stage: BoundaryDissolveCandidateStageReceiptV1 = Object.freeze({
  receiptId: sha256(JSON.stringify(stageBody)),
  ...stageBody,
})

const bundleBody = {
  schema: DISSOLVE_CANDIDATE_BUNDLE_RECEIPT_V1,
  capturedAt: "2026-07-27T08:01:00.000Z",
  root: SOURCE,
  checkpoint,
  rollbackManifestSha256: stage.rollbackManifestSha256,
  rollbackFiles: 10,
  stage: {stageId: stage.stageId, receiptId: stage.receiptId},
  candidateBoundarySha256: digest("8"),
  candidateMassManifestSha256: digest("9"),
  retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
  effects: "none",
} as const
const bundle: DissolveCandidateBundleReceiptV1 = Object.freeze({
  bundleId: canonicalSha256(bundleBody),
  ...bundleBody,
})

const proof: BoundaryDissolveProof = Object.freeze({
  sourceAtom: stage.sourceAtom,
  targetAtom: stage.targetAtom,
  planSha256: stage.planSha256,
  structuralSha256: stage.structuralSha256,
  preservedRuntimeIds: [`atom/${stage.targetAtom}`, "atom/19"],
  transferredGlobalKeys: ["mass-1", "mass-2", "mass-3", "mass-4", "mass-5"],
  retainedUnreferencedKeys: [],
  privateManifestSha256: stage.privateManifestSha256,
  graph: {before: SOURCE, planned: TARGET},
})

const frame = Object.freeze({
  localX: 1,
  localY: -2,
  localZ: 3,
  outerDiameterMm: 100,
})

describe("detached dissolve -> Bulk root promotion receipt", () => {
  test("produces a verified read-only receipt from matching candidate, stage, frame and success proof", () => {
    const frameCapture = captureDetachedDissolveRootFrame(
      bundle,
      stage,
      frame,
    )
    const receipt = produceBulkRootPromotionReceipt({
      bundle,
      stage,
      frameCapture: frameCapture!,
      proof,
    })

    expect(receipt).toEqual({
      version: 1,
      kind: "root-promotion",
      verified: true,
      removedRootAtomId: stage.sourceAtom,
      removedRootSrc: SOURCE,
      promotedAtomId: stage.targetAtom,
      promotedRootSrc: TARGET,
      formerRootFrame: frame,
    })
    expect(Object.isFrozen(frameCapture)).toBe(true)
    expect(Object.isFrozen(frameCapture?.formerRootFrame)).toBe(true)
    expect(Object.isFrozen(receipt)).toBe(true)
    expect(Object.isFrozen(receipt?.formerRootFrame)).toBe(true)
  })

  test("rejects a stale frame capture bound to another stage receipt", () => {
    const frameCapture = captureDetachedDissolveRootFrame(
      bundle,
      stage,
      frame,
    )!
    const currentStage = Object.freeze({
      ...stage,
      receiptId: digest("a"),
    })
    const currentBundle = Object.freeze({
      ...bundle,
      stage: {
        stageId: currentStage.stageId,
        receiptId: currentStage.receiptId,
      },
    })

    expect(produceBulkRootPromotionReceipt({
      bundle: currentBundle,
      stage: currentStage,
      frameCapture,
      proof,
    })).toBeNull()
  })

  test("rejects completion evidence that does not match the staged plan", () => {
    const frameCapture = captureDetachedDissolveRootFrame(
      bundle,
      stage,
      frame,
    )!
    const mismatchedProof = Object.freeze({
      ...proof,
      planSha256: digest("0"),
    })

    expect(produceBulkRootPromotionReceipt({
      bundle,
      stage,
      frameCapture,
      proof: mismatchedProof,
    })).toBeNull()
  })

  test("provides no receipt before successful completion evidence exists", () => {
    const frameCapture = captureDetachedDissolveRootFrame(
      bundle,
      stage,
      frame,
    )!

    expect(produceBulkRootPromotionReceipt(null)).toBeNull()
    expect(produceBulkRootPromotionReceipt({
      bundle,
      stage,
      frameCapture,
      proof: null,
    })).toBeNull()
  })
})
