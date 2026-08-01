import {closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync} from "node:fs"
import {createHash} from "node:crypto"
import {dirname, join} from "node:path"
import {
  READ_GRAPH_METHOD,
  parseMetaAddress,
  type MetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import {BULK_VIEWPORT_CAPTURE_METHOD} from "@metafor/types/bulk/capture"
import type {BulkRootPromotionReceipt} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {ForceMessage} from "shared/protocol/force/message"
import type {MonadRpcPeer} from "shared/transport/monad"
import {FORCE_CHECKPOINT_QUIESCE_METHOD} from "shared/transport/force/checkpoint"
import {BulkProjectionStore} from "./projection.ts"
import {materializedRootSrc} from "./web/force-protocol.ts"
import {buildBulkManifestation} from "./manifestation.ts"
import {
  type BulkInitialScene,
  type BulkGraphScene,
  prepareBulkInitialVisual,
} from "./visual-initial.ts"
import {BulkGraphStore} from "./graph.ts"
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

const projectionPromotionReceipt = (
  projection: BulkRuntimeProjection,
  receipt: BulkRootPromotionReceipt | null,
): BulkRootPromotionReceipt | null => {
  if (receipt === null) return null
  const target = projection.atoms.find(({wimp}) => wimp === receipt.promotedRootSrc)
  if (!target) return receipt
  let removedRootAtomId = receipt.removedRootAtomId
  const used = new Set(projection.atoms.map(({id}) => id))
  while (used.has(removedRootAtomId) || removedRootAtomId === target.id) {
    removedRootAtomId += 1
  }
  return {
    ...receipt,
    removedRootAtomId,
    promotedAtomId: target.id,
  }
}

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
    id: number
    src: typeof MF117_SOURCE
    absent: true
  }>
  promotedRoot: Readonly<{
    id: number
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

const legacyMF117Subtree = (promoted: boolean): readonly MF117StructuralEntity[] => [
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
  rootId: number,
): readonly MF117StructuralEntity[] => {
  const entities: MF117StructuralEntity[] = []
  const visited = new Set<string>()
  const pending: Array<{kind: "atom" | "topology"; id: number}> = [
    {kind: "atom", id: rootId},
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

const semanticStructuralSubtree = (
  subtree: readonly MF117StructuralEntity[],
): unknown => {
  const atomById = new Map(
    subtree
      .filter((entity): entity is Extract<MF117StructuralEntity, {kind: "atom"}> =>
        entity.kind === "atom")
      .map((atom) => [atom.id, atom] as const),
  )
  const topologyById = new Map(
    subtree
      .filter((entity): entity is Extract<MF117StructuralEntity, {kind: "topology"}> =>
        entity.kind === "topology")
      .map((topology) => [topology.id, topology] as const),
  )
  return subtree.map((entity) => ({
    kind: entity.kind,
    ...(entity.kind === "atom"
      ? {wimp: entity.wimp}
      : {topologyKind: entity.topologyKind}),
    parent: entity.parentAtom === null
      ? entity.parentTopology === null
        ? null
        : `topology:${topologyById.get(entity.parentTopology)?.topologyKind ?? "missing"}`
      : `atom:${atomById.get(entity.parentAtom)?.wimp ?? "missing"}`,
    position: entity.position,
  })).toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

const mf117Subtree = (
  projection: BulkRuntimeProjection,
  promoted: boolean,
): readonly MF117StructuralEntity[] => {
  const source = projection.atoms.filter(({wimp}) => wimp === MF117_SOURCE)
  const target = projection.atoms.filter(({wimp}) => wimp === MF117_TARGET)
  if (target.length !== 1 || (promoted ? source.length !== 0 : source.length !== 1)) {
    throw new Error(promoted
      ? "Bulk MF-117 projection retained a ghost torus or lost the Lada root frame"
      : "Bulk MF-117 current Lada subtree changed before promotion")
  }
  const subtree = structuralSubtree(projection, target[0]!.id)
  const atoms = subtree.filter(
    (entity): entity is Extract<MF117StructuralEntity, {kind: "atom"}> =>
      entity.kind === "atom",
  )
  const byWimp = new Map(atoms.map((atom) => [atom.wimp, atom] as const))
  const expected = [
    [MF117_TARGET, promoted ? null : MF117_SOURCE, 0],
    ["zavx0z/lada-auth", MF117_TARGET, 0],
    ["zavx0z/lada-chat", MF117_TARGET, 1],
    ["zavx0z/lada-model", MF117_TARGET, 2],
    ["zavx0z/lada-chat-send", "zavx0z/lada-chat", 0],
  ] as const
  const exact = atoms.length === expected.length &&
    subtree.every(({kind}) => kind === "atom") &&
    expected.every(([wimp, parentWimp, position]) => {
      const atom = byWimp.get(wimp)
      const parent = parentWimp === null
        ? null
        : byWimp.get(parentWimp) ?? projection.atoms.find(({wimp: candidate}) =>
          candidate === parentWimp)
      return atom !== undefined &&
        atom.position === position &&
        atom.parentTopology === null &&
        (parent === null ? atom.parentAtom === null : atom.parentAtom === parent?.id)
    })
  const targetParent = target[0]!.parentAtom
  const expectedTargetParent = promoted ? null : source[0]!.id
  if (!exact || targetParent !== expectedTargetParent) {
    throw new Error(promoted
      ? "Bulk MF-117 promoted Lada subtree is missing or reparented"
      : "Bulk MF-117 current Lada subtree changed before promotion")
  }
  return subtree
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

/** Bulk service layer: prepares its sole full Graph Store before Force is born. */
export class BulkMonad {
  readonly #graph = new BulkGraphStore()
  readonly #projection = new BulkProjectionStore()
  #state: BulkMonadState = "created"
  #error: string | null = null
  #activeSrc: MetaAddress
  #throughTs: number | null = null
  #promotionReceipt: BulkRootPromotionReceipt | null = null
  readonly #promotionPath: string

  constructor(options: {promotionPath?: string; root?: MetaAddress} = {}) {
    this.#promotionPath =
      options.promotionPath ?? join(MF117_STATE_DIRECTORY, "bulk-promotion.json")
    const defaultRoot = parseMetaAddress(MF117_SOURCE)
    if (defaultRoot === null) throw new Error("Bulk default Graph root is invalid")
    this.#activeSrc = options.root ?? defaultRoot
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
      const durable = existsSync(this.#promotionPath)
        ? this.#readDurablePromotion()
        : null
      if (durable !== null) this.#activeSrc = MF117_TARGET as MetaAddress
      const initial = await peer.call<Graph>(
        "dark",
        READ_GRAPH_METHOD,
        {root: this.#activeSrc},
        {waitMs: 30_000},
      )
      this.#replaceGraph(initial, this.#activeSrc)
      const hasMF117Projection = [...this.#projection.atoms.values()].some(({wimp}) =>
        wimp === MF117_SOURCE || wimp === MF117_TARGET)
      if (hasMF117Projection && durable !== null) {
        const proof = this.#verifyPromotedProjection(durable.promotion)
        if (
          durable.legacyManifestSha256 === null &&
          sha256(semanticStructuralSubtree(durable.structuralProof.subtree)) !==
            sha256(semanticStructuralSubtree(proof.subtree))
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

  async onImpulse(
    peer: Pick<MonadRpcPeer, "call">,
    message: ForceMessage,
  ): Promise<BulkGraphScene> {
    if (this.#state !== "ready") {
      throw new Error(`Bulk Monad cannot apply an invalidation from state: ${this.#state}`)
    }
    const part = message.parts[0]
    try {
      const materializedRoot = materializedRootSrc(part)
      const nextRoot = materializedRoot === null
        ? this.#activeSrc
        : parseMetaAddress(materializedRoot)
      if (nextRoot === null) {
        throw new Error(`Bulk received a non-canonical materialized root: ${materializedRoot}`)
      }
      await peer.call(
        "boundary",
        FORCE_CHECKPOINT_QUIESCE_METHOD,
        {},
        {waitMs: 30_000},
      )
      const current = await peer.call<Graph>(
        "dark",
        READ_GRAPH_METHOD,
        {root: nextRoot},
        {waitMs: 30_000},
      )
      this.#replaceGraph(current, nextRoot)
      this.#throughTs = part.ts
      return this.#scene()
    } catch (error) {
      this.onRuntimeBirthFailed(error)
      throw error
    }
  }

  openObserver(session: string): BulkInitialScene {
    if (this.#state !== "ready") throw new Error(`Bulk observer cannot open: runtime is not ready (${this.#state})`)
    return {...this.#scene(), session}
  }

  #scene(): BulkGraphScene {
    const projection = this.#projection.snapshot()
    const promotion = projectionPromotionReceipt(
      projection.runtime,
      this.#promotionReceipt,
    )
    const manifest = buildBulkManifestation(
      projection.runtime,
      promotion?.removedRootSrc ?? this.#activeSrc,
      promotion,
    )
    return {
      version: 1,
      throughTs: this.#throughTs,
      rootSrc: this.#activeSrc,
      graph: this.#graph.read(),
      manifest,
      visual: prepareBulkInitialVisual(manifest, projection.runtime),
    }
  }

  #replaceGraph(value: unknown, root: MetaAddress): void {
    const cut = this.#graph.replace(value, root)
    this.#projection.hydrate(cut.projection)
    this.#activeSrc = root
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
    mf117Subtree(projection, false)
    const manifest = buildBulkManifestation(
      projection,
      MF117_SOURCE,
    )
    const sourceAtom = projection.atoms.find(({wimp}) => wimp === MF117_SOURCE)!
    const targetAtom = projection.atoms.find(({wimp}) => wimp === MF117_TARGET)!
    const sourceId = sourceAtom.id * 2
    const targetId = targetAtom.id * 2
    const source = manifest.darkParticles.filter(({darkParticleId}) =>
      darkParticleId === sourceId)
    const target = manifest.darkParticles.filter(({darkParticleId}) =>
      darkParticleId === targetId)
    const outerDiameterMm =
      input.promotion.formerRootFrame.outerDiameterMm
    if (
      source.length !== 1 ||
      source[0]?.parentDarkParticleId !== null ||
      source[0].src !== MF117_SOURCE ||
      target.length !== 1 ||
      target[0]?.parentDarkParticleId !== sourceId ||
      target[0].src !== MF117_TARGET
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
    const targetId = proof.promotedRoot.id * 2
    const structuralSha256 = sha256(proof)
    let durable: MF117DurablePromotion
    if (existsSync(this.#promotionPath)) {
      durable = this.#readDurablePromotion()
      if (
        sha256(durable.promotion) !== sha256(input.promotion) ||
        (
          durable.legacyManifestSha256 === null &&
          sha256(semanticStructuralSubtree(durable.structuralProof.subtree)) !==
            sha256(semanticStructuralSubtree(proof.subtree))
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
    const subtree = mf117Subtree(projection, true)
    const projectedPromotion = projectionPromotionReceipt(projection, promotion)!
    const manifest = buildBulkManifestation(
      projection,
      promotion.removedRootSrc,
      projectedPromotion,
    )
    const promotedAtom = projection.atoms.find(({wimp}) => wimp === MF117_TARGET)!
    const targetId = promotedAtom.id * 2
    const target = manifest.darkParticles.filter(({darkParticleId}) => darkParticleId === targetId)
    const expectedAtomToruses = subtree
      .filter((entity): entity is Extract<MF117StructuralEntity, {kind: "atom"}> => entity.kind === "atom")
      .map(({id}) => id * 2)
      .toSorted((left, right) => left - right)
    const actualAtomToruses = manifest.darkParticles
      .filter(({darkParticleKind}) => darkParticleKind === "atom")
      .map(({darkParticleId}) => darkParticleId)
      .toSorted((left, right) => left - right)
    const root = target[0]
    if (
      projection.atoms.some(({wimp}) => wimp === MF117_SOURCE) ||
      projection.atoms.filter(({wimp}) => wimp === MF117_TARGET).length !== 1 ||
      manifest.rootSrc !== MF117_TARGET ||
      manifest.darkParticles.some(({src}) => src === MF117_SOURCE) ||
      JSON.stringify(actualAtomToruses) !== JSON.stringify(expectedAtomToruses) ||
      target.length !== 1 ||
      root?.parentDarkParticleId !== null ||
      root.src !== MF117_TARGET ||
      manifest.darkParticles.some(({parentDarkParticleId}) =>
        parentDarkParticleId !== null &&
        !manifest.darkParticles.some(({darkParticleId}) =>
          darkParticleId === parentDarkParticleId))
    ) throw new Error("Bulk MF-117 projection retained a ghost torus or lost the Lada root frame")
    return {
      version: 1,
      removedRoot: {
        id: promotion.removedRootAtomId,
        src: MF117_SOURCE,
        absent: true,
      },
      promotedRoot: {
        id: promotedAtom.id,
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
        subtree: legacyMF117Subtree(true),
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
