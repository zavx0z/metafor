import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import {createHash} from "node:crypto"
import {tmpdir} from "node:os"
import {dirname, join, relative, resolve, sep} from "node:path"
import {spawnSync} from "node:child_process"
import {
  parseMetaAddress,
  type MetaAddress,
  type MetaJSONV1,
} from "@metafor/types/metafor/meta-json"
import type {
  CheckpointForwardPatchDocumentV1,
  CheckpointManifestV1,
} from "@metafor/types/dark/checkpoint"
import type {
  BulkManifest,
  BulkRootPromotionReceipt,
} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {Particle} from "shared/protocol/force/particle"
import {MassCatalog, massFileName} from "../shared/mass.ts"
import {open as openBoundary, type BoundaryDatabase} from "../boundary/sqlite.ts"
import {assembleMetaJSON} from "../dark/monad/meta-json.ts"
import {DARK_DECLARATION_PROJECTION_METHOD} from "../dark/meta-json.ts"
import {
  BOUNDARY_META_JSON_PROJECTION_METHOD,
  readBoundaryMetaJSONProjection,
} from "../boundary/meta-json.ts"
import {
  BOUNDARY_DISSOLVE_PROPOSAL_V1,
  type BoundaryDissolveProposalV1,
} from "../boundary/dissolve-staging.ts"
import {
  DetachedBoundaryDissolveCandidateStaging,
} from "../boundary/dissolve-candidate-staging.ts"
import {
  createIsolatedBoundaryDissolveMassEvidenceReader,
} from "../boundary/dissolve-mass-evidence.ts"
import {
  executeDetachedBoundaryDissolveCandidate,
} from "../boundary/dissolve-candidate-execution.ts"
import {
  createDetachedDissolveCandidateBundle,
  type CandidateFileDigestV1,
} from "../dark/checkpoint/dissolve-candidate.ts"
import {
  captureDetachedDissolveRootFrame,
  produceBulkRootPromotionReceipt,
} from "../dark/checkpoint/dissolve-promotion.ts"
import {canonicalizeMetaJSONV1} from "../dark/checkpoint/projection.ts"
import {readCheckpointControlState} from "../dark/checkpoint/control.ts"
import {DarkForceHistory} from "../dark/force/history.ts"
import {BulkProjectionStore} from "../bulk/projection.ts"
import {buildBulkManifestation} from "../bulk/manifestation.ts"

const SOURCE = parseMetaAddress("zavx0z/inference")!
const TARGET = parseMetaAddress("zavx0z/lada")!
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

/**
 * Owner-approved MF-115 evidence captured before the detached dissolve.
 *
 * The frame belongs to the operation receipt, not to semantic manifestation.
 * Keeping it explicit prevents the acceptance bridge from reconstructing
 * operational evidence from viewport geometry.
 */
const ACCEPTED_FORMER_ROOT_FRAME =
  Object.freeze<BulkRootPromotionReceipt["formerRootFrame"]>({
    localX: 0,
    localY: 0,
    localZ: 0,
    outerDiameterMm: 100,
  })

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex")

const checkedFile = (path: string, label: string): string => {
  const absolute = resolve(path)
  if (!existsSync(absolute)) throw new Error(`${label} is missing: ${absolute}`)
  const stat = lstatSync(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} is not a regular file: ${absolute}`)
  }
  return absolute
}

const checkedDirectory = (path: string, label: string): string => {
  const absolute = resolve(path)
  if (!existsSync(absolute)) throw new Error(`${label} is missing: ${absolute}`)
  const stat = lstatSync(absolute)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} is not a regular directory: ${absolute}`)
  }
  return absolute
}

const git = (
  repository: string,
  args: readonly string[],
): Buffer => {
  const result = spawnSync(
    "git",
    ["--git-dir", repository, ...args],
    {maxBuffer: 512 * 1024 * 1024},
  )
  if (result.status !== 0) {
    throw new Error(
      `Checkpoint Git read failed: ${Buffer.from(result.stderr).toString("utf8").trim()}`,
    )
  }
  return Buffer.from(result.stdout)
}

const readCheckpointBlob = (
  repository: string,
  commit: string,
  blob: CheckpointManifestV1["projection"]["blob"],
): Uint8Array => {
  const chunks = blob.chunks.map(({sha256: digest, bytes}) => {
    const value = git(
      repository,
      ["show", `${commit}:objects/sha256/${digest.slice(0, 2)}/${digest}`],
    )
    if (value.byteLength !== bytes || sha256(value) !== digest) {
      throw new Error(`Checkpoint blob chunk ${digest} failed verification`)
    }
    return value
  })
  const output = Buffer.concat(chunks)
  if (output.byteLength !== blob.bytes || sha256(output) !== blob.sha256) {
    throw new Error(`Checkpoint blob ${blob.sha256} failed verification`)
  }
  return new Uint8Array(output)
}

const checkpointInputs = (
  repository: string,
  commit: string,
): {
  manifest: CheckpointManifestV1
  projection: MetaJSONV1
  patches: CheckpointForwardPatchDocumentV1
  boundary: Uint8Array
} => {
  const manifest = JSON.parse(
    git(repository, ["show", `${commit}:checkpoint.json`]).toString("utf8"),
  ) as CheckpointManifestV1
  if (
    manifest.schema !== "metafor/checkpoint-manifest/v1" ||
    manifest.identity.sequence !== 1 ||
    manifest.projection.root !== SOURCE ||
    manifest.patches.previousSnapshotSequence !== null
  ) {
    throw new Error("MF-115 requires the exact accepted initial sequence-one checkpoint")
  }
  const projection = JSON.parse(
    new TextDecoder("utf8", {fatal: true}).decode(
      readCheckpointBlob(repository, commit, manifest.projection.blob),
    ),
  ) as MetaJSONV1
  const patches = JSON.parse(
    new TextDecoder("utf8", {fatal: true}).decode(
      readCheckpointBlob(repository, commit, manifest.patches.blob),
    ),
  ) as CheckpointForwardPatchDocumentV1
  const boundary = readCheckpointBlob(
    repository,
    commit,
    manifest.boundary.blob,
  )
  const projectionDigest = canonicalizeMetaJSONV1(projection).sha256
  if (
    projectionDigest !== manifest.projection.blob.sha256 ||
    patches.base.sha256 !== projectionDigest ||
    patches.result.sha256 !== projectionDigest ||
    patches.entries.length !== 1 ||
    patches.entries[0]?.sequence !== 1 ||
    patches.entries[0].operations.length !== 0
  ) {
    throw new Error("Accepted checkpoint projection/patch identity is not exact")
  }
  return {manifest, projection, patches, boundary}
}

const plannedTemplate = (
  projection: MetaJSONV1,
  root: MetaAddress,
): MetaJSONV1["template"] => {
  if (root === SOURCE) return structuredClone(projection.template)
  const template = structuredClone(projection.template)
  delete template[SOURCE]
  if (!(TARGET in template)) {
    throw new Error("Accepted projection does not contain the Lada target")
  }
  return template
}

const metaJSONReader = (
  boundary: BoundaryDatabase,
  accepted: MetaJSONV1,
) => async (
  root: MetaAddress,
): Promise<MetaJSONV1> =>
  await assembleMetaJSON({
    async call<T>(target: string, method: string): Promise<T> {
      if (target === "dark" && method === DARK_DECLARATION_PROJECTION_METHOD) {
        return {root, template: plannedTemplate(accepted, root)} as T
      }
      if (
        target === "boundary" &&
        method === BOUNDARY_META_JSON_PROJECTION_METHOD
      ) {
        return await readBoundaryMetaJSONProjection(boundary, {root}) as T
      }
      throw new Error(`Unexpected detached MetaJSON provider: ${target}.${method}`)
    },
  } as never, {root})

const bulkProjection = async (
  boundary: BoundaryDatabase,
): Promise<BulkRuntimeProjection> => {
  const store = new BulkProjectionStore()
  for (const entry of (await boundary.initialProjection()).entries) {
    store.apply({...entry, by: "boundary", ts: 0} as Particle)
  }
  return store.view()
}

const fileDigest = (path: string): CandidateFileDigestV1 => {
  const value = new Uint8Array(readFileSync(path))
  return {
    path,
    bytes: value.byteLength,
    sha256: sha256(value),
  }
}

const treeDigests = (
  root: string,
): Array<{path: string; bytes: number; sha256: string}> => {
  const output: Array<{path: string; bytes: number; sha256: string}> = []
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).toSorted()) {
      const path = join(directory, name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) throw new Error(`Symlink is forbidden: ${path}`)
      if (stat.isDirectory()) {
        visit(path)
        continue
      }
      if (!stat.isFile()) throw new Error(`Non-regular entry is forbidden: ${path}`)
      const value = new Uint8Array(readFileSync(path))
      output.push({
        path: relative(root, path).split(sep).join("/"),
        bytes: value.byteLength,
        sha256: sha256(value),
      })
    }
  }
  visit(root)
  return output
}

const copyTree = (source: string, target: string): void => {
  mkdirSync(target, {recursive: true, mode: 0o700})
  for (const name of readdirSync(source).toSorted()) {
    const from = join(source, name)
    const to = join(target, name)
    const stat = lstatSync(from)
    if (stat.isSymbolicLink()) throw new Error(`Cannot restore symlink: ${from}`)
    if (stat.isDirectory()) copyTree(from, to)
    else if (stat.isFile()) {
      copyFileSync(from, to)
      chmodSync(to, 0o600)
    } else throw new Error(`Cannot restore non-regular entry: ${from}`)
  }
}

const verifyRollbackFiles = (
  bundleDirectory: string,
  expected: readonly CandidateFileDigestV1[],
): void => {
  const rollback = join(bundleDirectory, "rollback")
  const actual = treeDigests(rollback).map((entry) => ({
    ...entry,
    path: `rollback/${entry.path}`,
  }))
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Rollback set no longer matches its ordered manifest")
  }
}

const verifyRestoration = async (
  bundleDirectory: string,
  expected: readonly CandidateFileDigestV1[],
  accepted: MetaJSONV1,
  cutId: string,
  sequence: number,
): Promise<{
  directory: string
  files: number
  boundaryQuickCheck: "ok"
  foreignKeyViolations: 0
  preProjectionSha256: string
  history: {cutId: string; sequence: number}
  control: {cutId: string; sequence: number}
}> => {
  verifyRollbackFiles(bundleDirectory, expected)
  const restored = join(bundleDirectory, "restoration-proof")
  if (existsSync(restored)) {
    throw new Error(`Restoration proof target already exists: ${restored}`)
  }
  copyTree(join(bundleDirectory, "rollback"), restored)
  const restoredDigests = treeDigests(restored).map((entry) => ({
    ...entry,
    path: `rollback/${entry.path}`,
  }))
  if (JSON.stringify(restoredDigests) !== JSON.stringify(expected)) {
    throw new Error("Private restoration bytes do not match rollback manifest")
  }
  const boundary = await openBoundary(join(restored, "boundary.sqlite"), {
    massCatalog: new MassCatalog(join(restored, "mass")),
  })
  const quick = await boundary.projection.sql<Array<{quick_check: string}>>`
    PRAGMA quick_check
  `
  const foreign = await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`
  const projection = await metaJSONReader(boundary, accepted)(SOURCE)
  await boundary.close()
  const historyStatus = new DarkForceHistory(join(restored, "history")).status()
  const control = readCheckpointControlState(
    join(restored, "checkpoint-control.json"),
  )
  const projectionSha256 = canonicalizeMetaJSONV1(projection).sha256
  if (
    quick[0]?.quick_check !== "ok" ||
    foreign.length !== 0 ||
    projectionSha256 !== canonicalizeMetaJSONV1(accepted).sha256 ||
    historyStatus.cutId !== cutId ||
    historyStatus.sequence !== sequence ||
    control.barrier.cutId !== cutId ||
    control.barrier.acceptanceSequence !== sequence
  ) {
    throw new Error("Private rollback restoration failed semantic verification")
  }
  return {
    directory: restored,
    files: expected.length,
    boundaryQuickCheck: "ok",
    foreignKeyViolations: 0,
    preProjectionSha256: projectionSha256,
    history: {cutId: historyStatus.cutId, sequence: historyStatus.sequence},
    control: {
      cutId: control.barrier.cutId,
      sequence: control.barrier.acceptanceSequence,
    },
  }
}

const manifestHealth = (
  projection: BulkRuntimeProjection,
  manifest: BulkManifest,
  sourceAtom: number,
  targetAtom: number,
  promotion: BulkRootPromotionReceipt,
): {
  healthy: true
  atomCount: number
  manifestedAtomCount: number
  darkParticleCount: number
  maxDepth: number
  formerRootOuterDiameterMm: number
  promotedOuterDiameterMm: number
} => {
  const ids = new Set(manifest.darkParticles.map(({darkParticleId}) => darkParticleId))
  const manifestedAtoms = manifest.darkParticles.filter(({src}) => src !== null)
  const root = manifest.darkParticles.find(
    ({darkParticleId}) => darkParticleId === targetAtom * 2,
  )
  const closedParents = manifest.darkParticles.every((particle) =>
    particle.parentDarkParticleId === null ||
    ids.has(particle.parentDarkParticleId)
  )
  if (
    projection.atoms.some(({id}) => id === sourceAtom) ||
    projection.atoms.find(({id}) => id === targetAtom)?.parentAtom !== null ||
    manifest.rootSrc !== TARGET ||
    manifestedAtoms.length !== projection.atoms.length ||
    manifest.darkParticles.some(
      ({darkParticleId}) => darkParticleId === sourceAtom * 2,
    ) ||
    manifest.darkParticles.some(({src}) => src === SOURCE) ||
    manifest.darkParticles.filter(
      ({darkParticleId}) => darkParticleId === targetAtom * 2,
    ).length !== 1 ||
    !root ||
    root.parentDarkParticleId !== null ||
    promotion.removedRootAtomId !== sourceAtom ||
    promotion.promotedAtomId !== targetAtom ||
    promotion.promotedRootSrc !== TARGET ||
    !closedParents
  ) {
    throw new Error("Post-dissolve Bulk manifestation is not a healthy promoted scene")
  }
  return {
    healthy: true,
    atomCount: projection.atoms.length,
    manifestedAtomCount: manifestedAtoms.length,
    darkParticleCount: manifest.darkParticles.length,
    maxDepth: Math.max(0, ...manifest.darkParticles.map(({depth}) => depth)),
    formerRootOuterDiameterMm: promotion.formerRootFrame.outerDiameterMm,
    promotedOuterDiameterMm: promotion.formerRootFrame.outerDiameterMm,
  }
}

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")

const visualDocument = (
  manifest: BulkManifest,
  evidence: Record<string, unknown>,
): string => {
  const nodes = manifest.darkParticles
  const rows = new Map(nodes.map((node, index) => [node.darkParticleId, index]))
  const width = 1180
  const height = Math.max(720, 190 + nodes.length * 88)
  const lines = nodes.filter(({parentDarkParticleId}) => parentDarkParticleId !== null)
    .map((node) => {
      const parent = nodes.find(
        ({darkParticleId}) => darkParticleId === node.parentDarkParticleId,
      )!
      const x1 = 100 + parent.depth * 220
      const y1 = 150 + (rows.get(parent.darkParticleId) ?? 0) * 88
      const x2 = 100 + node.depth * 220
      const y2 = 150 + (rows.get(node.darkParticleId) ?? 0) * 88
      return `<path d="M${x1 + 46},${y1} C${x1 + 110},${y1} ${x2 - 70},${y2} ${x2 - 46},${y2}"/>`
    }).join("")
  const circles = nodes.map((node, index) => {
    const x = 100 + node.depth * 220
    const y = 150 + index * 88
    const root = node.parentDarkParticleId === null
    return `<g data-particle-id="${node.darkParticleId}" data-src="${escapeHtml(node.src ?? "")}">
      <circle cx="${x}" cy="${y}" r="${root ? 46 : 34}" class="${root ? "root" : "node"}"/>
      <text x="${x + 58}" y="${y - 5}" class="label">${escapeHtml(node.label)}</text>
      <text x="${x + 58}" y="${y + 18}" class="meta">${escapeHtml(node.src ?? node.darkParticleKind)} · depth ${node.depth} · id ${node.darkParticleId}</text>
    </g>`
  }).join("")
  const serialized = JSON.stringify(evidence).replaceAll("<", "\\u003c")
  return `<!doctype html>
<html lang="en" data-acceptance="pending" data-webgpu="pending">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MF-115 detached dissolve acceptance</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background:#07101d; color:#e8f1ff }
    body { margin:0; background:radial-gradient(circle at 20% 0%,#17304c 0,#07101d 48%); min-height:100vh }
    header { padding:28px 38px 18px; border-bottom:1px solid #27425d; display:flex; justify-content:space-between; align-items:flex-start }
    h1 { margin:0 0 8px; font-size:27px; font-weight:700 } p { margin:0; color:#9eb4ca }
    .badges { display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end }
    .badge { border:1px solid #39617f; border-radius:999px; padding:7px 12px; color:#bbd3e8; background:#0d1c2b }
    #status { border-color:#2d8e6b; color:#7ff0bd; background:#0b2a21 }
    main { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:24px; padding:26px 38px 40px }
    .scene,.proof { border:1px solid #27425d; background:#091522d9; border-radius:18px; overflow:hidden; box-shadow:0 22px 55px #0007 }
    .scene h2,.proof h2 { font-size:14px; text-transform:uppercase; letter-spacing:.12em; color:#83a7c4; margin:0; padding:18px 20px; border-bottom:1px solid #20384d }
    svg { width:100%; min-height:660px; display:block }
    path { stroke:#315c78; stroke-width:2; fill:none }
    circle { stroke-width:2.4; filter:drop-shadow(0 0 10px #3ac7ff55) }
    circle.root { fill:#2e2509; stroke:#ffd36a; filter:drop-shadow(0 0 15px #ffd36a66) }
    circle.node { fill:#0d3047; stroke:#4ad0ff }
    text.label { fill:#ecf7ff; font-size:15px; font-weight:650 }
    text.meta { fill:#88a7bd; font-size:12px }
    dl { margin:0; padding:18px 20px; display:grid; grid-template-columns:1fr; gap:13px }
    dt { color:#7898b2; font-size:11px; text-transform:uppercase; letter-spacing:.08em }
    dd { margin:3px 0 0; color:#e8f3ff; font:13px ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere }
    .pass { color:#71efb6 } .absent { color:#ffbe7a }
  </style>
</head>
<body>
  <header>
    <div><h1>Detached Inference → Lada dissolve</h1><p>Exact accepted cut · isolated candidate · no live activation</p></div>
    <div class="badges"><span id="status" class="badge">VERIFYING</span><span id="gpu" class="badge">WebGPU probe pending</span></div>
  </header>
  <main>
    <section class="scene"><h2>Post-dissolve Bulk manifestation</h2>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Promoted Lada subtree">${lines}${circles}</svg>
    </section>
    <aside class="proof"><h2>Acceptance evidence</h2><dl>
      <div><dt>Removed root</dt><dd class="absent">zavx0z/inference — absent</dd></div>
      <div><dt>Promoted root</dt><dd class="pass">zavx0z/lada</dd></div>
      <div><dt>Checkpoint</dt><dd id="checkpoint"></dd></div>
      <div><dt>Boundary proof</dt><dd id="proof"></dd></div>
      <div><dt>Former root frame</dt><dd id="frame"></dd></div>
      <div><dt>Scene</dt><dd id="scene"></dd></div>
      <div><dt>Rollback</dt><dd id="rollback"></dd></div>
    </dl></aside>
  </main>
  <script>
    const evidence = ${serialized};
    const pass = evidence.removedInferenceAbsent === true &&
      evidence.promotedRoot === "zavx0z/lada" &&
      evidence.promotionReceiptNonNull === true &&
      evidence.scene.healthy === true &&
      evidence.rollback.verified === true;
    document.documentElement.dataset.acceptance = pass ? "pass" : "fail";
    document.getElementById("status").textContent = pass ? "PASS · SCENE HEALTHY" : "FAIL";
    document.getElementById("checkpoint").textContent = evidence.checkpoint.cutId + ":" + evidence.checkpoint.sequence;
    document.getElementById("proof").textContent = evidence.boundaryProofSha256;
    document.getElementById("frame").textContent = evidence.scene.formerRootOuterDiameterMm + " mm · entire subtree";
    document.getElementById("scene").textContent = evidence.scene.atomCount + " atoms · depth " + evidence.scene.maxDepth;
    document.getElementById("rollback").textContent = evidence.rollback.files + " files · hashes + SQLite + projection";
    (async () => {
      let text = "navigator.gpu unavailable";
      let state = "unavailable";
      try {
        if (navigator.gpu) {
          const adapter = await navigator.gpu.requestAdapter();
          text = adapter ? "WebGPU adapter available" : "WebGPU adapter unavailable";
          state = adapter ? "available" : "unavailable";
        }
      } catch (error) {
        text = "WebGPU probe failed: " + String(error);
        state = "error";
      }
      document.documentElement.dataset.webgpu = state;
      document.getElementById("gpu").textContent = text;
    })();
  </script>
</body>
</html>`
}

const usage = (): never => {
  throw new Error(
    "Usage: bun runtime/dissolve-candidate-acceptance.ts " +
    "<stopped-cut-directory> <checkpoint.git> <checkpoint-commit> " +
    "<checkpoint-control.json> <new-output-directory>",
  )
}

const main = async (): Promise<void> => {
  const [
    stoppedCutArgument,
    checkpointRepositoryArgument,
    checkpointCommit,
    controlArgument,
    outputArgument,
    ...extra
  ] = process.argv.slice(2)
  if (
    !stoppedCutArgument ||
    !checkpointRepositoryArgument ||
    !checkpointCommit ||
    !controlArgument ||
    !outputArgument ||
    extra.length > 0
  ) usage()

  const stoppedCut = checkedDirectory(stoppedCutArgument!, "Stopped accepted cut")
  const checkpointRepository = checkedDirectory(
    checkpointRepositoryArgument!,
    "Accepted checkpoint repository",
  )
  const stoppedBoundary = checkedFile(
    join(stoppedCut, "boundary", "dev.sqlite"),
    "Stopped Boundary SQLite",
  )
  const stoppedMass = checkedDirectory(join(stoppedCut, "mass"), "Stopped Mass")
  const stoppedHistory = checkedDirectory(
    join(stoppedCut, "history"),
    "Stopped Dark Force history",
  )
  const controlSource = checkedFile(controlArgument!, "Checkpoint control state")
  const output = resolve(outputArgument!)
  if (existsSync(output)) throw new Error(`Output already exists: ${output}`)

  const inputsBefore = {
    boundary: [
      fileDigest(stoppedBoundary),
      ...["-wal", "-shm"]
        .map((suffix) => `${stoppedBoundary}${suffix}`)
        .filter(existsSync)
        .map(fileDigest),
    ],
    mass: treeDigests(stoppedMass),
    history: treeDigests(stoppedHistory),
    control: fileDigest(controlSource),
  }
  const accepted = checkpointInputs(
    checkpointRepository,
    checkpointCommit!,
  )
  const inspection = mkdtempSync(join(tmpdir(), "metafor-mf115-inspection-"))
  try {
    const inspectionBoundary = join(inspection, "boundary.sqlite")
    writeFileSync(inspectionBoundary, accepted.boundary, {mode: 0o600})
    const privateControl = join(inspection, "checkpoint-control.json")
    copyFileSync(controlSource, privateControl)
    chmodSync(privateControl, 0o600)
    const inspect = await openBoundary(inspectionBoundary, {
      massCatalog: new MassCatalog(join(inspection, "unused-mass")),
    })
    const sourceAtom = Number((await inspect.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${SOURCE}
        AND parent_atom IS NULL AND parent_topology IS NULL
    `)[0]?.id)
    const authorized = await inspect.projection.mass.authorized(sourceAtom)
    const absent = authorized.find(({key}) => key === "chatOutbox")
    await inspect.close()
    if (!Number.isSafeInteger(sourceAtom) || sourceAtom <= 0 || !absent) {
      throw new Error("Accepted cut does not contain the expected Inference/chatOutbox identity")
    }

    const proposal: BoundaryDissolveProposalV1 = {
      schema: BOUNDARY_DISSOLVE_PROPOSAL_V1,
      proposalId:
        `mf115-${accepted.manifest.identity.cutId}-${accepted.manifest.identity.sequence}`,
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
    const result = await createDetachedDissolveCandidateBundle({
      targetDirectory: output,
      root: SOURCE,
      stoppedBoundary,
      stoppedMassDirectory: stoppedMass,
      stoppedHistoryDirectory: stoppedHistory,
      stoppedControlState: privateControl,
      previousSnapshotSequence: null,
      baseProjection: accepted.projection,
      patches: accepted.patches.entries.map(({sequence, operations}) => ({
        sequence,
        operations,
      })),
      proposal,
      validAbsent: [{keyId: absent.keyId, format: absent.format}],
      capturedAt: new Date().toISOString(),
      confirmStoppedPrivateCopies: true,
      readMetaJSON: async (candidate, root) =>
        await metaJSONReader(candidate, accepted.projection)(root),
    })

    const candidatePath = join(output, "candidate", "boundary.sqlite")
    const candidateMass = join(output, "candidate", "mass")
    const candidate = await openBoundary(candidatePath, {
      massCatalog: new MassCatalog(candidateMass),
    })
    const candidateMassBefore = treeDigests(candidateMass)
    const beforeProjection = await bulkProjection(candidate)
    const beforeAtomIds = beforeProjection.atoms.map(({id}) => id).toSorted(
      (left, right) => left - right,
    )
    const frameCapture = captureDetachedDissolveRootFrame(
      result.receipt,
      result.stage,
      ACCEPTED_FORMER_ROOT_FRAME,
    )
    if (!frameCapture) throw new Error("Former root frame did not bind to candidate stage")
    const staging = await DetachedBoundaryDissolveCandidateStaging.open(
      candidate,
      {
        checkpoint: result.stage.checkpoint,
        rollbackManifestSha256: result.rollbackManifestSha256,
      },
    )
    const acceptance = await executeDetachedBoundaryDissolveCandidate(
      candidate,
      staging,
      proposal.proposalId,
      {
        massEvidence: createIsolatedBoundaryDissolveMassEvidenceReader(
          candidateMass,
          [{keyId: absent.keyId, format: absent.format}],
        ),
        readMetaJSON: metaJSONReader(candidate, accepted.projection),
      },
    )
    const promotion = produceBulkRootPromotionReceipt({
      bundle: result.receipt,
      stage: result.stage,
      frameCapture,
      proof: acceptance.proof,
    })
    if (!promotion) throw new Error("Detached dissolve did not produce a Bulk promotion receipt")
    const afterProjection = await bulkProjection(candidate)
    const afterAtomIds = afterProjection.atoms.map(({id}) => id).toSorted(
      (left, right) => left - right,
    )
    const expectedAfterIds = beforeAtomIds.filter(
      (id) => id !== result.stage.sourceAtom,
    )
    if (JSON.stringify(afterAtomIds) !== JSON.stringify(expectedAfterIds)) {
      throw new Error("Detached dissolve did not preserve the complete Lada subtree identities")
    }
    const manifestation = buildBulkManifestation(
      afterProjection,
      SOURCE,
      promotion,
    )
    const candidateMassAfter = treeDigests(candidateMass)
    if (
      JSON.stringify(candidateMassAfter) !== JSON.stringify(candidateMassBefore) ||
      existsSync(join(candidateMass, massFileName(absent.keyId, absent.format)))
    ) {
      throw new Error(
        "Detached dissolve changed Mass bytes or materialized absent chatOutbox",
      )
    }
    const scene = manifestHealth(
      afterProjection,
      manifestation,
      result.stage.sourceAtom,
      result.stage.targetAtom,
      promotion,
    )
    const quick = await candidate.projection.sql<Array<{quick_check: string}>>`
      PRAGMA quick_check
    `
    const foreign = await candidate.projection.sql<unknown[]>`PRAGMA foreign_key_check`
    if (quick[0]?.quick_check !== "ok" || foreign.length !== 0) {
      throw new Error("Detached post-dissolve Boundary integrity failed")
    }
    await candidate.close()

    verifyRollbackFiles(output, result.rollbackManifest.files)
    const rollback = await verifyRestoration(
      output,
      result.rollbackManifest.files,
      accepted.projection,
      accepted.manifest.identity.cutId,
      accepted.manifest.identity.sequence,
    )
    const inputsAfter = {
      boundary: [
        fileDigest(stoppedBoundary),
        ...["-wal", "-shm"]
          .map((suffix) => `${stoppedBoundary}${suffix}`)
          .filter(existsSync)
          .map(fileDigest),
      ],
      mass: treeDigests(stoppedMass),
      history: treeDigests(stoppedHistory),
      control: fileDigest(controlSource),
    }
    if (JSON.stringify(inputsAfter) !== JSON.stringify(inputsBefore)) {
      throw new Error("Accepted stopped-cut inputs changed during detached acceptance")
    }

    const evidence = {
      schema: "metafor/detached-dissolve-acceptance/v1",
      generatedAt: new Date().toISOString(),
      authority: "non-live",
      effects: {
        liveActivation: false,
        sourceWrite: false,
        force: false,
        monad: false,
        energy: false,
        runtimeLifecycle: false,
        hotReload: false,
      },
      checkpoint: {
        sourceCommit: checkpointCommit!,
        cutId: result.stage.checkpoint.cutId,
        sequence: result.stage.checkpoint.sequence,
        projectionSha256: result.stage.checkpoint.projectionSha256,
        candidateCommit: result.checkpointCommit,
      },
      bundle: {
        bundleId: result.receipt.bundleId,
        rollbackManifestSha256: result.rollbackManifestSha256,
        stageId: result.stage.stageId,
        stageReceiptId: result.stage.receiptId,
      },
      frameCapture,
      proof: acceptance.proof,
      boundaryProofSha256: sha256(JSON.stringify(acceptance.proof)),
      postProjectionSha256:
        canonicalizeMetaJSONV1(acceptance.postMetaJSON).sha256,
      removedInferenceAbsent:
        !afterProjection.atoms.some(({wimp}) => wimp === SOURCE),
      promotedRoot: TARGET,
      preservedAtomIds: afterAtomIds,
      promotionReceiptNonNull: true,
      promotion,
      localFenceProof: acceptance.localFenceProof,
      candidateMass: {
        unchanged: true,
        regularFiles: candidateMassAfter.length,
        chatOutboxAbsent: true,
      },
      scene,
      boundaryIntegrity: {
        quickCheck: "ok",
        foreignKeyViolations: 0,
      },
      rollback: {
        verified: true,
        ...rollback,
      },
      stoppedInputsUnchanged: true,
      retention: result.receipt.retention,
    } as const
    writeFileSync(
      join(output, "acceptance-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
      {mode: 0o600},
    )
    writeFileSync(
      join(output, "post-bulk-manifest.json"),
      `${JSON.stringify(manifestation, null, 2)}\n`,
      {mode: 0o600},
    )
    writeFileSync(
      join(output, "visual-proof.html"),
      visualDocument(manifestation, evidence),
      {mode: 0o600},
    )
    console.log(JSON.stringify({
      output,
      evidence: join(output, "acceptance-evidence.json"),
      visual: join(output, "visual-proof.html"),
      checkpoint: evidence.checkpoint,
      bundleId: evidence.bundle.bundleId,
      postProjectionSha256: evidence.postProjectionSha256,
      scene,
      rollback: evidence.rollback,
    }, null, 2))
  } finally {
    rmSync(inspection, {recursive: true, force: true})
  }
}

await main()
