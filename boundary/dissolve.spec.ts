import {afterEach, describe, expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  parseMetaAddress,
  type MetaAddress,
  type MetaJSONV1,
} from "@metafor/types/metafor/meta-json"
import type {Particle} from "shared/protocol/force/particle"
import {assembleMetaJSON} from "../dark/monad/meta-json.ts"
import {DARK_DECLARATION_PROJECTION_METHOD} from "../dark/meta-json.ts"
import {
  BOUNDARY_META_JSON_PROJECTION_METHOD,
  readBoundaryMetaJSONProjection,
} from "./meta-json.ts"
import {MassCatalog, massFileName, type MassFileFormat} from "../shared/mass.ts"
import {
  BoundaryDissolveError,
  executeBoundaryDissolveProof,
  planBoundaryDissolve,
  type BoundaryDissolveHooks,
  type BoundaryDissolveRequest,
  type BoundaryMassFenceIdentity,
} from "./dissolve.ts"
import {
  BOUNDARY_DISSOLVE_PROPOSAL_V1,
  BoundaryDissolveStagingError,
  IsolatedBoundaryDissolveStaging,
  type BoundaryDissolveProposalV1,
} from "./dissolve-staging.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const SOURCE = parseMetaAddress("synthetic/inference")!
const TARGET = parseMetaAddress("synthetic/lada")!
const LEAF = parseMetaAddress("synthetic/lada-child")!
const MASS_KEYS = ["session", "draft", "messages", "history", "model"] as const

const templateEntry = (
  name: string,
  matter?: MetaJSONV1["template"][MetaAddress]["matter"],
): MetaJSONV1["template"][MetaAddress] => ({
  name,
  fields: [],
  superposition: [],
  mass: MASS_KEYS.map((key) => ({key, format: "json"})),
  processes: [],
  ...(matter ? {matter} : {}),
})

const beforeTemplate = (): MetaJSONV1["template"] => ({
  [SOURCE]: templateEntry("Inference", [{kind: "wimp", src: TARGET}]),
  [TARGET]: templateEntry("Lada", [{
    kind: "wimp",
    src: LEAF,
    massBinding: {data: "/mass", directMass: {kind: "whole"}},
  }]),
  [LEAF]: templateEntry("Lada child"),
})

const plannedTemplate = (): MetaJSONV1["template"] => ({
  [TARGET]: templateEntry("Lada", [{
    kind: "wimp",
    src: LEAF,
    massBinding: {data: "/mass", directMass: {kind: "whole"}},
  }]),
  [LEAF]: templateEntry("Lada child"),
})

type Fixture = {
  boundary: BoundaryDatabase
  directory: string
  massRoot: string
  sourceAtom: number
  targetAtom: number
  leafAtom: number
}

const fixtures: Fixture[] = []
const stagingStores: IsolatedBoundaryDissolveStaging[] = []

afterEach(async () => {
  for (const staging of stagingStores.splice(0)) await staging.close()
  for (const fixture of fixtures.splice(0)) {
    await fixture.boundary.close()
    await rm(fixture.directory, {recursive: true, force: true})
  }
})

const apply = async (
  boundary: BoundaryDatabase,
  op: "add" | "remove",
  path: "wimp" | "matter",
  value: Record<string, unknown>,
) => await boundary.materialize({parts: [{
  part: "inflaton",
  op,
  path,
  value,
  by: "dark",
  ts: 1,
}] as [Particle]})

const authorized = async (
  boundary: BoundaryDatabase,
  atom: number,
): Promise<Array<{id: number; key: string; keyId: string; format: MassFileFormat}>> =>
  await boundary.projection.mass.authorized(atom)

const createFixture = async (): Promise<Fixture> => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-boundary-dissolve-"))
  const massRoot = join(directory, "mass")
  const boundary = await open(":memory:", {massCatalog: new MassCatalog(massRoot)})
  const fixture = {boundary, directory, massRoot, sourceAtom: 0, targetAtom: 0, leafAtom: 0}
  fixtures.push(fixture)

  await apply(boundary, "add", "wimp", {
    src: SOURCE,
    name: "Inference",
    mass: MASS_KEYS.map((key) => ({key, format: "json"})),
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
    mass: MASS_KEYS.map((key) => ({key, format: "json"})),
  })

  const firstAtoms = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
    SELECT id, wimp FROM atom WHERE wimp IN (${SOURCE}, ${TARGET}) ORDER BY id
  `
  fixture.sourceAtom = Number(firstAtoms.find((row) => row.wimp === SOURCE)!.id)
  fixture.targetAtom = Number(firstAtoms.find((row) => row.wimp === TARGET)!.id)

  // One mapping already aliases the source; the other four are independent.
  // Dissolve must normalize both shapes into target ownership.
  const sourceFirst = (await authorized(boundary, fixture.sourceAtom))[0]!
  const targetFirst = (await authorized(boundary, fixture.targetAtom))[0]!
  await boundary.projection.mass.source(
    fixture.targetAtom,
    targetFirst.id,
    fixture.sourceAtom,
    sourceFirst.id,
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
    mass: MASS_KEYS.map((key) => ({key, format: "json"})),
  })
  fixture.leafAtom = Number((await boundary.projection.sql<Array<{id: number}>>`
    SELECT id FROM atom WHERE wimp = ${LEAF}
  `)[0]!.id)

  await mkdir(massRoot, {recursive: true})
  for (const [index, mass] of (await authorized(boundary, fixture.sourceAtom)).entries()) {
    await writeFile(
      join(massRoot, massFileName(mass.keyId, mass.format)),
      JSON.stringify({key: mass.key, index}),
    )
  }
  return fixture
}

const digestReader = (fixture: Fixture) => async (
  input: {keyId: string; format: MassFileFormat},
): Promise<string> =>
  createHash("sha256")
    .update(await readFile(join(fixture.massRoot, massFileName(input.keyId, input.format))))
    .digest("hex")

const massSnapshot = async (fixture: Fixture): Promise<Array<{file: string; bytes: string; sha256: string}>> =>
  await Promise.all((await readdir(fixture.massRoot)).toSorted().map(async (file) => {
    const bytes = await readFile(join(fixture.massRoot, file))
    return {
      file,
      bytes: bytes.toString("hex"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }
  }))

const request = (): BoundaryDissolveRequest => ({
  source: SOURCE,
  target: TARGET,
  targetPosition: 0,
  mass: MASS_KEYS.map((key) => ({sourceKey: key, targetKey: key})) as unknown as BoundaryDissolveRequest["mass"],
})

const proposal = (
  proposalId = "synthetic-dissolve-1",
): BoundaryDissolveProposalV1 => ({
  schema: BOUNDARY_DISSOLVE_PROPOSAL_V1,
  proposalId,
  operation: "dissolve",
  request: request(),
})

const openStaging = async (): Promise<IsolatedBoundaryDissolveStaging> => {
  const staging = await IsolatedBoundaryDissolveStaging.open()
  stagingStores.push(staging)
  return staging
}

const metaJSONReader = (
  fixture: Fixture,
  phases: Array<{phase: "before" | "planned"; root: MetaAddress}>,
) => async (root: MetaAddress, phase: "before" | "planned"): Promise<MetaJSONV1> => {
  phases.push({phase, root})
  return await assembleMetaJSON({
    async call<T>(target: string, method: string): Promise<T> {
      if (target === "dark" && method === DARK_DECLARATION_PROJECTION_METHOD) {
        return {
          root,
          template: phase === "before" ? beforeTemplate() : plannedTemplate(),
        } as T
      }
      if (target === "boundary" && method === BOUNDARY_META_JSON_PROJECTION_METHOD) {
        return await readBoundaryMetaJSONProjection(fixture.boundary, {root}) as T
      }
      throw new Error(`Unexpected MetaJSON provider: ${target}.${method}`)
    },
  } as never, {root})
}

const hooks = (
  fixture: Fixture,
  fences: BoundaryMassFenceIdentity[],
  releases: BoundaryMassFenceIdentity[],
  phases: Array<{phase: "before" | "planned"; root: MetaAddress}>,
): BoundaryDissolveHooks => ({
  async fence(identity) {
    fences.push(structuredClone(identity))
  },
  async release(identity) {
    releases.push(structuredClone(identity))
  },
  digest: digestReader(fixture),
  readMetaJSON: metaJSONReader(fixture, phases),
})

const worldFingerprint = async (fixture: Fixture): Promise<unknown> => ({
  wimps: await fixture.boundary.projection.sql`SELECT src FROM wimp ORDER BY src`,
  atoms: await fixture.boundary.projection.sql`
    SELECT id, wimp, parent_atom, parent_topology, position FROM atom ORDER BY id
  `,
  origins: await fixture.boundary.projection.sql`
    SELECT kind, runtime_id, declaration_kind, declaration_wimp,
           declaration_local_id, parent_kind, parent_runtime_id,
           owner_atom, scope_atom, occurrence_key, ordinal
      FROM boundary_runtime_origin ORDER BY sequence
  `,
  memberships: await fixture.boundary.projection.sql`
    SELECT atom, declaration, key FROM mass_membership ORDER BY atom, declaration
  `,
  sources: await fixture.boundary.projection.sql`
    SELECT child_atom, child_declaration, parent_atom, parent_declaration
      FROM mass_key_source ORDER BY child_atom, child_declaration
  `,
})

describe("Boundary recursive remove and offline dissolve", () => {
  test("recursive remove uses inflaton/remove/wimp and removes parent plus descendants", async () => {
    const fixture = await createFixture()
    const filesBefore = await massSnapshot(fixture)

    const commit = await fixture.boundary.materialize({parts: [{
      part: "inflaton",
      op: "remove",
      path: "wimp",
      value: {src: SOURCE},
      by: "dark",
      ts: 2,
    }]})

    expect(await fixture.boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom ORDER BY id`).toEqual([])
    expect(await fixture.boundary.projection.sql<Array<{src: string}>>`
      SELECT src FROM wimp ORDER BY src
    `).toEqual([{src: TARGET}, {src: LEAF}].toSorted((left, right) => left.src.localeCompare(right.src)))
    const removed = commit!.messages
      .map((message) => message.parts[0])
      .filter((particle) => particle.part === "graviton" && particle.op === "remove")
      .map((particle) => particle.path)
    expect(removed.indexOf(`atom/${fixture.leafAtom}`)).toBeLessThan(
      removed.indexOf(`atom/${fixture.targetAtom}`),
    )
    expect(removed.indexOf(`atom/${fixture.targetAtom}`)).toBeLessThan(
      removed.indexOf(`atom/${fixture.sourceAtom}`),
    )
    expect(await massSnapshot(fixture)).toEqual(filesBefore)
  })

  test("dissolve removes only parent, reparent/reorders preserved descendants and transfers five Mass owners", async () => {
    const fixture = await createFixture()
    const filesBefore = await massSnapshot(fixture)
    const targetBefore = await authorized(fixture.boundary, fixture.targetAtom)
    const sourceBefore = await authorized(fixture.boundary, fixture.sourceAtom)
    const leafBefore = await authorized(fixture.boundary, fixture.leafAtom)
    const plan = await planBoundaryDissolve(fixture.boundary, request(), digestReader(fixture))
    const fences: BoundaryMassFenceIdentity[] = []
    const releases: BoundaryMassFenceIdentity[] = []
    const phases: Array<{phase: "before" | "planned"; root: MetaAddress}> = []

    const proof = await executeBoundaryDissolveProof(
      fixture.boundary,
      request(),
      plan,
      hooks(fixture, fences, releases, phases),
    )

    expect(phases).toEqual([
      {phase: "before", root: SOURCE},
      {phase: "planned", root: TARGET},
    ])
    expect(fences).toEqual(plan.transfers.map((transfer) => ({
      atom: fixture.sourceAtom,
      declaration: transfer.sourceDeclaration,
      key: transfer.sourceGlobalKey,
    })))
    expect(releases).toEqual(fences.toReversed())
    expect(proof).toMatchObject({
      sourceAtom: fixture.sourceAtom,
      targetAtom: fixture.targetAtom,
      preservedRuntimeIds: [`atom/${fixture.targetAtom}`, `atom/${fixture.leafAtom}`],
      transferredGlobalKeys: sourceBefore.map((mass) => mass.keyId),
      retainedUnreferencedKeys: targetBefore.slice(1).map((mass) => mass.keyId),
      metaJSON: {before: SOURCE, planned: TARGET},
    })
    expect(proof.privateManifestSha256).toMatch(/^[0-9a-f]{64}$/)

    expect(await fixture.boundary.projection.sql<Array<{
      id: number
      wimp: string
      parentAtom: number | null
      position: number
    }>>`
      SELECT id, wimp, parent_atom AS parentAtom, position FROM atom ORDER BY id
    `).toEqual([
      {id: fixture.targetAtom, wimp: TARGET, parentAtom: null, position: 0},
      {id: fixture.leafAtom, wimp: LEAF, parentAtom: fixture.targetAtom, position: 0},
    ])
    expect(await fixture.boundary.projection.sql<Array<{src: string}>>`
      SELECT src FROM wimp ORDER BY src
    `).toEqual([{src: TARGET}, {src: LEAF}].toSorted((left, right) => left.src.localeCompare(right.src)))
    expect((await authorized(fixture.boundary, fixture.targetAtom)).map(({key, keyId}) => ({key, keyId})))
      .toEqual(sourceBefore.map(({key, keyId}) => ({key, keyId})))
    expect((await authorized(fixture.boundary, fixture.leafAtom)).map(({key, keyId}) => ({key, keyId})))
      .toEqual(sourceBefore.map(({key, keyId}) => ({key, keyId})))
    expect(targetBefore.slice(1).map((mass) => mass.keyId))
      .not.toEqual(sourceBefore.slice(1).map((mass) => mass.keyId))
    expect(leafBefore.slice(1).map((mass) => mass.keyId))
      .toEqual(targetBefore.slice(1).map((mass) => mass.keyId))
    expect(await fixture.boundary.projection.sql<Array<{child_atom: number; parent_atom: number}>>`
      SELECT child_atom, parent_atom FROM mass_key_source ORDER BY child_atom, child_declaration
    `).toEqual(MASS_KEYS.map(() => ({
      child_atom: fixture.leafAtom,
      parent_atom: fixture.targetAtom,
    })))
    expect(await fixture.boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
    expect(await fixture.boundary.projection.sql<Array<{id: string}>>`
      SELECT id FROM mass_key
       WHERE id IN (
         ${targetBefore[1]!.keyId}, ${targetBefore[2]!.keyId},
         ${targetBefore[3]!.keyId}, ${targetBefore[4]!.keyId}
       )
       ORDER BY id
    `).toEqual(targetBefore.slice(1).map((mass) => ({id: mass.keyId}))
      .toSorted((left, right) => left.id.localeCompare(right.id)))
    expect(await massSnapshot(fixture)).toEqual(filesBefore)
  })

  test("dissolve rolls back reparent and earlier Mass transfers on a late membership CAS mismatch", async () => {
    const fixture = await createFixture()
    const filesBefore = await massSnapshot(fixture)
    const plan = await planBoundaryDissolve(fixture.boundary, request(), digestReader(fixture))
    const stale = plan.transfers[4]!
    const replacement = crypto.randomUUID()
    await fixture.boundary.projection.sql`INSERT INTO mass_key (id) VALUES (${replacement})`
    await fixture.boundary.projection.sql`
      UPDATE mass_membership SET key = ${replacement}
       WHERE atom = ${fixture.targetAtom} AND declaration = ${stale.targetDeclaration}
    `
    const before = await worldFingerprint(fixture)
    const fences: BoundaryMassFenceIdentity[] = []
    const releases: BoundaryMassFenceIdentity[] = []
    const phases: Array<{phase: "before" | "planned"; root: MetaAddress}> = []

    await expect(executeBoundaryDissolveProof(
      fixture.boundary,
      request(),
      plan,
      hooks(fixture, fences, releases, phases),
    )).rejects.toMatchObject({
      name: BoundaryDissolveError.name,
      code: "mass_membership_conflict",
      message: `Target Mass ${stale.targetAuthoredKey} changed`,
    })

    expect(phases).toEqual([{phase: "before", root: SOURCE}])
    expect(fences).toHaveLength(5)
    expect(releases).toEqual(fences.toReversed())
    expect(await worldFingerprint(fixture)).toEqual(before)
    expect(await massSnapshot(fixture)).toEqual(filesBefore)
    expect(await fixture.boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })

  test("stages an immutable five-key dissolve receipt without executing or deleting anything", async () => {
    const fixture = await createFixture()
    const staging = await openStaging()
    const worldBefore = await worldFingerprint(fixture)
    const filesBefore = await massSnapshot(fixture)
    const fences: BoundaryMassFenceIdentity[] = []
    const releases: BoundaryMassFenceIdentity[] = []
    const phases: Array<{phase: "before" | "planned"; root: MetaAddress}> = []
    const input = proposal()

    const receipt = await staging.stage(
      fixture.boundary,
      input,
      hooks(fixture, fences, releases, phases),
    )
    const repeated = await staging.stage(
      fixture.boundary,
      input,
      hooks(fixture, fences, releases, phases),
    )

    expect(receipt).toMatchObject({
      proposalId: input.proposalId,
      operation: "dissolve",
      status: "staged",
      source: SOURCE,
      target: TARGET,
      sourceAtom: fixture.sourceAtom,
      targetAtom: fixture.targetAtom,
      fenceCount: 5,
      effects: "none",
    })
    expect(receipt.receiptId).toMatch(/^[0-9a-f]{64}$/)
    expect(receipt.proposalSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(receipt.planSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(receipt.privateManifestSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.isFrozen(receipt)).toBe(true)
    expect(repeated).toEqual(receipt)
    expect(await staging.receipt(input.proposalId)).toEqual(receipt)
    expect(await staging.count()).toBe(1)
    expect(phases).toEqual([{phase: "before", root: SOURCE}])
    expect(fences).toEqual([])
    expect(releases).toEqual([])
    expect(await worldFingerprint(fixture)).toEqual(worldBefore)
    expect(await massSnapshot(fixture)).toEqual(filesBefore)
  })

  test("rejects recursive-remove shape and rolls back a conflicting proposal id", async () => {
    const fixture = await createFixture()
    const staging = await openStaging()
    const worldBefore = await worldFingerprint(fixture)
    const filesBefore = await massSnapshot(fixture)
    const fences: BoundaryMassFenceIdentity[] = []
    const releases: BoundaryMassFenceIdentity[] = []
    const phases: Array<{phase: "before" | "planned"; root: MetaAddress}> = []
    const stagingHooks = hooks(fixture, fences, releases, phases)
    const input = proposal("synthetic-dissolve-conflict")

    await expect(staging.stage(fixture.boundary, {
      ...input,
      operation: "remove",
    }, stagingHooks)).rejects.toMatchObject({
      name: BoundaryDissolveStagingError.name,
      code: "invalid_proposal",
    })
    expect(await staging.count()).toBe(0)

    const receipt = await staging.stage(fixture.boundary, input, stagingHooks)
    await expect(staging.stage(fixture.boundary, {
      ...input,
      request: {...input.request, targetPosition: 1},
    }, stagingHooks)).rejects.toMatchObject({
      name: BoundaryDissolveStagingError.name,
      code: "proposal_conflict",
    })

    expect(await staging.count()).toBe(1)
    expect(await staging.receipt(input.proposalId)).toEqual(receipt)
    expect(phases).toEqual([{phase: "before", root: SOURCE}])
    expect(fences).toEqual([])
    expect(releases).toEqual([])
    expect(await worldFingerprint(fixture)).toEqual(worldBefore)
    expect(await massSnapshot(fixture)).toEqual(filesBefore)
  })

  test("publishes no receipt when the fifth Mass membership drifts during validation", async () => {
    const fixture = await createFixture()
    const staging = await openStaging()
    const filesBefore = await massSnapshot(fixture)
    const initialPlan = await planBoundaryDissolve(
      fixture.boundary,
      request(),
      digestReader(fixture),
    )
    const fifth = initialPlan.transfers[4]!
    const replacement = crypto.randomUUID()
    const phases: Array<{phase: "before" | "planned"; root: MetaAddress}> = []
    const readMetaJSON = metaJSONReader(fixture, phases)

    await expect(staging.stage(fixture.boundary, proposal("synthetic-dissolve-race"), {
      digest: digestReader(fixture),
      async readMetaJSON(root, phase) {
        const document = await readMetaJSON(root, phase)
        await fixture.boundary.projection.sql`INSERT INTO mass_key (id) VALUES (${replacement})`
        await fixture.boundary.projection.sql`
          UPDATE mass_membership SET key = ${replacement}
           WHERE atom = ${fixture.targetAtom} AND declaration = ${fifth.targetDeclaration}
        `
        return document
      },
    })).rejects.toMatchObject({
      name: BoundaryDissolveStagingError.name,
      code: "pre_state_conflict",
    })

    expect(phases).toEqual([{phase: "before", root: SOURCE}])
    expect(await staging.count()).toBe(0)
    expect(await massSnapshot(fixture)).toEqual(filesBefore)
  })
})
