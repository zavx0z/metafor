export const GRAVITY_BROADCAST_CHANNEL = "metafor.gravity"
export const ELECTROMAGNETISM_BROADCAST_CHANNEL = "metafor.electromagnetism"
export const GLUON_BROADCAST_CHANNEL = "metafor.gluon"
export const HIGGS_BROADCAST_CHANNEL = "metafor.higgs"
export const WEAK_W_BROADCAST_CHANNEL = "metafor.weak.w"
export const WEAK_Z_BROADCAST_CHANNEL = "metafor.weak.z"
export const STRUCTURAL_BROADCAST_CHANNEL = "metafor.structural"
export const DB_SYNC_BROADCAST_CHANNEL = "metafor.db-sync"

export type ProtocolDomain = "dark" | "boundary" | "bulk" | "app"

export interface ProtocolChannelOptions {
  channelName?: string
}

export interface GravityProtocolPatch {
  op: "add" | "remove" | "test"
  path: string
  value?: unknown
}

export interface GravitonMessage {
  channel: "gravity"
  boson: "graviton"
  source: ProtocolDomain
  patches: GravityProtocolPatch[]
}

export interface PhotonMessage {
  channel: "electromagnetism"
  boson: "photon"
  source: ProtocolDomain
  value: string
  path: string
}

export interface ValueProtocolPatch {
  op: "replace"
  path: string
  value: unknown
}

export interface GluonMessage {
  channel: "gluon"
  boson: "gluon"
  source: ProtocolDomain
  patches: ValueProtocolPatch[]
}

export interface HiggsMessage {
  channel: "higgs"
  boson: "higgs"
  source: ProtocolDomain
  patches: ValueProtocolPatch[]
}

export type WeakCoordinationKind = "claim" | "accept" | "reject" | "release"

export interface ZMessage {
  channel: "weak-z"
  boson: "z"
  source: ProtocolDomain
  wimpId: string
  processId: string
  coordination: WeakCoordinationKind
  executorId?: string
}

export interface WMessage {
  channel: "weak-w"
  boson: "w+" | "w-"
  source: ProtocolDomain
  wimpId: string
  processId: string
  patches: ValueProtocolPatch[]
}

/**
 * Per-row sync-сообщение для зеркала канонической DB на потребителях,
 * у которых нет прямого доступа к SQLite (browser → IndexedDB).
 *
 * Server мирорит этот канал в WS; client применяет `op` на свой локальный store
 * через тот же {@link DbActorStore} API. Порядок гарантируется WS-очередью.
 * Барьер «всё применено» — сигнал на отдельном `STRUCTURAL_BROADCAST_CHANNEL`.
 */
export type DbSyncOp =
  | { kind: "clear-world" }
  | { kind: "insert-particle"; row: unknown }
  | { kind: "insert-field"; row: unknown }

export interface DbSyncMessage {
  channel: "db-sync"
  source: ProtocolDomain
  rootSrc: string
  op: DbSyncOp
}

/**
 * Структурный сигнал — адресующее сообщение об изменении world-структуры.
 *
 * Не несёт payload-а. Подписчик читает данные из канонического DB по `rootSrc` и `scope`.
 * Это служебный сигнал инфраструктурного слоя, без бозона: топологические изменения адресуются
 * `Higgs boson` (см. `HiggsMessage`), здесь же — извещение «есть что перечитать».
 */
export interface StructuralSignalMessage {
  channel: "structural"
  source: ProtocolDomain
  rootSrc: string
  scope: { kind: "world" } | { kind: "subtree"; parentParticleId: string }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null
const isProtocolDomain = (value: unknown): value is ProtocolDomain =>
  value === "dark" || value === "boundary" || value === "bulk" || value === "app"

const hasProtocolEnvelope = (
  value: unknown,
  channel: string,
  boson: string,
): value is Record<string, unknown> & { channel: string; boson: string } => {
  if (!isRecord(value)) return false
  if (value.channel !== channel) return false
  if (value.boson !== boson) return false
  return isProtocolDomain(value.source)
}

const openProtocolBroadcastChannel = (
  defaultChannelName: string,
  options: ProtocolChannelOptions = {},
): BroadcastChannel => new BroadcastChannel(options.channelName ?? defaultChannelName)

const isGravityPatch = (value: unknown): value is GravityProtocolPatch => {
  if (!isRecord(value)) return false
  if (value.op !== "add" && value.op !== "remove" && value.op !== "test") return false
  return typeof value.path === "string"
}

export const openElectromagnetismBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  openProtocolBroadcastChannel(ELECTROMAGNETISM_BROADCAST_CHANNEL, options)

export const openGluonBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  openProtocolBroadcastChannel(GLUON_BROADCAST_CHANNEL, options)

export const openHiggsBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  openProtocolBroadcastChannel(HIGGS_BROADCAST_CHANNEL, options)

export const openWeakWBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  openProtocolBroadcastChannel(WEAK_W_BROADCAST_CHANNEL, options)

export const openWeakZBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  openProtocolBroadcastChannel(WEAK_Z_BROADCAST_CHANNEL, options)

export const openStructuralBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  openProtocolBroadcastChannel(STRUCTURAL_BROADCAST_CHANNEL, options)

export const openDbSyncBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  openProtocolBroadcastChannel(DB_SYNC_BROADCAST_CHANNEL, options)

const isValueProtocolPatch = (value: unknown): value is ValueProtocolPatch => {
  if (!isRecord(value)) return false
  return value.op === "replace" && typeof value.path === "string" && "value" in value
}

const isWeakCoordinationKind = (value: unknown): value is WeakCoordinationKind =>
  value === "claim" || value === "accept" || value === "reject" || value === "release"

export const isGravitonMessage = (value: unknown): value is GravitonMessage => {
  if (!hasProtocolEnvelope(value, "gravity", "graviton")) return false
  return Array.isArray(value.patches) && value.patches.every(isGravityPatch)
}

export const isPhotonMessage = (value: unknown): value is PhotonMessage => {
  if (!hasProtocolEnvelope(value, "electromagnetism", "photon")) return false
  return typeof value.value === "string" && typeof value.path === "string"
}

export const isGluonMessage = (value: unknown): value is GluonMessage => {
  if (!hasProtocolEnvelope(value, "gluon", "gluon")) return false
  return Array.isArray(value.patches) && value.patches.every(isValueProtocolPatch)
}

export const isHiggsMessage = (value: unknown): value is HiggsMessage => {
  if (!hasProtocolEnvelope(value, "higgs", "higgs")) return false
  return Array.isArray(value.patches) && value.patches.every(isValueProtocolPatch)
}

export const isZMessage = (value: unknown): value is ZMessage => {
  if (!hasProtocolEnvelope(value, "weak-z", "z")) return false
  if (typeof value.wimpId !== "string" || typeof value.processId !== "string") return false
  if (!isWeakCoordinationKind(value.coordination)) return false
  return value.executorId === undefined || typeof value.executorId === "string"
}

export const isWMessage = (value: unknown): value is WMessage => {
  if (!isRecord(value)) return false
  if (value.boson !== "w+" && value.boson !== "w-") return false
  if (!hasProtocolEnvelope(value, "weak-w", value.boson)) return false
  if (typeof value.wimpId !== "string" || typeof value.processId !== "string") return false
  return Array.isArray(value.patches) && value.patches.every(isValueProtocolPatch)
}

const isStructuralScope = (value: unknown): value is StructuralSignalMessage["scope"] => {
  if (!isRecord(value)) return false
  if (value.kind === "world") return true
  if (value.kind === "subtree") return typeof value.parentParticleId === "string"
  return false
}

export const isStructuralSignalMessage = (value: unknown): value is StructuralSignalMessage => {
  if (!isRecord(value)) return false
  if (value.channel !== "structural") return false
  if (!isProtocolDomain(value.source)) return false
  if (typeof value.rootSrc !== "string") return false
  return isStructuralScope(value.scope)
}

const isDbSyncOp = (value: unknown): value is DbSyncOp => {
  if (!isRecord(value)) return false
  if (value.kind === "clear-world") return true
  if (value.kind === "insert-particle") return isRecord(value.row)
  if (value.kind === "insert-field") return isRecord(value.row)
  return false
}

export const isDbSyncMessage = (value: unknown): value is DbSyncMessage => {
  if (!isRecord(value)) return false
  if (value.channel !== "db-sync") return false
  if (!isProtocolDomain(value.source)) return false
  if (typeof value.rootSrc !== "string") return false
  return isDbSyncOp(value.op)
}
