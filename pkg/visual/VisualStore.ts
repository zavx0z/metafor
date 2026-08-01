import type {
  BulkFieldParticle,
  BulkManifest,
  BulkOrbitalParticle,
  BulkRelationChannel,
} from "@metafor/types/bulk/manifest"
import {visualBatchFingerprint} from "./internal/fingerprint.ts"
import {
  visualOwnerDarkParticleIdFromAtomId,
  type VisualLayoutSlug,
  type VisualPlacementSensitivity,
} from "./internal/layout.ts"
import {
  visualRelationEdgeBatchId,
  visualStateEdgeBatchId,
} from "./VisualComponents.ts"
import {
  visualDarkParticleColor,
  visualFieldParticleColor,
  visualRelationColor,
} from "./SemanticVisual.ts"
import {
  visualCausalMaterial,
  visualConditionFieldMaterial,
  visualContextTorusMaterial,
  visualFieldProxyMaterial,
  visualProcessTorusMaterial,
  visualRelationMaterial,
  visualStateTorusMaterial,
  visualTransitionMaterial,
  type VisualLineMaterial,
  type VisualQuantumMaterial,
} from "./VisualMaterialSpec.ts"
import type {
  VisualPayloadEdgeBatch,
  VisualPayloadEdgePath,
  VisualPayloadField,
  VisualPayloadFieldAlias,
  VisualPayloadFieldProxy,
  VisualPayloadOrbital,
  VisualPayloadTorus,
  VisualPayloadTransitionBatch,
  VisualScenePayload,
} from "./ScenePayload.ts"
import {
  classifyVisualInvalidation,
  diffVisualScenePayload,
  visualScopeKeepsPlacements,
  type VisualDeltaPatch,
  type VisualEntityDelta,
  type VisualInvalidationScope,
  type VisualUpstreamChange,
} from "./SceneReconciler.ts"
import {
  describeVisualPreparedScene,
  isLaterVisualFrontier,
  isVisualPreparedScene,
  type VisualCausalFrontier,
  type VisualPreparedScene,
} from "./ScenePreparation.ts"

/**
 * The persistent browser-side visual state.
 *
 * A Store is hydrated once from server-prepared state and then lives for as
 * long as the canvas does. It holds the current payload together with the
 * indexes a localized update needs, so an upstream change that reached three
 * Atoms is answered by re-deriving three Atoms' worth of paint rather than by
 * laying the whole scene out again and comparing the result with what was
 * already on screen. Comparing two fully rebuilt scenes is what this replaces;
 * it is available here only as `oracleAgainst`, for tests that must prove the
 * incremental answer is the same answer.
 *
 * Nothing here touches Canvas, GPU handles, `Renderer`, `Space` or `ViewPoint`.
 * The Store decides *what* changed; a renderer adapter decides how to spend it.
 */

/** Which entity class one renderer record belongs to. */
export type VisualStoreEntityClass =
  | "field"
  | "field-proxy"
  | "orbital"
  | "relation-batch"
  | "torus"
  | "transition-batch"

/**
 * What the Store believes a renderer currently holds for one identity.
 *
 * `generation` increments only when the Store actually emitted an update for
 * that identity, so a renderer adapter can assert it never re-uploaded a buffer
 * for an entity the Store left alone.
 */
export type VisualStoreRendererRecord = Readonly<{
  entityClass: VisualStoreEntityClass
  generation: number
  identity: string
}>

/**
 * The visual identities one upstream change can reach under the strategy in
 * use.
 *
 * `atomIds` is carried through from upstream unchanged — dropping it is exactly
 * what forces a one-Atom edit to rebuild everything. The remaining sets are the
 * layout-specific closure: under `centered-nested` a Field marker shared by
 * several owners hangs at their highest common owner, so a change inside a deep
 * Atom reaches a marker that lives much shallower, and every other owner that
 * shares that marker comes with it. Under `outside-in` markers are one per
 * owner and the closure stops at the Atom itself. The difference falls out of
 * the alias index rather than out of a branch on the slug.
 */
export type VisualStoreClosure = Readonly<{
  atomIds: readonly number[]
  fieldParticleIds: readonly string[]
  fieldProxyIds: readonly string[]
  orbitalParticleIds: readonly string[]
  ownerDarkParticleIds: readonly number[]
  relationBatchIds: readonly string[]
  transitionBatchIds: readonly string[]
  /** Whether the change named its reach; a change that did not is scene-wide. */
  whole: boolean
}>

export type VisualStoreApplication =
  | Readonly<{
    closure: VisualStoreClosure
    /** A frontier at or behind the current one; the payload was left alone. */
    duplicate: boolean
    kind: "visual-store-applied"
    patch: VisualDeltaPatch | Readonly<{kind: "visual-none-patch"}>
    scope: VisualInvalidationScope
  }>
  | Readonly<{
    closure: VisualStoreClosure
    kind: "visual-store-rebuild-required"
    /** Why the Store refused to answer locally, in one sentence. */
    reason: string
    scope: VisualInvalidationScope
  }>

/** What a Store needs to know about the strategy that produced its payload. */
export type VisualStoreLayoutReference = Readonly<{
  placement: VisualPlacementSensitivity
  slug?: VisualLayoutSlug
}>

const frozenDelta = <Value>(
  added: readonly Value[],
  removed: readonly string[],
  updated: readonly Value[],
): VisualEntityDelta<Value> =>
  Object.freeze({
    added: Object.freeze([...added]),
    removed: Object.freeze([...removed]),
    updated: Object.freeze([...updated]),
  })

const EMPTY_DELTA = frozenDelta([], [], [])

const NONE_PATCH = Object.freeze({kind: "visual-none-patch"} as const)

const indexBy = <Key, Value>(
  values: readonly Value[],
  key: (value: Value) => Key,
): Map<Key, Value> => new Map(values.map((value) => [key(value), value]))

const groupInto = <Key, Value>(
  target: Map<Key, Value[]>,
  key: Key,
  value: Value,
): void => {
  const bucket = target.get(key)
  if (bucket) bucket.push(value)
  else target.set(key, [value])
}

const sameQuantum = (
  left: VisualQuantumMaterial,
  right: VisualQuantumMaterial,
): boolean =>
  left.form === right.form &&
  left.glowIntensity === right.glowIntensity &&
  left.highlightSize === right.highlightSize &&
  left.opacity === right.opacity &&
  left.color.every((channel, index) => channel === right.color[index])

const freezeColor = (
  color: readonly [number, number, number],
): readonly [number, number, number] =>
  Object.freeze([...color]) as readonly [number, number, number]

/** Semantic facts of one manifest, indexed for a localized re-derivation. */
type ManifestIndex = Readonly<{
  currentStateIdByOwner: ReadonlyMap<number, number>
  darkById: ReadonlyMap<number, BulkManifest["darkParticles"][number]>
  fieldByOwnerAndFieldId: ReadonlyMap<string, BulkFieldParticle>
  fieldByParticleId: ReadonlyMap<string, BulkFieldParticle>
  orbitalById: ReadonlyMap<string, BulkOrbitalParticle>
  relationById: ReadonlyMap<string, BulkRelationChannel>
  transitionActiveById: ReadonlyMap<string, boolean>
}>

/**
 * Indexes exactly the semantic facts a repaint reads.
 *
 * Semantic manifestation carries no geometry and is cheap to produce, which is
 * what makes it a legitimate input to a local update: the Store re-derives
 * colour and material from the same pure laws the strategy used, for the
 * closure alone, and never asks a strategy to place anything.
 */
const indexManifest = (manifest: BulkManifest): ManifestIndex => {
  const orbitals = manifest.orbitalParticles ?? []
  const currentStateIdByOwner = new Map<number, number>()
  for (const particle of orbitals) {
    // The manifest marks exactly one State occurrence current per owner: the
    // root of the active sleeve, whose source State *is* the Atom's current
    // State. A layout node, by contrast, calls every occurrence of that State
    // current wherever it appears. Recovering the owner's current State id here
    // is what lets the Store answer the layout's question without the layout.
    if (particle.orbitalParticleKind === "state" && particle.current) {
      currentStateIdByOwner.set(particle.parentDarkParticleId, particle.sourceId)
    }
  }
  return Object.freeze({
    currentStateIdByOwner,
    darkById: indexBy(manifest.darkParticles, (p) => p.darkParticleId),
    fieldByOwnerAndFieldId: new Map(
      manifest.fieldParticles.map((field) =>
        [`${field.parentDarkParticleId}:${field.fieldId}`, field] as const
      ),
    ),
    fieldByParticleId: indexBy(manifest.fieldParticles, (f) => f.fieldParticleId),
    orbitalById: indexBy(orbitals, (p) => p.orbitalParticleId),
    relationById: indexBy(
      manifest.relationChannels ?? [],
      (channel) => channel.relationChannelId,
    ),
    transitionActiveById: new Map(
      (manifest.transitionChannels ?? []).map((channel) =>
        [channel.transitionChannelId, channel.active] as const
      ),
    ),
  })
}

/** One line batch rebuilt from paths the Store already holds. */
type RegroupedBatch = Readonly<{
  batchId: string
  material: VisualLineMaterial
  ownerDarkParticleId: number
  paths: readonly VisualPayloadEdgePath[]
  returning: boolean
}>

const regroup = (
  entries: readonly Readonly<{
    material: VisualLineMaterial
    ownerDarkParticleId: number
    path: VisualPayloadEdgePath
    returning: boolean
  }>[],
  identity: (entry: {
    material: VisualLineMaterial
    ownerDarkParticleId: number
    returning: boolean
  }) => string,
): readonly RegroupedBatch[] => {
  const batches = new Map<string, {
    material: VisualLineMaterial
    ownerDarkParticleId: number
    paths: VisualPayloadEdgePath[]
    returning: boolean
  }>()
  for (const entry of entries) {
    const id = identity(entry)
    const batch = batches.get(id)
    if (batch) batch.paths.push(entry.path)
    else {
      batches.set(id, {
        material: entry.material,
        ownerDarkParticleId: entry.ownerDarkParticleId,
        paths: [entry.path],
        returning: entry.returning,
      })
    }
  }
  return [...batches.entries()].map(([batchId, batch]) => {
    // Membership decides order, exactly as it does in the strategy's own
    // assembly, so a regrouped batch is byte-identical to a rebuilt one.
    const paths = batch.paths.toSorted((left, right) =>
      left.channelId < right.channelId ? -1 : 1
    )
    return Object.freeze({
      batchId,
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      paths: Object.freeze(paths),
      returning: batch.returning,
    })
  })
}

const batchFingerprint = (batch: RegroupedBatch): string =>
  visualBatchFingerprint(
    batch.batchId,
    batch.paths.map((path) => ({
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      points: path.points,
    })),
  )

export class VisualStore {
  #payload: VisualScenePayload
  #frontier: VisualCausalFrontier | null
  #sourceRevision: string
  readonly #layout: VisualStoreLayoutReference

  #tori = new Map<number, VisualPayloadTorus>()
  #fields = new Map<string, VisualPayloadField>()
  #orbitals = new Map<string, VisualPayloadOrbital>()
  #fieldProxies = new Map<string, VisualPayloadFieldProxy>()
  #transitionBatches = new Map<string, VisualPayloadTransitionBatch>()
  #relationBatches = new Map<string, VisualPayloadEdgeBatch>()

  #aliasBySource = new Map<string, VisualPayloadFieldAlias>()
  #aliasesByVisualField = new Map<string, VisualPayloadFieldAlias[]>()
  #visualFieldsBySourceOwner = new Map<number, Set<string>>()
  #orbitalsByOwner = new Map<number, string[]>()
  #proxiesByOwner = new Map<number, string[]>()
  #proxiesByVisualField = new Map<string, string[]>()
  #transitionBatchesByOwner = new Map<number, string[]>()
  #relationBatchesByOwner = new Map<number, string[]>()
  #sleeveOccurrences = new Map<string, string[]>()
  #records = new Map<string, VisualStoreRendererRecord>()

  constructor(prepared: VisualPreparedScene, layout: VisualStoreLayoutReference) {
    if (!isVisualPreparedScene(prepared)) {
      throw new TypeError("Visual Store needs server-prepared visual state")
    }
    if (layout.slug !== undefined && layout.slug !== prepared.layoutSlug) {
      throw new Error(
        `Visual Store was given ${layout.slug} state prepared as ${prepared.layoutSlug}`,
      )
    }
    this.#layout = Object.freeze({
      placement: Object.freeze({...layout.placement}),
      ...(layout.slug === undefined ? {} : {slug: layout.slug}),
    })
    this.#payload = prepared.payload
    this.#frontier = prepared.frontier
    this.#sourceRevision = prepared.keys.sourceRevision
    this.#reindex(prepared.payload, true)
  }

  get frontier(): VisualCausalFrontier | null {
    return this.#frontier
  }

  get layoutSlug(): VisualLayoutSlug {
    return this.#payload.layoutSlug
  }

  get payload(): VisualScenePayload {
    return this.#payload
  }

  /** Prepared-state description of what the Store currently holds. */
  describe(): VisualPreparedScene {
    return describeVisualPreparedScene(this.#payload, {
      frontier: this.#frontier,
      sourceRevision: this.#sourceRevision,
    })
  }

  torus(darkParticleId: number): VisualPayloadTorus | undefined {
    return this.#tori.get(darkParticleId)
  }

  field(fieldParticleId: string): VisualPayloadField | undefined {
    return this.#fields.get(fieldParticleId)
  }

  orbital(orbitalParticleId: string): VisualPayloadOrbital | undefined {
    return this.#orbitals.get(orbitalParticleId)
  }

  fieldProxy(fieldProxyId: string): VisualPayloadFieldProxy | undefined {
    return this.#fieldProxies.get(fieldProxyId)
  }

  /** Visual marker one upstream Field occurrence is drawn by, merged or not. */
  visualFieldForSource(
    sourceFieldParticleId: string,
  ): VisualPayloadField | undefined {
    const alias = this.#aliasBySource.get(sourceFieldParticleId)
    return alias ? this.#fields.get(alias.visualFieldParticleId) : undefined
  }

  /** Upstream occurrences one visual marker stands for. */
  sourcesOfVisualField(
    visualFieldParticleId: string,
  ): readonly VisualPayloadFieldAlias[] {
    return this.#aliasesByVisualField.get(visualFieldParticleId) ?? []
  }

  /** State occurrences of one indivisible sleeve. */
  sleeve(
    ownerDarkParticleId: number,
    sleeveRootStateId: number,
  ): readonly string[] {
    return this.#sleeveOccurrences.get(
      `${ownerDarkParticleId}:${sleeveRootStateId}`,
    ) ?? []
  }

  rendererRecord(
    entityClass: VisualStoreEntityClass,
    identity: string,
  ): VisualStoreRendererRecord | undefined {
    return this.#records.get(`${entityClass}:${identity}`)
  }

  rendererRecordCount(): number {
    return this.#records.size
  }

  /**
   * Visual identities one change can reach, under the strategy in use.
   *
   * A change that named no Atom cannot be proven local, so it reaches the whole
   * scene. That is deliberately the honest answer rather than a cheap one.
   */
  closureOf(change: VisualUpstreamChange): VisualStoreClosure {
    if (change.affectedAtomIds.length === 0) return this.#wholeClosure()
    const named = new Set<number>()
    for (const atomId of change.affectedAtomIds) {
      const ownerDarkParticleId = visualOwnerDarkParticleIdFromAtomId(atomId)
      if (this.#tori.has(ownerDarkParticleId)) named.add(ownerDarkParticleId)
    }
    if (named.size === 0) return this.#wholeClosure()
    const owners = new Set(named)

    // A marker the change reached may be merged, in which case it hangs at the
    // common ancestor of every owner that shares it rather than at the owner the
    // change named. That ancestor has to enter the closure or the marker itself
    // would have nowhere to be repainted from. What does *not* follow is that
    // the sharing owners' own Tori, sleeves and causal placements changed: they
    // did not. Only the proxies that draw the shared marker travel with it, and
    // those are reached per Field below rather than per owner.
    const fieldParticleIds = new Set<string>()
    for (const owner of owners) {
      for (const visualId of this.#visualFieldsBySourceOwner.get(owner) ?? []) {
        fieldParticleIds.add(visualId)
      }
    }
    for (const visualId of fieldParticleIds) {
      const marker = this.#fields.get(visualId)
      if (marker) owners.add(marker.ownerDarkParticleId)
    }

    const orbitalParticleIds = new Set<string>()
    const fieldProxyIds = new Set<string>()
    const transitionBatchIds = new Set<string>()
    const relationBatchIds = new Set<string>()
    for (const owner of named) {
      for (const id of this.#orbitalsByOwner.get(owner) ?? []) {
        orbitalParticleIds.add(id)
      }
      for (const id of this.#proxiesByOwner.get(owner) ?? []) {
        fieldProxyIds.add(id)
      }
      for (const id of this.#transitionBatchesByOwner.get(owner) ?? []) {
        transitionBatchIds.add(id)
      }
      for (const id of this.#relationBatchesByOwner.get(owner) ?? []) {
        relationBatchIds.add(id)
      }
    }
    // A merged marker is deliberately *not* fanned back out to the proxies of
    // the owners that share it. A proxy's paint is a function of its own colour
    // — which follows the Field's declared kind, never its Value — its anchor
    // State's activity and its owner's current State. None of those can move
    // because a Field somewhere else did, so widening here would repaint work
    // that provably has the same answer.

    return Object.freeze({
      atomIds: Object.freeze([...change.affectedAtomIds]),
      fieldParticleIds: Object.freeze([...fieldParticleIds]),
      fieldProxyIds: Object.freeze([...fieldProxyIds]),
      orbitalParticleIds: Object.freeze([...orbitalParticleIds]),
      ownerDarkParticleIds: Object.freeze([...owners]),
      relationBatchIds: Object.freeze([...relationBatchIds]),
      transitionBatchIds: Object.freeze([...transitionBatchIds]),
      whole: false,
    })
  }

  /**
   * Applies one upstream change against the semantic manifest it produced.
   *
   * The manifest is required because paint is a pure function of semantics that
   * the payload deliberately does not carry — a Dark particle's activity, a
   * Transition channel's activity, which State an Atom is in. Re-deriving those
   * for the closure is cheap and geometry-free; re-deriving them by running a
   * placement law is what this exists to avoid.
   *
   * A scope that moves placements is refused rather than guessed at: the caller
   * is told to bring a rebuilt payload and hand it to `adopt`.
   */
  apply(
    change: VisualUpstreamChange,
    manifest: BulkManifest,
    options: Readonly<{
      frontier?: VisualCausalFrontier
      sourceRevision?: string
    }> = {},
  ): VisualStoreApplication {
    const scope = classifyVisualInvalidation(change, this.#layout)
    const closure = this.closureOf(change)

    const next = options.frontier
    if (
      next !== undefined &&
      this.#frontier !== null &&
      this.#frontier.cutId === next.cutId &&
      !isLaterVisualFrontier(this.#frontier, next)
    ) {
      // Re-delivery after a reconnect, and provably so: the same cut at a
      // sequence already in the payload. Applying it again would be a no-op
      // with a cost, so saying so is cheaper. A change from a *different* cut
      // is not a duplicate — nothing about this frontier can order it against
      // the one held, so it is applied and the frontier follows it.
      return Object.freeze({
        closure,
        duplicate: true,
        kind: "visual-store-applied",
        patch: NONE_PATCH,
        scope,
      })
    }

    if (!visualScopeKeepsPlacements(scope)) {
      return Object.freeze({
        closure,
        kind: "visual-store-rebuild-required",
        reason:
          `A ${scope} change moves placements, which only the ${this.#payload.layoutSlug} strategy can decide`,
        scope,
      })
    }

    const patch = scope === "none" ||
        scope === "story-control" ||
        scope === "camera"
      // Playback and camera move a `ViewPoint`, not a scene entity. The scope
      // is reported so a consumer acts on it; the payload is already current.
      ? NONE_PATCH
      : this.#repaint(closure, indexManifest(manifest))

    if (patch.kind === "visual-delta-patch") this.#commit(patch)
    if (options.frontier !== undefined) this.#frontier = options.frontier
    if (options.sourceRevision !== undefined) {
      this.#sourceRevision = options.sourceRevision
    }

    return Object.freeze({
      closure,
      duplicate: false,
      kind: "visual-store-applied",
      patch,
      scope,
    })
  }

  /**
   * Takes a payload a strategy did have to build — a structural or geometry
   * change — and reduces it to exact renderer operations against what is
   * already on screen.
   *
   * This is the only path that compares two whole payloads, and it exists
   * because the alternative for a topology change is tearing the scene down.
   */
  adopt(
    payload: VisualScenePayload,
    options: Readonly<{
      frontier?: VisualCausalFrontier
      sourceRevision?: string
    }> = {},
  ): VisualDeltaPatch {
    if (payload.layoutSlug !== this.#payload.layoutSlug) {
      throw new Error(
        `Visual Store holds ${this.#payload.layoutSlug} and cannot adopt ${payload.layoutSlug}`,
      )
    }
    const patch = diffVisualScenePayload(this.#payload, payload)
    this.#payload = payload
    this.#reindex(payload, false)
    this.#bumpRecords(patch)
    if (options.frontier !== undefined) this.#frontier = options.frontier
    if (options.sourceRevision !== undefined) {
      this.#sourceRevision = options.sourceRevision
    }
    return patch
  }

  /**
   * Whether the incrementally maintained payload is the payload a full
   * deterministic rebuild would have produced.
   *
   * Only a correctness oracle. Production never calls it, because running the
   * strategy to check the Store would cost exactly what the Store saves.
   */
  oracleAgainst(rebuilt: VisualScenePayload): Readonly<{
    differences: readonly string[]
    equal: boolean
  }> {
    const patch = diffVisualScenePayload(this.#payload, rebuilt)
    const differences: string[] = []
    const note = (label: string, delta: VisualEntityDelta<unknown>): void => {
      for (const id of delta.removed) differences.push(`${label} ${id} absent`)
      for (const value of delta.added) {
        differences.push(`${label} added ${JSON.stringify(value).slice(0, 120)}`)
      }
      for (const value of delta.updated) {
        differences.push(
          `${label} differs ${JSON.stringify(value).slice(0, 120)}`,
        )
      }
    }
    note("torus", patch.tori)
    note("field", patch.fields)
    note("orbital", patch.orbitals)
    note("proxy", patch.fieldProxies)
    note("transition", patch.transitionBatches)
    note("relation", patch.relationBatches)
    return Object.freeze({
      differences: Object.freeze(differences),
      equal: differences.length === 0,
    })
  }

  #wholeClosure(): VisualStoreClosure {
    return Object.freeze({
      atomIds: Object.freeze([]),
      fieldParticleIds: Object.freeze([...this.#fields.keys()]),
      fieldProxyIds: Object.freeze([...this.#fieldProxies.keys()]),
      orbitalParticleIds: Object.freeze([...this.#orbitals.keys()]),
      ownerDarkParticleIds: Object.freeze([...this.#tori.keys()]),
      relationBatchIds: Object.freeze([...this.#relationBatches.keys()]),
      transitionBatchIds: Object.freeze([...this.#transitionBatches.keys()]),
      whole: true,
    })
  }

  /** Re-derives paint for the closure and expresses it as renderer operations. */
  #repaint(
    closure: VisualStoreClosure,
    index: ManifestIndex,
  ): VisualDeltaPatch {
    const tori: VisualPayloadTorus[] = []
    for (const ownerDarkParticleId of closure.ownerDarkParticleIds) {
      const stored = this.#tori.get(ownerDarkParticleId)
      const particle = index.darkById.get(ownerDarkParticleId)
      if (!stored || !particle) continue
      const color = freezeColor(visualDarkParticleColor(particle))
      const material = visualContextTorusMaterial(color)
      if (
        sameQuantum(stored.material, material) &&
        stored.label === particle.label
      ) continue
      tori.push(Object.freeze({...stored, color, label: particle.label, material}))
    }

    const fields: VisualPayloadField[] = []
    for (const fieldParticleId of closure.fieldParticleIds) {
      const stored = this.#fields.get(fieldParticleId)
      if (!stored) continue
      const aliases = this.#aliasesByVisualField.get(fieldParticleId) ?? []
      const sources = aliases
        .map((alias) => index.fieldByParticleId.get(alias.sourceFieldParticleId))
        .filter((field): field is BulkFieldParticle => field !== undefined)
      if (sources.length !== aliases.length) continue
      const fieldLabel = [...new Set(sources.map((f) => f.fieldLabel))]
        .join(" · ")
      // A marker standing for exactly one occurrence carries that occurrence's
      // Value. A merged marker's canonical Value is the merging strategy's own
      // decision, and under the only strategy that merges, a Value change is a
      // geometry change that never reaches this path.
      const single = sources.length === 1 ? sources[0]! : null
      const valueId = single ? single.valueId : stored.valueId
      const valueText = single ? single.valueText : stored.valueText
      if (
        stored.fieldLabel === fieldLabel &&
        stored.valueId === valueId &&
        stored.valueText === valueText
      ) continue
      fields.push(Object.freeze({...stored, fieldLabel, valueId, valueText}))
    }

    const orbitals: VisualPayloadOrbital[] = []
    for (const orbitalParticleId of closure.orbitalParticleIds) {
      const stored = this.#orbitals.get(orbitalParticleId)
      const particle = index.orbitalById.get(orbitalParticleId)
      if (!stored || !particle) continue
      const material = this.#orbitalMaterial(stored, particle, index)
      if (
        material === null ||
        (sameQuantum(stored.material, material) &&
          stored.active === particle.active &&
          stored.current === particle.current &&
          stored.label === particle.label)
      ) continue
      orbitals.push(Object.freeze({
        ...stored,
        active: particle.active,
        current: particle.current,
        label: particle.label,
        material,
      }))
    }

    const fieldProxies: VisualPayloadFieldProxy[] = []
    for (const fieldProxyId of closure.fieldProxyIds) {
      const stored = this.#fieldProxies.get(fieldProxyId)
      if (!stored) continue
      const material = this.#proxyMaterial(stored, index)
      if (material === null || sameQuantum(stored.material, material)) continue
      fieldProxies.push(Object.freeze({...stored, material}))
    }

    return Object.freeze({
      fieldProxies: frozenDelta([], [], fieldProxies),
      fields: frozenDelta([], [], fields),
      kind: "visual-delta-patch",
      orbitals: frozenDelta([], [], orbitals),
      relationBatches: this.#repaintRelationBatches(closure, index),
      tori: frozenDelta([], [], tori),
      transitionBatches: this.#repaintTransitionBatches(closure, index),
    })
  }

  #orbitalMaterial(
    stored: VisualPayloadOrbital,
    particle: BulkOrbitalParticle,
    index: ManifestIndex,
  ): VisualQuantumMaterial | null {
    // Colour is a pure function of kind and source identity, both of which are
    // declarations. Only the material moves when activity does.
    const color = stored.color
    if (stored.orbitalParticleKind === "state") {
      const current =
        index.currentStateIdByOwner.get(particle.parentDarkParticleId) ===
          particle.sourceId
      return visualStateTorusMaterial(color, current, particle.active)
    }
    const anchorId = particle.anchorStateOrbitalParticleId
    const anchor = anchorId === null ? undefined : index.orbitalById.get(anchorId)
    if (!anchor) return null
    return stored.orbitalParticleKind === "process" ||
        stored.orbitalParticleKind === "finally"
      ? visualProcessTorusMaterial(
        color,
        particle.current,
        particle.active,
        anchor.active,
      )
      : visualCausalMaterial(
        color,
        particle.current,
        particle.active,
        anchor.active,
      )
  }

  /**
   * Three laws produce Field proxies and two of them are spheres, so the form
   * alone cannot tell them apart — the Orbital named as the proxy's painter is
   * what distinguishes a Process projection from a Transition condition.
   */
  #proxyMaterial(
    stored: VisualPayloadFieldProxy,
    index: ManifestIndex,
  ): VisualQuantumMaterial | null {
    const state = index.orbitalById.get(stored.stateOrbitalParticleId)
    if (!state) return null
    const color = stored.color
    if (stored.paintOrbitalParticleId !== null) {
      const painter = index.orbitalById.get(stored.paintOrbitalParticleId)
      if (!painter) return null
      return visualFieldProxyMaterial(
        color,
        stored.form.kind,
        painter.active,
        state.active,
      )
    }
    if (stored.form.kind === "torus") {
      return visualFieldProxyMaterial(color, "torus", state.active, state.active)
    }
    const current =
      index.currentStateIdByOwner.get(state.parentDarkParticleId) ===
        state.sourceId
    return visualConditionFieldMaterial(color, current, state.active)
  }

  #repaintTransitionBatches(
    closure: VisualStoreClosure,
    index: ManifestIndex,
  ): VisualEntityDelta<VisualPayloadTransitionBatch> {
    const touched = closure.transitionBatchIds
      .map((id) => this.#transitionBatches.get(id))
      .filter((batch): batch is VisualPayloadTransitionBatch =>
        batch !== undefined
      )
    if (touched.length === 0) return EMPTY_DELTA
    const entries = touched.flatMap((batch) =>
      batch.paths.map((path) => {
        const active = index.transitionActiveById.get(path.channelId) ?? true
        return {
          material: visualTransitionMaterial(batch.returning, active),
          ownerDarkParticleId: batch.ownerDarkParticleId,
          path,
          returning: batch.returning,
        }
      })
    )
    const regrouped = regroup(entries, (entry) =>
      visualStateEdgeBatchId(
        entry.ownerDarkParticleId,
        entry.returning,
        entry.material,
      ))
    return this.#batchDelta(
      touched,
      regrouped.map((batch) =>
        Object.freeze({
          batchId: batch.batchId,
          fingerprint: batchFingerprint(batch),
          material: batch.material,
          ownerDarkParticleId: batch.ownerDarkParticleId,
          paths: batch.paths,
          returning: batch.returning,
        })
      ),
    )
  }

  #repaintRelationBatches(
    closure: VisualStoreClosure,
    index: ManifestIndex,
  ): VisualEntityDelta<VisualPayloadEdgeBatch> {
    const touched = closure.relationBatchIds
      .map((id) => this.#relationBatches.get(id))
      .filter((batch): batch is VisualPayloadEdgeBatch => batch !== undefined)
    if (touched.length === 0) return EMPTY_DELTA
    const entries: {
      material: VisualLineMaterial
      ownerDarkParticleId: number
      path: VisualPayloadEdgePath
      returning: boolean
    }[] = []
    for (const batch of touched) {
      for (const path of batch.paths) {
        const channel = index.relationById.get(path.channelId)
        if (!channel) return EMPTY_DELTA
        const branchActive = this.#relationBranchActive(channel, index)
        if (branchActive === null) return EMPTY_DELTA
        entries.push({
          material: visualRelationMaterial(
            freezeColor(visualRelationColor(channel)),
            channel.active,
            branchActive,
          ),
          ownerDarkParticleId: batch.ownerDarkParticleId,
          path,
          returning: false,
        })
      }
    }
    const regrouped = regroup(entries, (entry) =>
      visualRelationEdgeBatchId(entry.ownerDarkParticleId, entry.material))
    return this.#batchDelta(
      touched,
      regrouped.map((batch) =>
        Object.freeze({
          batchId: batch.batchId,
          fingerprint: batchFingerprint(batch),
          material: batch.material,
          ownerDarkParticleId: batch.ownerDarkParticleId,
          paths: batch.paths,
        })
      ),
    )
  }

  /**
   * Which State branch a relation is drawn against, so an inactive branch's
   * relations fade with it. A relation between two plain Fields belongs to no
   * branch and follows its own channel.
   */
  #relationBranchActive(
    channel: BulkRelationChannel,
    index: ManifestIndex,
  ): boolean | null {
    const branchOf = (
      kind: BulkRelationChannel["fromKind"],
      id: string,
    ): string | null => {
      if (kind === "field") return null
      if (kind === "field-proxy") {
        return this.#fieldProxies.get(id)?.stateOrbitalParticleId ?? null
      }
      const orbital = this.#orbitals.get(id)
      if (orbital?.anchorStateOrbitalParticleId) {
        return orbital.anchorStateOrbitalParticleId
      }
      return orbital?.orbitalParticleKind === "state" ? id : null
    }
    const branchId = branchOf(channel.fromKind, channel.fromId) ??
      branchOf(channel.toKind, channel.toId)
    if (branchId === null) return channel.active
    return index.orbitalById.get(branchId)?.active ?? null
  }

  /**
   * A repainted batch is a different batch: its identity carries its material,
   * because that is what decides which GPU line buffer draws it. Batches whose
   * geometry and paint both survived are absent from the delta entirely.
   */
  #batchDelta<Batch extends VisualPayloadEdgeBatch>(
    touched: readonly Batch[],
    rebuilt: readonly Batch[],
  ): VisualEntityDelta<Batch> {
    const before = indexBy(touched, (batch) => batch.batchId)
    const added: Batch[] = []
    const updated: Batch[] = []
    for (const batch of rebuilt) {
      const previous = before.get(batch.batchId)
      if (previous === undefined) added.push(batch)
      else if (previous.fingerprint !== batch.fingerprint) updated.push(batch)
    }
    const rebuiltIds = new Set(rebuilt.map((batch) => batch.batchId))
    const removed = touched
      .map((batch) => batch.batchId)
      .filter((id) => !rebuiltIds.has(id))
    return frozenDelta(added, removed, updated)
  }

  /** Swaps repainted entities into the payload without rebuilding the rest. */
  #commit(patch: VisualDeltaPatch): void {
    const swap = <Value>(
      current: readonly Value[],
      delta: VisualEntityDelta<Value>,
      identity: (value: Value) => string,
    ): readonly Value[] => {
      if (
        delta.added.length === 0 &&
        delta.removed.length === 0 &&
        delta.updated.length === 0
      ) return current
      const updated = indexBy(delta.updated, identity)
      const removed = new Set(delta.removed)
      return Object.freeze([
        ...current
          .filter((value) => !removed.has(identity(value)))
          .map((value) => updated.get(identity(value)) ?? value),
        ...delta.added,
      ])
    }

    this.#payload = Object.freeze({
      ...this.#payload,
      fieldProxies: swap(
        this.#payload.fieldProxies,
        patch.fieldProxies,
        (proxy) => proxy.fieldProxyId,
      ),
      fields: swap(
        this.#payload.fields,
        patch.fields,
        (field) => field.fieldParticleId,
      ),
      orbitals: swap(
        this.#payload.orbitals,
        patch.orbitals,
        (orbital) => orbital.orbitalParticleId,
      ),
      relationBatches: swap(
        this.#payload.relationBatches,
        patch.relationBatches,
        (batch) => batch.batchId,
      ),
      tori: swap(
        this.#payload.tori,
        patch.tori,
        (torus) => String(torus.darkParticleId),
      ),
      transitionBatches: swap(
        this.#payload.transitionBatches,
        patch.transitionBatches,
        (batch) => batch.batchId,
      ),
    })
    this.#reindex(this.#payload, false)
    this.#bumpRecords(patch)
  }

  #bumpRecords(patch: VisualDeltaPatch): void {
    const bump = (
      entityClass: VisualStoreEntityClass,
      delta: VisualEntityDelta<unknown>,
      identity: (value: never) => string,
    ): void => {
      for (const id of delta.removed) {
        this.#records.delete(`${entityClass}:${id}`)
      }
      for (const value of [...delta.added, ...delta.updated]) {
        const key = `${entityClass}:${identity(value as never)}`
        const record = this.#records.get(key)
        this.#records.set(key, Object.freeze({
          entityClass,
          generation: (record?.generation ?? 0) + 1,
          identity: identity(value as never),
        }))
      }
    }
    bump("torus", patch.tori, (t: VisualPayloadTorus) => String(t.darkParticleId))
    bump("field", patch.fields, (f: VisualPayloadField) => f.fieldParticleId)
    bump(
      "orbital",
      patch.orbitals,
      (o: VisualPayloadOrbital) => o.orbitalParticleId,
    )
    bump(
      "field-proxy",
      patch.fieldProxies,
      (p: VisualPayloadFieldProxy) => p.fieldProxyId,
    )
    bump(
      "transition-batch",
      patch.transitionBatches,
      (b: VisualPayloadEdgeBatch) => b.batchId,
    )
    bump(
      "relation-batch",
      patch.relationBatches,
      (b: VisualPayloadEdgeBatch) => b.batchId,
    )
  }

  #reindex(payload: VisualScenePayload, seedRecords: boolean): void {
    this.#tori = indexBy(payload.tori, (torus) => torus.darkParticleId)
    this.#fields = indexBy(payload.fields, (field) => field.fieldParticleId)
    this.#orbitals = indexBy(
      payload.orbitals,
      (orbital) => orbital.orbitalParticleId,
    )
    this.#fieldProxies = indexBy(
      payload.fieldProxies,
      (proxy) => proxy.fieldProxyId,
    )
    this.#transitionBatches = indexBy(
      payload.transitionBatches,
      (batch) => batch.batchId,
    )
    this.#relationBatches = indexBy(
      payload.relationBatches,
      (batch) => batch.batchId,
    )

    this.#aliasBySource = indexBy(
      payload.fieldAliases,
      (alias) => alias.sourceFieldParticleId,
    )
    this.#aliasesByVisualField = new Map()
    this.#visualFieldsBySourceOwner = new Map()
    for (const alias of payload.fieldAliases) {
      groupInto(this.#aliasesByVisualField, alias.visualFieldParticleId, alias)
      const owned = this.#visualFieldsBySourceOwner.get(
        alias.sourceParentDarkParticleId,
      ) ?? new Set<string>()
      owned.add(alias.visualFieldParticleId)
      this.#visualFieldsBySourceOwner.set(
        alias.sourceParentDarkParticleId,
        owned,
      )
    }

    this.#orbitalsByOwner = new Map()
    this.#sleeveOccurrences = new Map()
    for (const orbital of payload.orbitals) {
      groupInto(
        this.#orbitalsByOwner,
        orbital.ownerDarkParticleId,
        orbital.orbitalParticleId,
      )
      if (
        orbital.orbitalParticleKind === "state" &&
        orbital.sleeveRootStateId !== null
      ) {
        groupInto(
          this.#sleeveOccurrences,
          `${orbital.ownerDarkParticleId}:${orbital.sleeveRootStateId}`,
          orbital.orbitalParticleId,
        )
      }
    }

    this.#proxiesByOwner = new Map()
    this.#proxiesByVisualField = new Map()
    for (const proxy of payload.fieldProxies) {
      groupInto(
        this.#proxiesByOwner,
        proxy.ownerDarkParticleId,
        proxy.fieldProxyId,
      )
      groupInto(
        this.#proxiesByVisualField,
        proxy.visualFieldParticleId,
        proxy.fieldProxyId,
      )
    }

    this.#transitionBatchesByOwner = new Map()
    for (const batch of payload.transitionBatches) {
      groupInto(
        this.#transitionBatchesByOwner,
        batch.ownerDarkParticleId,
        batch.batchId,
      )
    }
    this.#relationBatchesByOwner = new Map()
    for (const batch of payload.relationBatches) {
      groupInto(
        this.#relationBatchesByOwner,
        batch.ownerDarkParticleId,
        batch.batchId,
      )
    }

    if (!seedRecords) return
    this.#records = new Map()
    const seed = (
      entityClass: VisualStoreEntityClass,
      identities: readonly string[],
    ): void => {
      for (const identity of identities) {
        this.#records.set(
          `${entityClass}:${identity}`,
          Object.freeze({entityClass, generation: 1, identity}),
        )
      }
    }
    seed("torus", payload.tori.map((t) => String(t.darkParticleId)))
    seed("field", payload.fields.map((f) => f.fieldParticleId))
    seed("orbital", payload.orbitals.map((o) => o.orbitalParticleId))
    seed("field-proxy", payload.fieldProxies.map((p) => p.fieldProxyId))
    seed("transition-batch", payload.transitionBatches.map((b) => b.batchId))
    seed("relation-batch", payload.relationBatches.map((b) => b.batchId))
  }
}

/**
 * Hydrates a Store from server-prepared visual state.
 *
 * The whole point of this entrypoint is what it does not do: it never resolves
 * or runs a placement law. A browser that reaches a first frame through here
 * leaves `visualLayoutBuiltScenes()` exactly where it found it, which is the
 * one honest way to prove the initial path did not lay the scene out again.
 */
export const hydrateVisualStore = (
  prepared: VisualPreparedScene,
  layout: VisualStoreLayoutReference,
): VisualStore => new VisualStore(prepared, layout)
