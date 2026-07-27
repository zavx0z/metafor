import {closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync} from "node:fs"
import {createHash} from "node:crypto"
import {dirname, join} from "node:path"
import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  type BoundaryInitialProjection,
  type BoundaryInitialProjectionEntry,
} from "@metafor/types/boundary/initial"
import type {BulkInitialPackage} from "@metafor/types/bulk/initial"
import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {ForceMessage} from "shared/protocol/force/message"
import type {MonadRpcPeer} from "shared/transport/monad"
import {DEFAULT_BULK_SCENE_SRC, DEFAULT_BULK_SETTINGS} from "./settings.ts"
import {BulkProjectionStore} from "./projection.ts"
import {observedRootSrc} from "./web/force-protocol.ts"
import {buildBulkManifestation} from "./manifestation.ts"
import {
  MF117_BULK_PREFLIGHT_METHOD,
  MF117_BULK_PROMOTE_METHOD,
  MF117_BULK_VERIFY_METHOD,
  MF117_SOURCE,
  MF117_STATE_DIRECTORY,
  MF117_TARGET,
} from "../shared/mf117.ts"

export type BulkMonadState = "created" | "loading" | "prepared" | "ready" | "error" | "stopped"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isInitialProjection = (value: unknown): value is BoundaryInitialProjection =>
  isRecord(value) && value.version === 1 && Array.isArray(value.entries)

const particle = (entry: BoundaryInitialProjectionEntry) => ({...structuredClone(entry), ts: 0})
const mf117Schema = "metafor/bulk-mf117-live/v1" as const
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
const sha256 = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex")

const durableJSON = (filename: string, value: unknown): void => {
  const directory = dirname(filename)
  mkdirSync(directory, {recursive: true, mode: 0o700})
  const temporary = join(directory, `.bulk-promotion.${process.pid}.${crypto.randomUUID()}.tmp`)
  const descriptor = openSync(temporary, "wx", 0o600)
  try {
    writeSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, undefined, "utf8")
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  renameSync(temporary, filename)
  const parent = openSync(directory, "r")
  try {
    fsyncSync(parent)
  } finally {
    closeSync(parent)
  }
}

/** Bulk service layer: prepares one permanent Store before its Force runtime is born. */
export class BulkMonad {
  readonly #projection = new BulkProjectionStore()
  #state: BulkMonadState = "created"
  #error: string | null = null
  #activeSrc = DEFAULT_BULK_SCENE_SRC
  #throughTs: number | null = null
  #promotionReceipt: BulkRootPromotionReceipt | null = null
  readonly #promotionPath: string

  constructor(options: {promotionPath?: string} = {}) {
    this.#promotionPath =
      options.promotionPath ?? join(MF117_STATE_DIRECTORY, "bulk-promotion.json")
  }

  async onServerStarted(
    peer: Pick<MonadRpcPeer, "call"> & Partial<Pick<MonadRpcPeer, "expose">>,
  ): Promise<{atoms: number; rootSrc: string}> {
    if (this.#state !== "created") throw new Error(`Bulk Monad cannot start from state: ${this.#state}`)
    this.#state = "loading"
    try {
      const initial = await peer.call<BoundaryInitialProjection>(
        "boundary",
        BOUNDARY_INITIAL_PROJECTION_METHOD,
        {},
        {waitMs: 30_000},
      )
      if (!isInitialProjection(initial)) throw new Error("Boundary returned an invalid initial Bulk projection")
      for (const entry of initial.entries) this.#projection.apply(particle(entry))
      this.#activeSrc = [...this.#projection.atoms.values()]
        .filter((atom) => atom.parentAtom === null && atom.parentTopology === null)
        .at(-1)?.wimp ?? DEFAULT_BULK_SCENE_SRC
      peer.expose?.(MF117_BULK_PREFLIGHT_METHOD, async (input) =>
        this.mf117Preflight(input))
      peer.expose?.(MF117_BULK_PROMOTE_METHOD, async (input) =>
        this.mf117Promote(input))
      peer.expose?.(MF117_BULK_VERIFY_METHOD, async () =>
        this.mf117Verify())
      this.#state = "prepared"
      return {atoms: this.#projection.atoms.size, rootSrc: this.#activeSrc}
    } catch (error) {
      this.onRuntimeBirthFailed(error)
      throw error
    }
  }

  onRuntimeBorn(): void {
    if (this.#state !== "prepared") throw new Error(`Bulk runtime cannot be born from state: ${this.#state}`)
    this.#state = "ready"
  }

  onRuntimeBirthFailed(error: unknown): void {
    if (this.#state === "error") return
    this.#error = error instanceof Error ? error.message : String(error)
    this.#state = "error"
  }

  onImpulse(message: ForceMessage): void {
    const part = message.parts[0]
    this.#projection.apply(part)
    const roots = new Set(
      [...this.#projection.atoms.values()]
        .filter((atom) => atom.parentAtom === null && atom.parentTopology === null)
        .map((atom) => atom.wimp),
    )
    const nextRoot = observedRootSrc(part, roots)
    if (nextRoot !== null) this.#activeSrc = nextRoot
    this.#throughTs = part.ts
  }

  openObserver(session: string): BulkInitialPackage {
    if (this.#state !== "ready") throw new Error(`Bulk observer cannot open: runtime is not ready (${this.#state})`)
    const projection = this.#projection.snapshot()
    return {
      version: 1,
      session,
      throughTs: this.#throughTs,
      rootSrc: this.#activeSrc,
      projection,
      manifest: buildBulkManifestation(
        projection.runtime,
        this.#promotionReceipt?.removedRootSrc ?? this.#activeSrc,
        DEFAULT_BULK_SETTINGS.layout,
        this.#promotionReceipt,
      ),
    }
  }

  mf117Preflight(value: unknown): {
    schema: typeof mf117Schema
    sourceRootTorus: {darkParticleId: number; outerDiameterMm: number}
    targetChildTorus: {darkParticleId: number; parentDarkParticleId: number}
    promotionReceiptSha256: string
    noGhostTorus: true
  } {
    const input = this.#mf117Input(value)
    if (this.#promotionReceipt !== null || existsSync(this.#promotionPath)) {
      throw new Error("Bulk MF-117 promotion already exists")
    }
    const projection = this.#projection.view()
    const manifest = buildBulkManifestation(
      projection,
      MF117_SOURCE,
      DEFAULT_BULK_SETTINGS.layout,
    )
    const sourceId = input.promotion.removedRootAtomId * 2
    const targetId = input.promotion.promotedAtomId * 2
    const source = manifest.darkParticles.filter(({darkParticleId}) =>
      darkParticleId === sourceId)
    const target = manifest.darkParticles.filter(({darkParticleId}) =>
      darkParticleId === targetId)
    const outerDiameterMm = source[0]
      ? (source[0].torusRadius + source[0].torusTube) *
        source[0].torusScale * 2
      : Number.NaN
    if (
      source.length !== 1 ||
      source[0]?.parentDarkParticleId !== null ||
      source[0].src !== MF117_SOURCE ||
      target.length !== 1 ||
      target[0]?.parentDarkParticleId !== sourceId ||
      target[0].src !== MF117_TARGET ||
      Math.abs(
        outerDiameterMm -
          input.promotion.formerRootFrame.outerDiameterMm,
      ) > 1e-9
    ) throw new Error("Bulk MF-117 current Inference/Lada torus frame changed")
    return {
      schema: mf117Schema,
      sourceRootTorus: {darkParticleId: sourceId, outerDiameterMm},
      targetChildTorus: {
        darkParticleId: targetId,
        parentDarkParticleId: sourceId,
      },
      promotionReceiptSha256: sha256(input.promotion),
      noGhostTorus: true,
    }
  }

  mf117Promote(value: unknown): {
    schema: typeof mf117Schema
    receiptId: string
    rootSrc: typeof MF117_TARGET
    removedInferenceTorusAbsent: true
    promotedRootTorus: {darkParticleId: number; parentDarkParticleId: null}
    manifestSha256: string
  } {
    const input = this.#mf117Input(value)
    const projection = this.#projection.view()
    const manifest = buildBulkManifestation(
      projection,
      input.promotion.removedRootSrc,
      DEFAULT_BULK_SETTINGS.layout,
      input.promotion,
    )
    const sourceId = input.promotion.removedRootAtomId * 2
    const targetId = input.promotion.promotedAtomId * 2
    const target = manifest.darkParticles.filter(({darkParticleId}) =>
      darkParticleId === targetId)
    if (
      projection.atoms.some(({id, wimp}) =>
        id === input.promotion.removedRootAtomId || wimp === MF117_SOURCE) ||
      manifest.rootSrc !== MF117_TARGET ||
      manifest.darkParticles.some(({darkParticleId, src}) =>
        darkParticleId === sourceId || src === MF117_SOURCE) ||
      target.length !== 1 ||
      target[0]?.parentDarkParticleId !== null ||
      target[0].src !== MF117_TARGET ||
      manifest.darkParticles.some(({parentDarkParticleId}) =>
        parentDarkParticleId !== null &&
        !manifest.darkParticles.some(({darkParticleId}) =>
          darkParticleId === parentDarkParticleId))
    ) throw new Error("Bulk MF-117 projection retained a ghost torus or lost the Lada root frame")
    const body = {
      schema: mf117Schema,
      promotion: input.promotion,
      rootSrc: MF117_TARGET,
      manifestSha256: sha256(manifest),
      removedInferenceTorusAbsent: true,
      retention: "retain-until-explicit-gc",
    } as const
    const receipt = {receiptId: sha256(body), ...body}
    if (existsSync(this.#promotionPath)) {
      const current = JSON.parse(readFileSync(this.#promotionPath, "utf8")) as typeof receipt
      if (JSON.stringify(current) !== JSON.stringify(receipt)) {
        throw new Error("Bulk MF-117 durable promotion receipt conflicts")
      }
    } else durableJSON(this.#promotionPath, receipt)
    this.#promotionReceipt = structuredClone(input.promotion)
    this.#activeSrc = MF117_TARGET
    return {
      schema: mf117Schema,
      receiptId: receipt.receiptId,
      rootSrc: MF117_TARGET,
      removedInferenceTorusAbsent: true,
      promotedRootTorus: {
        darkParticleId: targetId,
        parentDarkParticleId: null,
      },
      manifestSha256: receipt.manifestSha256,
    }
  }

  mf117Verify(): ReturnType<BulkMonad["mf117Promote"]> {
    if (this.#promotionReceipt === null || !existsSync(this.#promotionPath)) {
      throw new Error("Bulk MF-117 promotion receipt is unavailable")
    }
    return this.mf117Promote({
      schema: mf117Schema,
      promotion: this.#promotionReceipt,
    })
  }

  #mf117Input(value: unknown): {
    schema: typeof mf117Schema
    promotion: BulkRootPromotionReceipt
  } {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      JSON.stringify(Object.keys(value).toSorted()) !==
        JSON.stringify(["promotion", "schema"]) ||
      !("schema" in value) ||
      value.schema !== mf117Schema ||
      !("promotion" in value) ||
      typeof value.promotion !== "object" ||
      value.promotion === null
    ) throw new Error("Bulk MF-117 request is invalid")
    const promotion = value.promotion as BulkRootPromotionReceipt
    if (
      promotion.version !== 1 ||
      promotion.kind !== "root-promotion" ||
      promotion.verified !== true ||
      promotion.removedRootAtomId !== 1 ||
      promotion.removedRootSrc !== MF117_SOURCE ||
      promotion.promotedAtomId !== 2 ||
      promotion.promotedRootSrc !== MF117_TARGET
    ) throw new Error("Bulk MF-117 promotion receipt is not exact")
    return {schema: mf117Schema, promotion}
  }

  onHealthRequested(): Response {
    return Response.json({
      ok: this.#state !== "error" && this.#state !== "stopped",
      domain: "bulk",
      initialized: this.#state === "ready",
      rpc: this.#state,
      error: this.#error,
    })
  }

  onServerStopping(): void {
    this.#state = "stopped"
  }
}
