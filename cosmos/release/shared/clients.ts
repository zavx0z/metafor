/** Ограниченный same-origin transport Window; публичными моделями владеет @metafor/types. @packageDocumentation */
import {parseAgentFeedbackRequest} from "@metafor/types/metafor/agents"
import type {ClientAnnotationFeedback, ClientFeedbackReceipt, ClientCapability, ClientDescriptor, ClientFailure, ClientInspection, ClientSelector, ClientStatus, ClientViewAction, ClientCommandValue, ClientDiagnostics, ClientDiagnosticsOptions, ClientCapture} from "@metafor/types/cosmos/client"
export const SERVICE_DIAGNOSTICS_SCHEMA = "cosmos/service-diagnostics/v1"
export const CLIENT_CACHE_METHOD = "cosmos.client.cache"
export const CLIENT_SOCKET_PATH = "/clients/socket"
export const CLIENTS_READ_METHOD = "cosmos.clients.read"
export const CLIENT_INSPECT_METHOD = "cosmos.client.inspect"
export const CLIENT_ACT_METHOD = "cosmos.client.act"
export const CLIENT_LOGS_METHOD = "cosmos.client.logs"
export const CLIENT_EVENTS_METHOD = "cosmos.client.events"
export const CLIENT_DIAGNOSTICS_METHOD = "cosmos.client.diagnostics"
export const CLIENT_CAPTURE_METHOD = "cosmos.client.capture"
export const CLIENT_WIRE_MAX_BYTES = 256 * 1024
export const CLIENT_CAPTURE_MAX_BYTES = 8 * 1024 * 1024
export const CLIENT_CAPTURE_CHUNK_CHARS = 48 * 1024
export const CLIENT_CAPTURE_FRAME_MAX_BYTES = 64 * 1024
export const CLIENT_CAPTURE_MAX_CHARACTERS = Math.ceil(CLIENT_CAPTURE_MAX_BYTES / 3) * 4
export const CLIENT_CAPABILITIES: readonly ClientCapability[] = ["inspect", "logs", "cache", "view.change", "agent.select", "atom.select", "control.activate", "control.input", "diagnostics", "capture"]
export type ClientOperation = "inspect" | "logs" | "cache" | "act" | "diagnostics" | "capture"
export type ClientCaptureMetadata = Omit<ClientCapture, "pngBase64">
export type ClientHello = {type: "hello", version: 1, clientId: string | null, kind: "Window", capabilities: ClientCapability[], status: ClientStatus}
export type ClientInbound = ClientHello
  | {type: "feedback", connectionId: string, feedback: ClientAnnotationFeedback}
  | {type: "heartbeat", connectionId: string, status: ClientStatus}
  | {type: "activity", connectionId: string, event: "focus" | "observed-focus" | "pointer" | "keyboard", status: ClientStatus}
  | {type: "capture-start", connectionId: string, requestId: string, metadata: ClientCaptureMetadata, characters: number}
  | {type: "capture-chunk", connectionId: string, requestId: string, offset: number, data: string}
  | {type: "capture-end", connectionId: string, requestId: string}
  | ({type: "reply", connectionId: string, requestId: string} & ({ok: true, value: ClientCommandValue} | {ok: false, error: ClientFailure}))
export type ClientOutbound = {type: "registered", version: 1, client: ClientDescriptor}
  | ({type: "feedback-receipt", connectionId: string} & ClientFeedbackReceipt)
  | ({type: "command", connectionId: string, requestId: string, deadline: number} & ({operation: "inspect"} | {operation: "capture"} | ({operation: "diagnostics"} & ClientDiagnosticsOptions) | {operation: "logs", afterSequence?: number, limit?: number, source?: "window" | "service", producerId?: string} | {operation: "cache", afterIndex?: number, limit?: number, hash?: boolean} | {operation: "act", action: ClientViewAction}))
  | {type: "cancel", connectionId: string, requestId: string, reason: "timeout" | "closing"}
export interface ClientInspectRequest {target?: ClientSelector}
export interface ClientActRequest {target?: ClientSelector, action: ClientViewAction}
export interface ClientLogsRequest extends ClientInspectRequest {afterSequence?: number, limit?: number, source?: "window" | "service", producerId?: string}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
export const clientText = (value: unknown, maximum = 512): value is string => typeof value === "string" && value.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
export const clientId = (value: unknown): value is string => clientText(value, 256) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
export const clientRecord = (value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> => record(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key))
const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const finite = (value: unknown, maximum = 1e9) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum
const nullableText = (value: unknown, maximum: number) => value === null || clientText(value, maximum)
const viewport = (value: unknown, ratio = false) => clientRecord(value, ratio ? ["width", "height", "devicePixelRatio"] : ["width", "height"]) && finite(value.width) && finite(value.height) && (!ratio || finite(value.devicePixelRatio, 65_536))

export function isClientDiagnosticsOptions(value: unknown): value is ClientDiagnosticsOptions {
  return clientRecord(value, [], ["afterIndex", "limit", "sampleMs"]) &&
    (value.afterIndex === undefined || integer(value.afterIndex) && (value.afterIndex as number) <= 1_000_000) &&
    (value.limit === undefined || integer(value.limit) && (value.limit as number) >= 1 && (value.limit as number) <= 128) &&
    (value.sampleMs === undefined || value.sampleMs === 0 || integer(value.sampleMs) && (value.sampleMs as number) >= 1000 && (value.sampleMs as number) <= 3000)
}

export function isClientDiagnostics(value: unknown): value is ClientDiagnostics {
  if (!clientRecord(value, ["schema", "version", "durationMs", "viewport", "semantic", "projections", "projectionsComplete", "boxes", "page", "sample", "resources", "resourcesTruncated", "availability", "timings"]) ||
      value.schema !== "cosmos/client-diagnostics/v1" || value.version !== 1 || !finite(value.durationMs) || !viewport(value.viewport, true)) return false
  if (!clientRecord(value.semantic, ["nodes", "elements", "displays", "huds", "complete", "scanLimit"]) ||
      ![value.semantic.nodes, value.semantic.elements, value.semantic.displays, value.semantic.huds, value.semantic.scanLimit].every(integer) ||
      (value.semantic.nodes as number) > 50_000 || value.semantic.scanLimit !== 50_000 || typeof value.semantic.complete !== "boolean") return false
  if (typeof value.projectionsComplete !== "boolean" || !Array.isArray(value.projections) || value.projections.length > 32 || !value.projections.every(item =>
    clientRecord(item, ["index", "kind", "id", "available", "revision", "viewport", "boxes", "displayItems", "hits", "scrolls"]) && integer(item.index) && ["display", "hud"].includes(String(item.kind)) && nullableText(item.id, 128) &&
    typeof item.available === "boolean" && (item.revision === null || integer(item.revision)) && (item.viewport === null || viewport(item.viewport)) && [item.boxes, item.displayItems, item.hits, item.scrolls].every(integer))) return false
  if (!Array.isArray(value.boxes) || value.boxes.length > 128 || !value.boxes.every(item => clientRecord(item, ["index", "projection", "tag", "id", "x", "y", "width", "height"]) &&
    integer(item.index) && integer(item.projection) && (item.projection as number) < (value.projections as unknown[]).length && nullableText(item.tag, 32) && nullableText(item.id, 128) &&
    typeof item.x === "number" && Number.isFinite(item.x) && Math.abs(item.x) <= 1e9 && typeof item.y === "number" && Number.isFinite(item.y) && Math.abs(item.y) <= 1e9 && finite(item.width) && finite(item.height))) return false
  if (!clientRecord(value.page, ["cursor", "total", "truncated"]) || !integer(value.page.cursor) || !integer(value.page.total) || typeof value.page.truncated !== "boolean") return false
  const sample = value.sample
  if (!clientRecord(sample, ["requestedMs", "elapsedMs", "presentedEvents", "intervalsMs", "intervalsTruncated", "longTasks", "longTasksTruncated"]) ||
    !isClientDiagnosticsOptions({sampleMs: sample.requestedMs}) || !finite(sample.elapsedMs) || !integer(sample.presentedEvents) || typeof sample.intervalsTruncated !== "boolean" || typeof sample.longTasksTruncated !== "boolean" ||
    !Array.isArray(sample.intervalsMs) || sample.intervalsMs.length > 240 || !sample.intervalsMs.every(item => finite(item)) ||
    !Array.isArray(sample.longTasks) || sample.longTasks.length > 64 || !sample.longTasks.every(item => clientRecord(item, ["startTime", "durationMs"]) && finite(item.startTime) && finite(item.durationMs))) return false
  if (typeof value.resourcesTruncated !== "boolean" || !Array.isArray(value.resources) || value.resources.length > 64 || !value.resources.every(item =>
    clientRecord(item, ["url", "initiatorType", "durationMs", "transferBytes", "encodedBytes", "decodedBytes"]) && clientText(item.url, 1024) && clientText(item.initiatorType, 64) && finite(item.durationMs) &&
    [item.transferBytes, item.encodedBytes, item.decodedBytes].every(size => size === null || finite(size, Number.MAX_SAFE_INTEGER)))) return false
  return clientRecord(value.availability, ["presentedIntervals", "longTasks", "resources", "cpuLayoutTime", "drawCalls", "gpuTime"]) && Object.values(value.availability).every(item =>
    clientRecord(item, ["available", "reason"]) && typeof item.available === "boolean" && nullableText(item.reason, 512)) &&
    clientRecord(value.timings, ["cpuLayoutMs", "drawCalls", "gpuMs"]) && Object.values(value.timings).every(item => item === null)
}

export function isClientCaptureMetadata(value: unknown): value is ClientCaptureMetadata {
  return clientRecord(value, ["schema", "version", "mimeType", "width", "height", "byteLength", "presentedBefore", "presentedAfter", "durationMs"]) &&
    value.schema === "cosmos/client-capture/v1" && value.version === 1 && value.mimeType === "image/png" &&
    [value.width, value.height].every(size => integer(size) && (size as number) > 0 && (size as number) <= 65_536) &&
    integer(value.byteLength) && (value.byteLength as number) >= 33 && (value.byteLength as number) <= CLIENT_CAPTURE_MAX_BYTES &&
    integer(value.presentedBefore) && integer(value.presentedAfter) && (value.presentedAfter as number) >= (value.presentedBefore as number) && finite(value.durationMs)
}

export function isClientCapture(value: unknown): value is ClientCapture {
  if (!clientRecord(value, ["schema", "version", "mimeType", "width", "height", "byteLength", "pngBase64", "presentedBefore", "presentedAfter", "durationMs"])) return false
  const {pngBase64, ...metadata} = value
  if (!isClientCaptureMetadata(metadata) || typeof pngBase64 !== "string" || pngBase64.length !== Math.ceil(metadata.byteLength / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(pngBase64)) return false
  const padding = pngBase64.endsWith("==") ? 2 : pngBase64.endsWith("=") ? 1 : 0
  if (pngBase64.length / 4 * 3 - padding !== metadata.byteLength) return false
  try {
    const header = Uint8Array.from(atob(pngBase64.slice(0, 44)), character => character.charCodeAt(0))
    const bytes = new DataView(header.buffer)
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte) && bytes.getUint32(8) === 13 &&
      String.fromCharCode(...header.subarray(12, 16)) === "IHDR" && bytes.getUint32(16) === metadata.width && bytes.getUint32(20) === metadata.height
  } catch {return false}
}
export function isClientStatus(value: unknown): value is ClientStatus {
  return clientRecord(value, ["visible", "focused", "boot"]) && typeof value.visible === "boolean" && typeof value.focused === "boolean" &&
    clientRecord(value.boot, ["phase", "trace"]) && clientText(value.boot.phase, 128) && Array.isArray(value.boot.trace) && value.boot.trace.length <= 64 &&
    value.boot.trace.every(entry => clientRecord(entry, ["sequence", "phase"], ["message"]) && integer(entry.sequence) && clientText(entry.phase, 128) && (entry.message === undefined || clientText(entry.message, 4096)))
}
export function isClientAction(value: unknown): value is ClientViewAction {
  if (!record(value)) return false
  if (value.type === "view.change") return clientRecord(value, ["type", "view"]) && ["network", "agents", "offices"].includes(String(value.view))
  if (value.type === "agent.select") return clientRecord(value, ["type", "officeId", "agentRef"]) && clientId(value.officeId) && clientText(value.agentRef, 256) && /^atom:[A-Za-z0-9._:-]+$/u.test(value.agentRef)
  if (value.type === "atom.select") return clientRecord(value, ["type", "atomRef"]) && clientText(value.atomRef, 256) && /^atom:[1-9]\d*$/u.test(value.atomRef)
  if (value.type === "control.activate") return clientRecord(value, ["type", "controlId"]) && clientId(value.controlId)
  return value.type === "control.input" && clientRecord(value, ["type", "controlId", "value"]) && clientId(value.controlId) && clientText(value.value, 65_536)
}
export function isClientSelector(value: unknown): value is ClientSelector {
  return value === "last-active" || clientRecord(value, ["clientId", "connectionId"]) && clientId(value.clientId) && clientId(value.connectionId)
}
const annotationPoint = (value: unknown, dimensions: string[]) => clientRecord(value, dimensions) && dimensions.every(key => typeof value[key] === "number" && Number.isFinite(value[key]) && Math.abs(value[key] as number) <= 1e9)
const annotationTarget = (value: unknown): boolean => value === null || clientRecord(value, ["semanticNodeId", "semanticRef", "tag", "text", "spatialHitId", "ownAtomRef", "spatialPoint", "projection"]) &&
  integer(value.semanticNodeId) && value.semanticNodeId !== 0 && clientId(value.semanticRef) && clientText(value.tag, 64) && clientText(value.text, 2048) &&
  (value.spatialHitId === null || clientText(value.spatialHitId, 1024)) && (value.ownAtomRef === null || clientText(value.ownAtomRef, 256) && /^atom:[A-Za-z0-9._:-]+$/u.test(value.ownAtomRef)) &&
  (value.spatialPoint === null || annotationPoint(value.spatialPoint, ["x", "y", "z"])) &&
  clientRecord(value.projection, ["status", "owner", "hudPoint"]) && [null, "space", "display", "hud"].includes(value.projection.owner as null | string) &&
  (value.projection.status === "unknown" && value.projection.hudPoint === null || value.projection.status === "known" && value.projection.owner !== null && annotationPoint(value.projection.hudPoint, ["x", "y"]))
const annotations = (value: unknown) => clientRecord(value, ["enabled", "selected", "active", "textSelection", "message"]) && typeof value.enabled === "boolean" &&
  annotationTarget(value.selected) && annotationTarget(value.active) && clientText(value.textSelection, 2048) && (value.message === null || clientText(value.message, 512))
export function isClientInspection(value: unknown): value is ClientInspection {
  if (!clientRecord(value, ["schema", "version", "status", "viewport", "view"]) || value.schema !== "cosmos/client-inspection/v1" || value.version !== 1 || !isClientStatus(value.status) ||
      !clientRecord(value.viewport, ["width", "height", "devicePixelRatio"]) || ![value.viewport.width, value.viewport.height, value.viewport.devicePixelRatio].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 65_536)) return false
  const view = value.view
  if (view === null) return true
  return clientRecord(view, ["mode", "status", "error", "selected", "offices", "text", "controls"], ["annotations"]) && (view.annotations === undefined || annotations(view.annotations)) && ["agents", "offices", "network"].includes(String(view.mode)) && ["loading", "ready", "error"].includes(String(view.status)) &&
    (view.error === null || clientText(view.error, 4096)) && (view.selected === null || clientRecord(view.selected, ["officeId", "agentRef"]) && clientId(view.selected.officeId) && clientText(view.selected.agentRef)) &&
    Array.isArray(view.offices) && view.offices.length <= 128 && view.offices.every(office => clientRecord(office, ["id", "label", "agents"]) && clientId(office.id) && clientText(office.label) && Array.isArray(office.agents) && office.agents.length <= 128 && office.agents.every(id => clientText(id))) &&
    clientText(view.text, 16_384) && Array.isArray(view.controls) && view.controls.length <= 256 && view.controls.every(control =>
      clientRecord(control, ["id", "tag", "role", "label", "disabled", "hidden", "actions"], ["value", "redacted"]) && clientId(control.id) && clientText(control.tag, 64) && (control.role === null || clientText(control.role, 128)) && clientText(control.label) &&
      typeof control.disabled === "boolean" && typeof control.hidden === "boolean" && (control.redacted === undefined || typeof control.redacted === "boolean") && (control.value === undefined || clientText(control.value, 65_536)) &&
      !(control.redacted === true && control.value !== undefined) && Array.isArray(control.actions) && control.actions.length <= 2 && control.actions.every(action => action === "activate" || action === "input"))
}
export function isClientResult(operation: ClientOperation, value: unknown): value is ClientCommandValue {
  if (operation === "diagnostics") return isClientDiagnostics(value)
  if (operation === "capture") return isClientCapture(value)
  if (operation === "inspect") return isClientInspection(value)
  if (operation === "act") return clientRecord(value, ["schema", "version", "status"], ["inspection"]) && value.schema === "cosmos/client-action-result/v1" && value.version === 1 && clientText(value.status) && (value.inspection === undefined || isClientInspection(value.inspection))
  if (operation === "cache") return clientRecord(value, ["schema", "version", "from", "cacheNames", "entries", "cursor", "total", "truncated", "transaction"]) && value.schema === "cosmos/client-cache/v1" && value.version === 1 && value.from === "release-main" &&
    Array.isArray(value.cacheNames) && value.cacheNames.length <= 64 && value.cacheNames.every(name => clientText(name, 512)) && integer(value.cursor) && integer(value.total) && typeof value.truncated === "boolean" && ["absent", "marker-only"].includes(String(value.transaction)) &&
    Array.isArray(value.entries) && value.entries.length <= 128 && value.entries.every(entry => clientRecord(entry, ["cache", "url", "method", "status", "bytes", "sha256"], ["error"]) && clientText(entry.cache, 512) && clientText(entry.url, 4096) && clientText(entry.method, 16) && (entry.status === null || integer(entry.status)) && (entry.bytes === null || integer(entry.bytes)) && (entry.sha256 === null || typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/u.test(entry.sha256)) && (entry.error === undefined || clientText(entry.error, 512)))
  if (!clientRecord(value, ["schema", "version", "entries", "cursor", "dropped", "from"], ["owner"]) || value.schema !== "cosmos/client-logs/v1" || value.version !== 1 || !["release-main", "release-service"].includes(String(value.from)) || !integer(value.cursor) || !integer(value.dropped) || !Array.isArray(value.entries) || value.entries.length > 128) return false
  if (value.from === "release-service" && (!clientRecord(value.owner, ["kind", "producerId", "releaseVersion", "scriptURL", "scope"]) || value.owner.kind !== "ServiceWorker" || !clientId(value.owner.producerId) || !(value.owner.releaseVersion === null || clientText(value.owner.releaseVersion, 128)) || !clientText(value.owner.scriptURL, 4096) || !clientText(value.owner.scope, 4096))) return false
  return value.entries.every(entry => clientRecord(entry, ["sequence", "level", "message"], ["values", "timestamp"]) && integer(entry.sequence) && ["log", "debug", "info", "warn", "error"].includes(String(entry.level)) && clientText(entry.message, 16_384) && (entry.timestamp === undefined || typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp)) && (entry.values === undefined || Array.isArray(entry.values) && entry.values.length <= 32))
}
export function parseClientFeedback(value: unknown): ClientAnnotationFeedback | null {
  if (!clientRecord(value, ["agentRef", "world", "request"]) || !clientText(value.agentRef, 256) || !/^atom:[A-Za-z0-9._:-]+$/u.test(value.agentRef) ||
      !clientRecord(value.world, ["root", "cutId"]) || !clientText(value.world.root, 256) || !clientId(value.world.cutId)) return null
  try {return {agentRef: value.agentRef, world: {root: value.world.root, cutId: value.world.cutId}, request: parseAgentFeedbackRequest(value.request)}} catch {return null}
}
export function parseClientInbound(value: unknown): ClientInbound | null {
  if (!record(value)) return null
  if (value.type === "capture-start") return clientRecord(value, ["type", "connectionId", "requestId", "metadata", "characters"]) && clientId(value.connectionId) && clientId(value.requestId) &&
    isClientCaptureMetadata(value.metadata) && integer(value.characters) && value.characters === Math.ceil(value.metadata.byteLength / 3) * 4 ? value as Extract<ClientInbound, {type: "capture-start"}> : null
  if (value.type === "capture-chunk") return clientRecord(value, ["type", "connectionId", "requestId", "offset", "data"]) && clientId(value.connectionId) && clientId(value.requestId) && integer(value.offset) &&
    typeof value.data === "string" && value.data.length > 0 && value.data.length <= CLIENT_CAPTURE_CHUNK_CHARS && /^[A-Za-z0-9+/=]+$/u.test(value.data) ? value as Extract<ClientInbound, {type: "capture-chunk"}> : null
  if (value.type === "capture-end") return clientRecord(value, ["type", "connectionId", "requestId"]) && clientId(value.connectionId) && clientId(value.requestId) ? value as Extract<ClientInbound, {type: "capture-end"}> : null
  if (value.type === "feedback") {const feedback = parseClientFeedback(value.feedback); return clientRecord(value, ["type", "connectionId", "feedback"]) && clientId(value.connectionId) && feedback ? {type: "feedback", connectionId: value.connectionId, feedback} : null}
  if (value.type === "hello") return clientRecord(value, ["type", "version", "clientId", "kind", "capabilities", "status"]) && value.version === 1 && value.kind === "Window" && (value.clientId === null || clientId(value.clientId)) &&
    Array.isArray(value.capabilities) && value.capabilities.length <= CLIENT_CAPABILITIES.length && new Set(value.capabilities).size === value.capabilities.length && value.capabilities.every(cap => CLIENT_CAPABILITIES.includes(cap)) && isClientStatus(value.status) ? value as ClientHello : null
  if (value.type === "heartbeat" || value.type === "activity") return clientRecord(value, value.type === "activity" ? ["type", "connectionId", "event", "status"] : ["type", "connectionId", "status"]) && clientId(value.connectionId) && isClientStatus(value.status) &&
    (value.type !== "activity" || ["focus", "observed-focus", "pointer", "keyboard"].includes(String(value.event))) ? value as Extract<ClientInbound, {type: "heartbeat" | "activity"}> : null
  if (value.type !== "reply" || !clientId(value.connectionId) || !clientId(value.requestId) || typeof value.ok !== "boolean") return null
  if (value.ok) return clientRecord(value, ["type", "connectionId", "requestId", "ok", "value"]) ? value as Extract<ClientInbound, {type: "reply"}> : null
  return clientRecord(value, ["type", "connectionId", "requestId", "ok", "error"]) && clientRecord(value.error, ["code", "message"]) && ["unsupported", "client_error", "stale_control", "cancelled", "timeout", "invalid_reply", "conflict"].includes(String(value.error.code)) && clientText(value.error.message, 4096) ? value as Extract<ClientInbound, {type: "reply"}> : null
}
