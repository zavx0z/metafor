/** Exact cold-publication proof through the existing Dark history Oracle, never a private journal read. @packageDocumentation */
import type {OracleRpcPeer} from "shared/transport/oracle"
import {DARK_FORCE_HISTORY_READ_METHOD, type MetaCausalFrontier, type DarkForceHistoryReadReceipt} from "shared/protocol/metafor/observation"
import {isReactionStateCommit, type ReactionStateCommit} from "shared/protocol/force/reaction"

/** Distinguishes already committed history from a pre-crash intent first committed during replay after the startup snapshot. */
export type MatrixStatePublicationProof = Readonly<{confirmedBeforeBirth: boolean}>
export async function proveMatrixStatePublication(peer: Pick<OracleRpcPeer, "call">, birth: MetaCausalFrontier, event: ReactionStateCommit): Promise<MatrixStatePublicationProof> {
  const receipt = await peer.call<DarkForceHistoryReadReceipt>("dark", DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1,
    query: {kind: "origin", cutId: birth.cutId, from: event.eventId, path: event.atomId, limit: 16}}, {waitMs: 10_000})
  if (receipt.contractVersion !== 1 || receipt.resolution !== "exact" || receipt.frontier.cutId !== birth.cutId ||
      !receipt.range || receipt.range.truncated || !Array.isArray(receipt.entries) || receipt.entries.length > 16) throw new Error("Matrix recovery requires a complete exact same-cut Photon origin proof")
  const publications = receipt.entries.filter(entry => entry.particle.by === "matrix")
  const confirmations = receipt.entries.filter(entry => entry.particle.by === "boundary")
  if (publications.length !== 1 || confirmations.length === 0 || publications.length + confirmations.length !== receipt.entries.length) throw new Error("Matrix recovery Photon origin is missing or ambiguous")
  const publication = publications[0]!
  const source = publication.particle
  if (publication.sequence > birth.throughSequence || source.part !== "photon" || !["replace", "test"].includes(source.op) ||
      source.from !== event.eventId || source.path !== event.atomId || source.value !== event.state) throw new Error("Matrix recovery does not prove the exact pre-birth publication")
  let confirmedBeforeBirth = false
  for (const entry of receipt.entries) {
    if (!Number.isSafeInteger(entry.sequence) || entry.sequence <= 0 || entry.sequence > receipt.frontier.throughSequence || entry.id !== `${birth.cutId}:${entry.sequence}`) throw new Error("Matrix recovery history identity is invalid")
  }
  for (const entry of confirmations) {
    const part = entry.particle
    if (entry.sequence <= publication.sequence || part.part !== "photon" || part.op !== "copy" || part.from !== event.eventId || part.path !== event.atomId || part.ts !== source.ts ||
        !isReactionStateCommit(part.value) || part.value.eventId !== event.eventId || part.value.atomId !== event.atomId || part.value.wimp !== event.wimp || part.value.stateId !== event.stateId || part.value.state !== event.state) {
      throw new Error("Matrix recovery Boundary confirmation conflicts with the exact publication")
    }
    if (entry.sequence <= birth.throughSequence) confirmedBeforeBirth = true
  }
  return {confirmedBeforeBirth}
}
