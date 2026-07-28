import {closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync} from "node:fs"
import {createHash} from "node:crypto"
import {dirname, join} from "node:path"
import {
  BOUNDARY_INITIAL_PROJECTION_METHOD,
  type BoundaryInitialProjection,
  type BoundaryInitialProjectionEntry,
} from "@metafor/types/boundary/initial"
import {BULK_VIEWPORT_CAPTURE_METHOD} from "@metafor/types/bulk/capture"
import type {BulkInitialPackage} from "@metafor/types/bulk/initial"
import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
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
  MF117_RETENTION,
  MF117_SOURCE,
  MF117_STATE_DIRECTORY,
  MF117_TARGET,
} from "../shared/mf117.ts"
import type {BulkViewportCaptureRegistry} from "./capture.ts"

export type BulkMonadState = "created" | "loading" | "prepared" | "ready" | "error" | "stopped"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isInitialProjection = (value: unknown): value is BoundaryInitialProjection =>
  isRecord(value) && value.version === 1 && Array.isArray(value.entries)

const particle = (entry: BoundaryInitialProjectionEntry) => ({...structuredClone(entry), ts: 0})
const mf117Schema = "metafor/bulk-mf117-live/v1" as const
const mf117DurableSchema = "metafor/bulk-mf117-promotion/v2" as const
const hexSha256 = /^[0-9a-f]{64}$/
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

type MF117StructuralEntity =
  | Readonly<{
      kind: "atom"
      id: number
      wimp: string
      parentAtom: number | null
      parentTopology: number | null
      position: number
    }>
  | Readonly<{
      kind: "topology"
      id: number
      topologyKind: string
      parentAtom: number | null
      parentTopology: number | null
      position: number
    }>

type MF117StructuralProof = Readonly<{
  version: 1
  removedRoot: Readonly<{
    id: 1
    src: typeof MF117_SOURCE
    absent: true
  }>
  promotedRoot: Readonly<{
    id: 2
    src: typeof MF117_TARGET
    formerRootFrame: BulkRootPromotionReceipt["formerRootFrame"]
  }>
  subtree: readonly MF117StructuralEntity[]
}>

type MF117DurablePromotion = Readonly<{
  receiptId: string
  promotion: BulkRootPromotionReceipt
  structuralProof: MF117StructuralProof
  structuralSha256: string
  legacyManifestSha256: string | null
}>

const expectedMF117Subtree = (promoted: boolean): readonly MF117StructuralEntity[] => [
  {
    kind: "atom",
    id: 2,
    wimp: MF117_TARGET,
    parentAtom: promoted ? null : 1,
    parentTopology: null,
    position: 0,
  },
  {
    kind: "atom",
    id: 3,
    wimp: "zavx0z/lada-auth",
    parentAtom: 2,
    parentTopology: null,
    position: 0,
  },
  {
    kind: "atom",
    id: 4,
    wimp: "zavx0z/lada-chat",
    parentAtom: 2,
    parentTopology: null,
    position: 1,
  },
  {
    kind: "atom",
    id: 5,
    wimp: "zavx0z/lada-model",
    parentAtom: 2,
    parentTopology: null,
    position: 2,
  },
  {
    kind: "atom",
    id: 6,
    wimp: "zavx0z/lada-chat-send",
    parentAtom: 4,
    parentTopology: null,
    position: 0,
  },
]

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  JSON.stringify(Object.keys(value).toSorted()) === JSON.stringify([...keys].toSorted())

const structuralSubtree = (
  projection: BulkRuntimeProjection,
): readonly MF117StructuralEntity[] => {
  const entities: MF117StructuralEntity[] = []
  const visited = new Set<string>()
  const pending: Array<{kind: "atom" | "topology"; id: number}> = [
    {kind: "atom", id: 2},
  ]
  while (pending.length > 0) {
    const current = pending.shift()!
    const key = `${current.kind}/${current.id}`
    if (visited.has(key)) throw new Error("Bulk MF-117 promoted subtree contains a structural cycle")
    visited.add(key)
    if (current.kind === "atom") {
      const atom = projection.atoms.find(({id}) => id === current.id)
      if (!atom) continue
      entities.push({kind: "atom", ...atom})
    } else {
      const topology = projection.topologies.find(({id}) => id === current.id)
      if (!topology) continue
      entities.push({
        kind: "topology",
        id: topology.id,
        topologyKind: topology.kind,
        parentAtom: topology.parentAtom,
        parentTopology: topology.parentTopology,
        position: topology.position,
      })
    }
    for (const atom of projection.atoms) {
      if (
        current.kind === "atom"
          ? atom.parentAtom === current.id
          : atom.parentTopology === current.id
      ) pending.push({kind: "atom", id: atom.id})
    }
    for (const topology of projection.topologies) {
      if (
        current.kind === "atom"
          ? topology.parentAtom === current.id
          : topology.parentTopology === current.id
      ) pending.push({kind: "topology", id: topology.id})
    }
  }
  return entities.toSorted((left, right) =>
    left.kind.localeCompare(right.kind) || left.id - right.id)
}

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

  /** Register closed promotion and read-only observer methods before advertising them. */
  onServerStarting(
    peer: Pick<MonadRpcPeer, "expose">,
    captures: Pick<BulkViewportCaptureRegistry, "capture">,
  ): void {
    peer.expose(MF117_BULK_PREFLIGHT_METHOD, async (input) =>
      this.mf117Preflight(input))
    peer.expose(MF117_BULK_PROMOTE_METHOD, async (input) =>
      this.mf117Promote(input))
    peer.expose(MF117_BULK_VERIFY_METHOD, async () =>
      this.mf117Verify())
    peer.expose(
      BULK_VIEWPORT_CAPTURE_METHOD,
      async (params, context) => await captures.capture(params, context),
    )
  }

  async onServerStarted(
    peer: Pick<MonadRpcPeer, "call">,
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
      const hasMF117Projection = [...this.#projection.atoms.values()].some(({id, wimp}) =>
        (id === 1 && wimp === MF117_SOURCE) ||
        (id === 2 && wimp === MF117_TARGET))
      if (hasMF117Projection && existsSync(this.#promotionPath)) {
        const durable = this.#readDurablePromotion()
        const proof = this.#verifyPromotedProjection(durable.promotion)
        if (
          durable.legacyManifestSha256 === null &&
          (
            durable.structuralSha256 !== sha256(proof) ||
            sha256(durable.structuralProof) !== sha256(proof)
          )
        ) throw new Error("Bulk MF-117 durable structural proof conflicts")
        this.#promotionReceipt = structuredClone(durable.promotion)
        this.#activeSrc = MF117_TARGET
      }
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
    if (
      sha256(structuralSubtree(projection)) !==
        sha256(expectedMF117Subtree(false))
    ) throw new Error("Bulk MF-117 current Lada subtree changed before promotion")
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
    structuralSha256: string
  } {
    const input = this.#mf117Input(value)
    const proof = this.#verifyPromotedProjection(input.promotion)
    const targetId = input.promotion.promotedAtomId * 2
    const structuralSha256 = sha256(proof)
    let durable: MF117DurablePromotion
    if (existsSync(this.#promotionPath)) {
      durable = this.#readDurablePromotion()
      if (
        sha256(durable.promotion) !== sha256(input.promotion) ||
        (
          durable.legacyManifestSha256 === null &&
          (
            durable.structuralSha256 !== structuralSha256 ||
            sha256(durable.structuralProof) !== structuralSha256
          )
        )
      ) {
        throw new Error("Bulk MF-117 durable promotion receipt conflicts")
      }
    } else {
      const body = {
        schema: mf117DurableSchema,
        promotion: input.promotion,
        rootSrc: MF117_TARGET,
        structuralProof: proof,
        structuralSha256,
        removedInferenceTorusAbsent: true,
        retention: MF117_RETENTION,
      } as const
      const receipt = {receiptId: sha256(body), ...body}
      durableJSON(this.#promotionPath, receipt)
      durable = {
        receiptId: receipt.receiptId,
        promotion: structuredClone(input.promotion),
        structuralProof: structuredClone(proof),
        structuralSha256,
        legacyManifestSha256: null,
      }
    }
    this.#promotionReceipt = structuredClone(input.promotion)
    this.#activeSrc = MF117_TARGET
    return {
      schema: mf117Schema,
      receiptId: durable.receiptId,
      rootSrc: MF117_TARGET,
      removedInferenceTorusAbsent: true,
      promotedRootTorus: {
        darkParticleId: targetId,
        parentDarkParticleId: null,
      },
      structuralSha256,
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

  #verifyPromotedProjection(
    promotion: BulkRootPromotionReceipt,
  ): MF117StructuralProof {
    const projection = this.#projection.view()
    const subtree = structuralSubtree(projection)
    if (
      sha256(subtree) !==
        sha256(expectedMF117Subtree(true))
    ) throw new Error("Bulk MF-117 promoted Lada subtree is missing or reparented")
    const manifest = buildBulkManifestation(
      projection,
      promotion.removedRootSrc,
      DEFAULT_BULK_SETTINGS.layout,
      promotion,
    )
    const sourceId = promotion.removedRootAtomId * 2
    const targetId = promotion.promotedAtomId * 2
    const target = manifest.darkParticles.filter(({darkParticleId}) =>
      darkParticleId === targetId)
    const expectedAtomToruses = expectedMF117Subtree(true)
      .filter((entity): entity is Extract<MF117StructuralEntity, {kind: "atom"}> =>
        entity.kind === "atom")
      .map(({id}) => id * 2)
      .toSorted((left, right) => left - right)
    const actualAtomToruses = manifest.darkParticles
      .filter(({darkParticleKind}) => darkParticleKind === "atom")
      .map(({darkParticleId}) => darkParticleId)
      .toSorted((left, right) => left - right)
    const root = target[0]
    const rootOuterDiameterMm = root
      ? (root.torusRadius + root.torusTube) * root.torusScale * 2
      : Number.NaN
    if (
      projection.atoms.some(({id, wimp}) =>
        id === promotion.removedRootAtomId || wimp === MF117_SOURCE) ||
      projection.atoms.filter(({id, wimp}) =>
        id === promotion.promotedAtomId && wimp === MF117_TARGET).length !== 1 ||
      manifest.rootSrc !== MF117_TARGET ||
      manifest.darkParticles.some(({darkParticleId, src}) =>
        darkParticleId === sourceId || src === MF117_SOURCE) ||
      JSON.stringify(actualAtomToruses) !== JSON.stringify(expectedAtomToruses) ||
      target.length !== 1 ||
      root?.parentDarkParticleId !== null ||
      root.src !== MF117_TARGET ||
      root.localX !== promotion.formerRootFrame.localX ||
      root.localY !== promotion.formerRootFrame.localY ||
      root.localZ !== promotion.formerRootFrame.localZ ||
      Math.abs(
        rootOuterDiameterMm -
          promotion.formerRootFrame.outerDiameterMm,
      ) > 1e-9 ||
      manifest.darkParticles.some(({parentDarkParticleId}) =>
        parentDarkParticleId !== null &&
        !manifest.darkParticles.some(({darkParticleId}) =>
          darkParticleId === parentDarkParticleId))
    ) throw new Error("Bulk MF-117 projection retained a ghost torus or lost the Lada root frame")
    return {
      version: 1,
      removedRoot: {
        id: 1,
        src: MF117_SOURCE,
        absent: true,
      },
      promotedRoot: {
        id: 2,
        src: MF117_TARGET,
        formerRootFrame: structuredClone(promotion.formerRootFrame),
      },
      subtree,
    }
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
      promotion.promotedRootSrc !== MF117_TARGET ||
      !isRecord(promotion.formerRootFrame) ||
      !exactKeys(
        promotion.formerRootFrame as unknown as Record<string, unknown>,
        ["localX", "localY", "localZ", "outerDiameterMm"],
      ) ||
      promotion.formerRootFrame.localX !== 0 ||
      promotion.formerRootFrame.localY !== 0 ||
      promotion.formerRootFrame.localZ !== 0 ||
      promotion.formerRootFrame.outerDiameterMm !== 100
    ) throw new Error("Bulk MF-117 promotion receipt is not exact")
    return {schema: mf117Schema, promotion}
  }

  #readDurablePromotion(): MF117DurablePromotion {
    let value: unknown
    try {
      value = JSON.parse(readFileSync(this.#promotionPath, "utf8"))
    } catch {
      throw new Error("Bulk MF-117 durable promotion receipt is unreadable")
    }
    if (!isRecord(value)) {
      throw new Error("Bulk MF-117 durable promotion receipt is invalid")
    }
    const promotion = this.#mf117Input({
      schema: mf117Schema,
      promotion: value.promotion,
    }).promotion
    if (
      value.schema === mf117Schema &&
      exactKeys(value, [
        "receiptId",
        "schema",
        "promotion",
        "rootSrc",
        "manifestSha256",
        "removedInferenceTorusAbsent",
        "retention",
      ])
    ) {
      const body = {
        schema: value.schema,
        promotion: value.promotion,
        rootSrc: value.rootSrc,
        manifestSha256: value.manifestSha256,
        removedInferenceTorusAbsent: value.removedInferenceTorusAbsent,
        retention: value.retention,
      }
      if (
        typeof value.receiptId !== "string" ||
        value.receiptId !== sha256(body) ||
        value.rootSrc !== MF117_TARGET ||
        typeof value.manifestSha256 !== "string" ||
        !hexSha256.test(value.manifestSha256) ||
        value.removedInferenceTorusAbsent !== true ||
        value.retention !== MF117_RETENTION
      ) throw new Error("Bulk MF-117 legacy durable promotion receipt conflicts")
      const structuralProof: MF117StructuralProof = {
        version: 1,
        removedRoot: {id: 1, src: MF117_SOURCE, absent: true},
        promotedRoot: {
          id: 2,
          src: MF117_TARGET,
          formerRootFrame: structuredClone(promotion.formerRootFrame),
        },
        subtree: expectedMF117Subtree(true),
      }
      return {
        receiptId: value.receiptId,
        promotion,
        structuralProof,
        structuralSha256: sha256(structuralProof),
        legacyManifestSha256: value.manifestSha256,
      }
    }
    if (
      value.schema !== mf117DurableSchema ||
      !exactKeys(value, [
        "receiptId",
        "schema",
        "promotion",
        "rootSrc",
        "structuralProof",
        "structuralSha256",
        "removedInferenceTorusAbsent",
        "retention",
      ]) ||
      !isRecord(value.structuralProof) ||
      typeof value.structuralSha256 !== "string"
    ) throw new Error("Bulk MF-117 durable promotion receipt is invalid")
    const body = {
      schema: value.schema,
      promotion: value.promotion,
      rootSrc: value.rootSrc,
      structuralProof: value.structuralProof,
      structuralSha256: value.structuralSha256,
      removedInferenceTorusAbsent: value.removedInferenceTorusAbsent,
      retention: value.retention,
    }
    if (
      typeof value.receiptId !== "string" ||
      value.receiptId !== sha256(body) ||
      value.rootSrc !== MF117_TARGET ||
      value.structuralSha256 !== sha256(value.structuralProof) ||
      value.removedInferenceTorusAbsent !== true ||
      value.retention !== MF117_RETENTION
    ) throw new Error("Bulk MF-117 durable structural proof conflicts")
    return {
      receiptId: value.receiptId,
      promotion,
      structuralProof: structuredClone(value.structuralProof) as MF117StructuralProof,
      structuralSha256: value.structuralSha256,
      legacyManifestSha256: null,
    }
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
