import {isAbsolute, join, relative, resolve, sep} from "node:path"
import {createInstalledReleaseStore, type PublishedReleaseGraph} from "@metafor/tech-release/installed"
import {runInstalledCosmos} from "./installed"

/** One immutable initial code shipment and a separate persistent installed store. */
export interface BootstrapOptions {
  codeRoot?: string
  dataRoot: string
  initialDigest?: string
  port?: number
  metaRoot?: string
  signal?: AbortSignal
}

/**
Selects only an explicit instance-local Mass configuration. Unrelated inherited
paths are ignored. The release reader then checks every path segment, private
file ownership and the credential's Mass boundary before mounting its broker.
This does not provision a directory Mass or create credentials.
*/
export function bootstrapNodeConfiguration(dataRoot: string, path: string | undefined): string | undefined {
  if (!path || !isAbsolute(path) || /[\u0000-\u001f\u007f]/u.test(path)) return
  const suffix = relative(join(resolve(dataRoot), "mass"), resolve(path))
  if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) return
  return resolve(path)
}

/**
Fills the ordinary installed storage from verified initial bytes only when no
active release exists. Later boots use the persisted active candidate, even
after peer updates have advanced it beyond the shipped initial composition.
The receiver verifies all hashes and resumes partial copies; no source build
or checkout is involved. Startup still owns activation of the selected release.
*/
export async function prepareInstalledBootstrap(options: BootstrapOptions) {
  const dataRoot = resolve(options.dataRoot)
  const storeRoot = join(dataRoot, "store")
  const store = createInstalledReleaseStore({root: storeRoot})
  const active = await store.readActive()
  if (active) {
    await store.verifyCandidate(active.digest)
    return {storeRoot, digest: active.digest}
  }
  if (!options.initialDigest) throw new Error("First launch requires --release with a prepared release digest")
  const initialDigest = options.initialDigest
  if (!options.codeRoot) {
    await store.verifyCandidate(initialDigest)
    return {storeRoot, digest: initialDigest}
  }
  const initial = createInstalledReleaseStore({root: join(resolve(options.codeRoot), "release")})
  const candidate = await initial.verifyCandidate(initialDigest)
  await store.prepare(candidate.graph as PublishedReleaseGraph, {
    async read(identity) {return Bun.file(await initial.artifactPath(initialDigest, identity)).stream()},
  }, initialDigest)
  return {storeRoot, digest: initialDigest}
}

/**
Stable MetaFor entry: startup runs the verified release, whose Quantum may
execute resource Meta. Each instance receives its own data and source paths;
neither process-wide environment mutation nor a Capsule launcher is required.
*/
export async function runBootstrap(options: BootstrapOptions) {
  if (options.signal?.aborted) return
  const prepared = await prepareInstalledBootstrap(options)
  if (options.signal?.aborted) return
  const dataRoot = resolve(options.dataRoot)
  const nodeConfiguration = bootstrapNodeConfiguration(dataRoot, Bun.env.COSMOS_NODE_CONFIG)
  const environment: Record<string, string | undefined> = {
    COSMOS_NODE_CONFIG: nodeConfiguration,
    COSMOS_QUANTUM_DOMAIN: undefined,
    COSMOS_PEER_TOKEN: undefined,
    COSMOS_QUANTUM: "1",
    METAFOR_STATE_ROOT: dataRoot,
    METAFOR_MASS_PATH: join(dataRoot, "mass"),
    BOUNDARY_PATH: join(dataRoot, "dev.sqlite"),
    BOUNDARY_BACKUP_PATH: join(dataRoot, "dev.backup.sqlite"),
    DARK_FORCE_HISTORY_PATH: join(dataRoot, "dark-force-history", "v1"),
    DARK_CHECKPOINT_CONTROL_PATH: join(dataRoot, "checkpoint-control", "v1", "state.json"),
    DARK_FORCE_HISTORY_CUT_ID: undefined,
    DARK_FORCE_HISTORY_STARTED_AT: undefined,
    DARK_CHECKPOINT_SIDEBAND: "1",
    META_AUTHORING_RPC_SOURCE: undefined,
    META_AUTHORING_SCOPES: undefined,
    META_AUTHORING_CREATE_SCOPES: undefined,
    METAFOR_ROOT_SOURCES: undefined,
    METAFOR_ROOT_META: options.metaRoot ? resolve(options.metaRoot) : "",
    METAFOR_META_SOURCE_ROOT: undefined,
    METAFOR_META_ARTIFACT_ROOT: options.metaRoot ? undefined : prepared.storeRoot,
    METAFOR_META_ARTIFACT_MAP: undefined,
    METAFOR_META_ARTIFACT_MAP_FILE: undefined,
  }
  await runInstalledCosmos({storeRoot: prepared.storeRoot, initialDigest: prepared.digest,
    // Meta stopping drains owned resources before Quantum tears down its providers.
    // Startup still enforces a bounded deadline for a noncompliant release.
    terminationTimeoutMs: 60_000,
    environment,
    ...(options.signal ? {signal: options.signal} : {}),
    ...(options.port === undefined ? {} : {port: options.port})})
}
