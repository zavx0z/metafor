import {afterEach, describe, expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {MetaAddress} from "@metafor/types/metafor/graph"
import {forceDomains} from "../dark/force/store.ts"
import type {DissolveCandidateBundleReceiptV1} from "../dark/checkpoint/dissolve-candidate.ts"
import {
  buildEnergyDissolveRetargetRequest,
  DurableEnergyDissolveRetarget,
} from "../energy/dissolve-retarget.ts"
import {
  BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
  BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1,
  type BoundaryDissolveCandidateStageReceiptV1,
} from "./dissolve-candidate-staging.ts"
import {
  BOUNDARY_DISSOLVE_CAUSAL_ADMISSION_V1,
  BoundaryDissolveCausalAdmission,
  BoundaryDissolveCausalAdmissionError,
  type BoundaryDissolveCausalAdmissionInputV1,
} from "./dissolve-causal-admission.ts"
import type {
  BoundaryDissolvePlan,
  BoundaryDissolveProof,
} from "./dissolve.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const SOURCE = "zavx0z/inference" as MetaAddress
const TARGET = "zavx0z/lada" as MetaAddress
const keys = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
] as const
const previousKeys = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
] as const
const authored = [
  ["messages", "modelMessages"],
  ["ssoSession", "ssoSession"],
  ["chatMessages", "chatMessages"],
  ["chatOutbox", "chatOutbox"],
  ["greetingDraft", "greetingDraft"],
] as const

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex")

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value)
      .toSorted(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalValue(entry)]))
  }
  return value
}

const canonicalDigest = (value: unknown): string =>
  digest(JSON.stringify(canonicalValue(value)))

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

const temporaryDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "metafor-mf116-"))
  temporaryDirectories.push(directory)
  return directory
}

const fixturePlan = (): BoundaryDissolvePlan => {
  const transfers = authored.map(([sourceAuthoredKey, targetAuthoredKey], index) => ({
    sourceAuthoredKey,
    targetAuthoredKey,
    sourceDeclaration: 10 + index,
    targetDeclaration: 20 + index,
    sourceGlobalKey: keys[index]!,
    targetPreviousGlobalKey: previousKeys[index]!,
    format: "json" as const,
    targetSource: {atom: 1, declaration: 10 + index},
    dependents: index === 0
      ? [{
          atom: 3,
          declaration: 30,
          currentKey: previousKeys[index]!,
          parentAtom: 2,
          parentDeclaration: 20 + index,
        }]
      : [],
  }))
  return {
    source: {src: SOURCE, atom: 1, position: 0},
    target: {src: TARGET, atom: 2, previousPosition: 0, position: 0},
    preservedRuntime: [
      {
        kind: "atom",
        id: 2,
        wimp: TARGET,
        parentKind: "atom",
        parentId: 1,
        position: 0,
        declarationKind: "matter",
        declarationWimp: SOURCE,
        declarationLocalId: 1,
        ownerAtom: 2,
        scopeAtom: 1,
        occurrenceKey: "target",
        ordinal: 0,
      },
      {
        kind: "atom",
        id: 3,
        wimp: "zavx0z/lada-chat",
        parentKind: "atom",
        parentId: 2,
        position: 0,
        declarationKind: "matter",
        declarationWimp: TARGET,
        declarationLocalId: 1,
        ownerAtom: 3,
        scopeAtom: 1,
        occurrenceKey: "chat",
        ordinal: 0,
      },
      {
        kind: "atom",
        id: 4,
        wimp: "zavx0z/lada-chat-send",
        parentKind: "atom",
        parentId: 3,
        position: 0,
        declarationKind: "matter",
        declarationWimp: "zavx0z/lada-chat",
        declarationLocalId: 1,
        ownerAtom: 4,
        scopeAtom: 2,
        occurrenceKey: "send",
        ordinal: 0,
      },
    ],
    transfers,
    structuralSha256: digest("structural"),
    privateManifest: {
      entries: authored.map(([sourceAuthoredKey, targetAuthoredKey], index) => ({
        sourceAuthoredKey,
        targetAuthoredKey,
        format: "json" as const,
        globalKeyId: keys[index]!,
        evidence: index === 3
          ? {kind: "absent" as const, marker: "metafor/mass-absent/v1" as const}
          : {kind: "present" as const, digestSha256: digest(`mass-${index}`)},
      })),
    },
  }
}

const evidence = (): BoundaryDissolveCausalAdmissionInputV1 => {
  const plan = fixturePlan()
  const planSha256 = createHash("sha256")
    .update(JSON.stringify(plan))
    .digest("hex")
  const checkpoint = {
    cutId: "mf116-cut",
    sequence: 7,
    commit: "1".repeat(40),
    boundarySha256: digest("boundary"),
    projectionSha256: digest("projection-before"),
    massManifestSha256: digest("mass-manifest"),
  }
  const proposalSha256 = digest("proposal")
  const stageId = digest(
    `${checkpoint.commit}:${proposalSha256}:${planSha256}`,
  )
  const stageBody = {
    schema: BOUNDARY_DISSOLVE_CANDIDATE_STAGE_V1,
    stageId,
    proposalId: "mf116-proposal",
    operation: "dissolve",
    status: "staged",
    source: SOURCE,
    target: TARGET,
    sourceAtom: 1,
    targetAtom: 2,
    fenceCount: 5,
    proposalSha256,
    planSha256,
    structuralSha256: plan.structuralSha256,
    privateManifestSha256: digest(JSON.stringify(plan.privateManifest)),
    graphSha256: digest("meta-before"),
    checkpoint,
    rollbackManifestSha256: digest("rollback"),
    retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
    effects: "none",
  } as const
  const stage = {
    receiptId: digest(JSON.stringify(stageBody)),
    ...stageBody,
  } satisfies BoundaryDissolveCandidateStageReceiptV1
  const bundleBody = {
    schema: "metafor/dissolve-candidate-bundle/v1",
    capturedAt: "2026-07-27T00:00:00.000Z",
    root: SOURCE,
    checkpoint,
    rollbackManifestSha256: stage.rollbackManifestSha256,
    rollbackFiles: 11,
    stage: {stageId: stage.stageId, receiptId: stage.receiptId},
    candidateBoundarySha256: digest("candidate-boundary"),
    candidateMassManifestSha256: digest("candidate-mass"),
    retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
    effects: "none",
  } as const
  const bundle = {
    bundleId: canonicalDigest(bundleBody),
    ...bundleBody,
  } satisfies DissolveCandidateBundleReceiptV1
  const proof = {
    sourceAtom: 1,
    targetAtom: 2,
    planSha256,
    structuralSha256: plan.structuralSha256,
    preservedRuntimeIds: ["atom/2", "atom/3", "atom/4"],
    transferredGlobalKeys: [...keys],
    retainedUnreferencedKeys: [...previousKeys],
    privateManifestSha256: stage.privateManifestSha256,
    graph: {before: SOURCE, planned: TARGET},
  } satisfies BoundaryDissolveProof
  const promotionReceipt = {
    version: 1,
    kind: "root-promotion",
    verified: true,
    removedRootAtomId: 1,
    removedRootSrc: SOURCE,
    promotedAtomId: 2,
    promotedRootSrc: TARGET,
    formerRootFrame: {
      localX: 0,
      localY: 0,
      localZ: 0,
      outerDiameterMm: 100,
    },
  } satisfies BulkRootPromotionReceipt
  return {
    schema: BOUNDARY_DISSOLVE_CAUSAL_ADMISSION_V1,
    admissionId: "mf116-admission",
    bundle,
    stage,
    proof,
    promotionReceipt,
    postProjectionSha256: digest("projection-after"),
    plan,
  }
}

const heldFrontier = (input: BoundaryDissolveCausalAdmissionInputV1) => ({
  cutId: input.stage.checkpoint.cutId,
  phase: "held" as const,
  acceptanceSequence: input.stage.checkpoint.sequence,
  domains: forceDomains.map((domain) => ({
    domain,
    sentOrdinal: 3,
    appliedOrdinal: 3,
    appliedAcceptanceSequence: input.stage.checkpoint.sequence,
  })),
})

const openAdmission = async (): Promise<{
  boundary: BoundaryDatabase
  admission: BoundaryDissolveCausalAdmission
  directory: string
}> => {
  const directory = temporaryDirectory()
  const boundary = await open(join(directory, "boundary.sqlite"))
  return {
    boundary,
    admission: await BoundaryDissolveCausalAdmission.open(boundary),
    directory,
  }
}

describe("MF-116 non-live causal dissolve admission", () => {
  test("persists the happy path and advances only the exact post-commit order", async () => {
    const {boundary, admission, directory} = await openAdmission()
    try {
      const input = evidence()
      const admitted = await admission.admit(input)
      expect(admitted.plan.postCommit.map(({kind}) => kind)).toEqual([
        "energy-retarget",
        "force-entity",
        "force-entity",
        "force-entity",
        "bulk-promote",
        "retain-evidence",
        "release-admission",
      ])
      expect(admitted.plan.postCommit.filter((step) => step.kind === "force-entity"))
        .toEqual([
          {
            ordinal: 2,
            kind: "force-entity",
            entity: {kind: "atom", id: 2, operation: "replace", path: "atom/2"},
            wire: {messages: 1, partsPerMessage: 1},
          },
          {
            ordinal: 3,
            kind: "force-entity",
            entity: {kind: "atom", id: 3, operation: "replace", path: "atom/3"},
            wire: {messages: 1, partsPerMessage: 1},
          },
          {
            ordinal: 4,
            kind: "force-entity",
            entity: {kind: "atom", id: 1, operation: "remove", path: "atom/1"},
            wire: {messages: 1, partsPerMessage: 1},
          },
        ])

      const energy = DurableEnergyDissolveRetarget.prepare(
        join(directory, "energy", "receipt.json"),
        buildEnergyDissolveRetargetRequest(admitted, [1, 2, 3, 4, 5]),
      )
      await energy.fence({async fence() {}})
      const quiescent = await admission.markQuiescent(
        admitted.admissionId,
        heldFrontier(input),
        energy.fenceBinding(),
      )
      await expect(energy.retargetAfterCommit(quiescent, {
        async retarget() {
          return {targetGeneration: 1}
        },
      })).rejects.toMatchObject({code: "commit_required"})

      const committed = await admission.recordCommitted(
        admitted.admissionId,
        input.proof,
        input.postProjectionSha256,
      )
      const retargetCalls: number[] = []
      const retargeted = await energy.retargetAfterCommit(committed, {
        async retarget(handle) {
          retargetCalls.push(handle.ordinal)
          return {targetGeneration: 100 + handle.ordinal}
        },
      })
      expect(retargeted.phase).toBe("retargeted")
      expect(await energy.retargetAfterCommit(committed, {
        async retarget(handle) {
          retargetCalls.push(handle.ordinal)
          return {targetGeneration: 100 + handle.ordinal}
        },
      })).toEqual(retargeted)
      expect(retargetCalls).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5])
      let current = await admission.completePostCommitStep(
        admitted.admissionId,
        1,
        energy.retargetBinding(),
      )
      for (const step of current.plan.postCommit.slice(1)) {
        current = await admission.completePostCommitStep(
          admitted.admissionId,
          step.ordinal,
          digest(`effect-${step.ordinal}`),
        )
      }
      expect(current.phase).toBe("complete")
      expect(current.externalAdmission).toBe("open")
      expect(current.plan.retainedBindings.map(({targetPreviousGlobalKey}) =>
        targetPreviousGlobalKey)).toEqual([...previousKeys])
      expect(retargeted.request.deletePolicy).toBe("forbidden")
      expect(retargeted.request.releasePolicy).toBe("source-fence-retained")
      expect(retargeted.entries.every(({status}) => status === "retargeted")).toBe(true)
    } finally {
      await boundary.close()
    }
  })

  test("persists four fences across a late fifth-handle failure and resumes after reopen", async () => {
    const {boundary, admission, directory} = await openAdmission()
    try {
      const admitted = await admission.admit(evidence())
      const filename = join(directory, "energy", "receipt.json")
      const energy = DurableEnergyDissolveRetarget.prepare(
        filename,
        buildEnergyDissolveRetargetRequest(admitted, [11, 12, 13, 14, 15]),
      )
      const calls: number[] = []
      await expect(energy.fence({
        async fence(handle) {
          calls.push(handle.ordinal)
          if (handle.ordinal === 5) throw new Error("late fifth fence failed")
        },
      })).rejects.toThrow("late fifth fence failed")
      expect(DurableEnergyDissolveRetarget.open(filename).receipt().entries
        .map(({status}) => status)).toEqual([
          "fenced",
          "fenced",
          "fenced",
          "fenced",
          "pending",
        ])

      const reopened = DurableEnergyDissolveRetarget.open(filename)
      await reopened.fence({
        async fence(handle) {
          calls.push(handle.ordinal)
        },
      })
      expect(reopened.receipt().phase).toBe("fenced")
      expect(calls).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5])
      expect(reopened.fenceBinding().handleCount).toBe(5)
    } finally {
      await boundary.close()
    }
  })

  test("deduplicates exact admission and rejects changed evidence or a stale frontier", async () => {
    const {boundary, admission, directory} = await openAdmission()
    try {
      const input = evidence()
      const first = await admission.admit(input)
      expect(await admission.admit(input)).toEqual(first)
      await expect(admission.admit({
        ...input,
        postProjectionSha256: digest("different-post-projection"),
      })).rejects.toMatchObject({
        name: BoundaryDissolveCausalAdmissionError.name,
        code: "admission_conflict",
      })

      const energy = DurableEnergyDissolveRetarget.prepare(
        join(directory, "energy", "receipt.json"),
        buildEnergyDissolveRetargetRequest(first, [1, 1, 1, 1, 1]),
      )
      await energy.fence({async fence() {}})
      await expect(admission.markQuiescent(
        first.admissionId,
        {...heldFrontier(input), acceptanceSequence: input.stage.checkpoint.sequence + 1},
        energy.fenceBinding(),
      )).rejects.toMatchObject({
        name: BoundaryDissolveCausalAdmissionError.name,
        code: "stale_candidate",
      })
      expect((await admission.receipt(first.admissionId))?.phase).toBe("admitted")
    } finally {
      await boundary.close()
    }
  })

  test("has no world, retarget, Bulk or Force consequence effects before commit", async () => {
    const {boundary, admission, directory} = await openAdmission()
    try {
      const before = {
        wimp: await boundary.projection.sql`SELECT * FROM wimp`,
        atom: await boundary.projection.sql`SELECT * FROM atom`,
        massKey: await boundary.projection.sql`SELECT * FROM mass_key`,
      }
      const input = evidence()
      const admitted = await admission.admit(input)
      const energy = DurableEnergyDissolveRetarget.prepare(
        join(directory, "energy", "receipt.json"),
        buildEnergyDissolveRetargetRequest(admitted, [1, 2, 3, 4, 5]),
      )
      const retargets: string[] = []
      const effects: string[] = []
      await energy.fence({async fence() {}})
      const quiescent = await admission.markQuiescent(
        admitted.admissionId,
        heldFrontier(input),
        energy.fenceBinding(),
      )
      await expect(energy.retargetAfterCommit(quiescent, {
        async retarget(_handle, entryId) {
          retargets.push(entryId)
          return {targetGeneration: 1}
        },
      })).rejects.toMatchObject({code: "commit_required"})
      await expect(admission.completePostCommitStep(
        admitted.admissionId,
        1,
        "premature-effect",
      )).rejects.toMatchObject({code: "invalid_phase"})
      expect(retargets).toEqual([])
      expect(effects).toEqual([])
      expect({
        wimp: await boundary.projection.sql`SELECT * FROM wimp`,
        atom: await boundary.projection.sql`SELECT * FROM atom`,
        massKey: await boundary.projection.sql`SELECT * FROM mass_key`,
      }).toEqual(before)
      expect(quiescent.externalAdmission).toBe("closed")
      expect(quiescent.completedPostCommitOrdinals).toEqual([])
    } finally {
      await boundary.close()
    }
  })
})
