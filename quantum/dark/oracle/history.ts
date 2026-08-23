import {
  META_OBSERVATION_CONTRACT_VERSION,
  validateDarkForceHistoryReadRequest,
  type DarkForceHistoryPublicEntry,
  type DarkForceHistoryReadReceipt,
} from "shared/protocol/metafor/observation"
import type {DarkForceHistory} from "../force/history.ts"

type HistorySource = Pick<DarkForceHistory, "read" | "status">

const invalid = (issues: Array<{path: string; code: string; message: string}>): Error =>
  new Error(issues.map(({path, code, message}) => `${path || "/"} [${code}] ${message}`).join("; "))

const publicEntry = (
  entry: ReturnType<DarkForceHistory["read"]>[number],
): DarkForceHistoryPublicEntry => ({
  id: entry.id,
  sequence: entry.sequence,
  acceptedAt: entry.acceptedAt,
  particle: structuredClone(entry.particle),
  ...(entry.authoring === undefined ? {} : {authoring: structuredClone(entry.authoring)}),
})

/** Read-only projection over the existing Dark Force append-only history. */
export class DarkForceHistoryReadService {
  constructor(private readonly history: HistorySource) {}

  read(input: unknown): DarkForceHistoryReadReceipt {
    const validation = validateDarkForceHistoryReadRequest(input)
    if (!validation.ok) throw invalid(validation.issues)
    const status = this.history.status()
    const frontier = {
      cutId: status.cutId,
      throughSequence: status.sequence,
      retroactiveComplete: false as const,
    }
    if (validation.value.query.kind === "frontier") {
      return {
        contractVersion: META_OBSERVATION_CONTRACT_VERSION,
        resolution: "exact",
        frontier,
        range: null,
        entries: [],
      }
    }

    const query = validation.value.query
    if (query.cutId !== status.cutId) {
      throw new Error(`Dark Force history cut mismatch: expected ${status.cutId}, received ${query.cutId}`)
    }
    const requestedTo = query.toSequence ?? null
    const effectiveTo = Math.min(query.toSequence ?? status.sequence, status.sequence)
    const found = query.fromSequence > effectiveTo
      ? []
      : this.history.read({
          fromSequence: query.fromSequence,
          toSequence: effectiveTo,
          limit: query.limit + 1,
        })
    const truncated = found.length > query.limit
    const entries = found.slice(0, query.limit).map(publicEntry)
    const firstSequence = entries[0]?.sequence ?? null
    const lastSequence = entries.at(-1)?.sequence ?? null
    return {
      contractVersion: META_OBSERVATION_CONTRACT_VERSION,
      resolution: "exact",
      frontier,
      range: {
        requestedFromSequence: query.fromSequence,
        requestedToSequence: requestedTo,
        firstSequence,
        lastSequence,
        truncated,
        nextSequence: truncated && lastSequence !== null ? lastSequence + 1 : null,
      },
      entries,
    }
  }
}
