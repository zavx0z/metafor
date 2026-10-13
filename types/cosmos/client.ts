import type {AgentFeedbackRequest, AgentFeedbackReceipt} from "../metafor/agents"
import type {AtomRef} from "../metafor/graph"
/** Временные наблюдения Window и закрытые действия его Document без полномочий ОС, Quantum Energy или user identity. @packageDocumentation */
export type ClientViewMode = "agents" | "offices" | "network"
export type ClientViewAction =
  | {type: "view.change", view: ClientViewMode}
  | {type: "agent.select", officeId: string, agentRef: string}
  | {type: "atom.select", atomRef: AtomRef}
  | {type: "control.activate", controlId: string}
  | {type: "control.input", controlId: string, value: string}

export interface ClientViewControl {
  id: string
  tag: string
  role: string | null
  label: string
  disabled: boolean
  hidden: boolean
  value?: string
  redacted?: boolean
  actions: Array<"activate" | "input">
}

/** Ограниченное фактическое представление; control IDs принадлежат текущему соединению клиента. */
export interface ClientViewInspection {
  mode: ClientViewMode
  status: "loading" | "ready" | "error"
  error: string | null
  selected: {officeId: string, agentRef: string} | null
  offices: Array<{id: string, label: string, agents: string[]}>
  text: string
  controls: ClientViewControl[]
  annotations?: ClientAnnotations
}

/** Наблюдение одного существующего semantic node и его текущей проекции. */
export interface ClientAnnotationTarget {
  semanticNodeId: number
  semanticRef: string
  tag: string
  text: string
  spatialHitId: string | null
  ownAtomRef: string | null
  spatialPoint: {x: number, y: number, z: number} | null
  projection: {status: "known" | "unknown", owner: "space" | "display" | "hud" | null, hudPoint: {x: number, y: number} | null}
}
export interface ClientAnnotations {enabled: boolean, selected: ClientAnnotationTarget | null, active: ClientAnnotationTarget | null, textSelection: string, message: string | null}

export type ClientCapability = "inspect" | "logs" | "cache" | "diagnostics" | "capture" | ClientViewAction["type"]
export interface ClientTrace {sequence: number, phase: string, message?: string}
export interface ClientStatus {visible: boolean, focused: boolean, boot: {phase: string, trace: ClientTrace[]}}
export interface ClientWorld {root: string, cutId: string}
export interface ClientTarget {clientId: string, connectionId: string}
export type ClientSelector = "last-active" | ClientTarget
export interface ClientDescriptor {
  id: string
  connectionId: string
  kind: "Window"
  world: ClientWorld
  capabilities: ClientCapability[]
  status: ClientStatus
  lastActivitySequence: number | null
  lastSeenAt: number
}
export interface ClientInspection {
  schema: "cosmos/client-inspection/v1"
  version: 1
  status: ClientStatus
  viewport: {width: number, height: number, devicePixelRatio: number}
  view: ClientViewInspection | null
}
export interface ClientViewActionResult {schema: "cosmos/client-action-result/v1", version: 1, status: string, inspection?: ClientInspection}
export type ClientSafeValue = null | boolean | number | string | ClientSafeValue[] | {[key: string]: ClientSafeValue}
export interface ClientLog {sequence: number, level: "log" | "debug" | "info" | "warn" | "error", message: string, values?: ClientSafeValue[], timestamp?: number}
export interface ClientLogs {schema: "cosmos/client-logs/v1", version: 1, entries: ClientLog[], cursor: number, dropped: number, from: "release-main" | "release-service", owner?: ClientServiceOwner}
export interface ClientEvent {sequence: number, type: "registered" | "disconnected" | "activity" | "boot.phase" | "boot.failed" | "window.error" | "window.unhandledrejection" | "feedback.accepted" | "feedback.failed" | "service.error" | "service.unhandledrejection", target: ClientTarget, phase?: string, message?: string, feedbackId?: string}
export interface ClientEvents {schema: "cosmos/client-events/v1", version: 1, entries: ClientEvent[], cursor: number, dropped: number}
export type ClientFailureCode = "no_active_client" | "disconnected" | "unsupported" | "timeout" | "invalid_reply" | "client_error" | "stale_control" | "cancelled" | "conflict"
export interface ClientFailure {code: ClientFailureCode, message: string}
/** Target закрепляется при admission; disconnect/timeout возвращают отказ без выбора другого Window или повторной отправки. */
export type ClientCommandReceipt = {schema: "cosmos/client-command/v1", version: 1, requestId: string, target: ClientTarget | null} &
  ({ok: true, value: ClientCommandValue} | {ok: false, error: ClientFailure})
export interface ClientsReceipt {schema: "cosmos/clients/v1", version: 1, world: ClientWorld, sequence: number, lastActive: ClientTarget | null, clients: ClientDescriptor[]}

/** Снимок и Agent закреплены до доставки; correlation исходного соединения неизменна при reconnect. */
export interface ClientAnnotationFeedback {agentRef: string; world: ClientWorld; request: AgentFeedbackRequest}
export type ClientFeedbackReceipt = {id: string; ok: true; receipt: AgentFeedbackReceipt} | {id: string; ok: false; error: ClientFailure}

export interface ClientServiceOwner {kind: "ServiceWorker"; producerId: string; releaseVersion: string | null; scriptURL: string; scope: string}
/** Только чтение technical CacheStorage; transaction перечисляется только по marker без open/create. */
export interface ClientCacheInventory {
  schema: "cosmos/client-cache/v1"; version: 1; from: "release-main"; cacheNames: string[]
  entries: Array<{cache: string; url: string; method: string; status: number | null; bytes: number | null; sha256: string | null; error?: string}>
  cursor: number; total: number; truncated: boolean; transaction: "absent" | "marker-only"
}

/** Ограниченная страница существующих projection boxes; sample не вызывает render/RAF. */
export interface ClientDiagnosticsOptions {afterIndex?: number; limit?: number; sampleMs?: number}
export interface ClientFeatureAvailability {available: boolean; reason: string | null}
export interface ClientDiagnostics {
  schema: "cosmos/client-diagnostics/v1"; version: 1
  durationMs: number
  viewport: {width: number; height: number; devicePixelRatio: number}
  semantic: {nodes: number; elements: number; displays: number; huds: number; complete: boolean; scanLimit: number}
  projections: Array<{index: number; kind: "display" | "hud"; id: string | null; available: boolean; revision: number | null; viewport: {width: number; height: number} | null;
    boxes: number; displayItems: number; hits: number; scrolls: number}>
  projectionsComplete: boolean
  boxes: Array<{index: number; projection: number; tag: string | null; id: string | null; x: number; y: number; width: number; height: number}>
  page: {cursor: number; total: number; truncated: boolean}
  /** Интервалы presented events показывают cadence, а не CPU render duration. */
  sample: {requestedMs: number; elapsedMs: number; presentedEvents: number; intervalsMs: number[]; intervalsTruncated: boolean;
    longTasks: Array<{startTime: number; durationMs: number}>; longTasksTruncated: boolean}
  resources: Array<{url: string; initiatorType: string; durationMs: number; transferBytes: number | null; encodedBytes: number | null; decodedBytes: number | null}>
  resourcesTruncated: boolean
  availability: {presentedIntervals: ClientFeatureAvailability; longTasks: ClientFeatureAvailability; resources: ClientFeatureAvailability;
    cpuLayoutTime: ClientFeatureAvailability; drawCalls: ClientFeatureAvailability; gpuTime: ClientFeatureAvailability}
  /** Public Presentation не предоставляет эти counters; observation duration их не заменяет. */
  timings: {cpuLayoutMs: null; drawCalls: null; gpuMs: null}
}

/** PNG последнего presented кадра; две sequences ограничивают capture, не выдумывая atomic frame ID. */
export interface ClientCapture {
  schema: "cosmos/client-capture/v1"; version: 1; mimeType: "image/png"
  width: number; height: number; byteLength: number; pngBase64: string
  presentedBefore: number; presentedAfter: number; durationMs: number
}
export type ClientCommandValue = ClientInspection | ClientViewActionResult | ClientLogs | ClientCacheInventory | ClientDiagnostics | ClientCapture
