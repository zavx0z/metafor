import {existsSync, lstatSync, readFileSync, writeFileSync, openSync, fsyncSync, closeSync, unlinkSync} from "node:fs"
import {dirname, join, resolve} from "node:path"
import {DarkForceHistory} from "../force/history"
import {particleDestinations, type ForceOrigin} from "../force/route"
import {forceParticipants, type ForceDomain} from "../force/store"
import {CheckpointAppliedThroughBarrier} from "./barrier"
import type {CheckpointDeliveryReceipt} from "./barrier"
import type {Particle} from "shared/protocol/force/particle"
import {readCheckpointControlState, persistCheckpointControlState} from "./control"

export interface CheckpointTailRecoveryInput {
  filename: string
  historyDirectory: string
  participants: readonly ForceDomain[]
  operationId: string
  expectedCutId: string
  expectedControlSequence: number
  expectedHistorySequence: number
  /** Обязателен при apply; fingerprint получен отдельным dry-run. */
  expectedControlSha256?: string
}
export interface CheckpointTailRecoveryProof {
  schema: "metafor/checkpoint-control-tail-recovery-proof/v1"
  operationId: string
  cutId: string
  beforeSequence: number
  afterSequence: number
  predecessorSha256: string
  resultSha256: string
  tail: {id: string; sequence: number; part: Particle["part"]; op: Particle["op"]; by: ForceOrigin; path: Particle["path"]; sha256: string}
  deliveries: CheckpointDeliveryReceipt[]
  appliedUnchanged: boolean
  historyUnchanged: boolean
  boundaryUnchanged: boolean
  backupPath: string
  receiptPath: string
  outgoing: Array<{domain: ForceDomain; before: number; after: number}>
  mode: "dry-run" | "apply"
  replayed: boolean
}
const sha256 = (bytes: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
const bytes = (value: unknown) => JSON.stringify(value, null, 2) + "\n"

/**
 * Явное native восстановление единственного crash gap между durable history
 * acceptance и receipt persistence. Caller заранее останавливает exact contour.
 * Dry-run не пишет даже производный history catalog. Apply сверяет predecessor
 * hash, сохраняет immutable before-receipt и добавляет только неприменённые
 * deliveries плюс source ordinal. Constructor guard остаётся строгим; обычный
 * Force recovery затем доставляет исходную Particle без нового acceptance.
 * Проверки: [tail recovery](./control-recovery.spec.ts).
 */
export function recoverCheckpointControlTail(input: CheckpointTailRecoveryInput, mode: "dry-run" | "apply" = "dry-run"): CheckpointTailRecoveryProof {
  if (mode !== "dry-run" && mode !== "apply") throw new Error("Invalid checkpoint recovery mode")
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.operationId)) throw new Error("Invalid checkpoint recovery operation identity")
  const filename = resolve(input.filename), participants = forceParticipants(input.participants)
  const stat = lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size > 16 * 1024 * 1024) throw new Error("Checkpoint recovery requires a private regular control file")
  const predecessor = readFileSync(filename)
  const predecessorSha256 = sha256(predecessor)
  const current = readCheckpointControlState(filename, participants)
  const history = new DarkForceHistory(resolve(input.historyDirectory), undefined, {readOnly: true})
  const status = history.status()
  if (current.barrier.cutId !== input.expectedCutId || status.cutId !== input.expectedCutId || status.sequence !== input.expectedHistorySequence) throw new Error("Checkpoint recovery cut or history frontier changed")
  const receiptPath = join(dirname(filename), `recovery-${input.operationId}.json`)
  const backupPath = join(dirname(filename), `recovery-${input.operationId}.before.json`)
  if (existsSync(receiptPath)) {
    const retained = JSON.parse(readFileSync(receiptPath, "utf8"))
    if (retained.schema !== "metafor/checkpoint-control-tail-recovery/v1" || retained.operationId !== input.operationId
      || retained.cutId !== input.expectedCutId || retained.beforeSequence !== input.expectedControlSequence || retained.afterSequence !== input.expectedHistorySequence
      || retained.predecessorSha256 !== input.expectedControlSha256) throw new Error("Checkpoint recovery identity conflicts with its retained receipt")
    if (!existsSync(backupPath) || sha256(readFileSync(backupPath)) !== retained.predecessorSha256) throw new Error("Checkpoint recovery predecessor backup is unavailable or changed")
    if (predecessorSha256 === retained.resultSha256) return {...retained.summary, mode, replayed: true}
  }
  if (current.barrier.acceptanceSequence !== input.expectedControlSequence || input.expectedHistorySequence !== input.expectedControlSequence + 1) throw new Error("Checkpoint recovery supports only one exact missing acceptance receipt")
  if (mode === "apply" && (!input.expectedControlSha256 || input.expectedControlSha256 !== predecessorSha256)) throw new Error("Checkpoint recovery predecessor fingerprint changed")
  const tail = history.read({fromSequence: input.expectedHistorySequence, toSequence: input.expectedHistorySequence, limit: 1})
  const entry = tail[0]
  if (tail.length !== 1 || !entry || entry.sequence !== input.expectedHistorySequence || entry.id !== `${status.cutId}:${entry.sequence}`) throw new Error("Checkpoint recovery history tail is incomplete")
  const origin = entry.particle.by as ForceOrigin
  if (!["boundary", "matrix", "energy"].includes(origin) || !participants.includes(origin as ForceDomain)) throw new Error("Checkpoint recovery requires an explicit participating domain outbox source")
  const destinations = particleDestinations({parts: [entry.particle]}, origin, participants)
  const barrier = new CheckpointAppliedThroughBarrier(status.cutId, current.barrier, participants)
  const receipts = barrier.recordAccepted(entry.sequence, destinations)
  const after = {...current, barrier: barrier.state(), acceptedOutgoing: current.acceptedOutgoing.map(value => value.domain === origin ? {...value, ordinal: value.ordinal + 1} : value)}
  const resultSha256 = sha256(bytes(after))
  const summary = {schema: "metafor/checkpoint-control-tail-recovery-proof/v1" as const, operationId: input.operationId, cutId: status.cutId,
    beforeSequence: input.expectedControlSequence, afterSequence: status.sequence, predecessorSha256, resultSha256,
    tail: {id: entry.id, sequence: entry.sequence, part: entry.particle.part, op: entry.particle.op, by: origin, path: entry.particle.path, sha256: sha256(bytes(entry))},
    deliveries: receipts, appliedUnchanged: true, historyUnchanged: true, boundaryUnchanged: true,
    backupPath, receiptPath,
    outgoing: after.acceptedOutgoing.map((value, index) => ({domain: value.domain, before: current.acceptedOutgoing[index]!.ordinal, after: value.ordinal}))}
  if (mode === "dry-run") return {...summary, mode, replayed: false}
  const lock = join(dirname(filename), ".checkpoint-control-recovery.lock")
  const fd = openSync(lock, "wx", 0o600)
  try {
    const historyAgain = new DarkForceHistory(resolve(input.historyDirectory), undefined, {readOnly: true}).status()
    if (sha256(readFileSync(filename)) !== predecessorSha256 || historyAgain.cutId !== status.cutId || historyAgain.sequence !== status.sequence) throw new Error("Checkpoint recovery predecessor changed before commit")
    if (existsSync(backupPath)) {
      if (sha256(readFileSync(backupPath)) !== predecessorSha256) throw new Error("Checkpoint recovery predecessor backup conflicts")
    } else {
      const backupFd = openSync(backupPath, "wx", 0o600)
      try {writeFileSync(backupFd, predecessor); fsyncSync(backupFd)} finally {closeSync(backupFd)}
    }
    if (!existsSync(receiptPath)) {
      const receipt = {schema: "metafor/checkpoint-control-tail-recovery/v1", operationId: input.operationId, cutId: status.cutId,
        beforeSequence: input.expectedControlSequence, afterSequence: status.sequence, predecessorSha256, resultSha256, summary,
        backupPath}
      const receiptFd = openSync(receiptPath, "wx", 0o600)
      try {writeFileSync(receiptFd, bytes(receipt)); fsyncSync(receiptFd)} finally {closeSync(receiptFd)}
      const directoryFd = openSync(dirname(filename), "r")
      try {fsyncSync(directoryFd)} finally {closeSync(directoryFd)}
    }
    persistCheckpointControlState(filename, after, participants)
    return {...summary, mode, replayed: false}
  } finally {closeSync(fd); unlinkSync(lock)}
}
