import {
  HAMILTONIAN_LIFECYCLE_CHANNEL,
  publishHamiltonianEarlyChannel,
  subscribeHamiltonianEarlyChannel,
} from "./monitor.js"

export {HAMILTONIAN_LIFECYCLE_CHANNEL}
export const HAMILTONIAN_LIFECYCLE_KIND = "hamiltonian-lifecycle"
export const HAMILTONIAN_LIFECYCLE_VERSION = 1
export const HAMILTONIAN_LIFECYCLE_SNAPSHOT_KIND = "hamiltonian-lifecycle-snapshot"
export const HAMILTONIAN_LIFECYCLE_SNAPSHOT_VERSION = 1
export const HAMILTONIAN_NODE_SYSTEM_DECLARATION_KIND = "hamiltonian-node-system-declaration"
export const HAMILTONIAN_NODE_SYSTEM_DECLARATION_VERSION = 1

const SINGLETON = Symbol.for("metafor.hamiltonian.lifecycle.singleton.v1")
const MAX_PENDING_OBSERVATIONS = 1024
const MAX_RECENT_EVENT_IDENTITIES = 1024
const MAX_RETIRED_SOURCE_IDENTITIES = 512
const MAX_RETIRED_ENTITY_IDENTITIES = 2048
const MAX_SNAPSHOT_ENVELOPES = 1024
const MAX_SNAPSHOT_SOURCES = 512
const ENVELOPE_FIELDS = Object.freeze([
  "at",
  "causedBy",
  "eventId",
  "kind",
  "observation",
  "sequence",
  "sourceId",
  "sourceIncarnation",
  "sourceKind",
  "sourceStartedAt",
  "version",
])
const OBSERVATION_FIELDS = Object.freeze([
  "attributes",
  "messageClass",
  "messageId",
  "ownerId",
  "phase",
  "sourceEntityId",
  "subjectId",
  "subjectKind",
  "targetEntityId",
  "transportId",
  "type",
])
const SNAPSHOT_FIELDS = Object.freeze([
  "at",
  "envelopes",
  "frontier",
  "kind",
  "revision",
  "scopeId",
  "snapshotId",
  "version",
])
const NODE_SYSTEM_DECLARATION_FIELDS = Object.freeze([
  "boundaryTransports",
  "incarnation",
  "incarnationStartedAt",
  "kind",
  "logicalContourId",
  "revision",
  "rootId",
  "snapshot",
  "version",
])
const NODE_SYSTEM_BOUNDARY_TRANSPORT_FIELDS = Object.freeze([
  "attributes",
  "kind",
  "owner",
  "phase",
  "source",
  "target",
  "transportId",
])
const NODE_SYSTEM_ENTITY_REFERENCE_FIELDS = Object.freeze([
  "entityId",
  "incarnation",
  "logicalContourId",
])
const FRONTIER_FIELDS = Object.freeze(["sequence", "sourceId", "sourceIncarnation"])
const ENTITY_PHASES = new Set(["born", "changed", "ended"])
const TRANSPORT_PHASES = new Set(["opening", "opened", "changed", "closed"])
const MESSAGE_PHASES = new Set(["sent", "received"])
const FORBIDDEN_ATTRIBUTE_KEYS = new Set([
  "authorityKey",
  "candidate",
  "controlResumeNonce",
  "particle",
  "payload",
  "resumeNonce",
  "rpc",
  "sdp",
  "signal",
  "token",
])

/**
 * @typedef {Readonly<{
 *   type: "entity" | "transport" | "message",
 *   phase: "born" | "changed" | "ended" | "opening" | "opened" | "closed" | "sent" | "received",
 *   subjectId: string,
 *   subjectKind: string,
 *   ownerId: string | null,
 *   sourceEntityId: string | null,
 *   targetEntityId: string | null,
 *   transportId: string | null,
 *   messageId: string | null,
 *   messageClass: string | null,
 *   attributes: Readonly<Record<string, string | number | boolean | null>>,
 * }>} HamiltonianLifecycleObservation
 */

/**
 * @typedef {Readonly<{
 *   kind: "hamiltonian-lifecycle",
 *   version: 1,
 *   sourceId: string,
 *   sourceKind: string,
 *   sourceIncarnation: string,
 *   sourceStartedAt: number,
 *   sequence: number,
 *   eventId: string,
 *   at: number,
 *   causedBy: string | null,
 *   observation: HamiltonianLifecycleObservation,
 * }>} HamiltonianLifecycleEnvelope
 */

/**
 * @typedef {Readonly<{
 *   sourceId: string,
 *   sourceIncarnation: string,
 *   expectedSequence: number,
 *   receivedSequence: number,
 *   missingFrom: number,
 *   missingTo: number,
 * }>} HamiltonianLifecycleGap
 */

/**
 * @typedef {{
 *   source: HamiltonianLifecycleSource,
 *   subscribers: Set<(envelope: HamiltonianLifecycleEnvelope) => unknown>,
 *   backlog: HamiltonianLifecycleEnvelope[],
 *   retainedKeys: Set<string>,
 *   retainedOrder: string[],
 *   snapshotSubscribers: Set<(snapshot: HamiltonianLifecycleSnapshot) => unknown>,
 *   snapshots: Map<string, HamiltonianLifecycleSnapshot>,
 *   declarationRegistry: HamiltonianNodeSystemDeclarationRegistry,
 *   declarationSubscribers: Set<(declaration: HamiltonianNodeSystemDeclaration) => unknown>,
 *   unsubscribe: () => unknown,
 * }} HamiltonianLifecycleState
 */

/**
 * @typedef {Readonly<{
 *   sourceId: string,
 *   sourceIncarnation: string,
 *   sequence: number,
 * }>} HamiltonianLifecycleFrontierEntry
 */

/**
 * @typedef {Readonly<{
 *   kind: "hamiltonian-lifecycle-snapshot",
 *   version: 1,
 *   snapshotId: string,
 *   scopeId: string,
 *   revision: number,
 *   at: number,
 *   frontier: readonly HamiltonianLifecycleFrontierEntry[],
 *   envelopes: readonly HamiltonianLifecycleEnvelope[],
 * }>} HamiltonianLifecycleSnapshot
 */

/**
 * @typedef {Readonly<{
 *   kind: "hamiltonian-node-system-declaration",
 *   version: 1,
 *   logicalContourId: string,
 *   incarnation: string,
 *   incarnationStartedAt: number,
 *   revision: number,
 *   rootId: string,
 *   snapshot: HamiltonianLifecycleSnapshot,
 *   boundaryTransports: readonly HamiltonianNodeSystemBoundaryTransport[],
 * }>} HamiltonianNodeSystemDeclaration
 */

/**
 * @typedef {Readonly<{
 *   logicalContourId: string,
 *   incarnation: string,
 *   entityId: string,
 * }>} HamiltonianNodeSystemEntityReference
 */

/**
 * @typedef {Readonly<{
 *   transportId: string,
 *   kind: string,
 *   phase: "opening" | "opened" | "changed" | "closed",
 *   owner: HamiltonianNodeSystemEntityReference,
 *   source: HamiltonianNodeSystemEntityReference,
 *   target: HamiltonianNodeSystemEntityReference,
 *   attributes: Readonly<Record<string, string | number | boolean | null>>,
 * }>} HamiltonianNodeSystemBoundaryTransport
 */

/**
 * Retains one current declaration per stable logical contour. Incarnations
 * converge by their monotonic start point; revisions advance only inside the
 * accepted incarnation. Equal start points are rejected because wall-clock
 * order alone cannot prove which incarnation supersedes the other. Accept is
 * one aggregation transaction: replacement also reconciles every other
 * current declaration whose boundary referenced the superseded incarnation.
 */
export class HamiltonianNodeSystemDeclarationRegistry {
  /** @type {Map<string, HamiltonianNodeSystemDeclaration>} */
  #declarations = new Map()

  /**
   * @param {unknown} value
   * @returns {{
   *   declaration: HamiltonianNodeSystemDeclaration,
   *   previous: HamiltonianNodeSystemDeclaration | null,
   *   reconciled: readonly Readonly<{
   *     declaration: HamiltonianNodeSystemDeclaration,
   *     previous: HamiltonianNodeSystemDeclaration,
   *   }>[],
   * } | null}
   */
  accept(value) {
    if (!isHamiltonianNodeSystemDeclaration(value)) return null
    const declaration = value
    const previous = this.#declarations.get(declaration.logicalContourId) ?? null
    if (previous !== null) {
      if (declaration.incarnation === previous.incarnation) {
        if (
          declaration.incarnationStartedAt !== previous.incarnationStartedAt ||
          declaration.revision <= previous.revision ||
          !frontierDominates(declaration.snapshot.frontier, previous.snapshot.frontier)
        ) return null
      } else {
        if (declaration.incarnationStartedAt <= previous.incarnationStartedAt) return null
      }
    }
    const declarations = new Map(this.#declarations)
    declarations.set(declaration.logicalContourId, declaration)
    if (!declaration.boundaryTransports.every((transport) =>
      (transport.source.logicalContourId === declaration.logicalContourId ||
        transport.target.logicalContourId === declaration.logicalContourId) &&
      boundaryTransportReferencesCurrentDeclarations(transport, declarations))) return null
    /** @type {Array<Readonly<{
     *   declaration: HamiltonianNodeSystemDeclaration,
     *   previous: HamiltonianNodeSystemDeclaration,
     * }>>} */
    const reconciled = []
    for (const [logicalContourId, retained] of declarations) {
      if (logicalContourId === declaration.logicalContourId) continue
      const boundaryTransports = retained.boundaryTransports.filter((transport) =>
        boundaryTransportReferencesCurrentDeclarations(transport, declarations))
      if (boundaryTransports.length === retained.boundaryTransports.length) continue
      const next = createHamiltonianNodeSystemDeclaration({...retained, boundaryTransports})
      declarations.set(logicalContourId, next)
      reconciled.push(Object.freeze({declaration: next, previous: retained}))
    }
    this.#declarations = declarations
    return Object.freeze({declaration, previous, reconciled: Object.freeze(reconciled)})
  }

  /** @param {string} logicalContourId */
  current(logicalContourId) {
    return this.#declarations.get(logicalContourId) ?? null
  }

  values() {
    return this.#declarations.values()
  }
}

export class HamiltonianLifecycleSource {
  /** @type {Readonly<{id: string, kind: string, incarnation: string, startedAt: number}>} */
  #source
  #sequence = 0

  /** @param {{id: string, kind: string, incarnation: string, startedAt?: number}} source */
  constructor(source) {
    const normalized = Object.freeze({
      id: source.id,
      kind: source.kind,
      incarnation: source.incarnation,
      startedAt: source.startedAt ?? Date.now(),
    })
    if (!validSource(normalized)) throw new Error("invalid Hamiltonian lifecycle source")
    this.#source = normalized
  }

  /**
   * @param {HamiltonianLifecycleObservation} observation
   * @param {{at?: number, causedBy?: string | null}} [context]
   */
  next(observation, context = {}) {
    return createHamiltonianLifecycleEnvelope({
      sourceId: this.#source.id,
      sourceKind: this.#source.kind,
      sourceIncarnation: this.#source.incarnation,
      sourceStartedAt: this.#source.startedAt,
      sequence: this.#sequence += 1,
      at: context.at ?? Date.now(),
      causedBy: context.causedBy ?? null,
      observation,
    })
  }
}

export class HamiltonianLifecycleCursor {
  /** @type {Map<string, number>} */
  #sequences = new Map()
  /** @type {Set<string>} */
  #retired = new Set()
  /** @type {string[]} */
  #retiredOrder = []
  #retiredCapacity

  /** @param {{retiredSourceCapacity?: number}} [options] */
  constructor(options = {}) {
    const requested = Math.floor(options.retiredSourceCapacity ?? MAX_RETIRED_SOURCE_IDENTITIES)
    this.#retiredCapacity = Number.isFinite(requested)
      ? Math.max(1, requested)
      : MAX_RETIRED_SOURCE_IDENTITIES
  }

  /**
   * @param {unknown} value
   * @returns {{envelope: HamiltonianLifecycleEnvelope, gap: HamiltonianLifecycleGap | null} | null}
   */
  accept(value) {
    if (!isHamiltonianLifecycleEnvelope(value)) return null
    const key = `${value.sourceId}\u0000${value.sourceIncarnation}`
    if (this.#retired.has(key)) return null
    const previous = this.#sequences.get(key) ?? 0
    if (value.sequence <= previous) return null
    const expectedSequence = previous + 1
    const gap = value.sequence === expectedSequence ? null : Object.freeze({
      sourceId: value.sourceId,
      sourceIncarnation: value.sourceIncarnation,
      expectedSequence,
      receivedSequence: value.sequence,
      missingFrom: expectedSequence,
      missingTo: value.sequence - 1,
    })
    this.#sequences.set(key, value.sequence)
    return {envelope: value, gap}
  }

  /** @param {readonly HamiltonianLifecycleFrontierEntry[]} frontier */
  seed(frontier) {
    for (const entry of frontier) {
      if (!isHamiltonianLifecycleFrontierEntry(entry)) continue
      const key = `${entry.sourceId}\u0000${entry.sourceIncarnation}`
      if (this.#retired.has(key)) continue
      const previous = this.#sequences.get(key) ?? 0
      if (entry.sequence > previous) this.#sequences.set(key, entry.sequence)
    }
  }

  snapshot() {
    return Object.fromEntries(this.#sequences)
  }

  /** @param {string} sourceId @param {string} sourceIncarnation */
  retire(sourceId, sourceIncarnation) {
    if (!validId(sourceId, 256) || !validId(sourceIncarnation, 256)) return false
    const key = `${sourceId}\u0000${sourceIncarnation}`
    const hadSequence = this.#sequences.delete(key)
    if (this.#retired.has(key)) return hadSequence
    this.#retired.add(key)
    this.#retiredOrder.push(key)
    if (this.#retiredOrder.length > this.#retiredCapacity) {
      const removed = this.#retiredOrder.splice(0, this.#retiredOrder.length - this.#retiredCapacity)
      for (const retiredKey of removed) this.#retired.delete(retiredKey)
    }
    return true
  }

  get activeSourceCount() {
    return this.#sequences.size
  }

  get retiredSourceCount() {
    return this.#retired.size
  }
}

export class HamiltonianLifecycleRetainedJournal {
  #scopeId
  #revision = 0
  /** @type {Map<string, HamiltonianLifecycleEnvelope>} */
  #entities = new Map()
  /** @type {Map<string, HamiltonianLifecycleEnvelope>} */
  #transports = new Map()
  /** @type {Map<string, string>} */
  #transportSlots = new Map()
  /** @type {Map<string, HamiltonianLifecycleFrontierEntry>} */
  #frontier = new Map()
  /** @type {Set<string>} */
  #retiredEntities = new Set()
  /** @type {string[]} */
  #retiredEntityOrder = []

  /** @param {string} scopeId @param {{initialRevision?: number}} [options] */
  constructor(scopeId, options = {}) {
    if (!validId(scopeId, 512)) throw new Error("invalid Hamiltonian lifecycle journal scope")
    const initialRevision = options.initialRevision ?? 0
    if (!Number.isSafeInteger(initialRevision) || initialRevision < 0) {
      throw new Error("invalid Hamiltonian lifecycle initial revision")
    }
    this.#scopeId = scopeId
    this.#revision = initialRevision
  }

  /** @param {unknown} value */
  observe(value) {
    if (!isHamiltonianLifecycleEnvelope(value)) return false
    const envelope = value
    const sourceKey = `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`
    const previous = this.#frontier.get(sourceKey)
    if (previous && envelope.sequence <= previous.sequence) return false
    this.#frontier.set(sourceKey, Object.freeze({
      sourceId: envelope.sourceId,
      sourceIncarnation: envelope.sourceIncarnation,
      sequence: envelope.sequence,
    }))
    this.#revision += 1
    const observation = envelope.observation
    if (observation.type === "entity") {
      if (observation.phase === "ended") {
        this.#deleteEntityTree(observation.subjectId)
      } else if (
        this.#retiredEntities.has(observation.subjectId) ||
        (observation.ownerId !== null && this.#retiredEntities.has(observation.ownerId))
      ) {
        this.#deleteEntityTree(observation.subjectId)
      } else {
        this.#entities.set(observation.subjectId, envelope)
      }
    } else if (observation.type === "transport") {
      this.#setTransport(envelope)
    }
    return true
  }

  /**
   * Merges an authoritative retained snapshot for only the source frontiers
   * carried by that snapshot. This lets one relay journal aggregate several
   * independently owned realms without replacing unrelated sources.
   *
   * @param {unknown} value
   */
  merge(value) {
    if (!isHamiltonianLifecycleSnapshot(value)) return false
    const authoritative = new Set()
    for (const entry of value.frontier) {
      const key = `${entry.sourceId}\u0000${entry.sourceIncarnation}`
      const previous = this.#frontier.get(key)
      if (previous === undefined || entry.sequence > previous.sequence) authoritative.add(key)
    }
    if (authoritative.size === 0) return false

    const retainedEntities = new Set()
    const retainedTransports = new Set()
    for (const envelope of value.envelopes) {
      const sourceKey = `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`
      if (!authoritative.has(sourceKey)) continue
      if (envelope.observation.type === "entity") retainedEntities.add(envelope.observation.subjectId)
      if (envelope.observation.type === "transport") retainedTransports.add(envelope.observation.subjectId)
    }
    for (const [entityId, envelope] of [...this.#entities]) {
      const sourceKey = `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`
      if (authoritative.has(sourceKey) && !retainedEntities.has(entityId)) this.#deleteEntityTree(entityId)
    }
    for (const [transportId, envelope] of [...this.#transports]) {
      const sourceKey = `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`
      if (authoritative.has(sourceKey) && !retainedTransports.has(transportId)) this.#deleteTransport(transportId)
    }

    for (const envelope of value.envelopes) {
      const sourceKey = `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`
      if (!authoritative.has(sourceKey) || envelope.observation.type !== "entity") continue
      const observation = envelope.observation
      if (
        this.#retiredEntities.has(observation.subjectId) ||
        (observation.ownerId !== null && this.#retiredEntities.has(observation.ownerId))
      ) {
        this.#deleteEntityTree(observation.subjectId)
      } else {
        this.#entities.set(observation.subjectId, envelope)
      }
    }
    this.#pruneRetiredOwnership()
    for (const envelope of value.envelopes) {
      const sourceKey = `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`
      if (authoritative.has(sourceKey) && envelope.observation.type === "transport") {
        this.#setTransport(envelope)
      }
    }
    for (const entry of value.frontier) {
      const key = `${entry.sourceId}\u0000${entry.sourceIncarnation}`
      if (authoritative.has(key)) this.#frontier.set(key, entry)
    }
    this.#revision += 1
    return true
  }

  /** @param {unknown} value */
  replace(value) {
    if (!isHamiltonianLifecycleSnapshot(value) || value.scopeId !== this.#scopeId) return false
    if (value.revision < this.#revision) return false
    this.#revision = value.revision
    this.#entities.clear()
    this.#transports.clear()
    this.#transportSlots.clear()
    this.#frontier.clear()
    for (const entry of value.frontier) {
      this.#frontier.set(`${entry.sourceId}\u0000${entry.sourceIncarnation}`, entry)
    }
    for (const envelope of value.envelopes) {
      const observation = envelope.observation
      if (observation.type === "entity" && !this.#retiredEntities.has(observation.subjectId)) {
        this.#entities.set(observation.subjectId, envelope)
      }
    }
    this.#pruneRetiredOwnership()
    for (const envelope of value.envelopes) {
      if (envelope.observation.type === "transport") this.#setTransport(envelope)
    }
    return true
  }

  snapshot() {
    if (this.#entities.size + this.#transports.size > MAX_SNAPSHOT_ENVELOPES) {
      throw new Error("Hamiltonian lifecycle snapshot structural capacity exceeded")
    }
    if (this.#frontier.size > MAX_SNAPSHOT_SOURCES) {
      throw new Error("Hamiltonian lifecycle snapshot source capacity exceeded")
    }
    const envelopes = [...this.#entities.values(), ...this.#transports.values()]
      .sort((left, right) => {
        const leftType = left.observation.type === "entity" ? 0 : 1
        const rightType = right.observation.type === "entity" ? 0 : 1
        return leftType - rightType || left.at - right.at || left.sequence - right.sequence
      })
    const frontier = [...this.#frontier.values()]
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.sourceIncarnation.localeCompare(right.sourceIncarnation))
    const snapshot = {
      kind: HAMILTONIAN_LIFECYCLE_SNAPSHOT_KIND,
      version: HAMILTONIAN_LIFECYCLE_SNAPSHOT_VERSION,
      snapshotId: hamiltonianLifecycleSnapshotId(this.#scopeId, this.#revision),
      scopeId: this.#scopeId,
      revision: this.#revision,
      at: Date.now(),
      frontier,
      envelopes,
    }
    if (!isHamiltonianLifecycleSnapshot(snapshot)) {
      throw new Error("invalid Hamiltonian lifecycle snapshot")
    }
    return /** @type {HamiltonianLifecycleSnapshot} */ (deepFreezeSnapshot(snapshot))
  }

  /**
   * Removes an entity and every retained transport attached to it after an
   * external owner has supplied the actual terminal lifecycle observation.
   * The observation itself keeps its original source identity and is relayed
   * separately; this journal only materializes the resulting current state.
   *
   * @param {string} entityId
   */
  retireEntity(entityId) {
    if (!validId(entityId, 512)) return false
    const changed = this.#deleteEntityTree(entityId)
    if (changed) this.#revision += 1
    return changed
  }

  /**
   * Forgets a currently unreachable ownership subtree without declaring its
   * logical identity terminal. A later authoritative observation may
   * materialize the same stable owner again (for example after reopening a
   * browser profile whose local storage survived). This is intentionally
   * distinct from retireEntity(), which fences the ended identity against
   * stale resurrection.
   *
   * @param {string} entityId
   */
  forgetEntityTree(entityId) {
    if (!validId(entityId, 512)) return false
    const changed = this.#deleteEntityTree(entityId, false)
    if (changed) this.#revision += 1
    return changed
  }

  /**
   * Retained ownership is structural: an owned runtime object cannot outlive
   * the entity that contains it. Remove the whole ownership subtree before
   * considering transports, otherwise a surviving cross-runtime transport can
   * make an orphaned child visible as a false root.
   *
   * @param {string} entityId
   */
  #deleteEntityTree(entityId, retainAsRetired = true) {
    const removed = new Set([entityId])
    let expanded = true
    while (expanded) {
      expanded = false
      for (const envelope of this.#entities.values()) {
        const observation = envelope.observation
        if (
          observation.type !== "entity" ||
          removed.has(observation.subjectId) ||
          observation.ownerId === null ||
          !removed.has(observation.ownerId)
        ) continue
        removed.add(observation.subjectId)
        expanded = true
      }
    }

    let changed = false
    for (const removedId of removed) {
      if (retainAsRetired) this.#retainRetiredEntity(removedId)
      if (this.#entities.delete(removedId)) changed = true
    }
    for (const [transportId, transportEnvelope] of [...this.#transports]) {
      const transport = transportEnvelope.observation
      if (
        (transport.ownerId !== null && removed.has(transport.ownerId)) ||
        (transport.sourceEntityId !== null && removed.has(transport.sourceEntityId)) ||
        (transport.targetEntityId !== null && removed.has(transport.targetEntityId))
      ) {
        this.#deleteTransport(transportId)
        changed = true
      }
    }
    return changed
  }

  /** @param {HamiltonianLifecycleEnvelope} envelope */
  #setTransport(envelope) {
    const observation = envelope.observation
    if (
      (observation.ownerId !== null && this.#retiredEntities.has(observation.ownerId)) ||
      (observation.sourceEntityId !== null && this.#retiredEntities.has(observation.sourceEntityId)) ||
      (observation.targetEntityId !== null && this.#retiredEntities.has(observation.targetEntityId))
    ) return
    const slot = hamiltonianLifecycleTransportSlot(observation)
    if (slot === null) return
    const previousTransportId = this.#transportSlots.get(slot)
    if (previousTransportId && previousTransportId !== observation.subjectId) {
      this.#deleteTransport(previousTransportId)
    }
    this.#transportSlots.set(slot, observation.subjectId)
    this.#transports.set(observation.subjectId, envelope)
  }

  /** @param {string} entityId */
  #retainRetiredEntity(entityId) {
    if (this.#retiredEntities.has(entityId)) return
    this.#retiredEntities.add(entityId)
    this.#retiredEntityOrder.push(entityId)
    if (this.#retiredEntityOrder.length <= MAX_RETIRED_ENTITY_IDENTITIES) return
    const expired = this.#retiredEntityOrder.splice(
      0,
      this.#retiredEntityOrder.length - MAX_RETIRED_ENTITY_IDENTITIES,
    )
    for (const expiredId of expired) this.#retiredEntities.delete(expiredId)
  }

  #pruneRetiredOwnership() {
    const removed = new Set(this.#retiredEntities)
    let expanded = true
    while (expanded) {
      expanded = false
      for (const envelope of this.#entities.values()) {
        const observation = envelope.observation
        if (
          removed.has(observation.subjectId) ||
          observation.ownerId === null ||
          !removed.has(observation.ownerId)
        ) continue
        removed.add(observation.subjectId)
        expanded = true
      }
    }
    for (const removedId of removed) {
      if (!this.#entities.delete(removedId)) continue
      this.#retainRetiredEntity(removedId)
    }
  }

  /** @param {string} transportId */
  #deleteTransport(transportId) {
    const envelope = this.#transports.get(transportId)
    if (envelope) {
      const slot = hamiltonianLifecycleTransportSlot(envelope.observation)
      if (slot !== null && this.#transportSlots.get(slot) === transportId) {
        this.#transportSlots.delete(slot)
      }
    }
    this.#transports.delete(transportId)
  }
}

/**
 * @param {object} input
 * @param {string} input.sourceId
 * @param {string} input.sourceKind
 * @param {string} input.sourceIncarnation
 * @param {number} input.sourceStartedAt
 * @param {number} input.sequence
 * @param {number} input.at
 * @param {string | null} [input.causedBy]
 * @param {HamiltonianLifecycleObservation} input.observation
 */
export function createHamiltonianLifecycleEnvelope(input) {
  const eventId = hamiltonianLifecycleEventId(input.sourceIncarnation, input.sequence)
  const envelope = {
    kind: HAMILTONIAN_LIFECYCLE_KIND,
    version: HAMILTONIAN_LIFECYCLE_VERSION,
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
    sourceIncarnation: input.sourceIncarnation,
    sourceStartedAt: input.sourceStartedAt,
    sequence: input.sequence,
    eventId,
    at: input.at,
    causedBy: input.causedBy ?? null,
    observation: freezeObservation(input.observation),
  }
  if (!isHamiltonianLifecycleEnvelope(envelope)) {
    throw new Error("invalid Hamiltonian lifecycle envelope")
  }
  return /** @type {HamiltonianLifecycleEnvelope} */ (Object.freeze(envelope))
}

/** @param {string} sourceIncarnation @param {number} sequence */
export function hamiltonianLifecycleEventId(sourceIncarnation, sequence) {
  return `event:${encodeURIComponent(sourceIncarnation)}:${sequence}`
}

/** @param {string} scopeId @param {number} revision */
export function hamiltonianLifecycleSnapshotId(scopeId, revision) {
  return `snapshot:${encodeURIComponent(scopeId)}:${revision}`
}

/** @param {string} kind @param {string} incarnation */
export function hamiltonianLifecycleEntityId(kind, incarnation) {
  return `${kind}:${encodeURIComponent(incarnation || "unknown")}`
}

/** @param {string} kind @param {string} incarnation */
export function hamiltonianLifecycleTransportId(kind, incarnation) {
  return `${kind}:${encodeURIComponent(incarnation || "unknown")}`
}

/** @param {string} incarnation */
export function hamiltonianLifecycleMessageId(incarnation) {
  return `message:${encodeURIComponent(incarnation || "unknown")}`
}

/** @param {string} sessionEpoch @param {"server" | "browser"} endpoint */
export function hamiltonianRtcPeerEntityId(sessionEpoch, endpoint) {
  return hamiltonianLifecycleEntityId("rtc-peer", `${sessionEpoch}:${endpoint}`)
}

/** @param {string} sessionEpoch @param {"oracle" | "force"} lane */
export function hamiltonianDataChannelTransportId(sessionEpoch, lane) {
  return hamiltonianLifecycleTransportId("data-channel", `${sessionEpoch}:${lane}`)
}

/**
 * One slot is one current logical transport between the same runtime endpoints.
 * DataChannels additionally have two simultaneous lanes, Oracle and Force.
 * A new incarnation replaces the previous incarnation in the same slot while
 * the latest closed incarnation remains retained as current terminal state.
 *
 * @param {HamiltonianLifecycleObservation} observation
 */
export function hamiltonianLifecycleTransportSlot(observation) {
  if (observation.type !== "transport") return null
  const lane = observation.subjectKind === "data-channel"
    ? String(observation.attributes.lane ?? "")
    : ""
  return JSON.stringify([
    observation.subjectKind,
    observation.sourceEntityId,
    observation.targetEntityId,
    lane,
  ])
}

/**
 * @param {object} input
 * @param {"entity" | "transport" | "message"} input.type
 * @param {HamiltonianLifecycleObservation["phase"]} input.phase
 * @param {string} input.subjectId
 * @param {string} input.subjectKind
 * @param {string | null} [input.ownerId]
 * @param {string | null} [input.sourceEntityId]
 * @param {string | null} [input.targetEntityId]
 * @param {string | null} [input.transportId]
 * @param {string | null} [input.messageId]
 * @param {string | null} [input.messageClass]
 * @param {Record<string, string | number | boolean | null>} [input.attributes]
 * @returns {HamiltonianLifecycleObservation}
 */
export function createHamiltonianLifecycleObservation(input) {
  const observation = {
    type: input.type,
    phase: input.phase,
    subjectId: input.subjectId,
    subjectKind: input.subjectKind,
    ownerId: input.ownerId ?? null,
    sourceEntityId: input.sourceEntityId ?? null,
    targetEntityId: input.targetEntityId ?? null,
    transportId: input.transportId ?? null,
    messageId: input.messageId ?? null,
    messageClass: input.messageClass ?? null,
    attributes: {...(input.attributes ?? {})},
  }
  if (!isHamiltonianLifecycleObservation(observation)) {
    throw new Error("invalid Hamiltonian lifecycle observation")
  }
  return freezeObservation(observation)
}

/** @param {unknown} value @returns {value is HamiltonianLifecycleEnvelope} */
export function isHamiltonianLifecycleEnvelope(value) {
  if (!plainObject(value) || !hasExactFields(value, ENVELOPE_FIELDS)) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  return record.kind === HAMILTONIAN_LIFECYCLE_KIND &&
    record.version === HAMILTONIAN_LIFECYCLE_VERSION &&
    validId(record.sourceId, 256) &&
    validKind(record.sourceKind) &&
    validId(record.sourceIncarnation, 256) &&
    Number.isSafeInteger(record.sourceStartedAt) && Number(record.sourceStartedAt) >= 0 &&
    Number.isSafeInteger(record.sequence) && Number(record.sequence) > 0 &&
    record.eventId === hamiltonianLifecycleEventId(String(record.sourceIncarnation), Number(record.sequence)) &&
    Number.isSafeInteger(record.at) && Number(record.at) >= 0 &&
    (record.causedBy === null || validId(record.causedBy, 512)) &&
    isHamiltonianLifecycleObservation(record.observation)
}

/** @param {unknown} value @returns {value is HamiltonianLifecycleSnapshot} */
export function isHamiltonianLifecycleSnapshot(value) {
  if (!plainObject(value) || !hasExactFields(value, SNAPSHOT_FIELDS)) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  if (
    record.kind !== HAMILTONIAN_LIFECYCLE_SNAPSHOT_KIND ||
    record.version !== HAMILTONIAN_LIFECYCLE_SNAPSHOT_VERSION ||
    !validId(record.scopeId, 512) ||
    !Number.isSafeInteger(record.revision) || Number(record.revision) < 0 ||
    record.snapshotId !== hamiltonianLifecycleSnapshotId(String(record.scopeId), Number(record.revision)) ||
    !Number.isSafeInteger(record.at) || Number(record.at) < 0 ||
    !Array.isArray(record.frontier) || record.frontier.length > MAX_SNAPSHOT_SOURCES ||
    !record.frontier.every(isHamiltonianLifecycleFrontierEntry) ||
    !Array.isArray(record.envelopes) || record.envelopes.length > MAX_SNAPSHOT_ENVELOPES ||
    !record.envelopes.every(isHamiltonianLifecycleEnvelope)
  ) return false
  const frontierEntries = /** @type {HamiltonianLifecycleFrontierEntry[]} */ (record.frontier)
  const snapshotEnvelopes = /** @type {HamiltonianLifecycleEnvelope[]} */ (record.envelopes)
  const frontierKeys = new Set()
  for (const entry of frontierEntries) {
    const key = `${entry.sourceId}\u0000${entry.sourceIncarnation}`
    if (frontierKeys.has(key)) return false
    frontierKeys.add(key)
  }
  const retainedSubjects = new Set()
  const retainedTransportSlots = new Set()
  return snapshotEnvelopes.every((envelope) => {
    const observation = envelope.observation
    if (
      observation.type === "message" ||
      (observation.type === "entity" && observation.phase === "ended")
    ) return false
    const retainedKey = `${observation.type}\u0000${observation.subjectId}`
    if (retainedSubjects.has(retainedKey)) return false
    retainedSubjects.add(retainedKey)
    if (observation.type === "transport") {
      const slot = hamiltonianLifecycleTransportSlot(observation)
      if (slot === null || retainedTransportSlots.has(slot)) return false
      retainedTransportSlots.add(slot)
    }
    const frontier = frontierEntries.find((entry) =>
      entry.sourceId === envelope.sourceId && entry.sourceIncarnation === envelope.sourceIncarnation)
    return Boolean(frontier && envelope.sequence <= frontier.sequence)
  })
}

/**
 * A contour declaration is the validated replacement boundary above retained
 * lifecycle snapshots. The snapshot scope is the incarnation and its exact
 * ownership-closed root; logicalContourId is the stable registry key.
 *
 * @param {unknown} value
 * @returns {value is HamiltonianNodeSystemDeclaration}
 */
export function isHamiltonianNodeSystemDeclaration(value) {
  if (!plainObject(value) || !hasExactFields(value, NODE_SYSTEM_DECLARATION_FIELDS)) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  if (
    record.kind !== HAMILTONIAN_NODE_SYSTEM_DECLARATION_KIND ||
    record.version !== HAMILTONIAN_NODE_SYSTEM_DECLARATION_VERSION ||
    !validId(record.logicalContourId, 512) ||
    !validId(record.incarnation, 256) ||
    !Number.isSafeInteger(record.incarnationStartedAt) || Number(record.incarnationStartedAt) < 0 ||
    !Number.isSafeInteger(record.revision) || Number(record.revision) <= 0 ||
    !validId(record.rootId, 512) ||
    !isHamiltonianLifecycleSnapshot(record.snapshot) ||
    !Array.isArray(record.boundaryTransports) ||
    record.boundaryTransports.length > MAX_SNAPSHOT_ENVELOPES ||
    !record.boundaryTransports.every(isHamiltonianNodeSystemBoundaryTransport)
  ) return false
  const snapshot = /** @type {HamiltonianLifecycleSnapshot} */ (record.snapshot)
  const boundaryTransportIds = new Set()
  const boundaryTransportSlots = new Set()
  for (const transport of /** @type {HamiltonianNodeSystemBoundaryTransport[]} */ (record.boundaryTransports)) {
    if (boundaryTransportIds.has(transport.transportId)) return false
    boundaryTransportIds.add(transport.transportId)
    const slot = JSON.stringify([
      transport.kind,
      transport.source.entityId,
      transport.target.entityId,
      transport.kind === "data-channel" ? String(transport.attributes.lane ?? "") : "",
    ])
    if (boundaryTransportSlots.has(slot)) return false
    boundaryTransportSlots.add(slot)
  }
  return snapshot.revision > 0 &&
    snapshot.frontier.some((entry) => entry.sourceIncarnation === record.incarnation) &&
    isHamiltonianLifecycleOwnershipClosed(snapshot, [String(record.rootId)])
}

/**
 * @param {object} input
 * @param {string} input.logicalContourId
 * @param {string} input.incarnation
 * @param {number} input.incarnationStartedAt
 * @param {number} input.revision
 * @param {string} input.rootId
 * @param {HamiltonianLifecycleSnapshot} input.snapshot
 * @param {readonly HamiltonianNodeSystemBoundaryTransport[]} [input.boundaryTransports]
 * @returns {HamiltonianNodeSystemDeclaration}
 */
export function createHamiltonianNodeSystemDeclaration(input) {
  const boundaryTransports = (input.boundaryTransports ?? []).map(freezeBoundaryTransport)
  const declaration = {
    kind: HAMILTONIAN_NODE_SYSTEM_DECLARATION_KIND,
    version: HAMILTONIAN_NODE_SYSTEM_DECLARATION_VERSION,
    logicalContourId: input.logicalContourId,
    incarnation: input.incarnation,
    incarnationStartedAt: input.incarnationStartedAt,
    revision: input.revision,
    rootId: input.rootId,
    snapshot: input.snapshot,
    boundaryTransports: Object.freeze(boundaryTransports),
  }
  if (!isHamiltonianNodeSystemDeclaration(declaration)) {
    throw new Error("invalid Hamiltonian node-system declaration")
  }
  return /** @type {HamiltonianNodeSystemDeclaration} */ (Object.freeze(declaration))
}

/**
 * @param {unknown} value
 * @returns {value is HamiltonianNodeSystemBoundaryTransport}
 */
export function isHamiltonianNodeSystemBoundaryTransport(value) {
  if (!plainObject(value) || !hasExactFields(value, NODE_SYSTEM_BOUNDARY_TRANSPORT_FIELDS)) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  return validId(record.transportId, 512) &&
    validKind(record.kind) &&
    typeof record.phase === "string" && TRANSPORT_PHASES.has(record.phase) &&
    isHamiltonianNodeSystemEntityReference(record.owner) &&
    isHamiltonianNodeSystemEntityReference(record.source) &&
    isHamiltonianNodeSystemEntityReference(record.target) &&
    validAttributes(record.attributes)
}

/** @param {unknown} value @returns {value is HamiltonianNodeSystemEntityReference} */
function isHamiltonianNodeSystemEntityReference(value) {
  if (!plainObject(value) || !hasExactFields(value, NODE_SYSTEM_ENTITY_REFERENCE_FIELDS)) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  return validId(record.logicalContourId, 512) &&
    validId(record.incarnation, 256) &&
    validId(record.entityId, 512)
}

/**
 * A boundary record never imports a foreign ownership subtree. It only becomes
 * current when both exact endpoint declarations are already current and each
 * referenced entity exists in its own ownership-closed snapshot.
 *
 * @param {HamiltonianNodeSystemBoundaryTransport} transport
 * @param {ReadonlyMap<string, HamiltonianNodeSystemDeclaration>} declarations
 */
function boundaryTransportReferencesCurrentDeclarations(transport, declarations) {
  const references = [transport.owner, transport.source, transport.target]
  if (transport.source.logicalContourId === transport.target.logicalContourId) return false
  if (
    transport.owner.logicalContourId !== transport.source.logicalContourId &&
    transport.owner.logicalContourId !== transport.target.logicalContourId
  ) return false
  return references.every((reference) => {
    const declaration = declarations.get(reference.logicalContourId)
    return declaration?.incarnation === reference.incarnation &&
      declaration.snapshot.envelopes.some(({observation}) =>
        observation.type === "entity" && observation.subjectId === reference.entityId)
  })
}

/**
 * @param {readonly HamiltonianLifecycleFrontierEntry[]} next
 * @param {readonly HamiltonianLifecycleFrontierEntry[]} previous
 */
function frontierDominates(next, previous) {
  const bySource = new Map(next.map((entry) => [
    `${entry.sourceId}\u0000${entry.sourceIncarnation}`,
    entry.sequence,
  ]))
  return previous.every((entry) =>
    (bySource.get(`${entry.sourceId}\u0000${entry.sourceIncarnation}`) ?? 0) >= entry.sequence)
}

/** @param {HamiltonianNodeSystemBoundaryTransport} transport */
function freezeBoundaryTransport(transport) {
  return Object.freeze({
    ...transport,
    owner: Object.freeze({...transport.owner}),
    source: Object.freeze({...transport.source}),
    target: Object.freeze({...transport.target}),
    attributes: Object.freeze({...transport.attributes}),
  })
}

/** @param {string} kind @param {string} identity */
export function hamiltonianLogicalContourId(kind, identity) {
  if (!validKind(kind) || !validId(identity, 256)) {
    throw new Error("invalid Hamiltonian logical contour identity")
  }
  return `${kind}:${encodeURIComponent(identity)}`
}

/**
 * A retained scope may cross a realm boundary only when every retained entity
 * has an explicit owner chain ending at one of the declared roots. Every
 * retained transport owner and endpoint must also exist in the snapshot, and
 * all three chains must end at the same declared root. Consumers must never
 * infer a missing parent from entity kind, transport endpoints, or observation
 * order.
 *
 * @param {unknown} value
 * @param {readonly string[]} rootIds
 * @returns {value is HamiltonianLifecycleSnapshot}
 */
export function isHamiltonianLifecycleOwnershipClosed(value, rootIds) {
  if (
    !isHamiltonianLifecycleSnapshot(value) ||
    !Array.isArray(rootIds) ||
    rootIds.length === 0 ||
    rootIds.some((rootId) => !validId(rootId, 512))
  ) return false
  const roots = new Set(rootIds)
  if (roots.size !== rootIds.length) return false
  /** @type {Map<string, HamiltonianLifecycleObservation>} */
  const entities = new Map()
  for (const envelope of value.envelopes) {
    const observation = envelope.observation
    if (observation.type === "entity") entities.set(observation.subjectId, observation)
  }
  for (const rootId of roots) {
    const root = entities.get(rootId)
    if (!root || (root.ownerId !== null && root.ownerId !== rootId)) return false
  }
  /** @type {Map<string, string>} */
  const resolvedRoots = new Map()
  /**
   * @param {string} entityId
   * @returns {string | null}
   */
  const resolveRoot = (entityId) => {
    const cached = resolvedRoots.get(entityId)
    if (cached !== undefined) return cached
    /** @type {string[]} */
    const path = []
    const visited = new Set()
    let currentId = entityId
    let rootId = null
    while (rootId === null) {
      const cachedRoot = resolvedRoots.get(currentId)
      if (cachedRoot !== undefined) {
        rootId = cachedRoot
        break
      }
      if (roots.has(currentId)) {
        rootId = currentId
        break
      }
      if (visited.has(currentId)) return null
      visited.add(currentId)
      path.push(currentId)
      const current = entities.get(currentId)
      if (!current || current.ownerId === null || current.ownerId === currentId) return null
      currentId = current.ownerId
    }
    for (const pathId of path) resolvedRoots.set(pathId, rootId)
    resolvedRoots.set(entityId, rootId)
    return rootId
  }
  for (const entityId of entities.keys()) {
    if (resolveRoot(entityId) === null) return false
  }
  for (const envelope of value.envelopes) {
    const transport = envelope.observation
    if (transport.type !== "transport") continue
    if (
      transport.ownerId === null ||
      transport.sourceEntityId === null ||
      transport.targetEntityId === null
    ) return false
    const ownerRoot = resolveRoot(transport.ownerId)
    if (
      ownerRoot === null ||
      resolveRoot(transport.sourceEntityId) !== ownerRoot ||
      resolveRoot(transport.targetEntityId) !== ownerRoot
    ) return false
  }
  return true
}

/**
 * Projects a full local retained journal onto declared ownership roots before
 * it crosses a realm boundary. Entities outside those roots and transports
 * attached to an external endpoint are deliberately omitted; the receiving
 * owner must observe its side of a cross-scope transport independently.
 *
 * @param {unknown} value
 * @param {readonly string[]} rootIds
 * @returns {HamiltonianLifecycleSnapshot | null}
 */
export function projectHamiltonianLifecycleOwnershipScope(value, rootIds) {
  if (
    !isHamiltonianLifecycleSnapshot(value) ||
    !Array.isArray(rootIds) ||
    rootIds.length === 0 ||
    rootIds.some((rootId) => !validId(rootId, 512))
  ) return null
  const roots = new Set(rootIds)
  if (roots.size !== rootIds.length) return null
  /** @type {Map<string, HamiltonianLifecycleObservation>} */
  const entities = new Map()
  for (const envelope of value.envelopes) {
    const observation = envelope.observation
    if (observation.type === "entity") entities.set(observation.subjectId, observation)
  }
  for (const rootId of roots) {
    const root = entities.get(rootId)
    if (!root || (root.ownerId !== null && root.ownerId !== rootId)) return null
  }
  /** @type {Map<string, string | null>} */
  const resolvedRoots = new Map()
  /**
   * @param {string} entityId
   * @returns {string | null}
   */
  const resolveTopOwner = (entityId) => {
    if (resolvedRoots.has(entityId)) return resolvedRoots.get(entityId) ?? null
    /** @type {string[]} */
    const path = []
    const visited = new Set()
    let currentId = entityId
    let topOwner = null
    while (topOwner === null) {
      if (resolvedRoots.has(currentId)) {
        topOwner = resolvedRoots.get(currentId) ?? null
        break
      }
      if (visited.has(currentId)) break
      visited.add(currentId)
      path.push(currentId)
      const current = entities.get(currentId)
      if (!current) break
      if (current.ownerId === null || current.ownerId === currentId) {
        topOwner = currentId
        break
      }
      currentId = current.ownerId
    }
    for (const pathId of path) resolvedRoots.set(pathId, topOwner)
    return topOwner
  }
  const includedEntityIds = new Set(
    [...entities.keys()].filter((entityId) => {
      const rootId = resolveTopOwner(entityId)
      return rootId !== null && roots.has(rootId)
    }),
  )
  const envelopes = value.envelopes.filter((envelope) => {
    const observation = envelope.observation
    if (observation.type === "entity") return includedEntityIds.has(observation.subjectId)
    if (observation.type !== "transport") return false
    if (
      observation.ownerId === null ||
      observation.sourceEntityId === null ||
      observation.targetEntityId === null ||
      !includedEntityIds.has(observation.ownerId) ||
      !includedEntityIds.has(observation.sourceEntityId) ||
      !includedEntityIds.has(observation.targetEntityId)
    ) return false
    const rootId = resolveTopOwner(observation.ownerId)
    return rootId !== null &&
      resolveTopOwner(observation.sourceEntityId) === rootId &&
      resolveTopOwner(observation.targetEntityId) === rootId
  })
  const projected = {...value, envelopes}
  if (!isHamiltonianLifecycleOwnershipClosed(projected, rootIds)) return null
  return /** @type {HamiltonianLifecycleSnapshot} */ (deepFreezeSnapshot(projected))
}

/**
 * @param {unknown} value
 * @param {string} sourceId
 * @param {string} sourceKind
 * @param {string} sourceIncarnation
 * @returns {value is HamiltonianLifecycleEnvelope}
 */
export function isHamiltonianLifecycleEnvelopeFromSource(value, sourceId, sourceKind, sourceIncarnation) {
  return isHamiltonianLifecycleEnvelope(value) &&
    value.sourceId === sourceId &&
    value.sourceKind === sourceKind &&
    value.sourceIncarnation === sourceIncarnation
}

/**
 * @param {unknown} value
 * @param {string} scopeId
 * @param {string} sourceId
 * @param {string} sourceKind
 * @param {string} sourceIncarnation
 * @returns {value is HamiltonianLifecycleSnapshot}
 */
export function isHamiltonianLifecycleSnapshotFromSource(
  value,
  scopeId,
  sourceId,
  sourceKind,
  sourceIncarnation,
) {
  if (!isHamiltonianLifecycleSnapshot(value) || value.scopeId !== scopeId || value.frontier.length !== 1) return false
  const frontier = value.frontier[0]
  if (!frontier) return false
  return frontier.sourceId === sourceId &&
    frontier.sourceIncarnation === sourceIncarnation &&
    value.envelopes.every((envelope) =>
      isHamiltonianLifecycleEnvelopeFromSource(envelope, sourceId, sourceKind, sourceIncarnation))
}

/** @param {unknown} value @returns {value is HamiltonianLifecycleFrontierEntry} */
export function isHamiltonianLifecycleFrontierEntry(value) {
  if (!plainObject(value) || !hasExactFields(value, FRONTIER_FIELDS)) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  return validId(record.sourceId, 256) &&
    validId(record.sourceIncarnation, 256) &&
    Number.isSafeInteger(record.sequence) && Number(record.sequence) > 0
}

/** @param {unknown} value @returns {value is HamiltonianLifecycleObservation} */
export function isHamiltonianLifecycleObservation(value) {
  if (!plainObject(value) || !hasExactFields(value, OBSERVATION_FIELDS)) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  if (!validObservationPhase(record.type, record.phase)) return false
  if (!validId(record.subjectId, 512) || !validKind(record.subjectKind)) return false
  if (!nullableId(record.ownerId) || !nullableId(record.sourceEntityId) || !nullableId(record.targetEntityId)) return false
  if (!nullableId(record.transportId) || !nullableId(record.messageId)) return false
  if (!(record.messageClass === null || validMessageClass(record.messageClass))) return false
  if (!validAttributes(record.attributes)) return false
  if (record.type === "entity") {
    return record.transportId === null && record.messageId === null && record.messageClass === null
  }
  if (record.type === "transport") {
    return record.transportId === record.subjectId &&
      typeof record.ownerId === "string" &&
      typeof record.sourceEntityId === "string" &&
      typeof record.targetEntityId === "string" &&
      record.messageId === null && record.messageClass === null
  }
  return record.type === "message" &&
    record.subjectId === record.messageId &&
    typeof record.ownerId === "string" &&
    typeof record.sourceEntityId === "string" &&
    typeof record.targetEntityId === "string" &&
    typeof record.transportId === "string" &&
    typeof record.messageId === "string" &&
    typeof record.messageClass === "string"
}

/** @param {HamiltonianLifecycleObservation} observation @param {{at?: number, causedBy?: string | null}} [context] */
export function emitHamiltonianLifecycle(observation, context = {}) {
  const state = lifecycleState()
  const envelope = state.source.next(observation, context)
  publish(state, envelope, true)
  return envelope
}

/** @param {unknown} value */
export function publishHamiltonianLifecycleEnvelope(value) {
  if (!isHamiltonianLifecycleEnvelope(value)) return false
  publish(lifecycleState(), value, true)
  return true
}

/** @param {unknown} value */
export function receiveHamiltonianLifecycleEnvelope(value) {
  if (!isHamiltonianLifecycleEnvelope(value)) return false
  publish(lifecycleState(), value, false)
  return true
}

/** @param {unknown} value */
export function publishHamiltonianLifecycleSnapshot(value) {
  if (!isHamiltonianLifecycleSnapshot(value)) return false
  publishSnapshot(lifecycleState(), value, true)
  return true
}

/** @param {unknown} value */
export function publishHamiltonianNodeSystemDeclaration(value) {
  if (!isHamiltonianNodeSystemDeclaration(value)) return false
  publishDeclaration(lifecycleState(), value, true)
  return true
}

/** @param {unknown} value */
export function receiveHamiltonianNodeSystemDeclaration(value) {
  if (!isHamiltonianNodeSystemDeclaration(value)) return false
  publishDeclaration(lifecycleState(), value, false)
  return true
}

/** @param {unknown} value */
export function receiveHamiltonianLifecycleSnapshot(value) {
  if (!isHamiltonianLifecycleSnapshot(value)) return false
  publishSnapshot(lifecycleState(), value, false)
  return true
}

/** @param {(envelope: HamiltonianLifecycleEnvelope) => unknown} handler */
export function subscribeHamiltonianLifecycle(handler) {
  const state = lifecycleState()
  state.subscribers.add(handler)
  const pending = state.backlog.splice(0)
  for (const envelope of pending) handler(envelope)
  return () => state.subscribers.delete(handler)
}

/** @param {(snapshot: HamiltonianLifecycleSnapshot) => unknown} handler */
export function subscribeHamiltonianLifecycleSnapshot(handler) {
  const state = lifecycleState()
  state.snapshotSubscribers.add(handler)
  for (const snapshot of state.snapshots.values()) handler(snapshot)
  return () => state.snapshotSubscribers.delete(handler)
}

/** @param {(declaration: HamiltonianNodeSystemDeclaration) => unknown} handler */
export function subscribeHamiltonianNodeSystemDeclaration(handler) {
  const state = lifecycleState()
  state.declarationSubscribers.add(handler)
  for (const declaration of state.declarationRegistry.values()) handler(declaration)
  return () => state.declarationSubscribers.delete(handler)
}

/** @returns {HamiltonianLifecycleState} */
function lifecycleState() {
  const global = /** @type {any} */ (globalThis)
  if (global[SINGLETON]) return /** @type {HamiltonianLifecycleState} */ (global[SINGLETON])
  const realm = global[Symbol.for("metafor.hamiltonian.monitor.bootstrap.v1")]?.realm ?? {
    incarnation: randomId(),
    kind: "unknown",
    startedAt: Date.now(),
  }
  const source = new HamiltonianLifecycleSource({
    id: `${realm.kind}:${realm.incarnation}`,
    kind: realm.kind,
    incarnation: realm.incarnation,
    startedAt: realm.startedAt,
  })
  /** @type {Set<(envelope: HamiltonianLifecycleEnvelope) => unknown>} */
  const subscribers = new Set()
  /** @type {Set<(snapshot: HamiltonianLifecycleSnapshot) => unknown>} */
  const snapshotSubscribers = new Set()
  /** @type {HamiltonianLifecycleEnvelope[]} */
  const backlog = []
  /** @type {Set<string>} */
  const retainedKeys = new Set()
  /** @type {string[]} */
  const retainedOrder = []
  /** @type {Map<string, HamiltonianLifecycleSnapshot>} */
  const snapshots = new Map()
  const declarationRegistry = new HamiltonianNodeSystemDeclarationRegistry()
  /** @type {Set<(declaration: HamiltonianNodeSystemDeclaration) => unknown>} */
  const declarationSubscribers = new Set()
  /** @type {HamiltonianLifecycleState} */
  const state = {
    source,
    subscribers,
    backlog,
    retainedKeys,
    retainedOrder,
    snapshotSubscribers,
    snapshots,
    declarationRegistry,
    declarationSubscribers,
    unsubscribe: () => {},
  }
  state.unsubscribe = subscribeHamiltonianEarlyChannel(HAMILTONIAN_LIFECYCLE_CHANNEL, (value) => {
    if (isHamiltonianLifecycleEnvelope(value)) publish(state, value, false)
    else if (isHamiltonianLifecycleSnapshot(value)) publishSnapshot(state, value, false)
    else if (isHamiltonianNodeSystemDeclaration(value)) publishDeclaration(state, value, false)
  })
  global[SINGLETON] = state
  return state
}

/** @param {HamiltonianLifecycleState} state @param {HamiltonianLifecycleSnapshot} snapshot @param {boolean} broadcast */
function publishSnapshot(state, snapshot, broadcast) {
  const previous = state.snapshots.get(snapshot.scopeId)
  const isNewer = previous === undefined || snapshot.revision > previous.revision
  const retained = isNewer ? snapshot : previous
  if (isNewer) {
    state.snapshots.set(snapshot.scopeId, snapshot)
    for (const subscriber of state.snapshotSubscribers) subscriber(snapshot)
  }
  if (broadcast) publishHamiltonianEarlyChannel(HAMILTONIAN_LIFECYCLE_CHANNEL, retained)
}

/**
 * @param {HamiltonianLifecycleState} state
 * @param {HamiltonianNodeSystemDeclaration} declaration
 * @param {boolean} broadcast
 */
function publishDeclaration(state, declaration, broadcast) {
  const accepted = state.declarationRegistry.accept(declaration)
  const retained = accepted?.declaration ?? state.declarationRegistry.current(declaration.logicalContourId)
  if (accepted) {
    for (const subscriber of state.declarationSubscribers) subscriber(accepted.declaration)
  }
  if (broadcast && retained) publishHamiltonianEarlyChannel(HAMILTONIAN_LIFECYCLE_CHANNEL, retained)
}

/** @param {HamiltonianLifecycleState} state @param {HamiltonianLifecycleEnvelope} envelope @param {boolean} broadcast */
function publish(state, envelope, broadcast) {
  const retainedKey = `${envelope.sourceId}\u0000${envelope.eventId}`
  if (state.retainedKeys.has(retainedKey)) return
  state.retainedKeys.add(retainedKey)
  state.retainedOrder.push(retainedKey)
  if (state.retainedOrder.length > MAX_RECENT_EVENT_IDENTITIES) {
    const removed = state.retainedOrder.splice(0, state.retainedOrder.length - MAX_RECENT_EVENT_IDENTITIES)
    for (const key of removed) state.retainedKeys.delete(key)
  }
  if (state.subscribers.size === 0) {
    state.backlog.push(envelope)
    if (state.backlog.length > MAX_PENDING_OBSERVATIONS) {
      state.backlog.splice(0, state.backlog.length - MAX_PENDING_OBSERVATIONS)
    }
  }
  if (envelope.observation.type === "entity" && envelope.observation.phase === "ended") {
    state.snapshots.delete(envelope.observation.subjectId)
  }
  for (const subscriber of state.subscribers) subscriber(envelope)
  if (broadcast) publishHamiltonianEarlyChannel(HAMILTONIAN_LIFECYCLE_CHANNEL, envelope)
}

/** @param {HamiltonianLifecycleObservation} observation */
function freezeObservation(observation) {
  return Object.freeze({...observation, attributes: Object.freeze({...observation.attributes})})
}

/** @param {HamiltonianLifecycleSnapshot} snapshot */
function deepFreezeSnapshot(snapshot) {
  return Object.freeze({
    ...snapshot,
    frontier: Object.freeze(snapshot.frontier.map((entry) => Object.freeze({...entry}))),
    envelopes: Object.freeze([...snapshot.envelopes]),
  })
}

/** @param {unknown} value */
function validSource(value) {
  if (!plainObject(value)) return false
  const record = /** @type {Record<string, unknown>} */ (value)
  return validId(record.id, 256) && validKind(record.kind) && validId(record.incarnation, 256) &&
    Number.isSafeInteger(record.startedAt) && Number(record.startedAt) >= 0
}

/** @param {unknown} type @param {unknown} phase */
function validObservationPhase(type, phase) {
  if (typeof phase !== "string") return false
  if (type === "entity") return ENTITY_PHASES.has(phase)
  if (type === "transport") return TRANSPORT_PHASES.has(phase)
  if (type === "message") return MESSAGE_PHASES.has(phase)
  return false
}

/** @param {unknown} value */
function validAttributes(value) {
  if (!plainObject(value)) return false
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value))
  if (entries.length > 24) return false
  return entries.every(([key, child]) =>
    /^[a-z][A-Za-z0-9]{0,63}$/.test(key) &&
    !FORBIDDEN_ATTRIBUTE_KEYS.has(key) &&
    (child === null || typeof child === "boolean" ||
      (typeof child === "number" && Number.isFinite(child)) ||
      (typeof child === "string" && child.length <= 256)))
}

/** @param {unknown} value @param {readonly string[]} fields */
function hasExactFields(value, fields) {
  return Object.keys(/** @type {Record<string, unknown>} */ (value)).sort().join("\u0000") === [...fields].sort().join("\u0000")
}

/** @param {unknown} value */
function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

/** @param {unknown} value */
function nullableId(value) {
  return value === null || validId(value, 512)
}

/** @param {unknown} value @param {number} max */
function validId(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max
}

/** @param {unknown} value */
function validKind(value) {
  return typeof value === "string" && /^[a-z][a-z0-9.-]{0,63}$/.test(value)
}

/** @param {unknown} value */
function validMessageClass(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value)
}

function randomId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}:${Math.random().toString(36).slice(2)}`
  }
}

lifecycleState()
