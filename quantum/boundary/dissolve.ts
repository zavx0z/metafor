import type {SQL} from "bun"
import {createHash} from "node:crypto"
import {
  validateGraph,
  type MetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import type {MassFileFormat} from "../../shared/mass.ts"
import type {BoundaryDatabase} from "./sqlite.ts"

const digestPattern = /^[0-9a-f]{64}$/

export const BOUNDARY_DISSOLVE_ABSENT_MARKER =
  "metafor/mass-absent/v1" as const

export type BoundaryDissolveMassMapping = Readonly<{
  sourceKey: string
  targetKey: string
}>

export type BoundaryDissolveFiveMassMappings = readonly [
  BoundaryDissolveMassMapping,
  BoundaryDissolveMassMapping,
  BoundaryDissolveMassMapping,
  BoundaryDissolveMassMapping,
  BoundaryDissolveMassMapping,
]

export type BoundaryMassFenceIdentity = Readonly<{
  atom: number
  declaration: number
  key: string
}>

export type BoundaryDissolveRequest = Readonly<{
  source: MetaAddress
  target: MetaAddress
  targetPosition: number
  mass: BoundaryDissolveFiveMassMappings
}>

export type BoundaryDissolveMassEvidence =
  | Readonly<{kind: "present"; digestSha256: string}>
  | Readonly<{
    kind: "absent"
    marker: typeof BOUNDARY_DISSOLVE_ABSENT_MARKER
  }>

export type BoundaryDissolveMassEvidenceReader = (
  input: Readonly<{keyId: string; format: MassFileFormat}>,
) => Promise<BoundaryDissolveMassEvidence>

export type BoundaryDissolveGraphReader = (
  root: MetaAddress,
  phase: "before" | "planned",
) => Promise<Graph>

export type BoundaryDissolveHooks = Readonly<{
  fence(identity: BoundaryMassFenceIdentity): Promise<void>
  release(identity: BoundaryMassFenceIdentity): Promise<void>
  massEvidence: BoundaryDissolveMassEvidenceReader
  readGraph: BoundaryDissolveGraphReader
  /**
   * Optional live-only control receipt written through the same SQLite
   * transaction after every structural proof check and before COMMIT.
   */
  beforeCommit?(
    proof: BoundaryDissolveProof,
    plannedGraph: Graph,
  ): Promise<void>
}>

export type BoundaryDissolveErrorCode =
  | "invalid_request"
  | "invalid_shape"
  | "invalid_mass_mapping"
  | "invalid_mass_evidence"
  | "pre_state_conflict"
  | "mass_membership_conflict"
  | "post_state_mismatch"
  | "graph_invalid"

export class BoundaryDissolveError extends Error {
  override readonly name = "BoundaryDissolveError"

  constructor(
    readonly code: BoundaryDissolveErrorCode,
    message: string,
  ) {
    super(message)
  }
}

type RuntimeRow = Readonly<{
  kind: "atom" | "topology"
  id: number
  wimp: string | null
  parentKind: "root" | "atom" | "topology"
  parentId: number
  position: number
  declarationKind: "wimp" | "matter"
  declarationWimp: string
  declarationLocalId: number
  ownerAtom: number
  scopeAtom: number
  occurrenceKey: string
  ordinal: number
}>

type RelationRow = Readonly<{
  childAtom: number
  childDeclaration: number
  childKey: string
  parentAtom: number
  parentDeclaration: number
}>

type DependentMembership = Readonly<{
  atom: number
  declaration: number
  currentKey: string
  parentAtom: number
  parentDeclaration: number
}>

type DissolveTransfer = Readonly<{
  sourceAuthoredKey: string
  targetAuthoredKey: string
  sourceDeclaration: number
  targetDeclaration: number
  sourceGlobalKey: string
  targetPreviousGlobalKey: string
  format: MassFileFormat
  targetSource: Readonly<{atom: number; declaration: number}> | null
  dependents: readonly DependentMembership[]
}>

type PrivateManifestEntry = Readonly<{
  sourceAuthoredKey: string
  targetAuthoredKey: string
  format: MassFileFormat
  globalKeyId: string
  evidence: BoundaryDissolveMassEvidence
}>

type PrivateManifest = Readonly<{
  entries: readonly PrivateManifestEntry[]
}>

export type BoundaryDissolvePlan = Readonly<{
  source: Readonly<{src: MetaAddress; atom: number; position: number}>
  target: Readonly<{src: MetaAddress; atom: number; previousPosition: number; position: number}>
  preservedRuntime: readonly RuntimeRow[]
  transfers: readonly DissolveTransfer[]
  structuralSha256: string
  /** Internal proof evidence; this module is deliberately not exported by the Boundary package. */
  privateManifest: PrivateManifest
}>

export type BoundaryDissolveProof = Readonly<{
  sourceAtom: number
  targetAtom: number
  planSha256: string
  structuralSha256: string
  preservedRuntimeIds: readonly string[]
  transferredGlobalKeys: readonly string[]
  /** Superseded target identities remain metadata-only; this proof performs no byte GC. */
  retainedUnreferencedKeys: readonly string[]
  privateManifestSha256: string
  graph: Readonly<{before: MetaAddress; planned: MetaAddress}>
}>

const runtimeKey = (kind: RuntimeRow["kind"], id: number): string => `${kind}/${id}`
const membershipKey = (atom: number, declaration: number): string => `${atom}/${declaration}`
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex")

const expectMassEvidence = (
  value: unknown,
  label: string,
): BoundaryDissolveMassEvidence => {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    value.kind === "present" &&
    Object.keys(value).length === 2 &&
    "digestSha256" in value &&
    typeof value.digestSha256 === "string" &&
    digestPattern.test(value.digestSha256)
  ) {
    return Object.freeze({kind: "present", digestSha256: value.digestSha256})
  }
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    value.kind === "absent" &&
    Object.keys(value).length === 2 &&
    "marker" in value &&
    value.marker === BOUNDARY_DISSOLVE_ABSENT_MARKER
  ) {
    return Object.freeze({
      kind: "absent",
      marker: BOUNDARY_DISSOLVE_ABSENT_MARKER,
    })
  }
  throw new BoundaryDissolveError(
    "invalid_mass_evidence",
    `${label} must be closed present SHA-256 or explicit absent evidence`,
  )
}

const validPosition = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BoundaryDissolveError("invalid_request", "Dissolve targetPosition must be a non-negative safe integer")
  }
  return value
}

const validateMappings = (
  mappings: BoundaryDissolveFiveMassMappings,
): void => {
  if (!Array.isArray(mappings) || mappings.length !== 5) {
    throw new BoundaryDissolveError("invalid_request", "Dissolve proof requires exactly five Mass mappings")
  }
  const source = new Set<string>()
  const target = new Set<string>()
  for (const mapping of mappings) {
    if (
      typeof mapping?.sourceKey !== "string" ||
      mapping.sourceKey.length === 0 ||
      typeof mapping.targetKey !== "string" ||
      mapping.targetKey.length === 0
    ) {
      throw new BoundaryDissolveError("invalid_mass_mapping", "Dissolve Mass keys must be non-empty strings")
    }
    if (source.has(mapping.sourceKey) || target.has(mapping.targetKey)) {
      throw new BoundaryDissolveError("invalid_mass_mapping", "Dissolve Mass mappings must be one-to-one")
    }
    source.add(mapping.sourceKey)
    target.add(mapping.targetKey)
  }
}

const readRuntime = async (sql: SQL): Promise<RuntimeRow[]> => {
  const rows = await sql<Array<{
    kind: RuntimeRow["kind"]
    id: number
    wimp: string | null
    atomParent: number | null
    atomTopologyParent: number | null
    topologyParent: number | null
    topologyTopologyParent: number | null
    position: number
    declarationKind: RuntimeRow["declarationKind"]
    declarationWimp: string
    declarationLocalId: number
    ownerAtom: number
    scopeAtom: number
    occurrenceKey: string
    ordinal: number
  }>>`
    SELECT origin.kind, origin.runtime_id AS id, atom.wimp,
           atom.parent_atom AS atomParent, atom.parent_topology AS atomTopologyParent,
           topology.parent_atom AS topologyParent,
           topology.parent_topology AS topologyTopologyParent,
           COALESCE(atom.position, topology.position) AS position,
           origin.declaration_kind AS declarationKind,
           origin.declaration_wimp AS declarationWimp,
           origin.declaration_local_id AS declarationLocalId,
           origin.owner_atom AS ownerAtom, origin.scope_atom AS scopeAtom,
           origin.occurrence_key AS occurrenceKey, origin.ordinal
      FROM boundary_runtime_origin AS origin
      LEFT JOIN atom ON origin.kind = ${"atom"} AND atom.id = origin.runtime_id
      LEFT JOIN topology ON origin.kind = ${"topology"} AND topology.id = origin.runtime_id
     ORDER BY origin.sequence
  `
  return rows.map((row) => {
    const atomParent = row.kind === "atom" ? row.atomParent : row.topologyParent
    const topologyParent = row.kind === "atom" ? row.atomTopologyParent : row.topologyTopologyParent
    if (atomParent !== null && topologyParent !== null) {
      throw new BoundaryDissolveError("invalid_shape", `Runtime ${runtimeKey(row.kind, row.id)} has two parents`)
    }
    return {
      kind: row.kind,
      id: Number(row.id),
      wimp: row.kind === "atom" ? row.wimp : null,
      parentKind: atomParent !== null ? "atom" : topologyParent !== null ? "topology" : "root",
      parentId: Number(atomParent ?? topologyParent ?? 0),
      position: Number(row.position),
      declarationKind: row.declarationKind,
      declarationWimp: row.declarationWimp,
      declarationLocalId: Number(row.declarationLocalId),
      ownerAtom: Number(row.ownerAtom),
      scopeAtom: Number(row.scopeAtom),
      occurrenceKey: row.occurrenceKey,
      ordinal: Number(row.ordinal),
    }
  })
}

const subtree = (rows: readonly RuntimeRow[], root: RuntimeRow): RuntimeRow[] => {
  const result: RuntimeRow[] = []
  const queue = [root]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    const key = runtimeKey(current.kind, current.id)
    if (visited.has(key)) {
      throw new BoundaryDissolveError("invalid_shape", `Runtime cycle or duplicate at ${key}`)
    }
    visited.add(key)
    result.push(current)
    queue.push(...rows.filter((row) => row.parentKind === current.kind && row.parentId === current.id))
  }
  return result
}

const readRelations = async (sql: SQL): Promise<RelationRow[]> =>
  (await sql<Array<RelationRow>>`
    SELECT relation.child_atom AS childAtom,
           relation.child_declaration AS childDeclaration,
           child.key AS childKey,
           relation.parent_atom AS parentAtom,
           relation.parent_declaration AS parentDeclaration
      FROM mass_key_source AS relation
      JOIN mass_membership AS child
        ON child.atom = relation.child_atom AND child.declaration = relation.child_declaration
     ORDER BY relation.child_atom, relation.child_declaration
  `).map((row) => ({
    childAtom: Number(row.childAtom),
    childDeclaration: Number(row.childDeclaration),
    childKey: row.childKey,
    parentAtom: Number(row.parentAtom),
    parentDeclaration: Number(row.parentDeclaration),
  }))

const relationDescendants = (
  relations: readonly RelationRow[],
  source: Readonly<{atom: number; declaration: number}>,
  target: Readonly<{atom: number; declaration: number}>,
): DependentMembership[] => {
  const result = new Map<string, DependentMembership>()
  const queue = [source, target]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const parent = queue.shift()!
    const parentKey = membershipKey(parent.atom, parent.declaration)
    if (visited.has(parentKey)) continue
    visited.add(parentKey)
    for (const relation of relations) {
      if (relation.parentAtom !== parent.atom || relation.parentDeclaration !== parent.declaration) continue
      const childKey = membershipKey(relation.childAtom, relation.childDeclaration)
      queue.push({atom: relation.childAtom, declaration: relation.childDeclaration})
      if (childKey === membershipKey(target.atom, target.declaration)) continue
      result.set(childKey, {
        atom: relation.childAtom,
        declaration: relation.childDeclaration,
        currentKey: relation.childKey,
        parentAtom: relation.parentAtom,
        parentDeclaration: relation.parentDeclaration,
      })
    }
  }
  return [...result.values()].sort((left, right) =>
    left.atom - right.atom || left.declaration - right.declaration)
}

const membership = async (
  sql: SQL,
  atom: number,
  authoredKey: string,
): Promise<{
  declaration: number
  globalKey: string
  format: MassFileFormat
  source: {atom: number; declaration: number} | null
}> => {
  const row = (await sql<Array<{
    declaration: number
    globalKey: string
    format: string
    sourceAtom: number | null
    sourceDeclaration: number | null
  }>>`
    SELECT declaration.id AS declaration, member.key AS globalKey,
           declaration.format,
           relation.parent_atom AS sourceAtom,
           relation.parent_declaration AS sourceDeclaration
      FROM mass_membership AS member
      JOIN mass_declaration AS declaration ON declaration.id = member.declaration
      LEFT JOIN mass_key_source AS relation
        ON relation.child_atom = member.atom AND relation.child_declaration = member.declaration
     WHERE member.atom = ${atom} AND declaration.local_key = ${authoredKey}
       AND declaration.active = 1
  `)[0]
  if (!row || (row.format !== "json" && row.format !== "binary")) {
    throw new BoundaryDissolveError(
      "invalid_mass_mapping",
      `Mass declaration ${atom}.${authoredKey} is unavailable`,
    )
  }
  return {
    declaration: Number(row.declaration),
    globalKey: row.globalKey,
    format: row.format,
    source: row.sourceAtom === null || row.sourceDeclaration === null
      ? null
      : {atom: Number(row.sourceAtom), declaration: Number(row.sourceDeclaration)},
  }
}

const structuralView = (
  source: BoundaryDissolvePlan["source"],
  target: BoundaryDissolvePlan["target"],
  preservedRuntime: readonly RuntimeRow[],
  transfers: readonly DissolveTransfer[],
): unknown => ({
  source,
  target,
  preservedRuntime,
  transfers: transfers.map((transfer) => ({
    sourceAuthoredKey: transfer.sourceAuthoredKey,
    targetAuthoredKey: transfer.targetAuthoredKey,
    sourceDeclaration: transfer.sourceDeclaration,
    targetDeclaration: transfer.targetDeclaration,
    format: transfer.format,
    targetSource: transfer.targetSource,
    dependents: transfer.dependents.map((dependent) => ({
      atom: dependent.atom,
      declaration: dependent.declaration,
      parentAtom: dependent.parentAtom,
      parentDeclaration: dependent.parentDeclaration,
    })),
  })),
})

const manifest = async (
  transfers: readonly DissolveTransfer[],
  massEvidence: BoundaryDissolveMassEvidenceReader,
): Promise<PrivateManifest> => ({
  entries: await Promise.all(transfers.map(async (transfer) => ({
    sourceAuthoredKey: transfer.sourceAuthoredKey,
    targetAuthoredKey: transfer.targetAuthoredKey,
    format: transfer.format,
    globalKeyId: transfer.sourceGlobalKey,
    evidence: expectMassEvidence(
      await massEvidence({keyId: transfer.sourceGlobalKey, format: transfer.format}),
      `Mass ${transfer.sourceAuthoredKey}`,
    ),
  }))),
})

const sameManifest = (left: PrivateManifest, right: PrivateManifest): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const validatedGraph = async (
  read: BoundaryDissolveGraphReader,
  root: MetaAddress,
  phase: "before" | "planned",
): Promise<Graph> => {
  const document = await read(root, phase)
  const validation = validateGraph(document)
  if (!validation.ok || document.root !== root) {
    throw new BoundaryDissolveError(
      "graph_invalid",
      `Dissolve ${phase} readGraph did not return a valid ${root} document`,
    )
  }
  return validation.value
}

const buildPlanState = async (
  sql: SQL,
  request: BoundaryDissolveRequest,
): Promise<Omit<BoundaryDissolvePlan, "structuralSha256" | "privateManifest">> => {
  validateMappings(request.mass)
  const position = validPosition(request.targetPosition)
  const rows = await readRuntime(sql)
  const sources = rows.filter((row) =>
    row.kind === "atom" &&
    row.wimp === request.source &&
    row.parentKind === "root" &&
    row.declarationKind === "wimp" &&
    row.declarationWimp === request.source)
  if (sources.length !== 1) {
    throw new BoundaryDissolveError("invalid_shape", "Dissolve source must have one materialized root Atom")
  }
  const sourceRow = sources[0]!
  const directChildren = rows.filter((row) => row.parentKind === "atom" && row.parentId === sourceRow.id)
  if (
    directChildren.length !== 1 ||
    directChildren[0]?.kind !== "atom" ||
    directChildren[0].wimp !== request.target
  ) {
    throw new BoundaryDissolveError(
      "invalid_shape",
      "Dissolve source must contain exactly one direct target Atom",
    )
  }
  const targetRow = directChildren[0]
  if (
    targetRow.declarationKind !== "matter" ||
    targetRow.declarationWimp !== request.source ||
    targetRow.scopeAtom !== sourceRow.id
  ) {
    throw new BoundaryDissolveError("invalid_shape", "Dissolve target origin is not owned by the source root")
  }
  const relations = await readRelations(sql)
  const transfers: DissolveTransfer[] = []
  const sourceGlobalKeys = new Set<string>()
  for (const mapping of request.mass) {
    const sourceMass = await membership(sql, sourceRow.id, mapping.sourceKey)
    const targetMass = await membership(sql, targetRow.id, mapping.targetKey)
    if (sourceMass.source !== null) {
      throw new BoundaryDissolveError(
        "invalid_mass_mapping",
        `Source Mass ${mapping.sourceKey} is borrowed and cannot become Lada ownership`,
      )
    }
    if (sourceMass.format !== targetMass.format) {
      throw new BoundaryDissolveError(
        "invalid_mass_mapping",
        `Mass ${mapping.sourceKey} → ${mapping.targetKey} requires the same codec`,
      )
    }
    if (
      targetMass.source !== null &&
      (
        targetMass.source.atom !== sourceRow.id ||
        targetMass.source.declaration !== sourceMass.declaration
      )
    ) {
      throw new BoundaryDissolveError(
        "invalid_mass_mapping",
        `Target Mass ${mapping.targetKey} has an unrelated owner`,
      )
    }
    if (sourceGlobalKeys.has(sourceMass.globalKey)) {
      throw new BoundaryDissolveError(
        "invalid_mass_mapping",
        "Dissolve source declarations must own five distinct global key identities",
      )
    }
    sourceGlobalKeys.add(sourceMass.globalKey)
    transfers.push({
      sourceAuthoredKey: mapping.sourceKey,
      targetAuthoredKey: mapping.targetKey,
      sourceDeclaration: sourceMass.declaration,
      targetDeclaration: targetMass.declaration,
      sourceGlobalKey: sourceMass.globalKey,
      targetPreviousGlobalKey: targetMass.globalKey,
      format: sourceMass.format,
      targetSource: targetMass.source,
      dependents: relationDescendants(
        relations,
        {atom: sourceRow.id, declaration: sourceMass.declaration},
        {atom: targetRow.id, declaration: targetMass.declaration},
      ),
    })
  }
  return {
    source: {src: request.source, atom: sourceRow.id, position: sourceRow.position},
    target: {
      src: request.target,
      atom: targetRow.id,
      previousPosition: targetRow.position,
      position,
    },
    preservedRuntime: subtree(rows, targetRow),
    transfers,
  }
}

/**
 * Builds an immutable CAS plan from an isolated Boundary database.
 * It does not mutate SQLite, Mass bytes, runtime processes or external Meta.
 */
export async function planBoundaryDissolve(
  boundary: BoundaryDatabase,
  request: BoundaryDissolveRequest,
  massEvidence: BoundaryDissolveMassEvidenceReader,
): Promise<BoundaryDissolvePlan> {
  const state = await buildPlanState(boundary.projection.sql, request)
  const privateManifest = await manifest(state.transfers, massEvidence)
  return Object.freeze({
    ...state,
    structuralSha256: sha256(JSON.stringify(structuralView(
      state.source,
      state.target,
      state.preservedRuntime,
      state.transfers,
    ))),
    privateManifest,
  })
}

const moveRuntimeRoot = async (
  sql: SQL,
  plan: BoundaryDissolvePlan,
): Promise<void> => {
  const moved = await sql<Array<{id: number}>>`
    UPDATE atom
       SET parent_atom = NULL, parent_topology = NULL, position = ${plan.target.position}
     WHERE id = ${plan.target.atom}
       AND parent_atom = ${plan.source.atom}
       AND parent_topology IS NULL
       AND position = ${plan.target.previousPosition}
     RETURNING id
  `
  if (moved.length !== 1) {
    throw new BoundaryDissolveError("pre_state_conflict", "Dissolve target Atom parent/position changed")
  }
  const targetBefore = plan.preservedRuntime[0]!
  const origin = await sql<Array<{id: number}>>`
    UPDATE boundary_runtime_origin
       SET declaration_kind = ${"wimp"}, declaration_wimp = ${plan.target.src},
           declaration_local_id = 0, parent_kind = ${"root"}, parent_runtime_id = 0,
           owner_atom = ${plan.target.atom}, scope_atom = ${plan.target.atom},
           occurrence_key = ${""}, ordinal = 0
     WHERE kind = ${"atom"} AND runtime_id = ${plan.target.atom}
       AND declaration_kind = ${targetBefore.declarationKind}
       AND declaration_wimp = ${targetBefore.declarationWimp}
       AND declaration_local_id = ${targetBefore.declarationLocalId}
       AND parent_kind = ${targetBefore.parentKind}
       AND parent_runtime_id = ${targetBefore.parentId}
       AND scope_atom = ${targetBefore.scopeAtom}
     RETURNING runtime_id AS id
  `
  if (origin.length !== 1) {
    throw new BoundaryDissolveError("pre_state_conflict", "Dissolve target runtime origin changed")
  }
  for (const runtime of plan.preservedRuntime.slice(1)) {
    const updated = await sql<Array<{id: number}>>`
      UPDATE boundary_runtime_origin
         SET scope_atom = ${runtime.scopeAtom === plan.source.atom ? plan.target.atom : runtime.scopeAtom}
       WHERE kind = ${runtime.kind} AND runtime_id = ${runtime.id}
         AND scope_atom = ${runtime.scopeAtom}
       RETURNING runtime_id AS id
    `
    if (updated.length !== 1) {
      throw new BoundaryDissolveError(
        "pre_state_conflict",
        `Dissolve descendant ${runtimeKey(runtime.kind, runtime.id)} changed`,
      )
    }
  }
}

const transferMass = async (
  sql: SQL,
  plan: BoundaryDissolvePlan,
): Promise<void> => {
  for (const transfer of plan.transfers) {
    const source = await sql<Array<{key: string}>>`
      SELECT key FROM mass_membership
       WHERE atom = ${plan.source.atom}
         AND declaration = ${transfer.sourceDeclaration}
         AND key = ${transfer.sourceGlobalKey}
    `
    if (source.length !== 1) {
      throw new BoundaryDissolveError(
        "mass_membership_conflict",
        `Source Mass ${transfer.sourceAuthoredKey} changed`,
      )
    }
    const target = await sql<Array<{key: string}>>`
      UPDATE mass_membership
         SET key = ${transfer.sourceGlobalKey}
       WHERE atom = ${plan.target.atom}
         AND declaration = ${transfer.targetDeclaration}
         AND key = ${transfer.targetPreviousGlobalKey}
       RETURNING key
    `
    if (target.length !== 1) {
      throw new BoundaryDissolveError(
        "mass_membership_conflict",
        `Target Mass ${transfer.targetAuthoredKey} changed`,
      )
    }
    for (const dependent of transfer.dependents) {
      const updated = await sql<Array<{key: string}>>`
        UPDATE mass_membership
           SET key = ${transfer.sourceGlobalKey}
         WHERE atom = ${dependent.atom}
           AND declaration = ${dependent.declaration}
           AND key = ${dependent.currentKey}
         RETURNING key
      `
      if (updated.length !== 1) {
        throw new BoundaryDissolveError(
          "mass_membership_conflict",
          `Dependent Mass ${dependent.atom}/${dependent.declaration} changed`,
        )
      }
    }
    await sql`
      DELETE FROM mass_key_source
       WHERE child_atom = ${plan.target.atom}
         AND child_declaration = ${transfer.targetDeclaration}
    `
    await sql`
      UPDATE mass_key_source
         SET parent_atom = ${plan.target.atom},
             parent_declaration = ${transfer.targetDeclaration}
       WHERE parent_atom = ${plan.source.atom}
         AND parent_declaration = ${transfer.sourceDeclaration}
    `
  }
}

const removeSourceRoot = async (
  sql: SQL,
  plan: BoundaryDissolvePlan,
): Promise<void> => {
  await sql`
    INSERT OR IGNORE INTO boundary_retired_process_execution (
      execution_id, atom, process, state, energy
    )
    SELECT execution_id, atom, process, state, energy
      FROM boundary_process_execution
     WHERE atom = ${plan.source.atom} AND status IN (${"pending"}, ${"superseded"})
  `
  await sql`
    DELETE FROM boundary_runtime_origin
     WHERE kind = ${"atom"} AND runtime_id = ${plan.source.atom}
  `
  const atom = await sql<Array<{id: number}>>`
    DELETE FROM atom WHERE id = ${plan.source.atom} RETURNING id
  `
  if (atom.length !== 1) {
    throw new BoundaryDissolveError("pre_state_conflict", "Dissolve source Atom changed")
  }
  await sql`DELETE FROM mass_declaration WHERE wimp = ${plan.source.src}`
  const wimp = await sql<Array<{src: string}>>`
    DELETE FROM wimp WHERE src = ${plan.source.src} RETURNING src
  `
  if (wimp.length !== 1) {
    throw new BoundaryDissolveError("pre_state_conflict", "Dissolve source WIMP changed")
  }
}

const transitionActiveRoot = async (
  sql: SQL,
  plan: BoundaryDissolvePlan,
): Promise<void> => {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS boundary_active_root (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      active_src TEXT NOT NULL,
      previous_src TEXT,
      dissolve_plan_sha256 TEXT,
      retention TEXT NOT NULL
        CHECK (retention = 'retain-until-explicit-gc')
    ) STRICT;
  `)
  await sql`
    INSERT OR IGNORE INTO boundary_active_root (
      singleton, active_src, previous_src, dissolve_plan_sha256, retention
    ) VALUES (
      1, ${plan.source.src}, NULL, NULL, ${"retain-until-explicit-gc"}
    )
  `
  const changed = await sql<Array<{activeSrc: string}>>`
    UPDATE boundary_active_root
       SET active_src = ${plan.target.src},
           previous_src = ${plan.source.src},
           dissolve_plan_sha256 = ${sha256(JSON.stringify(plan))}
     WHERE singleton = 1 AND active_src = ${plan.source.src}
     RETURNING active_src AS activeSrc
  `
  if (changed.length !== 1 || changed[0]?.activeSrc !== plan.target.src) {
    throw new BoundaryDissolveError(
      "pre_state_conflict",
      "Boundary canonical active root changed before dissolve",
    )
  }
}

const expectedRuntime = (plan: BoundaryDissolvePlan): RuntimeRow[] =>
  plan.preservedRuntime.map((runtime, index) => index === 0
    ? {
        ...runtime,
        parentKind: "root",
        parentId: 0,
        position: plan.target.position,
        declarationKind: "wimp",
        declarationWimp: plan.target.src,
        declarationLocalId: 0,
        ownerAtom: plan.target.atom,
        scopeAtom: plan.target.atom,
        occurrenceKey: "",
        ordinal: 0,
      }
    : {
        ...runtime,
        scopeAtom: runtime.scopeAtom === plan.source.atom ? plan.target.atom : runtime.scopeAtom,
      })

const verifyPlannedState = async (
  boundary: BoundaryDatabase,
  plan: BoundaryDissolvePlan,
  hooks: BoundaryDissolveHooks,
): Promise<void> => {
  const rows = await readRuntime(boundary.projection.sql)
  const target = rows.find((row) => row.kind === "atom" && row.id === plan.target.atom)
  if (!target) throw new BoundaryDissolveError("post_state_mismatch", "Dissolve target Atom disappeared")
  const actualRuntime = subtree(rows, target)
  if (JSON.stringify(actualRuntime) !== JSON.stringify(expectedRuntime(plan))) {
    throw new BoundaryDissolveError("post_state_mismatch", "Dissolve did not preserve the planned runtime subtree")
  }
  if (rows.some((row) => row.kind === "atom" && row.id === plan.source.atom)) {
    throw new BoundaryDissolveError("post_state_mismatch", "Dissolve source Atom survived")
  }
  for (const transfer of plan.transfers) {
    const targetMass = await membership(
      boundary.projection.sql,
      plan.target.atom,
      transfer.targetAuthoredKey,
    )
    if (targetMass.globalKey !== transfer.sourceGlobalKey || targetMass.source !== null) {
      throw new BoundaryDissolveError(
        "post_state_mismatch",
        `Target Mass ${transfer.targetAuthoredKey} did not become the key owner`,
      )
    }
    for (const dependent of transfer.dependents) {
      const row = (await boundary.projection.sql<Array<{key: string}>>`
        SELECT key FROM mass_membership
         WHERE atom = ${dependent.atom} AND declaration = ${dependent.declaration}
      `)[0]
      if (row?.key !== transfer.sourceGlobalKey) {
        throw new BoundaryDissolveError(
          "post_state_mismatch",
          `Dependent Mass ${dependent.atom}/${dependent.declaration} did not follow the transferred key`,
        )
      }
    }
    if (transfer.targetPreviousGlobalKey !== transfer.sourceGlobalKey) {
      const retained = await boundary.projection.sql<Array<{id: string}>>`
        SELECT id FROM mass_key WHERE id = ${transfer.targetPreviousGlobalKey}
      `
      const members = await boundary.projection.sql<unknown[]>`
        SELECT 1 FROM mass_membership WHERE key = ${transfer.targetPreviousGlobalKey} LIMIT 1
      `
      if (retained.length !== 1 || members.length !== 0) {
        throw new BoundaryDissolveError(
          "post_state_mismatch",
          `Superseded target key ${transfer.targetPreviousGlobalKey} was not retained unreferenced`,
        )
      }
    }
  }
  const staleSources = await boundary.projection.sql<unknown[]>`
    SELECT 1 FROM mass_key_source WHERE parent_atom = ${plan.source.atom} LIMIT 1
  `
  if (staleSources.length > 0) {
    throw new BoundaryDissolveError("post_state_mismatch", "Dissolve left a Mass source on the removed Atom")
  }
  const postManifest: PrivateManifest = {
    entries: await Promise.all(plan.transfers.map(async (transfer) => {
      const targetMass = await membership(
        boundary.projection.sql,
        plan.target.atom,
        transfer.targetAuthoredKey,
      )
      return {
        sourceAuthoredKey: transfer.sourceAuthoredKey,
        targetAuthoredKey: transfer.targetAuthoredKey,
        format: targetMass.format,
        globalKeyId: targetMass.globalKey,
        evidence: expectMassEvidence(
          await hooks.massEvidence({keyId: targetMass.globalKey, format: targetMass.format}),
          `Transferred Mass ${transfer.targetAuthoredKey}`,
        ),
      }
    })),
  }
  if (!sameManifest(plan.privateManifest, postManifest)) {
    throw new BoundaryDissolveError("post_state_mismatch", "Private source/target Mass manifests differ")
  }
  if ((await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).length > 0) {
    throw new BoundaryDissolveError("post_state_mismatch", "Dissolve result violates Boundary foreign keys")
  }
}

/**
 * Executes the approved proof only on the caller-provided isolated Boundary.
 * No Oracle/Force endpoint imports or exposes this function.
 */
export async function executeBoundaryDissolveProof(
  boundary: BoundaryDatabase,
  request: BoundaryDissolveRequest,
  plan: BoundaryDissolvePlan,
  hooks: BoundaryDissolveHooks,
): Promise<BoundaryDissolveProof> {
  await validatedGraph(hooks.readGraph, request.source, "before")
  const fenced: BoundaryMassFenceIdentity[] = []
  let transaction = false
  try {
    for (const transfer of plan.transfers) {
      const identity = {
        atom: plan.source.atom,
        declaration: transfer.sourceDeclaration,
        key: transfer.sourceGlobalKey,
      }
      await hooks.fence(identity)
      fenced.push(identity)
    }

    await boundary.projection.sql.unsafe("BEGIN IMMEDIATE")
    transaction = true
    const current = await buildPlanState(boundary.projection.sql, request)
    const structuralSha256 = sha256(JSON.stringify(structuralView(
      current.source,
      current.target,
      current.preservedRuntime,
      current.transfers,
    )))
    if (structuralSha256 !== plan.structuralSha256) {
      throw new BoundaryDissolveError("pre_state_conflict", "Boundary dissolve structural pre-state changed")
    }
    const currentManifest = await manifest(current.transfers, hooks.massEvidence)
    if (!sameManifest(plan.privateManifest, currentManifest)) {
      throw new BoundaryDissolveError("pre_state_conflict", "Boundary dissolve Mass pre-state changed")
    }

    await moveRuntimeRoot(boundary.projection.sql, plan)
    await transferMass(boundary.projection.sql, plan)
    await transitionActiveRoot(boundary.projection.sql, plan)
    await removeSourceRoot(boundary.projection.sql, plan)
    await boundary.projection.refreshRuntimeIndexesForOfflineProof()
    await verifyPlannedState(boundary, plan, hooks)
    const plannedGraph = await validatedGraph(
      hooks.readGraph,
      request.target,
      "planned",
    )
    const proof: BoundaryDissolveProof = {
      sourceAtom: plan.source.atom,
      targetAtom: plan.target.atom,
      planSha256: sha256(JSON.stringify(plan)),
      structuralSha256: plan.structuralSha256,
      preservedRuntimeIds: plan.preservedRuntime.map((runtime) => runtimeKey(runtime.kind, runtime.id)),
      transferredGlobalKeys: plan.transfers.map((transfer) => transfer.sourceGlobalKey),
      retainedUnreferencedKeys: [...new Set(plan.transfers
        .filter((transfer) => transfer.targetPreviousGlobalKey !== transfer.sourceGlobalKey)
        .map((transfer) => transfer.targetPreviousGlobalKey))],
      privateManifestSha256: sha256(JSON.stringify(plan.privateManifest)),
      graph: {before: request.source, planned: request.target},
    }
    await hooks.beforeCommit?.(proof, plannedGraph)
    await boundary.projection.sql.unsafe("COMMIT")
    transaction = false
    return proof
  } catch (error) {
    if (transaction) {
      await boundary.projection.sql.unsafe("ROLLBACK").catch(() => undefined)
      transaction = false
    }
    await boundary.projection.refreshRuntimeIndexesForOfflineProof()
    throw error
  } finally {
    for (const identity of fenced.toReversed()) await hooks.release(identity)
  }
}
