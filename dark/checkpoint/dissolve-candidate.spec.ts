import {afterEach, describe, expect, test} from "bun:test"
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import {mkdir, writeFile} from "node:fs/promises"
import {createHash} from "node:crypto"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {spawnSync} from "node:child_process"
import {
  parseMetaAddress,
  type MetaAddress,
  type MetaJSONV1,
} from "@metafor/types/metafor/meta-json"
import type {Particle} from "shared/protocol/force/particle"
import {assembleMetaJSON} from "../monad/meta-json.ts"
import {DARK_DECLARATION_PROJECTION_METHOD} from "../meta-json.ts"
import {
  BOUNDARY_META_JSON_PROJECTION_METHOD,
  readBoundaryMetaJSONProjection,
} from "../../boundary/meta-json.ts"
import {
  DetachedBoundaryDissolveCandidateStaging,
} from "../../boundary/dissolve-candidate-staging.ts"
import {
  executeDetachedBoundaryDissolveCandidate,
} from "../../boundary/dissolve-candidate-execution.ts"
import {
  createIsolatedBoundaryDissolveMassEvidenceReader,
} from "../../boundary/dissolve-mass-evidence.ts"
import {
  BOUNDARY_DISSOLVE_PROPOSAL_V1,
  type BoundaryDissolveProposalV1,
} from "../../boundary/dissolve-staging.ts"
import {
  open as openBoundary,
  type BoundaryDatabase,
} from "../../boundary/sqlite.ts"
import {MassCatalog, massFileName, type MassFileFormat} from "../../shared/mass.ts"
import {DarkForceHistory} from "../force/history.ts"
import {initializeCheckpointControlBaseline} from "./control.ts"
import {
  BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
} from "../../boundary/dissolve-candidate-staging.ts"
import {
  createDetachedDissolveCandidateBundle,
} from "./dissolve-candidate.ts"
import {
  captureDetachedDissolveRootFrame,
  produceBulkRootPromotionReceipt,
} from "./dissolve-promotion.ts"
import {BulkProjectionStore} from "../../bulk/projection.ts"
import {buildBulkManifestation} from "../../bulk/manifestation.ts"

const SOURCE = parseMetaAddress("synthetic/inference")!
const TARGET = parseMetaAddress("synthetic/lada")!
const LEAF = parseMetaAddress("synthetic/lada-child")!
const SOURCE_KEYS = [
  "messages",
  "ssoSession",
  "chatMessages",
  "chatOutbox",
  "greetingDraft",
] as const
const TARGET_KEYS = [
  "modelMessages",
  "ssoSession",
  "chatMessages",
  "chatOutbox",
  "greetingDraft",
] as const

type Fixture = {
  root: string
  boundary: string
  mass: string
  history: string
  control: string
  proposal: BoundaryDissolveProposalV1
  absent: {keyId: string; format: MassFileFormat}
  projection: MetaJSONV1
  readMetaJSON(
    boundary: BoundaryDatabase,
    root: MetaAddress,
    phase: "before" | "planned",
  ): Promise<MetaJSONV1>
}

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex")

const apply = async (
  boundary: BoundaryDatabase,
  op: "add" | "remove",
  path: "wimp" | "matter",
  value: Record<string, unknown>,
): Promise<void> => {
  await boundary.materialize({parts: [{
    part: "inflaton",
    op,
    path,
    value,
    by: "dark",
    ts: 1,
  }] as [Particle]})
}

const templateEntry = (
  name: string,
  mass: readonly string[],
  matter?: MetaJSONV1["template"][MetaAddress]["matter"],
): MetaJSONV1["template"][MetaAddress] => ({
  name,
  fields: [],
  superposition: [],
  mass: mass.map((key) => ({key, format: "json"})),
  processes: [],
  ...(matter ? {matter} : {}),
})

const template = (root: MetaAddress): MetaJSONV1["template"] => {
  const value: MetaJSONV1["template"] = {
    [SOURCE]: templateEntry("Inference", SOURCE_KEYS, [{
      kind: "wimp",
      src: TARGET,
    }]),
    [TARGET]: templateEntry("Lada", TARGET_KEYS, [{
      kind: "wimp",
      src: LEAF,
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
    }]),
    [LEAF]: templateEntry("Lada child", TARGET_KEYS),
  }
  if (root !== SOURCE) delete value[SOURCE]
  return value
}

const metaJSONReader = (
  boundary: BoundaryDatabase,
  root: MetaAddress,
): Promise<MetaJSONV1> =>
  assembleMetaJSON({
    async call<T>(target: string, method: string): Promise<T> {
      if (target === "dark" && method === DARK_DECLARATION_PROJECTION_METHOD) {
        const declaration = template(root)
        return {root, template: declaration} as T
      }
      if (
        target === "boundary" &&
        method === BOUNDARY_META_JSON_PROJECTION_METHOD
      ) {
        return await readBoundaryMetaJSONProjection(boundary, {root}) as T
      }
      throw new Error(`Unexpected MetaJSON provider: ${target}.${method}`)
    },
  } as never, {root})

const authorized = async (
  boundary: BoundaryDatabase,
  atom: number,
): Promise<Array<{
  id: number
  key: string
  keyId: string
  format: MassFileFormat
}>> => await boundary.projection.mass.authorized(atom)

const createFixture = async (): Promise<Fixture> => {
  const root = mkdtempSync(join(tmpdir(), "metafor-dissolve-candidate-spec-"))
  directories.push(root)
  const boundaryPath = join(root, "stopped.sqlite")
  const mass = join(root, "mass")
  const historyPath = join(root, "history")
  const control = join(root, "control", "state.json")
  const boundary = await openBoundary(boundaryPath, {
    massCatalog: new MassCatalog(mass),
  })

  await apply(boundary, "add", "wimp", {
    src: SOURCE,
    name: "Inference",
    mass: SOURCE_KEYS.map((key) => ({key, format: "json"})),
  })
  await apply(boundary, "add", "matter", {
    wimp: SOURCE,
    id: 1,
    parent: null,
    edgeSlot: "root",
    position: 3,
    kind: "wimp",
    src: TARGET,
  })
  await apply(boundary, "add", "wimp", {
    src: TARGET,
    name: "Lada",
    mass: TARGET_KEYS.map((key) => ({key, format: "json"})),
  })
  const atoms = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
    SELECT id, wimp FROM atom
     WHERE wimp IN (${SOURCE}, ${TARGET})
     ORDER BY id
  `
  const sourceAtom = Number(atoms.find(({wimp}) => wimp === SOURCE)!.id)
  const targetAtom = Number(atoms.find(({wimp}) => wimp === TARGET)!.id)
  const sourceMass = await authorized(boundary, sourceAtom)
  const targetMass = await authorized(boundary, targetAtom)
  await boundary.projection.mass.source(
    targetAtom,
    targetMass[0]!.id,
    sourceAtom,
    sourceMass[0]!.id,
  )
  await apply(boundary, "add", "matter", {
    wimp: TARGET,
    id: 1,
    parent: null,
    edgeSlot: "root",
    position: 2,
    kind: "wimp",
    src: LEAF,
    massBinding: {data: "/mass", directMass: {kind: "whole"}},
  })
  await apply(boundary, "add", "wimp", {
    src: LEAF,
    name: "Lada child",
    mass: TARGET_KEYS.map((key) => ({key, format: "json"})),
  })

  await mkdir(mass, {recursive: true})
  for (const [index, entry] of sourceMass.entries()) {
    await writeFile(
      join(mass, massFileName(entry.keyId, entry.format)),
      JSON.stringify({key: entry.key, index}),
    )
  }
  const chatOutbox = sourceMass.find(({key}) => key === "chatOutbox")!
  unlinkSync(join(mass, massFileName(chatOutbox.keyId, chatOutbox.format)))
  const projection = await metaJSONReader(boundary, SOURCE)
  await boundary.close()

  const history = new DarkForceHistory(historyPath, {
    cutId: "candidate-cut",
    startedAt: "2026-07-27T08:00:00.000Z",
  }, {
    now: (() => {
      let second = 0
      return () => new Date(`2026-07-27T08:00:0${second++}.000Z`)
    })(),
  })
  history.accept({
    part: "graviton",
    op: "replace",
    path: "atom/900",
    value: {proof: 1},
    by: "boundary",
    ts: 1,
  })
  history.accept({
    part: "graviton",
    op: "replace",
    path: "atom/901",
    value: {proof: 2},
    by: "boundary",
    ts: 2,
  })
  initializeCheckpointControlBaseline(control, "candidate-cut", 2)

  const proposal: BoundaryDissolveProposalV1 = {
    schema: BOUNDARY_DISSOLVE_PROPOSAL_V1,
    proposalId: "candidate-dissolve-1",
    operation: "dissolve",
    request: {
      source: SOURCE,
      target: TARGET,
      targetPosition: 0,
      mass: SOURCE_KEYS.map((sourceKey, index) => ({
        sourceKey,
        targetKey: TARGET_KEYS[index]!,
      })) as unknown as BoundaryDissolveProposalV1["request"]["mass"],
    },
  }
  return {
    root,
    boundary: boundaryPath,
    mass,
    history: historyPath,
    control,
    proposal,
    absent: {keyId: chatOutbox.keyId, format: chatOutbox.format},
    projection,
    readMetaJSON: async (candidate, requested) =>
      await metaJSONReader(candidate, requested),
  }
}

const bulkProjection = async (
  boundary: BoundaryDatabase,
): Promise<ReturnType<BulkProjectionStore["view"]>> => {
  const store = new BulkProjectionStore()
  for (const entry of (await boundary.initialProjection()).entries) {
    store.apply({...entry, by: "boundary", ts: 0} as Particle)
  }
  return store.view()
}

const massSnapshot = (directory: string): Array<{
  file: string
  sha256: string
}> => readdirSync(directory).toSorted().map((file) => ({
  file,
  sha256: sha256(new Uint8Array(readFileSync(join(directory, file)))),
}))

const treeSnapshot = (directory: string): Array<{
  path: string
  sha256: string
}> => {
  const output: Array<{path: string; sha256: string}> = []
  const visit = (root: string, prefix: string): void => {
    for (const name of readdirSync(root).toSorted()) {
      const filename = join(root, name)
      const path = prefix ? `${prefix}/${name}` : name
      if (lstatSync(filename).isDirectory()) visit(filename, path)
      else {
        output.push({
          path,
          sha256: sha256(new Uint8Array(readFileSync(filename))),
        })
      }
    }
  }
  visit(directory, "")
  return output
}

describe("detached durable dissolve candidate bundle", () => {
  test("captures sequence two, retains rollback bytes and reopens an effects-none stage", async () => {
    const fixture = await createFixture()
    const target = join(fixture.root, "candidate-bundle")
    const sourceBoundary = new Uint8Array(readFileSync(fixture.boundary))
    const sourceMass = massSnapshot(fixture.mass)
    const sourceHistory = treeSnapshot(fixture.history)
    const sourceControl = new Uint8Array(readFileSync(fixture.control))

    const result = await createDetachedDissolveCandidateBundle({
      targetDirectory: target,
      root: SOURCE,
      stoppedBoundary: fixture.boundary,
      stoppedMassDirectory: fixture.mass,
      stoppedHistoryDirectory: fixture.history,
      stoppedControlState: fixture.control,
      previousSnapshotSequence: null,
      baseProjection: fixture.projection,
      patches: [
        {sequence: 1, operations: []},
        {sequence: 2, operations: []},
      ],
      proposal: fixture.proposal,
      validAbsent: [fixture.absent],
      capturedAt: "2026-07-27T08:01:00.000Z",
      confirmStoppedPrivateCopies: true,
      readMetaJSON: fixture.readMetaJSON,
    })

    expect(result.receipt).toMatchObject({
      root: SOURCE,
      checkpoint: {cutId: "candidate-cut", sequence: 2},
      rollbackManifestSha256: result.rollbackManifestSha256,
      retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
      effects: "none",
    })
    expect(result.stage).toMatchObject({
      source: SOURCE,
      target: TARGET,
      fenceCount: 5,
      retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
      effects: "none",
    })
    expect(result.rollbackManifest.checkpoint).toMatchObject({
      cutId: "candidate-cut",
      sequence: 2,
      commit: result.checkpointCommit,
    })
    expect(result.rollbackManifest.files.find(
      ({path}) => path === "rollback/boundary.sqlite",
    )?.sha256).toBe(sha256(sourceBoundary))
    expect(new Uint8Array(readFileSync(fixture.boundary))).toEqual(sourceBoundary)
    expect(massSnapshot(fixture.mass)).toEqual(sourceMass)
    expect(treeSnapshot(fixture.history)).toEqual(sourceHistory)
    expect(new Uint8Array(readFileSync(fixture.control))).toEqual(sourceControl)
    expect(existsSync(join(target, "candidate-failure.json"))).toBe(false)
    expect(lstatSync(target).isDirectory()).toBe(true)

    const candidatePath = join(target, "candidate", "boundary.sqlite")
    const candidate = await openBoundary(candidatePath, {
      massCatalog: new MassCatalog(join(target, "candidate", "mass")),
    })
    const staging = await DetachedBoundaryDissolveCandidateStaging.open(
      candidate,
      {
        checkpoint: result.stage.checkpoint,
        rollbackManifestSha256: result.rollbackManifestSha256,
      },
    )
    expect(await staging.count()).toBe(1)
    expect(await staging.receipt(fixture.proposal.proposalId)).toEqual(
      result.stage,
    )
    expect(await candidate.projection.sql<Array<{src: string}>>`
      SELECT src FROM wimp WHERE src = ${SOURCE}
    `).toEqual([{src: SOURCE}])
    await candidate.close()
    expect(existsSync(join(
      target,
      "candidate",
      "mass",
      massFileName(fixture.absent.keyId, fixture.absent.format),
    ))).toBe(false)

    const remote = spawnSync(
      "git",
      ["--git-dir", join(target, "checkpoint.git"), "remote"],
      {encoding: "utf8"},
    )
    expect(remote.status).toBe(0)
    expect(remote.stdout.trim()).toBe("")

    let reopened = await openBoundary(candidatePath, {
      massCatalog: new MassCatalog(join(target, "candidate", "mass")),
    })
    await expect(DetachedBoundaryDissolveCandidateStaging.open(
      reopened,
      {
        checkpoint: {
          ...result.stage.checkpoint,
          projectionSha256: "0".repeat(64),
        },
        rollbackManifestSha256: result.rollbackManifestSha256,
      },
    )).rejects.toMatchObject({code: "stage_corrupt"})
    await reopened.close()

    reopened = await openBoundary(candidatePath, {
      massCatalog: new MassCatalog(join(target, "candidate", "mass")),
    })
    await reopened.projection.sql`
      UPDATE boundary_dissolve_candidate_stage
         SET receipt_json = ${"{}"}
    `
    await reopened.close()
    reopened = await openBoundary(candidatePath, {
      massCatalog: new MassCatalog(join(target, "candidate", "mass")),
    })
    await expect(DetachedBoundaryDissolveCandidateStaging.open(
      reopened,
      {
        checkpoint: result.stage.checkpoint,
        rollbackManifestSha256: result.rollbackManifestSha256,
      },
    )).rejects.toMatchObject({code: "stage_corrupt"})
    await reopened.close()
  })

  test("retains a failed private target with an effects-none failure receipt", async () => {
    const fixture = await createFixture()
    const target = join(fixture.root, "failed-candidate")
    const control = JSON.parse(readFileSync(fixture.control, "utf8")) as {
      barrier: {acceptanceSequence: number}
    }
    control.barrier.acceptanceSequence = 1
    writeFileSync(fixture.control, `${JSON.stringify(control)}\n`)

    await expect(createDetachedDissolveCandidateBundle({
      targetDirectory: target,
      root: SOURCE,
      stoppedBoundary: fixture.boundary,
      stoppedMassDirectory: fixture.mass,
      stoppedHistoryDirectory: fixture.history,
      stoppedControlState: fixture.control,
      previousSnapshotSequence: null,
      baseProjection: fixture.projection,
      patches: [
        {sequence: 1, operations: []},
        {sequence: 2, operations: []},
      ],
      proposal: fixture.proposal,
      validAbsent: [fixture.absent],
      capturedAt: "2026-07-27T08:02:00.000Z",
      confirmStoppedPrivateCopies: true,
      readMetaJSON: fixture.readMetaJSON,
    })).rejects.toThrow("does not match")

    expect(existsSync(target)).toBe(true)
    const failure = JSON.parse(
      readFileSync(join(target, "candidate-failure.json"), "utf8"),
    )
    expect(failure).toMatchObject({
      schema: "metafor/dissolve-candidate-failure/v1",
      retention: BOUNDARY_DISSOLVE_CANDIDATE_RETENTION,
      effects: "none",
    })
  })

  test("executes only the exact detached stage and reframes the complete promoted subtree", async () => {
    const fixture = await createFixture()
    const target = join(fixture.root, "accepted-candidate")
    const result = await createDetachedDissolveCandidateBundle({
      targetDirectory: target,
      root: SOURCE,
      stoppedBoundary: fixture.boundary,
      stoppedMassDirectory: fixture.mass,
      stoppedHistoryDirectory: fixture.history,
      stoppedControlState: fixture.control,
      previousSnapshotSequence: null,
      baseProjection: fixture.projection,
      patches: [
        {sequence: 1, operations: []},
        {sequence: 2, operations: []},
      ],
      proposal: fixture.proposal,
      validAbsent: [fixture.absent],
      capturedAt: "2026-07-27T08:03:00.000Z",
      confirmStoppedPrivateCopies: true,
      readMetaJSON: fixture.readMetaJSON,
    })
    const candidatePath = join(target, "candidate", "boundary.sqlite")
    const candidateMass = join(target, "candidate", "mass")
    const candidate = await openBoundary(candidatePath, {
      massCatalog: new MassCatalog(candidateMass),
    })
    const beforeProjection = await bulkProjection(candidate)
    const beforeManifest = buildBulkManifestation(beforeProjection, SOURCE)
    const formerRoot = beforeManifest.darkParticles.find(
      ({darkParticleId}) => darkParticleId === result.stage.sourceAtom * 2,
    )!
    const frame = {
      localX: formerRoot.localX,
      localY: formerRoot.localY,
      localZ: formerRoot.localZ,
      outerDiameterMm:
        (formerRoot.torusRadius + formerRoot.torusTube) *
        formerRoot.torusScale * 2,
    }
    const frameCapture = captureDetachedDissolveRootFrame(
      result.receipt,
      result.stage,
      frame,
    )
    const staging = await DetachedBoundaryDissolveCandidateStaging.open(
      candidate,
      {
        checkpoint: result.stage.checkpoint,
        rollbackManifestSha256: result.rollbackManifestSha256,
      },
    )
    const massEvidence = createIsolatedBoundaryDissolveMassEvidenceReader(
      candidateMass,
      [fixture.absent],
    )
    const acceptance = await executeDetachedBoundaryDissolveCandidate(
      candidate,
      staging,
      fixture.proposal.proposalId,
      {
        massEvidence,
        readMetaJSON: async (root) => await metaJSONReader(candidate, root),
      },
    )
    const promotion = produceBulkRootPromotionReceipt({
      bundle: result.receipt,
      stage: result.stage,
      frameCapture: frameCapture!,
      proof: acceptance.proof,
    })
    const afterProjection = await bulkProjection(candidate)
    const manifestation = buildBulkManifestation(
      afterProjection,
      SOURCE,
      {},
      promotion,
    )

    expect(frameCapture).not.toBeNull()
    expect(promotion).not.toBeNull()
    expect(acceptance.localFenceProof.effects).toBe("none")
    expect(acceptance.localFenceProof.fenced).toHaveLength(5)
    expect(acceptance.localFenceProof.released)
      .toEqual(acceptance.localFenceProof.fenced.toReversed())
    expect(acceptance.postMetaJSON.root).toBe(TARGET)
    expect(acceptance.postMetaJSON.template[SOURCE]).toBeUndefined()
    expect(afterProjection.atoms.some(({id}) => id === result.stage.sourceAtom))
      .toBe(false)
    expect(afterProjection.atoms.find(({id}) => id === result.stage.targetAtom))
      .toMatchObject({
        parentAtom: null,
        parentTopology: null,
        wimp: TARGET,
      })
    expect(manifestation.rootSrc).toBe(TARGET)
    expect(manifestation.darkParticles.map(({darkParticleId}) => darkParticleId))
      .toEqual([result.stage.targetAtom * 2, (result.stage.targetAtom + 1) * 2])
    expect(manifestation.darkParticles[0]).toMatchObject({
      parentDarkParticleId: null,
      localX: frame.localX,
      localY: frame.localY,
      localZ: frame.localZ,
    })
    expect(
      (manifestation.darkParticles[0]!.torusRadius +
        manifestation.darkParticles[0]!.torusTube) *
      manifestation.darkParticles[0]!.torusScale * 2,
    ).toBeCloseTo(frame.outerDiameterMm, 12)
    expect(await candidate.projection.sql<unknown[]>`PRAGMA foreign_key_check`)
      .toEqual([])
    await candidate.close()
  })
})
