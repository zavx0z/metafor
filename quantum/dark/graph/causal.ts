/**
Causal snapshot and ref-based delta service for the public Graph.

Every newly assembled Graph is read inside an applied-through Force hold. The
service retains only a bounded disposable set of snapshots that it previously
issued. A missing base produces a new exact snapshot; it never falls back to a
path patch, Force-history guess or another canonical Store.

@packageDocumentation
*/

import type {CheckpointBarrierFrontier} from "../checkpoint/barrier.ts"
import {
  META_OBSERVATION_CONTRACT_VERSION,
  validateReadGraphDeltaRequest,
  type MetaGraphSnapshotIdentity,
  type ReadGraphDeltaReceipt,
} from "shared/protocol/metafor/observation"
import type {Graph} from "@metafor/types/metafor/graph"
import {
  DarkForceCausalReadError,
  type DarkForceTimeControl,
} from "../time-control.ts"
import {diffGraph, graphDigest} from "./delta.ts"

type Snapshot = {
  identity: MetaGraphSnapshotIdentity
  graph: Graph
}

type GraphReader = () => Promise<Graph>
type ExactFrontierReader = Pick<DarkForceTimeControl, "readAtExactFrontier">

const clone = <T>(value: T): T => structuredClone(value)

const identityKey = (identity: MetaGraphSnapshotIdentity): string =>
  [
    identity.root,
    identity.frontier.cutId,
    identity.frontier.throughSequence,
    identity.digest,
  ].join("\u0000")

const sameIdentity = (
  left: MetaGraphSnapshotIdentity,
  right: MetaGraphSnapshotIdentity,
): boolean => identityKey(left) === identityKey(right)

const identity = (
  graph: Graph,
  held: CheckpointBarrierFrontier,
): MetaGraphSnapshotIdentity => {
  if (
    held.phase !== "held" ||
    typeof held.cutId !== "string" ||
    !/^[A-Za-z0-9._-]+$/.test(held.cutId) ||
    !Number.isSafeInteger(held.acceptanceSequence) ||
    held.acceptanceSequence < 0
  ) {
    throw new Error("Causal Graph read did not receive a held applied-through frontier")
  }
  return {
    root: graph.root,
    frontier: {
      cutId: held.cutId,
      throughSequence: held.acceptanceSequence,
      retroactiveComplete: false,
    },
    digest: graphDigest(graph),
  }
}

/**
Owns only disposable cursors over exact Graph snapshots.

The cache is a transport optimization, not world state: eviction and restart
lead to `reason: "resync"` with another full exact Graph.

@example
```ts
const service = new CausalGraphReadService(timeControl, async () => graph)
const initial = await service.read({contractVersion: 1, base: null})
```
*/
export class CausalGraphReadService {
  readonly #snapshots = new Map<string, Snapshot>()

  /**
  @param exact - Existing Force time-control hold shared with pause and step.
  @param readGraph - Stateless assembly of the same complete Graph returned by `readGraph`.
  @param capacity - Maximum retained snapshots in `[1..64]`; eviction requires resync.
  @throws `RangeError` when `capacity` is outside the closed supported range.
  */
  constructor(
    private readonly exact: ExactFrontierReader,
    private readonly readGraph: GraphReader,
    private readonly capacity = 8,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 64) {
      throw new RangeError("Causal Graph snapshot cache capacity must be between 1 and 64")
    }
  }

  /**
  Returns an exact initial/resync snapshot or a verified delta from a retained base.

  @param input - Closed `ReadGraphDeltaRequest`; arbitrary roots and Graph bodies are rejected.
  @returns Exact Graph evidence, or `unknown` when the causal hold itself cannot be proven.
  @throws On invalid input, provider failure or an internal causal-time conflict.
  */
  async read(input: unknown): Promise<ReadGraphDeltaReceipt> {
    const validation = validateReadGraphDeltaRequest(input)
    if (!validation.ok) {
      throw new Error(
        validation.issues
          .map(({path, code, message}) => `${path || "/"} [${code}] ${message}`)
          .join("; "),
      )
    }

    let current: Snapshot
    try {
      current = await this.exact.readAtExactFrontier(async (held) => {
        const graph = await this.readGraph()
        return {identity: identity(graph, held), graph: clone(graph)}
      })
    } catch (error) {
      if (error instanceof DarkForceCausalReadError) {
        return {
          contractVersion: META_OBSERVATION_CONTRACT_VERSION,
          resolution: "unknown",
          kind: "unavailable",
          reason: error.code,
        }
      }
      throw error
    }

    const baseIdentity = validation.value.base
    const retained = baseIdentity === null
      ? null
      : sameIdentity(baseIdentity, current.identity)
        ? current
        : this.#snapshots.get(identityKey(baseIdentity)) ?? null
    if (
      retained !== null &&
      retained.identity.frontier.cutId === current.identity.frontier.cutId
    ) {
      const before = retained.identity.frontier.throughSequence
      const after = current.identity.frontier.throughSequence
      if (after < before) {
        throw new Error("Causal Graph frontier regressed inside one Force cut")
      }
      if (after === before && retained.identity.digest !== current.identity.digest) {
        throw new Error("Graph changed without advancing the causal Force frontier")
      }
    }
    const canDelta = retained !== null &&
      retained.identity.root === current.identity.root &&
      retained.identity.frontier.cutId === current.identity.frontier.cutId

    this.#remember(current)
    if (baseIdentity === null || !canDelta) {
      return {
        contractVersion: META_OBSERVATION_CONTRACT_VERSION,
        resolution: "exact",
        kind: "snapshot",
        reason: baseIdentity === null ? "initial" : "resync",
        snapshot: clone(current),
      }
    }

    const delta = diffGraph(retained.graph, current.graph)
    if (
      delta.baseDigest !== baseIdentity.digest ||
      delta.resultDigest !== current.identity.digest
    ) {
      throw new Error("Causal Graph delta does not match its exact snapshot identities")
    }
    return {
      contractVersion: META_OBSERVATION_CONTRACT_VERSION,
      resolution: "exact",
      kind: "delta",
      base: clone(baseIdentity),
      result: clone(current.identity),
      delta,
    }
  }

  #remember(snapshot: Snapshot): void {
    const key = identityKey(snapshot.identity)
    this.#snapshots.delete(key)
    this.#snapshots.set(key, clone(snapshot))
    while (this.#snapshots.size > this.capacity) {
      const oldest = this.#snapshots.keys().next().value
      if (typeof oldest !== "string") throw new Error("Causal Graph snapshot cache is inconsistent")
      this.#snapshots.delete(oldest)
    }
  }
}
