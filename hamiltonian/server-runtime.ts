import {
  HamiltonianLifecycleRetainedJournal,
  HamiltonianLifecycleSource,
  HamiltonianNodeSystemDeclarationRegistry,
  createHamiltonianLifecycleObservation,
  createHamiltonianNodeSystemDeclaration,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
  hamiltonianLifecycleTransportId,
  hamiltonianLogicalContourId,
  isHamiltonianLifecycleEnvelope,
  isHamiltonianLifecycleOwnershipClosed,
  isHamiltonianLifecycleSnapshot,
  isHamiltonianNodeSystemDeclaration,
  projectHamiltonianLifecycleOwnershipScope,
  projectHamiltonianNodeSystemBoundaryTransports,
  type HamiltonianLifecycleEnvelope,
  type HamiltonianLifecycleSnapshot,
  type HamiltonianNodeSystemBoundaryTransport,
  type HamiltonianNodeSystemDeclaration,
} from "./core/lifecycle.js"
import {watch, type FSWatcher} from "node:fs"
import {fileURLToPath} from "node:url"
import {
  BunEmbodimentSet,
  type EmbodimentAuthority,
} from "./bun-embodiment.ts"
import {authorityKey, makeLeaseId} from "./core/runtime.js"
import {hamiltonianBrowserNodeId} from "./core/orchestration.js"
import {HostTopology, type WindowCandidate} from "./host-state.ts"
import {PeerProcessSupervisor} from "./peer-supervisor.ts"
import type {PeerSignal, WeriftPeerSnapshot} from "./peer/werift-peer.ts"
import {
  HamiltonianWebPush,
  isHamiltonianPushSubscription,
  validWorkerIdentity,
  type HamiltonianPushSubscriptionInput,
} from "./web-push.ts"
import type {WebPushLifecycleEvent, WebPushLifecycleHook} from "@metafor/web-push/lifecycle"
import {isHamiltonianServiceWorkerCodeVersion} from "./update/shared/service-release.js"
import {
  hamiltonianBrowserManifest,
  hamiltonianBrowserSourceRevision,
  hamiltonianServiceWorkerRelease,
  hamiltonianVersionedModuleRelease,
  type HamiltonianServiceWorkerRelease,
} from "./update/host/browser-release.ts"
import {HamiltonianServiceWorkerAdmissionRegistry} from "./update/host/service-admission.ts"

export interface HamiltonianServerSocketData {
  connectionId: string
  connectionGeneration: number
  deviceId: string
  lifecycleTransportId: string
  workerEntityId: string
  openedAt: number
  lastPongAt: number
  lastChallengeSeq: number
  lastAckSeq: number
  nextHeartbeatTimer: ReturnType<typeof setTimeout> | null
  heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null
  workerIdentity: string | null
  workerRuntimeIncarnation: string | null
  workerCodeVersion: string | null
  resumeNonce: string | null
  identityConfirmed: boolean
  workerUpdateRequired: boolean
  retainAuthorityOnClose: boolean
  reportedEmptyWindowInventory: boolean
}

export interface ClientTabsMessage {
  kind: "tabs"
  windows: WindowCandidate[]
}

export interface ClientPongMessage {
  kind: "pong"
  at: number
  seq: number
  workerIdentity: string
  workerRuntimeIncarnation: string
}

export interface ClientIdentityMessage {
  kind: "identity"
  workerIdentity: string
  workerRuntimeIncarnation: string
  workerCodeVersion: string
  resumeNonce: string
  lifecycleSnapshot: HamiltonianLifecycleSnapshot
  lifecycleDeclaration?: HamiltonianNodeSystemDeclaration
  wakeId?: string
  wakeProof?: string
}

export interface ClientBrowserLifecycleSnapshotMessage {
  kind: "browser-lifecycle-snapshot"
  snapshot: HamiltonianLifecycleSnapshot
  declaration?: HamiltonianNodeSystemDeclaration
}

export interface ClientPushSubscriptionMessage {
  kind: "push-subscription"
  registrationId: string
  subscription: HamiltonianPushSubscriptionInput["subscription"]
}

export interface ClientPeerSignalMessage {
  kind: "peer-signal"
  peerId: string
  sessionEpoch: string
  peerGeneration: number
  authorityKey: string
  tabId: string
  signal: PeerSignal
}

export interface ClientPeerFailedMessage {
  kind: "peer-failed"
  peerId: string
  sessionEpoch: string
  peerGeneration: number
  authorityKey: string
  tabId: string
  reason: string
}

interface ClientLifecycleMonitor {
  messageId: string
  transportId: string
}

export interface ClientLifecycleRetirementMessage {
  kind: "lifecycle-retirement"
  envelope: HamiltonianLifecycleEnvelope
}

type MonitoredClientMessage = (
  | ClientTabsMessage
  | ClientPongMessage
  | ClientIdentityMessage
  | ClientPushSubscriptionMessage
  | ClientPeerSignalMessage
  | ClientPeerFailedMessage
  | ClientLifecycleRetirementMessage
  | ClientBrowserLifecycleSnapshotMessage
) & {monitor?: ClientLifecycleMonitor}

export type HamiltonianClientMessage = MonitoredClientMessage

interface HostEvent {
  at: number
  kind: string
  connectionId?: string
  detail?: string
}

interface PendingPushWake {
  wakeId: string
  wakeProof: string
  armedAt: number
  armedAfterConnectionGeneration: number
}

const experimentRoot = fileURLToPath(new URL(".", import.meta.url))
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url))
const publicRoot = `${experimentRoot}/public`
const updateRoot = `${experimentRoot}/update`
const visualRoot = `${experimentRoot}/visual`
const orchestrationEntry = `${experimentRoot}/browser/orchestration.ts`
const layoutWorkerEntry = `${visualRoot}/browser/layout-worker.ts`
const serviceWorkerEntry = `${experimentRoot}/browser/service.ts`
const webPushClientEntry = `${repositoryRoot}/pkg/web-push/src/client.ts`
const engineFont = fileURLToPath(new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url))
const uiRoot = fileURLToPath(new URL("../pkg/ui/", import.meta.url))
const nodesRoot = fileURLToPath(new URL("../pkg/nodes/", import.meta.url))
const webPushRoot = fileURLToPath(new URL("../pkg/web-push/", import.meta.url))
const browserStaticFiles: Readonly<Record<string, {path: string; type: string}>> = Object.freeze({
  "/": {path: `${publicRoot}/index.html`, type: "text/html; charset=utf-8"},
  "/index.html": {path: `${publicRoot}/index.html`, type: "text/html; charset=utf-8"},
  "/window-entry.js": {path: `${publicRoot}/window-entry.js`, type: "text/javascript; charset=utf-8"},
  "/app.js": {path: `${publicRoot}/app.js`, type: "text/javascript; charset=utf-8"},
  "/embodiment-worker.js": {path: `${publicRoot}/embodiment-worker.js`, type: "text/javascript; charset=utf-8"},
  "/embodiment-worker-entry.js": {path: `${publicRoot}/embodiment-worker-entry.js`, type: "text/javascript; charset=utf-8"},
  "/styles.css": {path: `${visualRoot}/browser/styles.css`, type: "text/css; charset=utf-8"},
  "/engine-static/JetBrainsMono-Bold.ttf": {path: engineFont, type: "font/ttf"},
  "/core/runtime.js": {path: `${experimentRoot}/core/runtime.js`, type: "text/javascript; charset=utf-8"},
  "/core/cache.js": {path: `${updateRoot}/browser/release-cache.js`, type: "text/javascript; charset=utf-8"},
  "/core/browser-control.js": {path: `${experimentRoot}/core/browser-control.js`, type: "text/javascript; charset=utf-8"},
  "/update/page-update.js": {path: `${updateRoot}/browser/page-update.js`, type: "text/javascript; charset=utf-8"},
  "/core/monitor.js": {path: `${experimentRoot}/core/monitor.js`, type: "text/javascript; charset=utf-8"},
  "/core/lifecycle.js": {path: `${experimentRoot}/core/lifecycle.js`, type: "text/javascript; charset=utf-8"},
  "/core/orchestration.js": {path: `${experimentRoot}/core/orchestration.js`, type: "text/javascript; charset=utf-8"},
})
let orchestrationBundle: Promise<string> | null = null
let layoutWorkerBundle: Promise<string> | null = null
let serviceWorkerBundle: Promise<string> | null = null
let webPushClientBundle: Promise<string> | null = null

function getOrchestrationBundle(): Promise<string> {
  orchestrationBundle ??= Bun.build({
    root: repositoryRoot,
    entrypoints: [orchestrationEntry],
    target: "browser",
    format: "esm",
    loader: {".wgsl": "text"},
    minify: false,
    sourcemap: "inline",
  }).then(async (result) => {
    if (!result.success || result.outputs.length === 0) {
      const detail = result.logs.map((log) => log.message).join("\n")
      throw new Error(`Hamiltonian orchestration bundle failed${detail ? `: ${detail}` : ""}`)
    }
    return await result.outputs[0]!.text()
  }).catch((error: unknown) => {
    throw new Error(`Hamiltonian orchestration bundle failed: ${browserBuildError(error)}`)
  })
  return orchestrationBundle
}

function getLayoutWorkerBundle(): Promise<string> {
  layoutWorkerBundle ??= Bun.build({
    root: repositoryRoot,
    entrypoints: [layoutWorkerEntry],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "inline",
  }).then(async (result) => {
    if (!result.success || result.outputs.length === 0) {
      const detail = result.logs.map((log) => log.message).join("\n")
      throw new Error(`Hamiltonian layout Worker bundle failed${detail ? `: ${detail}` : ""}`)
    }
    return await result.outputs[0]!.text()
  }).catch((error: unknown) => {
    throw new Error(`Hamiltonian layout Worker bundle failed: ${browserBuildError(error)}`)
  })
  return layoutWorkerBundle
}

function getServiceWorkerBundle(): Promise<string> {
  serviceWorkerBundle ??= Bun.build({
    root: repositoryRoot,
    entrypoints: [serviceWorkerEntry],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "inline",
  }).then(async (result) => {
    if (!result.success || result.outputs.length === 0) {
      const detail = result.logs.map((log) => log.message).join("\n")
      throw new Error(`Hamiltonian Service Worker bundle failed${detail ? `: ${detail}` : ""}`)
    }
    return await result.outputs[0]!.text()
  }).catch((error: unknown) => {
    throw new Error(`Hamiltonian Service Worker bundle failed: ${browserBuildError(error)}`)
  })
  return serviceWorkerBundle
}

function getWebPushClientBundle(): Promise<string> {
  webPushClientBundle ??= Bun.build({
    root: repositoryRoot,
    entrypoints: [webPushClientEntry],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "inline",
  }).then(async (result) => {
    if (!result.success || result.outputs.length === 0) {
      const detail = result.logs.map((log) => log.message).join("\n")
      throw new Error(`Hamiltonian Web Push client bundle failed${detail ? `: ${detail}` : ""}`)
    }
    return await result.outputs[0]!.text()
  }).catch((error: unknown) => {
    throw new Error(`Hamiltonian Web Push client bundle failed: ${browserBuildError(error)}`)
  })
  return webPushClientBundle
}

function browserBuildError(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error)
  const message = "message" in error ? String(error.message) : String(error)
  const logs = "logs" in error && Array.isArray(error.logs)
    ? error.logs.map((log) => typeof log === "object" && log !== null && "message" in log
      ? String(log.message)
      : String(log)).filter(Boolean)
    : []
  return logs.length === 0 ? message : `${message}: ${logs.join("\n")}`
}

function invalidateBrowserBundles(): void {
  orchestrationBundle = null
  layoutWorkerBundle = null
  serviceWorkerBundle = null
  webPushClientBundle = null
}

function isReloadableSource(filename: string | Buffer | null): boolean {
  if (filename === null) return false
  const value = String(filename)
  return /\.(?:html|css|js|ts|wgsl)$/.test(value) &&
    !/\.(?:spec|test)\.(?:js|ts)$/.test(value)
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  if (leftBytes.length !== rightBytes.length) return false
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index]! ^ rightBytes[index]!
  }
  return mismatch === 0
}

function isBrowserProfileLifecycleSnapshot(
  value: unknown,
  socket: HamiltonianServerSocketData,
  workerIdentity: string,
  workerRuntimeIncarnation: string,
  workerCodeVersion: string,
): value is HamiltonianLifecycleSnapshot {
  const browserEntityId = hamiltonianBrowserNodeId(socket.deviceId)
  if (
    !isHamiltonianLifecycleSnapshot(value) ||
    value.scopeId !== socket.workerEntityId ||
    !isHamiltonianLifecycleOwnershipClosed(value, [browserEntityId])
  ) return false
  const entities = value.envelopes
    .filter(({observation}) => observation.type === "entity")
    .map(({observation}) => observation)
  const browser = entities.find(({subjectId}) => subjectId === browserEntityId)
  const worker = entities.find(({subjectId}) => subjectId === socket.workerEntityId)
  return entities.filter(({subjectKind}) => subjectKind === "browser-runtime").length === 1 &&
    entities.filter(({subjectKind}) => subjectKind === "service").length === 1 &&
    browser?.subjectKind === "browser-runtime" &&
    browser.ownerId === browserEntityId &&
    browser.attributes.profileId === socket.deviceId &&
    typeof browser.attributes.runtime === "string" &&
    browser.attributes.runtime.length > 0 &&
    worker?.subjectKind === "service" &&
    worker.ownerId === browserEntityId &&
    worker.attributes.identity === workerIdentity &&
    worker.attributes.runtimeIncarnation === workerRuntimeIncarnation &&
    worker.attributes.codeVersion === workerCodeVersion &&
    isHamiltonianServiceWorkerCodeVersion(worker.attributes.codeVersion)
}

function parseClientMessage(value: string | Buffer): HamiltonianClientMessage | null {
  if (value.length > 128 * 1024) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(typeof value === "string" ? value : value.toString())
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) return null

  const monitor = parseClientLifecycleMonitor(parsed)
  if (monitor === null) return null

  if (
    parsed.kind === "pong" &&
    "at" in parsed && typeof parsed.at === "number" &&
    "seq" in parsed && typeof parsed.seq === "number" &&
    "workerIdentity" in parsed && validWorkerIdentity(parsed.workerIdentity) &&
    "workerRuntimeIncarnation" in parsed && validWorkerIdentity(parsed.workerRuntimeIncarnation)
  ) {
    return withClientLifecycleMonitor({
      kind: "pong",
      at: parsed.at,
      seq: parsed.seq,
      workerIdentity: parsed.workerIdentity,
      workerRuntimeIncarnation: parsed.workerRuntimeIncarnation,
    }, monitor)
  }

  if (
    parsed.kind === "identity" &&
    "workerIdentity" in parsed && validWorkerIdentity(parsed.workerIdentity) &&
    "workerRuntimeIncarnation" in parsed && validWorkerIdentity(parsed.workerRuntimeIncarnation) &&
    "workerCodeVersion" in parsed && isHamiltonianServiceWorkerCodeVersion(parsed.workerCodeVersion) &&
    "resumeNonce" in parsed &&
    typeof parsed.resumeNonce === "string" &&
    parsed.resumeNonce.length > 0 &&
    parsed.resumeNonce.length <= 128 &&
    "lifecycleSnapshot" in parsed && isHamiltonianLifecycleSnapshot(parsed.lifecycleSnapshot) &&
    (!("lifecycleDeclaration" in parsed) || parsed.lifecycleDeclaration === undefined ||
      isHamiltonianNodeSystemDeclaration(parsed.lifecycleDeclaration)) &&
    (
      (!("wakeId" in parsed) || parsed.wakeId === undefined) &&
      (!("wakeProof" in parsed) || parsed.wakeProof === undefined) ||
      ("wakeId" in parsed && validWorkerIdentity(parsed.wakeId) &&
        "wakeProof" in parsed && validWorkerIdentity(parsed.wakeProof))
    )
  ) {
    return withClientLifecycleMonitor({
      kind: "identity",
      workerIdentity: parsed.workerIdentity,
      workerRuntimeIncarnation: parsed.workerRuntimeIncarnation,
      workerCodeVersion: parsed.workerCodeVersion,
      resumeNonce: parsed.resumeNonce,
      lifecycleSnapshot: parsed.lifecycleSnapshot,
      ...("lifecycleDeclaration" in parsed &&
        isHamiltonianNodeSystemDeclaration(parsed.lifecycleDeclaration)
        ? {lifecycleDeclaration: parsed.lifecycleDeclaration}
        : {}),
      ...("wakeId" in parsed && typeof parsed.wakeId === "string" ? {wakeId: parsed.wakeId} : {}),
      ...("wakeProof" in parsed && typeof parsed.wakeProof === "string" ? {wakeProof: parsed.wakeProof} : {}),
    }, monitor)
  }

  if (
    parsed.kind === "browser-lifecycle-snapshot" &&
    "snapshot" in parsed && isHamiltonianLifecycleSnapshot(parsed.snapshot) &&
    (!("declaration" in parsed) || parsed.declaration === undefined ||
      isHamiltonianNodeSystemDeclaration(parsed.declaration))
  ) {
    return withClientLifecycleMonitor({
      kind: "browser-lifecycle-snapshot",
      snapshot: parsed.snapshot,
      ...("declaration" in parsed && isHamiltonianNodeSystemDeclaration(parsed.declaration)
        ? {declaration: parsed.declaration}
        : {}),
    }, monitor)
  }

  if (
    parsed.kind === "push-subscription" &&
    "registrationId" in parsed && validWorkerIdentity(parsed.registrationId) &&
    "subscription" in parsed && isHamiltonianPushSubscription(parsed.subscription)
  ) {
    return withClientLifecycleMonitor({
      kind: "push-subscription",
      registrationId: parsed.registrationId,
      subscription: parsed.subscription,
    }, monitor)
  }

  if (
    parsed.kind === "lifecycle-retirement" &&
    "envelope" in parsed &&
    isHamiltonianLifecycleEnvelope(parsed.envelope)
  ) {
    return withClientLifecycleMonitor({
      kind: "lifecycle-retirement",
      envelope: parsed.envelope,
    }, monitor)
  }

  if (
    parsed.kind === "peer-signal" &&
    "peerId" in parsed && typeof parsed.peerId === "string" && parsed.peerId.length <= 256 &&
    "sessionEpoch" in parsed && typeof parsed.sessionEpoch === "string" && parsed.sessionEpoch.length <= 128 &&
    "peerGeneration" in parsed && typeof parsed.peerGeneration === "number" && Number.isSafeInteger(parsed.peerGeneration) && parsed.peerGeneration > 0 &&
    "authorityKey" in parsed && typeof parsed.authorityKey === "string" && parsed.authorityKey.length <= 512 &&
    "tabId" in parsed && typeof parsed.tabId === "string" && parsed.tabId.length <= 128 &&
    "signal" in parsed && validPeerSignal(parsed.signal)
  ) {
    return withClientLifecycleMonitor({
      kind: "peer-signal",
      peerId: parsed.peerId,
      sessionEpoch: parsed.sessionEpoch,
      peerGeneration: parsed.peerGeneration as number,
      authorityKey: parsed.authorityKey,
      tabId: parsed.tabId,
      signal: parsed.signal,
    }, monitor)
  }

  if (
    parsed.kind === "peer-failed" &&
    "peerId" in parsed && typeof parsed.peerId === "string" && parsed.peerId.length <= 256 &&
    "sessionEpoch" in parsed && typeof parsed.sessionEpoch === "string" && parsed.sessionEpoch.length <= 128 &&
    "peerGeneration" in parsed && typeof parsed.peerGeneration === "number" && Number.isSafeInteger(parsed.peerGeneration) && parsed.peerGeneration > 0 &&
    "authorityKey" in parsed && typeof parsed.authorityKey === "string" && parsed.authorityKey.length <= 512 &&
    "tabId" in parsed && typeof parsed.tabId === "string" && parsed.tabId.length <= 128 &&
    "reason" in parsed && typeof parsed.reason === "string" && parsed.reason.length <= 256
  ) {
    return withClientLifecycleMonitor({
      kind: "peer-failed",
      peerId: parsed.peerId,
      sessionEpoch: parsed.sessionEpoch,
      peerGeneration: parsed.peerGeneration as number,
      authorityKey: parsed.authorityKey,
      tabId: parsed.tabId,
      reason: parsed.reason,
    }, monitor)
  }

  if (parsed.kind !== "tabs" || !("windows" in parsed) || !Array.isArray(parsed.windows)) {
    return null
  }
  if (parsed.windows.length > 64) return null

  const windows: WindowCandidate[] = []
  for (const candidate of parsed.windows) {
    if (!candidate || typeof candidate !== "object") return null
    if (!("tabId" in candidate) || typeof candidate.tabId !== "string") return null
    if (!("joinedAt" in candidate) || typeof candidate.joinedAt !== "number") return null
    if (!("visible" in candidate) || typeof candidate.visible !== "boolean") return null
    if (!candidate.tabId || candidate.tabId.length > 128 || !Number.isFinite(candidate.joinedAt)) {
      return null
    }
    windows.push({
      tabId: candidate.tabId,
      joinedAt: candidate.joinedAt,
      visible: candidate.visible,
    })
  }
  return withClientLifecycleMonitor({kind: "tabs", windows}, monitor)
}

function parseClientLifecycleMonitor(value: object): ClientLifecycleMonitor | null | undefined {
  if (!("monitor" in value)) return undefined
  const monitor = value.monitor
  if (
    !monitor ||
    typeof monitor !== "object" ||
    !("messageId" in monitor) ||
    typeof monitor.messageId !== "string" ||
    !monitor.messageId.startsWith("message:") ||
    monitor.messageId.length > 512 ||
    !("transportId" in monitor) ||
    typeof monitor.transportId !== "string" ||
    !monitor.transportId.startsWith("websocket:") ||
    monitor.transportId.length > 512
  ) return null
  return {messageId: monitor.messageId, transportId: monitor.transportId}
}

function withClientLifecycleMonitor<T extends
  ClientTabsMessage |
  ClientPongMessage |
  ClientIdentityMessage |
  ClientPushSubscriptionMessage |
  ClientPeerSignalMessage |
  ClientPeerFailedMessage |
  ClientLifecycleRetirementMessage |
  ClientBrowserLifecycleSnapshotMessage
>(
  message: T,
  monitor: ClientLifecycleMonitor | undefined,
): T & {monitor?: ClientLifecycleMonitor} {
  return monitor === undefined ? message : {...message, monitor}
}

function isObservedSupersededServiceWorkerEnd(
  envelope: HamiltonianLifecycleEnvelope,
  successorWorkerEntityId: string,
  browserEntityId: string,
): boolean {
  const observation = envelope.observation
  return envelope.sourceKind === "page" &&
    envelope.sourceId === hamiltonianLifecycleEntityId("page", envelope.sourceIncarnation) &&
    observation.type === "entity" &&
    observation.phase === "ended" &&
    observation.subjectKind === "service" &&
    observation.subjectId !== successorWorkerEntityId &&
    observation.ownerId === browserEntityId &&
    observation.attributes.state === "ended" &&
    observation.attributes.successor === successorWorkerEntityId
}

function validPeerSignal(value: unknown): value is PeerSignal {
  if (!value || typeof value !== "object" || !("type" in value)) return false
  if (value.type === "candidate") {
    if (!("candidate" in value) || value.candidate === null) return "candidate" in value
    const candidate = value.candidate
    if (!candidate || typeof candidate !== "object" || !("candidate" in candidate)) return false
    if (typeof candidate.candidate !== "string" || candidate.candidate.length > 8_192) return false
    if (
      "sdpMid" in candidate &&
      candidate.sdpMid !== null &&
      candidate.sdpMid !== undefined &&
      (typeof candidate.sdpMid !== "string" || candidate.sdpMid.length > 256)
    ) return false
    if (
      "sdpMLineIndex" in candidate &&
      candidate.sdpMLineIndex !== null &&
      candidate.sdpMLineIndex !== undefined &&
      (!Number.isSafeInteger(candidate.sdpMLineIndex) || Number(candidate.sdpMLineIndex) < 0)
    ) return false
    if (
      "usernameFragment" in candidate &&
      candidate.usernameFragment !== null &&
      candidate.usernameFragment !== undefined &&
      (typeof candidate.usernameFragment !== "string" || candidate.usernameFragment.length > 256)
    ) return false
    return true
  }
  if (value.type !== "description" || !("description" in value)) return false
  const description = value.description
  return Boolean(
    description &&
    typeof description === "object" &&
    "type" in description &&
    (description.type === "offer" || description.type === "answer") &&
    "sdp" in description &&
    typeof description.sdp === "string" &&
    description.sdp.length <= 100_000,
  )
}

function isRealtimeControlPayload(value: string | Buffer): boolean {
  try {
    const parsed = JSON.parse(typeof value === "string" ? value : value.toString()) as {
      kind?: unknown
      lane?: unknown
    }
    return parsed?.lane === "oracle" || parsed?.lane === "force" ||
      (typeof parsed?.kind === "string" && /^(oracle|force)(?:[.-]|$)/.test(parsed.kind))
  } catch {
    return false
  }
}

function moduleSource(version: string): string {
  return [
    `export const version = ${JSON.stringify(version)};`,
    "export function createEmbodiment(context) {",
    "  const runtime = String(context.runtime);",
    "  const role = String(context.role ?? runtime);",
    "  const incarnation = String(context.incarnation);",
    "  const authority = context.authority ?? null;",
    "  let state = 'created';",
    "  const snapshot = () => ({runtime, role, incarnation, version, state, authority});",
    "  return {",
    "    start() {",
    "      if (state !== 'created') throw new Error(`cannot start embodiment from ${state}`);",
    "      state = 'active';",
    "      return snapshot();",
    "    },",
    "    stop() {",
    "      if (state === 'active') state = 'stopped';",
    "      return snapshot();",
    "    },",
    "    snapshot,",
    "  };",
    "}",
    "export function describe() {",
    "  return `versioned module ${version} loaded through Hamiltonian cache`;",
    "}",
    "",
  ].join("\n")
}

async function directlyServedBrowserSourceArtifacts(): Promise<Record<string, string>> {
  const artifacts = await Promise.all(Object.entries(browserStaticFiles)
    .filter(([, {type}]) => type !== "font/ttf")
    .map(async ([pathname, {path}]) => [pathname, await Bun.file(path).text()] as const))
  return Object.fromEntries(artifacts)
}

async function currentHamiltonianBrowserSourceRevision(): Promise<string> {
  const [
    orchestrationBundle,
    layoutWorkerBundle,
    serviceWorkerBundle,
    webPushClientBundle,
    directlyServedText,
  ] = await Promise.all([
    getOrchestrationBundle(),
    getLayoutWorkerBundle(),
    getServiceWorkerBundle(),
    getWebPushClientBundle(),
    directlyServedBrowserSourceArtifacts(),
  ])
  return hamiltonianBrowserSourceRevision({
    orchestrationBundle,
    layoutWorkerBundle,
    serviceWorkerBundle,
    webPushClientBundle,
    directlyServedText,
  })
}

function securityHeaders(contentType: string): HeadersInit {
  return {
    "cache-control": "no-store",
    "content-type": contentType,
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  }
}

const CONTENT_SECURITY_POLICY = "default-src 'self'; connect-src 'self' ws: wss: data:; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'"

function staticResponse(pathname: string): Response | null {
  const entry = browserStaticFiles[pathname]
  if (!entry) return null
  const headers = new Headers(securityHeaders(entry.type))
  headers.set("content-security-policy", "default-src 'self'; connect-src 'self' ws: wss: data:; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'")
  return new Response(Bun.file(entry.path), {headers})
}

function authorized(request: Request, expectedToken: string): boolean {
  const authorization = request.headers.get("authorization")
  return authorization?.startsWith("Bearer ") === true &&
    safeEqual(authorization.slice("Bearer ".length), expectedToken)
}

async function boundedJson(request: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Request body is too large")
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).length > maxBytes) throw new Error("Request body is too large")
  return JSON.parse(text) as unknown
}

export const hostname = Bun.env.HAMILTONIAN_HOST ?? "127.0.0.1"
export const port = Number(Bun.env.HAMILTONIAN_PORT ?? 4400)
export const identity = Bun.env.HAMILTONIAN_ID ?? "hamiltonian-lab"
export const version = Bun.env.HAMILTONIAN_VERSION ?? "v1"
export const token = Bun.env.HAMILTONIAN_TOKEN ?? crypto.randomUUID()
const tlsCertPath = Bun.env.HAMILTONIAN_TLS_CERT
const tlsKeyPath = Bun.env.HAMILTONIAN_TLS_KEY
const heartbeatMs = Number(Bun.env.HAMILTONIAN_HEARTBEAT_MS ?? 10_000)
export const placement = Bun.env.HAMILTONIAN_PLACEMENT ?? "browser"
const configuredVapidPublicKey = Bun.env.HAMILTONIAN_VAPID_PUBLIC_KEY
const configuredVapidPrivateKey = Bun.env.HAMILTONIAN_VAPID_PRIVATE_KEY
const configuredVapidSubject = Bun.env.HAMILTONIAN_VAPID_SUBJECT
const webPushStoragePath = Bun.env.HAMILTONIAN_WEB_PUSH_STORAGE_PATH ??
  `${repositoryRoot}/.metafor/hamiltonian-web-push.json`
  let observeWebPushLifecycle: WebPushLifecycleHook = () => {}
  const webPush = new HamiltonianWebPush({
    ...(configuredVapidPublicKey === undefined ? {} : {publicKey: configuredVapidPublicKey}),
    ...(configuredVapidPrivateKey === undefined ? {} : {privateKey: configuredVapidPrivateKey}),
    ...(configuredVapidSubject === undefined ? {} : {subject: configuredVapidSubject}),
    storagePath: webPushStoragePath,
    onLifecycle: (event) => observeWebPushLifecycle(event),
  })
  if (placement !== "browser" && placement !== "server") {
    throw new Error(`Unknown Hamiltonian placement: ${placement}`)
  }
  if ((tlsCertPath && !tlsKeyPath) || (!tlsCertPath && tlsKeyPath)) {
    throw new Error("HAMILTONIAN_TLS_CERT and HAMILTONIAN_TLS_KEY must be provided together")
  }

  const hostStartedAt = Date.now()
  const hostEpoch = crypto.randomUUID()
  const serverEntityId = hamiltonianLifecycleEntityId("server", hostEpoch)
  const serverLogicalContourId = hamiltonianLogicalContourId("server", identity)
  const serverMainRole = placement === "server" ? "main" : "main-probe"
  const serverWorkerRole = placement === "server" ? "worker" : "worker-probe"
  let serverFencingToken = 1
  const makeServerAuthority = (fencingToken: number): EmbodimentAuthority => ({
    hostEpoch,
    connectionId: "bun-host",
    holderId: "main",
    fencingToken,
    leaseId: makeLeaseId(hostEpoch, fencingToken, "bun-host", "main"),
    expiresAt: Number.MAX_SAFE_INTEGER,
  })
  let serverAuthority = placement === "server" ? makeServerAuthority(serverFencingToken) : null
  const topology = new HostTopology(hostEpoch)
  const sockets = new Map<string, Bun.ServerWebSocket<HamiltonianServerSocketData>>()
  const serviceWorkerAdmission = new HamiltonianServiceWorkerAdmissionRegistry()
  let controlConnectionGeneration = 0
  const sourceWatchers: FSWatcher[] = []
  let sourceUpdateTimer: ReturnType<typeof setTimeout> | null = null
  let sourceUpdateGeneration = 0
  const detachedAuthorities = new Map<string, {
    expiresAt: number
    deviceId: string
    workerIdentity: string
    resumeNonce: string
  }>()
  const pendingWakes = new Map<string, PendingPushWake>()
  const pendingWakeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const detachedLeaseTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const browserProfileReachabilityTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const events: HostEvent[] = []
  let boundPort = port
  let broadcastTopology = () => {}
  const record = (event: HostEvent) => {
    events.push(event)
    if (events.length > 500) events.splice(0, events.length - 500)
  }
  const currentServiceWorkerRelease = async (): Promise<HamiltonianServiceWorkerRelease> => {
    return hamiltonianServiceWorkerRelease(await getServiceWorkerBundle())
  }
  const applyServiceWorkerUpdateState = (socket: Bun.ServerWebSocket<HamiltonianServerSocketData>) => {
    socket.data.identityConfirmed = false
    socket.data.retainAuthorityOnClose = false
    socket.data.workerUpdateRequired = true
  }
  const sendServiceWorkerUpdate = (
    socket: Bun.ServerWebSocket<HamiltonianServerSocketData>,
    target: HamiltonianServiceWorkerRelease,
  ) => {
    sendControl(socket, {kind: "service-update", target})
    record({
      at: Date.now(),
      kind: "service-update-required",
      connectionId: socket.data.connectionId,
      detail: `${socket.data.workerEntityId} ${socket.data.workerCodeVersion ?? "unknown"} -> ${target.version}`,
    })
  }
  const revokeServiceWorkerApplication = async (
    staleSockets: ReadonlyArray<Bun.ServerWebSocket<HamiltonianServerSocketData>>,
  ) => {
    for (const socket of staleSockets) topology.disconnect(socket.data.connectionId)
    if (staleSockets.length === 0) return
    broadcastTopology()
    await peerOperations
  }
  const reconcileServiceWorkerReleases = async (target: HamiltonianServiceWorkerRelease) => {
    const updates = serviceWorkerAdmission.reconcileRelease([...sockets.values()].map((socket) => ({
      endpoint: socket,
      profileId: socket.data.deviceId,
      workerEntityId: socket.data.workerEntityId,
      runtimeIncarnation: socket.data.workerRuntimeIncarnation,
      codeVersion: socket.data.workerCodeVersion,
      applicationAdmitted: socket.data.identityConfirmed,
    })), target)
    for (const {endpoint} of updates) applyServiceWorkerUpdateState(endpoint)
    const revokedSockets = updates
      .filter(({revokeApplication}) => revokeApplication)
      .map(({endpoint}) => endpoint)
    await revokeServiceWorkerApplication(revokedSockets)
    for (const {endpoint, target: updateTarget} of updates) {
      sendServiceWorkerUpdate(endpoint, updateTarget)
    }
  }
  const clearPendingWake = (workerEntityId: string, wakeId: string): boolean => {
    if (pendingWakes.get(workerEntityId)?.wakeId !== wakeId) return false
    pendingWakes.delete(workerEntityId)
    const timer = pendingWakeTimers.get(workerEntityId)
    if (timer) clearTimeout(timer)
    pendingWakeTimers.delete(workerEntityId)
    return true
  }
  const source = moduleSource(version)
  const moduleRelease = hamiltonianVersionedModuleRelease(version, source)
  const sourceHash = moduleRelease.sha256
  const indexResponse = async (localJoinToken = "") => {
    const servedAt = Date.now()
    const navigationId = crypto.randomUUID()
    const browserSourceRevision = await currentHamiltonianBrowserSourceRevision()
    const template = await Bun.file(`${publicRoot}/index.html`).text()
    const html = template
      .replaceAll("__HAMILTONIAN_HOST_IDENTITY__", escapeHtmlAttribute(identity))
      .replaceAll("__HAMILTONIAN_HOST_EPOCH__", escapeHtmlAttribute(hostEpoch))
      .replaceAll("__HAMILTONIAN_HOST_VERSION__", escapeHtmlAttribute(version))
      .replaceAll("__HAMILTONIAN_NAVIGATION_ID__", escapeHtmlAttribute(navigationId))
      .replaceAll("__HAMILTONIAN_SERVED_AT__", String(servedAt))
      .replaceAll("__HAMILTONIAN_BROWSER_SOURCE_REVISION__", escapeHtmlAttribute(browserSourceRevision))
      .replaceAll("__HAMILTONIAN_LOCAL_JOIN_TOKEN__", escapeHtmlAttribute(localJoinToken))
    const headers = new Headers(securityHeaders("text/html; charset=utf-8"))
    headers.set("content-security-policy", "default-src 'self'; connect-src 'self' ws: wss: data:; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'")
    return new Response(html, {headers})
  }
  const hostLifecycleJournal = new HamiltonianLifecycleRetainedJournal(serverEntityId)
  const nodeSystemDeclarations = new HamiltonianNodeSystemDeclarationRegistry()
  let serverDeclarationRevision = 0
  const broadcastLifecycleEnvelope = (value: HamiltonianLifecycleEnvelope) => {
    const payload = JSON.stringify({kind: "lifecycle", envelope: value})
    for (const observer of sockets.values()) {
      if (!observer.data.identityConfirmed) continue
      if (observer.getBufferedAmount() <= 256_000) observer.send(payload)
    }
  }
  const broadcastLifecycleSnapshot = () => {
    const payload = JSON.stringify({kind: "lifecycle-snapshot", snapshot: hostLifecycleJournal.snapshot()})
    for (const observer of sockets.values()) {
      if (!observer.data.identityConfirmed) continue
      if (observer.getBufferedAmount() <= 256_000) observer.send(payload)
    }
  }
  const mergeBrowserLifecycleSnapshot = (snapshot: HamiltonianLifecycleSnapshot) => {
    if (!hostLifecycleJournal.merge(snapshot)) return false
    broadcastLifecycleSnapshot()
    return true
  }
  const cancelBrowserProfileReachabilityExpiry = (deviceId: string) => {
    const timer = browserProfileReachabilityTimers.get(deviceId)
    if (timer) clearTimeout(timer)
    browserProfileReachabilityTimers.delete(deviceId)
  }
  const forgetBrowserProfileIfUnreachable = (
    deviceId: string,
    workerEntityId: string,
    connectionId?: string,
  ): boolean => {
    if (
      [...sockets.values()].some((candidate) =>
        candidate.data.identityConfirmed && candidate.data.deviceId === deviceId) ||
      webPush.has(workerEntityId) ||
      pendingWakes.has(workerEntityId)
    ) return false
    cancelBrowserProfileReachabilityExpiry(deviceId)
    const browserEntityId = hamiltonianBrowserNodeId(deviceId)
    if (!hostLifecycleJournal.forgetEntityTree(browserEntityId)) return false
    serviceWorkerAdmission.forgetEmbodiment(workerEntityId)
    broadcastLifecycleSnapshot()
    record({
      at: Date.now(),
      kind: "browser-profile-unreachable",
      ...(connectionId === undefined ? {} : {connectionId}),
      detail: browserEntityId,
    })
    return true
  }
  const scheduleBrowserProfileReachabilityExpiry = (
    deviceId: string,
    workerEntityId: string,
    connectionId: string,
    expiresAt: number,
  ) => {
    cancelBrowserProfileReachabilityExpiry(deviceId)
    const timer = setTimeout(() => {
      browserProfileReachabilityTimers.delete(deviceId)
      forgetBrowserProfileIfUnreachable(deviceId, workerEntityId, connectionId)
    }, Math.max(0, expiresAt - Date.now()))
    browserProfileReachabilityTimers.set(deviceId, timer)
  }
  const relayLifecycleEnvelope = (value: unknown) => {
    if (!isHamiltonianLifecycleEnvelope(value)) return
    hostLifecycleJournal.observe(value)
    broadcastLifecycleEnvelope(value)
  }
  const hostLifecycle = new HamiltonianLifecycleSource({
    id: serverEntityId,
    kind: "server",
    incarnation: hostEpoch,
    startedAt: hostStartedAt,
  })
  relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "born",
    subjectId: serverEntityId,
    subjectKind: "server",
    ownerId: serverEntityId,
    attributes: {identity, hostEpoch, version, placement, state: "active"},
  })))

  const sendNodeSystemDeclaration = (
    socket: Bun.ServerWebSocket<HamiltonianServerSocketData>,
    declaration: HamiltonianNodeSystemDeclaration,
  ) => {
    if (socket.getBufferedAmount() > 256_000) return
    socket.send(JSON.stringify({kind: "node-system-declaration", declaration}))
  }
  const broadcastNodeSystemDeclaration = (declaration: HamiltonianNodeSystemDeclaration) => {
    for (const socket of sockets.values()) {
      if (socket.data.identityConfirmed) sendNodeSystemDeclaration(socket, declaration)
    }
  }
  const browserDeclarationStartedAt = (
    snapshot: HamiltonianLifecycleSnapshot,
    workerRuntimeIncarnation: string,
  ) => snapshot.envelopes.find((envelope) =>
    envelope.sourceIncarnation === workerRuntimeIncarnation)?.sourceStartedAt ?? -1
  const browserDeclarationForSnapshot = (
    snapshot: HamiltonianLifecycleSnapshot,
    socket: HamiltonianServerSocketData,
    workerRuntimeIncarnation: string,
    supplied?: HamiltonianNodeSystemDeclaration,
  ): HamiltonianNodeSystemDeclaration | null => {
    const logicalContourId = hamiltonianLogicalContourId("browser-profile", socket.deviceId)
    const rootId = hamiltonianBrowserNodeId(socket.deviceId)
    const startedAt = browserDeclarationStartedAt(snapshot, workerRuntimeIncarnation)
    if (startedAt < 0) return null
    if (supplied !== undefined) {
      return supplied.logicalContourId === logicalContourId &&
        supplied.incarnation === workerRuntimeIncarnation &&
        supplied.incarnationStartedAt === startedAt &&
        supplied.revision === snapshot.revision &&
        supplied.rootId === rootId &&
        supplied.snapshot.snapshotId === snapshot.snapshotId &&
        supplied.boundaryTransports.length === 0
        ? supplied
        : null
    }
    return createHamiltonianNodeSystemDeclaration({
      logicalContourId,
      incarnation: workerRuntimeIncarnation,
      incarnationStartedAt: startedAt,
      revision: snapshot.revision,
      rootId,
      snapshot,
    })
  }
  const acceptBrowserDeclaration = (
    declaration: HamiltonianNodeSystemDeclaration,
  ): HamiltonianNodeSystemDeclaration | null => {
    const accepted = nodeSystemDeclarations.accept(declaration)
    if (accepted) {
      broadcastNodeSystemDeclaration(accepted.declaration)
      return accepted.declaration
    }
    const current = nodeSystemDeclarations.current(declaration.logicalContourId)
    if (
      current?.incarnation === declaration.incarnation &&
      current.revision === declaration.revision &&
      current.snapshot.snapshotId === declaration.snapshot.snapshotId
    ) {
      return current
    }
    return null
  }
  const serverBoundaryTransports = (
    snapshot: HamiltonianLifecycleSnapshot,
    observedSnapshot: HamiltonianLifecycleSnapshot,
  ): readonly HamiltonianNodeSystemBoundaryTransport[] =>
    projectHamiltonianNodeSystemBoundaryTransports({
      logicalContourId: serverLogicalContourId,
      incarnation: hostEpoch,
      rootId: serverEntityId,
      snapshot,
      observedSnapshot,
      declarations: nodeSystemDeclarations.values(),
    })
  const refreshServerDeclaration = (): HamiltonianNodeSystemDeclaration => {
    const observedSnapshot = hostLifecycleJournal.snapshot()
    const projected = projectHamiltonianLifecycleOwnershipScope(
      observedSnapshot,
      [serverEntityId],
    )
    if (!projected) throw new Error("Hamiltonian server lifecycle is not ownership-closed")
    const retainedSources = new Set(projected.envelopes.map((envelope) =>
      `${envelope.sourceId}\u0000${envelope.sourceIncarnation}`))
    for (const entry of nodeSystemDeclarations.current(serverLogicalContourId)?.snapshot.frontier ?? []) {
      retainedSources.add(`${entry.sourceId}\u0000${entry.sourceIncarnation}`)
    }
    const snapshot = Object.freeze({
      ...projected,
      frontier: Object.freeze(projected.frontier.filter((entry) =>
        retainedSources.has(`${entry.sourceId}\u0000${entry.sourceIncarnation}`))),
    })
    const declaration = createHamiltonianNodeSystemDeclaration({
      logicalContourId: serverLogicalContourId,
      incarnation: hostEpoch,
      incarnationStartedAt: hostStartedAt,
      revision: ++serverDeclarationRevision,
      rootId: serverEntityId,
      snapshot,
      boundaryTransports: serverBoundaryTransports(snapshot, observedSnapshot),
    })
    const accepted = nodeSystemDeclarations.accept(declaration)
    if (!accepted) throw new Error("Hamiltonian server declaration did not advance monotonically")
    return accepted.declaration
  }
  const broadcastServerDeclaration = () => {
    const declaration = refreshServerDeclaration()
    broadcastNodeSystemDeclaration(declaration)
    return declaration
  }
  const sendCurrentNodeSystemDeclarations = (socket: Bun.ServerWebSocket<HamiltonianServerSocketData>) => {
    const declaration = refreshServerDeclaration()
    sendNodeSystemDeclaration(
      socket,
      declaration.boundaryTransports.length === 0
        ? declaration
        : createHamiltonianNodeSystemDeclaration({...declaration, boundaryTransports: []}),
    )
  }
  const observeServiceWorkerAvailability = (
    workerEntityId: string,
    deviceId: string,
    attributes: Record<string, string | number | boolean | null>,
    causedBy?: string,
  ) => {
    const embodiment = serviceWorkerAdmission.embodiment(workerEntityId)
    relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: workerEntityId,
      subjectKind: "service",
      ownerId: hamiltonianBrowserNodeId(webPush.deviceIdFor(workerEntityId) ?? deviceId),
      attributes: {
        ...attributes,
        ...(embodiment === undefined ? {} : {codeVersion: embodiment.codeVersion}),
      },
    }), causedBy === undefined ? undefined : {causedBy}))
  }
  const webPushTransportId = (workerEntityId: string) =>
    hamiltonianLifecycleTransportId("web-push", workerEntityId)
  const webPushWorkerEntityId = (event: WebPushLifecycleEvent): string | null => {
    const detail = event.detail
    const candidate = event.subjectId ?? (
      detail && "subscriptionId" in detail ? detail.subscriptionId : null
    )
    return typeof candidate === "string" && candidate.startsWith("service:")
      ? candidate
      : null
  }
  observeWebPushLifecycle = (event) => {
    const workerEntityId = webPushWorkerEntityId(event)
    if (!workerEntityId) return
    const deviceId = webPush.deviceIdFor(workerEntityId)
    if (!deviceId) return
    const transportId = webPushTransportId(workerEntityId)
    if (event.type === "server.subscription-stored" || event.type === "server.subscription-replaced") {
      relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "opened",
        subjectId: transportId,
        subjectKind: "web-push",
        ownerId: serverEntityId,
        sourceEntityId: serverEntityId,
        targetEntityId: workerEntityId,
        transportId,
        attributes: {state: "ready", mediatedBy: "browser-push-service"},
      })))
      observeServiceWorkerAvailability(workerEntityId, deviceId, {push: "ready"})
      return
    }
    if (event.type === "server.subscription-removed") {
      relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "closed",
        subjectId: transportId,
        subjectKind: "web-push",
        ownerId: serverEntityId,
        sourceEntityId: serverEntityId,
        targetEntityId: workerEntityId,
        transportId,
        attributes: {reason: event.detail?.statusCode ?? "subscription-removed"},
      })))
      observeServiceWorkerAvailability(workerEntityId, deviceId, {push: "unavailable"})
      return
    }
    if (event.type === "server.push-queued") {
      observeServiceWorkerAvailability(workerEntityId, deviceId, {state: "waking", push: "sending"})
      return
    }
    if (event.type === "server.push-dispatched" && event.detail?.messageId) {
      const messageId = hamiltonianLifecycleMessageId(event.detail.messageId)
      relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
        type: "message",
        phase: "sent",
        subjectId: messageId,
        subjectKind: "web-push-message",
        ownerId: serverEntityId,
        sourceEntityId: serverEntityId,
        targetEntityId: workerEntityId,
        transportId,
        messageId,
        messageClass: "web-push",
      })))
      record({
        at: event.at,
        kind: "push-sent",
        detail: `${workerEntityId} ${event.detail.messageId}`,
      })
      observeServiceWorkerAvailability(workerEntityId, deviceId, {state: "waking", push: "sent"})
      return
    }
    if (event.type === "server.push-accepted") {
      observeServiceWorkerAvailability(workerEntityId, deviceId, {state: "waking", push: "accepted"})
      return
    }
    if (event.type === "server.push-failed") {
      observeServiceWorkerAvailability(workerEntityId, deviceId, {
        state: "error",
        push: "failed",
        ...(event.detail?.reason === undefined ? {} : {reason: event.detail.reason}),
      })
      return
    }
    if (event.type === "server.receipt-confirmed") {
      observeServiceWorkerAvailability(workerEntityId, deviceId, {state: "active", push: "received"})
    }
  }
  const observeHostIpcMessage = (event: {
    phase: "sent" | "received"
    messageId: string
    messageClass: string
    processEntityId: string
    transportId: string
  }) => {
    const sent = event.phase === "sent"
    relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
      type: "message",
      phase: event.phase,
      subjectId: event.messageId,
      subjectKind: "ipc-message",
      ownerId: serverEntityId,
      sourceEntityId: sent ? serverEntityId : event.processEntityId,
      targetEntityId: sent ? event.processEntityId : serverEntityId,
      transportId: event.transportId,
      messageId: event.messageId,
      messageClass: event.messageClass,
    })))
  }
  const sendControl = (
    socket: Bun.ServerWebSocket<HamiltonianServerSocketData>,
    message: Readonly<{kind: string}> & Record<string, unknown>,
  ) => {
    const messageId = `message:${encodeURIComponent(crypto.randomUUID())}`
    const monitor = {messageId, transportId: socket.data.lifecycleTransportId}
    if (socket.data.identityConfirmed) {
      relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
        type: "message",
        phase: "sent",
        subjectId: messageId,
        subjectKind: "websocket-message",
        ownerId: serverEntityId,
        sourceEntityId: serverEntityId,
        targetEntityId: socket.data.workerEntityId,
        transportId: socket.data.lifecycleTransportId,
        messageId,
        messageClass: message.kind,
      })))
    }
    socket.send(JSON.stringify({...message, monitor}))
  }
  const clearHeartbeatTimers = (socket: Bun.ServerWebSocket<HamiltonianServerSocketData>) => {
    if (socket.data.nextHeartbeatTimer !== null) clearTimeout(socket.data.nextHeartbeatTimer)
    if (socket.data.heartbeatTimeoutTimer !== null) clearTimeout(socket.data.heartbeatTimeoutTimer)
    socket.data.nextHeartbeatTimer = null
    socket.data.heartbeatTimeoutTimer = null
  }
  const challengeHeartbeat = (socket: Bun.ServerWebSocket<HamiltonianServerSocketData>) => {
    if (stopping || sockets.get(socket.data.connectionId) !== socket) return
    if (socket.data.lastChallengeSeq > socket.data.lastAckSeq) return
    socket.data.nextHeartbeatTimer = null
    socket.data.lastChallengeSeq += 1
    sendControl(socket, {
      kind: "ping",
      at: Date.now(),
      seq: socket.data.lastChallengeSeq,
    })
    const expiresAt = socket.data.lastPongAt + heartbeatMs * 3
    socket.data.heartbeatTimeoutTimer = setTimeout(() => {
      socket.data.heartbeatTimeoutTimer = null
      if (socket.data.lastChallengeSeq === socket.data.lastAckSeq) return
      record({at: Date.now(), kind: "heartbeat-timeout", connectionId: socket.data.connectionId})
      socket.data.retainAuthorityOnClose = false
      socket.close(4000, "heartbeat timeout")
    }, Math.max(1, expiresAt - Date.now()))
  }
  const scheduleHeartbeatAfterAck = (socket: Bun.ServerWebSocket<HamiltonianServerSocketData>) => {
    if (socket.data.nextHeartbeatTimer !== null) clearTimeout(socket.data.nextHeartbeatTimer)
    socket.data.nextHeartbeatTimer = setTimeout(() => challengeHeartbeat(socket), heartbeatMs)
  }

  const scheduleSourceUpdate = (filename: string | Buffer | null) => {
    if (!isReloadableSource(filename) || stopping) return
    sourceUpdateGeneration += 1
    const generation = sourceUpdateGeneration
    invalidateBrowserBundles()
    if (sourceUpdateTimer !== null) clearTimeout(sourceUpdateTimer)
    sourceUpdateTimer = setTimeout(() => {
      sourceUpdateTimer = null
      void Promise.all([
        currentHamiltonianBrowserSourceRevision(),
        currentServiceWorkerRelease(),
      ]).then(async ([revision, serviceWorkerRelease]) => {
        if (generation !== sourceUpdateGeneration || stopping) return
        record({at: Date.now(), kind: "source-update", detail: revision})
        await reconcileServiceWorkerReleases(serviceWorkerRelease)
        for (const socket of sockets.values()) {
          if (!socket.data.identityConfirmed) continue
          if (socket.getBufferedAmount() > 256_000) continue
          sendControl(socket, {kind: "source-update", revision})
        }
      }).catch((error: unknown) => {
        if (generation !== sourceUpdateGeneration || stopping) return
        record({
          at: Date.now(),
          kind: "source-update-failed",
          detail: error instanceof Error ? error.message : String(error),
        })
      })
    }, 120)
  }
  invalidateBrowserBundles()
  // Build once as soon as the host incarnation starts. A first navigation
  // must not pay the browser bundle compilation cost on its module request.
  void Promise.all([
    getOrchestrationBundle(),
    getLayoutWorkerBundle(),
    getServiceWorkerBundle(),
    getWebPushClientBundle(),
  ]).catch(() => {})
  let peerSnapshot: WeriftPeerSnapshot | null = null
  let peerError: string | null = null
  let peerAssignment: {
    key: string
    peerId: string
    sessionEpoch: string
    peerGeneration: number
    authorityKey: string
    connectionId: string
    tabId: string
  } | null = null
  let peerGeneration = 0
  let peerOperations: Promise<void> = Promise.resolve()
  let readyPeerKey: string | null = null
  let requestPeerRepair = (_reason: string) => {}
  let requestBunRepair = (_role: string, _reason: string) => {}
  let signalingUp = 0
  let signalingDown = 0
  let controlFramesIn = 0
  let controlBytesIn = 0
  let heartbeatAcks = 0
  let realtimeFramesRejected = 0
  let stalePeerFramesDropped = 0
  let peerRepairs = 0
  let stopping = false
  const peerSupervisor = new PeerProcessSupervisor({
    serverEntityId,
    // The loopback host already has a directly reachable endpoint. ICE-lite
    // avoids Werift waiting five seconds for its implicit public STUN probe.
    ...(isLoopbackHostname(hostname) ? {iceLite: true} : {}),
    onLifecycle(envelope) {
      if (!isHamiltonianLifecycleEnvelope(envelope)) return
      relayLifecycleEnvelope(envelope)
      if (!stopping && envelope.observation.type !== "message") {
        broadcastServerDeclaration()
      }
    },
    onMessage(event) {
      observeHostIpcMessage(event)
    },
    onProcessExit(event) {
      const closed = hostLifecycle.next(createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "closed",
        subjectId: event.transportId,
        subjectKind: "ipc",
        ownerId: serverEntityId,
        sourceEntityId: serverEntityId,
        targetEntityId: event.entityId,
        transportId: event.transportId,
        attributes: {reason: event.reason.slice(0, 256)},
      }))
      relayLifecycleEnvelope(closed)
      relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "ended",
        subjectId: event.entityId,
        subjectKind: "peer-process",
        ownerId: serverEntityId,
        attributes: {
          incarnation: event.incarnation,
          role: event.role,
          state: "stopped",
          reason: event.reason.slice(0, 256),
        },
      }), {causedBy: closed.eventId}))
    },
    onSignal(peerId, signal) {
      const assignment = peerAssignment
      if (!assignment || assignment.peerId !== peerId) return
      const socket = sockets.get(assignment.connectionId)
      if (!socket || socket.getBufferedAmount() > 256_000) return
      signalingDown += 1
      sendControl(socket, {
        kind: "peer-signal",
        peerId,
        sessionEpoch: assignment.sessionEpoch,
        peerGeneration: assignment.peerGeneration,
        authorityKey: assignment.authorityKey,
        tabId: assignment.tabId,
        signal,
      })
    },
    onState(snapshot, error, errorPeerId) {
      peerSnapshot = snapshot
      const assignment = peerAssignment
      const matchesAssignment = Boolean(
        snapshot &&
        assignment &&
        snapshot.peerId === assignment.peerId &&
        snapshot.sessionEpoch === assignment.sessionEpoch,
      )
      const snapshotKey = snapshot ? `${snapshot.peerId}:${snapshot.sessionEpoch}` : null
      const errorMatchesAssignment = Boolean(
        error &&
        assignment &&
        (errorPeerId ? errorPeerId === assignment.peerId : matchesAssignment),
      )
      if (errorMatchesAssignment) {
        peerError = error ?? null
        readyPeerKey = null
        queueMicrotask(() => requestPeerRepair(`peer process failure: ${error}`))
      } else if (
        matchesAssignment &&
        snapshot &&
        snapshot.state === "connected" &&
        snapshot.channels.includes("oracle") &&
        snapshot.channels.includes("force")
      ) {
        peerError = null
        readyPeerKey = snapshotKey
      } else if (
        matchesAssignment &&
        snapshot &&
        readyPeerKey === snapshotKey &&
        (snapshot.state === "failed" || snapshot.state === "closed" || snapshot.channels.length < 2)
      ) {
        readyPeerKey = null
        queueMicrotask(() => requestPeerRepair(`server peer ${snapshot.state}`))
      }
      broadcastTopology()
    },
  })
  const bunEmbodiments = new BunEmbodimentSet(
    [serverMainRole, serverWorkerRole],
    () => broadcastTopology(),
    undefined,
    (_role, envelope) => relayLifecycleEnvelope(envelope),
    (_role, event) => observeHostIpcMessage(event),
    (role, event) => {
      const closed = hostLifecycle.next(createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "closed",
        subjectId: event.transportId,
        subjectKind: "ipc",
        ownerId: serverEntityId,
        sourceEntityId: serverEntityId,
        targetEntityId: event.entityId,
        transportId: event.transportId,
        attributes: {exitCode: event.exitCode, reason: event.reason.slice(0, 256)},
      }))
      relayLifecycleEnvelope(closed)
      relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "ended",
        subjectId: event.entityId,
        subjectKind: "bun-process",
        ownerId: serverEntityId,
        attributes: {
          incarnation: event.incarnation,
          role,
          state: "stopped",
          reason: event.reason.slice(0, 256),
        },
      }), {causedBy: closed.eventId}))
      queueMicrotask(() => requestBunRepair(role, event.reason))
    },
  )
  const hostState = () => ({
    identity,
    hostEpoch,
    version,
    placement,
    serverAuthority,
    bunEmbodiment: bunEmbodiments.snapshot()[serverMainRole],
    bunEmbodiments: bunEmbodiments.snapshot(),
    peer: {assignment: peerAssignment, snapshot: peerSnapshot, error: peerError},
  })

  const topologyState = () => {
    const snapshot = topology.snapshot()
    if (placement === "server") {
      return {...snapshot, leaseDurationMs: heartbeatMs * 3, leader: null}
    }
    const leaderSocket = snapshot.leader ? sockets.get(snapshot.leader.connectionId) : null
    const detachedExpiry = snapshot.leader
      ? detachedAuthorities.get(snapshot.leader.connectionId)?.expiresAt
      : undefined
    return {
      ...snapshot,
      leaseDurationMs: heartbeatMs * 3,
      leader: snapshot.leader
        ? {
          ...snapshot.leader,
          leaseExpiresAt: leaderSocket
            ? leaderSocket.data.lastPongAt + heartbeatMs * 3
            : detachedExpiry ?? 0,
        }
        : null,
    }
  }

  const observableState = () => ({
    identity,
    hostEpoch,
    version,
    placement,
    serverAuthority,
    listener: {hostname, port: boundPort},
    topology: topologyState(),
    serverEmbodiments: bunEmbodiments.snapshot(),
    peer: {
      assignment: peerAssignment,
      snapshot: peerSnapshot,
      process: peerSupervisor.processSnapshot(),
      error: peerError,
      signalingUp,
      signalingDown,
      realtimeFramesOnControlSocket: 0,
      realtimeFramesRejected,
      stalePeerFramesDropped,
      peerRepairs,
      controlFramesIn,
      controlBytesIn,
      heartbeatAcks,
    },
    connections: [...sockets.values()].map((socket) => ({
      connectionId: socket.data.connectionId,
      deviceId: socket.data.deviceId,
      workerIdentity: socket.data.workerIdentity,
      workerRuntimeIncarnation: socket.data.workerRuntimeIncarnation,
      workerCodeVersion: socket.data.workerCodeVersion,
      identityConfirmed: socket.data.identityConfirmed,
      workerUpdateRequired: socket.data.workerUpdateRequired,
      openedAt: socket.data.openedAt,
      lastPongAt: socket.data.lastPongAt,
      lastChallengeSeq: socket.data.lastChallengeSeq,
      lastAckSeq: socket.data.lastAckSeq,
    })),
    push: {
      publicKey: webPush.publicKey,
      subscriptions: webPush.snapshots(),
      pendingWakeIds: [...pendingWakes.entries()].map(([workerEntityId, wake]) => ({
        workerEntityId,
        wakeId: wake.wakeId,
        armedAt: wake.armedAt,
      })),
    },
    events: [...events],
  })

  const tryResumeDetachedAuthority = (
    socket: Bun.ServerWebSocket<HamiltonianServerSocketData>,
    windows: WindowCandidate[],
  ): boolean => {
    const leader = topology.snapshot().leader
    if (!leader || sockets.has(leader.connectionId)) return false
    const detached = detachedAuthorities.get(leader.connectionId)
    if (
      !detached ||
      Date.now() >= detached.expiresAt ||
      detached.deviceId !== socket.data.deviceId ||
      detached.workerIdentity !== socket.data.workerIdentity ||
      detached.resumeNonce !== socket.data.resumeNonce
    ) return false
    if (!topology.rebindLeaderConnection(leader.connectionId, socket.data.connectionId, windows)) {
      return false
    }

    const timer = detachedLeaseTimers.get(leader.connectionId)
    if (timer) clearTimeout(timer)
    detachedLeaseTimers.delete(leader.connectionId)
    detachedAuthorities.delete(leader.connectionId)
    if (peerAssignment?.connectionId === leader.connectionId) {
      peerAssignment = {...peerAssignment, connectionId: socket.data.connectionId}
    }
    record({
      at: Date.now(),
      kind: "authority-resumed",
      connectionId: socket.data.connectionId,
      detail: `from ${leader.connectionId}`,
    })
    const assignment = peerAssignment
    const readyAfterResume = assignment &&
      !peerError &&
      readyPeerKey === `${assignment.peerId}:${assignment.sessionEpoch}` &&
      peerSnapshot?.peerId === assignment.peerId &&
      peerSnapshot.sessionEpoch === assignment.sessionEpoch &&
      peerSnapshot.state === "connected" &&
      peerSnapshot.channels.includes("oracle") &&
      peerSnapshot.channels.includes("force")
    if (assignment && !readyAfterResume) {
      queueMicrotask(() => requestPeerRepair("control resumed without a ready peer session"))
    }
    return true
  }

  broadcastTopology = () => {
    const nextTopology = topologyState()
    const message = {
      kind: "topology",
      host: hostState(),
      topology: nextTopology,
    }
    for (const socket of sockets.values()) {
      if (!socket.data.identityConfirmed) continue
      if (socket.getBufferedAmount() > 256_000) {
        socket.close(1013, "control channel backpressure")
        continue
      }
      sendControl(socket, message)
    }
    schedulePeer(nextTopology.leader)
  }

  const schedulePeer = (leader: ReturnType<typeof topologyState>["leader"]) => {
    const nextKey = leader?.leaseId ?? null
    if (peerAssignment?.key === nextKey || (!peerAssignment && !nextKey)) return
    const previous = peerAssignment
    peerAssignment = leader
      ? {
        key: leader.leaseId,
        peerId: `peer:${leader.leaseId}:${peerGeneration += 1}`,
        sessionEpoch: crypto.randomUUID(),
        peerGeneration,
        authorityKey: authorityKey(leader)!,
        connectionId: leader.connectionId,
        tabId: leader.tabId,
      }
      : null
    readyPeerKey = null
    const next = peerAssignment
    peerOperations = peerOperations.then(async () => {
      if (previous) await peerSupervisor.closePeer(previous.peerId)
      if (next && peerAssignment?.key === next.key) {
        record({at: Date.now(), kind: "peer-begin", connectionId: next.connectionId, detail: next.peerId})
        await peerSupervisor.begin(next.peerId, next.sessionEpoch)
      }
    }).catch((error) => {
      peerError = error instanceof Error ? error.message : String(error)
    })
  }

  requestPeerRepair = (reason: string) => {
    const previous = peerAssignment
    if (!previous) return
    const leader = topologyState().leader
    if (
      !leader ||
      !sockets.has(previous.connectionId) ||
      leader.connectionId !== previous.connectionId ||
      leader.tabId !== previous.tabId ||
      authorityKey(leader) !== previous.authorityKey ||
      Date.now() >= leader.leaseExpiresAt
    ) return
    peerGeneration += 1
    const next = {
      ...previous,
      peerId: `peer:${leader.leaseId}:${peerGeneration}`,
      sessionEpoch: crypto.randomUUID(),
      peerGeneration,
    }
    peerAssignment = next
    readyPeerKey = null
    peerRepairs += 1
    record({
      at: Date.now(),
      kind: "peer-repair",
      connectionId: next.connectionId,
      detail: `${reason} -> ${next.peerId}`,
    })
    peerOperations = peerOperations.then(async () => {
      await peerSupervisor.closePeer(previous.peerId)
      if (peerAssignment?.peerId !== next.peerId) return
      await peerSupervisor.begin(next.peerId, next.sessionEpoch)
    }).catch((error) => {
      peerError = error instanceof Error ? error.message : String(error)
    })
    broadcastTopology()
  }

  export const tls = tlsCertPath && tlsKeyPath
    ? {tls: {cert: Bun.file(tlsCertPath), key: Bun.file(tlsKeyPath)}}
    : {}

export async function handleNavigation(localJoinToken: string): Promise<Response> {
  return await indexResponse(localJoinToken)
}

export async function handleOrchestrationBundle(): Promise<Response> {
  return await bundleResponse(getOrchestrationBundle)
}

export async function handleLayoutWorkerBundle(): Promise<Response> {
  return await bundleResponse(getLayoutWorkerBundle)
}

export async function handleWebPushClientBundle(): Promise<Response> {
  return await bundleResponse(getWebPushClientBundle)
}

export async function handleServiceWorkerBundle(): Promise<Response> {
  try {
    const headers = new Headers(securityHeaders("text/javascript; charset=utf-8"))
    headers.set("content-security-policy", CONTENT_SECURITY_POLICY)
    headers.set("service-allowed", "/")
    headers.set("cache-control", "no-cache")
    return new Response(await getServiceWorkerBundle(), {headers})
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), {status: 500})
  }
}

export function controlTokenMatches(suppliedToken: string): boolean {
  return safeEqual(suppliedToken, token)
}

export function nextControlSocketData(
  deviceId: string,
  lifecycleTransportId: string,
  workerEntityId: string,
): HamiltonianServerSocketData {
  return {
    connectionId: crypto.randomUUID(),
    connectionGeneration: ++controlConnectionGeneration,
    deviceId,
    lifecycleTransportId,
    workerEntityId,
    openedAt: Date.now(),
    lastPongAt: Date.now(),
    lastChallengeSeq: 0,
    lastAckSeq: 0,
    nextHeartbeatTimer: null,
    heartbeatTimeoutTimer: null,
    workerIdentity: null,
    workerRuntimeIncarnation: null,
    workerCodeVersion: null,
    resumeNonce: null,
    identityConfirmed: false,
    workerUpdateRequired: false,
    retainAuthorityOnClose: false,
    reportedEmptyWindowInventory: false,
  }
}

export function isAuthorizedRequest(request: Request): boolean {
  return authorized(request, token)
}

export function handleVapidPublicKey(): Response {
  return Response.json({publicKey: webPush.publicKey}, {
    headers: securityHeaders("application/json; charset=utf-8"),
  })
}

export async function readWakeWorkerIdentity(request: Request): Promise<string | null> {
  const input = await boundedJson(request)
  if (typeof input !== "object" || input === null || !("workerIdentity" in input)) return null
  if (!validWorkerIdentity(input.workerIdentity)) throw new Error("Invalid Service Worker identity")
  return input.workerIdentity
}

export function wakeWorkerEntityId(workerIdentity: string | null): string | null {
  return workerIdentity === null
    ? webPush.onlyWorkerEntityId()
    : hamiltonianLifecycleEntityId("service", workerIdentity)
}

export function hasPushSubscription(workerEntityId: string): boolean {
  return webPush.has(workerEntityId)
}

export function pushSubscriptionDeviceId(workerEntityId: string): string | null {
  return webPush.deviceIdFor(workerEntityId)
}

export function hasPendingWake(workerEntityId: string): boolean {
  return pendingWakes.has(workerEntityId)
}

export async function handleWakeServiceWorker(workerEntityId: string, workerDeviceId: string): Promise<Response> {
  const wakeId = crypto.randomUUID()
  const wakeProof = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
  const wake: PendingPushWake = {
    wakeId,
    wakeProof,
    armedAt: Date.now(),
    armedAfterConnectionGeneration: controlConnectionGeneration,
  }
  pendingWakes.set(workerEntityId, wake)
  pendingWakeTimers.set(workerEntityId, setTimeout(() => {
    pendingWakeTimers.delete(workerEntityId)
    if (pendingWakes.get(workerEntityId)?.wakeId !== wakeId) return
    pendingWakes.delete(workerEntityId)
    record({at: Date.now(), kind: "push-reconnect-timeout", detail: `${workerEntityId} ${wakeId}`})
    observeServiceWorkerAvailability(workerEntityId, workerDeviceId, {
      state: "error",
      push: "reconnect-failed",
      wakeId,
      reason: "push-reconnect-timeout",
    })
  }, 90_000))
  record({at: Date.now(), kind: "push-armed", detail: `${workerEntityId} ${wakeId}`})
  observeServiceWorkerAvailability(workerEntityId, workerDeviceId, {
    state: "waking",
    push: "armed",
    wakeId,
  })
  try {
    await webPush.wake(workerEntityId, {
      kind: "wake-service",
      wakeId,
      wakeProof,
      token,
      serverEntityId,
    })
    record({at: Date.now(), kind: "push-service-accepted", detail: `${workerEntityId} ${wakeId}`})
    return Response.json({ok: true, workerEntityId, wakeId}, {
      headers: securityHeaders("application/json; charset=utf-8"),
    })
  } catch {
    const reason = "RedactedError"
    if (!clearPendingWake(workerEntityId, wakeId)) {
      return Response.json({ok: true, workerEntityId, wakeId, delivery: "confirmed"}, {
        headers: securityHeaders("application/json; charset=utf-8"),
      })
    }
    record({at: Date.now(), kind: "push-send-failed", detail: `${workerEntityId} ${reason}`.slice(0, 512)})
    observeServiceWorkerAvailability(workerEntityId, workerDeviceId, {
      state: "error",
      push: "failed",
      reason,
    })
    return new Response("Web Push delivery failed", {status: 502})
  }
}

export async function handleManifest(): Promise<Response> {
  const serviceWorker = await currentServiceWorkerRelease()
  return Response.json(
    hamiltonianBrowserManifest(identity, moduleRelease, serviceWorker),
    {headers: securityHeaders("application/json; charset=utf-8")},
  )
}

export function handleStatus(): Response {
  return Response.json(observableState(), {
    headers: securityHeaders("application/json; charset=utf-8"),
  })
}

export const versionedModulePath = `/versions/${encodeURIComponent(version)}/module.js`

export function handleVersionedModule(): Response {
  const headers = new Headers(securityHeaders("text/javascript; charset=utf-8"))
  headers.set("x-hamiltonian-sha256", sourceHash)
  return new Response(source, {headers})
}

export function handleStaticAsset(pathname: string): Response {
  return staticResponse(pathname) ?? new Response("Not found", {status: 404})
}

async function bundleResponse(load: () => Promise<string>): Promise<Response> {
  try {
    return new Response(await load(), {headers: securityHeaders("text/javascript; charset=utf-8")})
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), {status: 500})
  }
}

type ControlSocket = Bun.ServerWebSocket<HamiltonianServerSocketData>

export function handleControlOpen(socket: ControlSocket): void {
  sockets.set(socket.data.connectionId, socket)
  topology.connect(socket.data.connectionId, socket.data.deviceId)
  record({at: Date.now(), kind: "connection-open", connectionId: socket.data.connectionId})
  sendCurrentNodeSystemDeclarations(socket)
  socket.send(JSON.stringify({kind: "lifecycle-snapshot", snapshot: hostLifecycleJournal.snapshot()}))
  sendControl(socket, {
    kind: "hello",
    connectionId: socket.data.connectionId,
    host: hostState(),
  })
  broadcastTopology()
  challengeHeartbeat(socket)
  void currentHamiltonianBrowserSourceRevision().then((revision) => {
    if (sockets.get(socket.data.connectionId) !== socket || !socket.data.identityConfirmed) return
    sendControl(socket, {kind: "source-update", revision})
  }).catch((error: unknown) => {
    record({
      at: Date.now(),
      kind: "source-update-failed",
      connectionId: socket.data.connectionId,
      detail: error instanceof Error ? error.message : String(error),
    })
  })
}

export function recordControlFrame(rawMessage: string | Buffer): void {
  controlFramesIn += 1
  controlBytesIn += rawMessage.length
}

export function isRealtimePayloadOnControlChannel(rawMessage: string | Buffer): boolean {
  return isRealtimeControlPayload(rawMessage)
}

export function rejectRealtimeControlPayload(socket: ControlSocket): void {
  realtimeFramesRejected += 1
  socket.data.retainAuthorityOnClose = false
  socket.close(1008, "realtime payload is forbidden on control channel")
}

export function parseControlMessage(rawMessage: string | Buffer): HamiltonianClientMessage | null {
  return parseClientMessage(rawMessage)
}

export function rejectInvalidControlMessage(socket: ControlSocket): void {
  socket.data.retainAuthorityOnClose = false
  socket.close(1008, "invalid control message")
}

export function applicationMessageAllowed(socket: ControlSocket, message: HamiltonianClientMessage): boolean {
  return serviceWorkerAdmission.applicationMessageAllowed(socket.data.identityConfirmed, message.kind)
}

export function acceptControlMessageMonitor(
  socket: ControlSocket,
  message: HamiltonianClientMessage,
): boolean {
  if (!message.monitor) return true
  if (message.monitor.transportId !== socket.data.lifecycleTransportId) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "control message transport identity mismatch")
    return false
  }
  if (socket.data.identityConfirmed) {
    relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "received",
      subjectId: message.monitor.messageId,
      subjectKind: "websocket-message",
      ownerId: serverEntityId,
      sourceEntityId: socket.data.workerEntityId,
      targetEntityId: serverEntityId,
      transportId: socket.data.lifecycleTransportId,
      messageId: message.monitor.messageId,
      messageClass: message.kind,
    })))
  }
  return true
}

export function handleLifecycleRetirement(
  socket: ControlSocket,
  message: ClientLifecycleRetirementMessage & {monitor?: ClientLifecycleMonitor},
): void {
  if (
    message.monitor === undefined ||
    !isObservedSupersededServiceWorkerEnd(
      message.envelope,
      socket.data.workerEntityId,
      hamiltonianBrowserNodeId(socket.data.deviceId),
    )
  ) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "invalid browser lifecycle retirement")
    return
  }
  hostLifecycleJournal.retireEntity(message.envelope.observation.subjectId)
  serviceWorkerAdmission.forgetEmbodiment(message.envelope.observation.subjectId)
  broadcastLifecycleEnvelope(message.envelope)
}

export function handleBrowserLifecycleSnapshot(
  socket: ControlSocket,
  message: ClientBrowserLifecycleSnapshotMessage,
): void {
  if (
    !socket.data.identityConfirmed ||
    !socket.data.workerIdentity ||
    !socket.data.workerRuntimeIncarnation ||
    !socket.data.workerCodeVersion ||
    !isBrowserProfileLifecycleSnapshot(
      message.snapshot,
      socket.data,
      socket.data.workerIdentity,
      socket.data.workerRuntimeIncarnation,
      socket.data.workerCodeVersion,
    )
  ) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "invalid browser lifecycle snapshot")
    return
  }
  const browserDeclaration = browserDeclarationForSnapshot(
    message.snapshot,
    socket.data,
    socket.data.workerRuntimeIncarnation,
    message.declaration,
  )
  if (!browserDeclaration || !acceptBrowserDeclaration(browserDeclaration)) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "invalid browser node-system declaration")
    return
  }
  mergeBrowserLifecycleSnapshot(message.snapshot)
  broadcastServerDeclaration()
}

export function handlePong(socket: ControlSocket, message: ClientPongMessage): void {
  if (
    message.seq !== socket.data.lastChallengeSeq ||
    message.seq <= socket.data.lastAckSeq ||
    socket.data.workerEntityId !== hamiltonianLifecycleEntityId("service", message.workerIdentity) ||
    (socket.data.workerIdentity !== null && socket.data.workerIdentity !== message.workerIdentity) ||
    (socket.data.workerRuntimeIncarnation !== null &&
      socket.data.workerRuntimeIncarnation !== message.workerRuntimeIncarnation)
  ) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "invalid heartbeat acknowledgement")
    return
  }
  socket.data.lastPongAt = Date.now()
  socket.data.lastAckSeq = message.seq
  if (socket.data.heartbeatTimeoutTimer !== null) {
    clearTimeout(socket.data.heartbeatTimeoutTimer)
    socket.data.heartbeatTimeoutTimer = null
  }
  scheduleHeartbeatAfterAck(socket)
  heartbeatAcks += 1
  if (socket.data.identityConfirmed) {
    relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "changed",
      subjectId: socket.data.lifecycleTransportId,
      subjectKind: "websocket",
      ownerId: socket.data.workerEntityId,
      sourceEntityId: socket.data.workerEntityId,
      targetEntityId: serverEntityId,
      transportId: socket.data.lifecycleTransportId,
      attributes: {
        connectionId: socket.data.connectionId,
        heartbeat: "observed",
        heartbeatSequence: socket.data.lastAckSeq,
        lastPongAt: socket.data.lastPongAt,
        observedBy: "server",
      },
    })))
    broadcastServerDeclaration()
  }
  broadcastTopology()
}

export async function handleIdentity(socket: ControlSocket, message: ClientIdentityMessage): Promise<void> {
  socket.data.workerUpdateRequired = true
  if (
    socket.data.workerEntityId !== hamiltonianLifecycleEntityId("service", message.workerIdentity) ||
    (socket.data.workerIdentity !== null && socket.data.workerIdentity !== message.workerIdentity) ||
    (socket.data.workerRuntimeIncarnation !== null &&
      socket.data.workerRuntimeIncarnation !== message.workerRuntimeIncarnation) ||
    (socket.data.workerCodeVersion !== null && socket.data.workerCodeVersion !== message.workerCodeVersion) ||
    !isBrowserProfileLifecycleSnapshot(
      message.lifecycleSnapshot,
      socket.data,
      message.workerIdentity,
      message.workerRuntimeIncarnation,
      message.workerCodeVersion,
    )
  ) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "worker identity does not match control endpoint")
    return
  }
  if (message.wakeId !== undefined) {
    const pendingWake = pendingWakes.get(socket.data.workerEntityId)
    if (
      message.wakeProof === undefined ||
      pendingWake?.wakeId !== message.wakeId ||
      !safeEqual(pendingWake.wakeProof, message.wakeProof) ||
      socket.data.connectionGeneration <= pendingWake.armedAfterConnectionGeneration ||
      !webPush.matchesDevice(socket.data.workerEntityId, socket.data.deviceId)
    ) {
      socket.data.retainAuthorityOnClose = false
      socket.close(1008, "unexpected Web Push wake identity")
      return
    }
  }
  const targetServiceWorker = await currentServiceWorkerRelease()
  const admissionClaim = {
    profileId: socket.data.deviceId,
    workerEntityId: socket.data.workerEntityId,
    runtimeIncarnation: message.workerRuntimeIncarnation,
    codeVersion: message.workerCodeVersion,
    applicationAdmitted: socket.data.identityConfirmed,
  }
  const admission = serviceWorkerAdmission.decideIdentity(admissionClaim, targetServiceWorker)
  if (admission.kind === "reject") {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, admission.reason)
    return
  }
  socket.data.workerIdentity = message.workerIdentity
  socket.data.workerRuntimeIncarnation = message.workerRuntimeIncarnation
  socket.data.workerCodeVersion = message.workerCodeVersion
  socket.data.resumeNonce = message.resumeNonce
  if (admission.kind === "stale") {
    applyServiceWorkerUpdateState(socket)
    if (admission.revokeApplication) await revokeServiceWorkerApplication([socket])
    sendServiceWorkerUpdate(socket, admission.target)
    return
  }
  const browserDeclaration = browserDeclarationForSnapshot(
    message.lifecycleSnapshot,
    socket.data,
    message.workerRuntimeIncarnation,
    message.lifecycleDeclaration,
  )
  if (!browserDeclaration || !acceptBrowserDeclaration(browserDeclaration)) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "invalid browser node-system declaration")
    return
  }
  serviceWorkerAdmission.confirmCurrent(admissionClaim)
  socket.data.identityConfirmed = true
  socket.data.workerUpdateRequired = false
  socket.data.retainAuthorityOnClose = true
  cancelBrowserProfileReachabilityExpiry(socket.data.deviceId)
  mergeBrowserLifecycleSnapshot(message.lifecycleSnapshot)
  socket.send(JSON.stringify({kind: "lifecycle-snapshot", snapshot: hostLifecycleJournal.snapshot()}))
  for (const declaration of nodeSystemDeclarations.values()) {
    if (declaration.logicalContourId !== serverLogicalContourId) {
      sendNodeSystemDeclaration(socket, declaration)
    }
  }
  relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "opened",
    subjectId: socket.data.lifecycleTransportId,
    subjectKind: "websocket",
    ownerId: socket.data.workerEntityId,
    sourceEntityId: socket.data.workerEntityId,
    targetEntityId: serverEntityId,
    transportId: socket.data.lifecycleTransportId,
    attributes: {
      connectionId: socket.data.connectionId,
      heartbeat: "awaiting",
      observedBy: "server",
    },
  })))
  broadcastServerDeclaration()
  record({
    at: Date.now(),
    kind: "worker-identity",
    connectionId: socket.data.connectionId,
    detail: `${message.workerIdentity} runtime ${message.workerRuntimeIncarnation} code ${message.workerCodeVersion}`,
  })
  sendControl(socket, {kind: "service-current", target: targetServiceWorker})
  void currentHamiltonianBrowserSourceRevision().then((revision) => {
    if (sockets.get(socket.data.connectionId) === socket && socket.data.identityConfirmed) {
      sendControl(socket, {kind: "source-update", revision})
    }
  }).catch((error: unknown) => {
    record({
      at: Date.now(),
      kind: "source-update-failed",
      connectionId: socket.data.connectionId,
      detail: error instanceof Error ? error.message : String(error),
    })
  })
  if (message.wakeId !== undefined) {
    clearPendingWake(socket.data.workerEntityId, message.wakeId)
    webPush.confirmReceipt(socket.data.workerEntityId, {
      schema: 1,
      messageId: message.wakeId,
      operationId: message.wakeId,
      receivedAt: Date.now(),
    })
    record({
      at: Date.now(),
      kind: "push-reconnect-confirmed",
      connectionId: socket.data.connectionId,
      detail: `${socket.data.workerEntityId} ${message.wakeId}`,
    })
    observeServiceWorkerAvailability(socket.data.workerEntityId, socket.data.deviceId, {
      identity: message.workerIdentity,
      runtimeIncarnation: message.workerRuntimeIncarnation,
      codeVersion: message.workerCodeVersion,
      state: "active",
      push: "received",
      wakeId: message.wakeId,
    })
    sendControl(socket, {kind: "wake-confirmed", wakeId: message.wakeId})
  } else {
    observeServiceWorkerAvailability(socket.data.workerEntityId, socket.data.deviceId, {
      identity: message.workerIdentity,
      runtimeIncarnation: message.workerRuntimeIncarnation,
      codeVersion: message.workerCodeVersion,
      state: "active",
      push: webPush.has(socket.data.workerEntityId) ? "ready" : "unavailable",
    })
  }
}

export async function handlePushSubscription(
  socket: ControlSocket,
  message: ClientPushSubscriptionMessage,
): Promise<void> {
  if (!socket.data.identityConfirmed || !socket.data.workerIdentity || !socket.data.workerRuntimeIncarnation) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "PushSubscription requires an identified Service Worker")
    return
  }
  try {
    const subscription = await webPush.register(socket.data.workerEntityId, {
      workerIdentity: socket.data.workerIdentity,
      deviceId: socket.data.deviceId,
      subscription: message.subscription,
    }, message.registrationId)
    record({
      at: Date.now(),
      kind: "push-subscription",
      connectionId: socket.data.connectionId,
      detail: socket.data.workerEntityId,
    })
    observeServiceWorkerAvailability(socket.data.workerEntityId, socket.data.deviceId, {
      identity: socket.data.workerIdentity,
      runtimeIncarnation: socket.data.workerRuntimeIncarnation,
      ...(socket.data.workerCodeVersion === null ? {} : {codeVersion: socket.data.workerCodeVersion}),
      state: "active",
      push: "ready",
    })
    sendControl(socket, {
      kind: "push-subscription-confirmed",
      registrationId: message.registrationId,
      subscription,
    })
  } catch (error) {
    sendControl(socket, {
      kind: "push-subscription-rejected",
      registrationId: message.registrationId,
      reason: (error instanceof Error ? error.message : String(error)).slice(0, 256),
    })
  }
}

export function handlePeerSignal(socket: ControlSocket, message: ClientPeerSignalMessage): void {
  const assignment = peerAssignment
  if (!assignment || assignment.connectionId !== socket.data.connectionId || assignment.tabId !== message.tabId) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "unauthorized peer signal")
    return
  }
  if (
    assignment.peerId !== message.peerId ||
    assignment.sessionEpoch !== message.sessionEpoch ||
    assignment.peerGeneration !== message.peerGeneration ||
    assignment.authorityKey !== message.authorityKey
  ) {
    stalePeerFramesDropped += 1
    record({at: Date.now(), kind: "stale-peer-signal", connectionId: socket.data.connectionId})
    return
  }
  signalingUp += 1
  void peerSupervisor.signal(message.peerId, message.signal)
}

export function handlePeerFailure(socket: ControlSocket, message: ClientPeerFailedMessage): void {
  const assignment = peerAssignment
  if (!assignment || assignment.connectionId !== socket.data.connectionId || assignment.tabId !== message.tabId) {
    socket.data.retainAuthorityOnClose = false
    socket.close(1008, "unauthorized peer failure")
    return
  }
  if (
    assignment.peerId !== message.peerId ||
    assignment.sessionEpoch !== message.sessionEpoch ||
    assignment.peerGeneration !== message.peerGeneration ||
    assignment.authorityKey !== message.authorityKey
  ) {
    stalePeerFramesDropped += 1
    return
  }
  requestPeerRepair(`browser: ${message.reason}`)
}

export function handleTabs(socket: ControlSocket, message: ClientTabsMessage): void {
  socket.data.reportedEmptyWindowInventory = message.windows.length === 0
  if (!tryResumeDetachedAuthority(socket, message.windows)) {
    topology.updateWindows(socket.data.connectionId, message.windows)
  }
  broadcastTopology()
}

export function handleControlClose(socket: ControlSocket, code: number, reason: string | Buffer): void {
  clearHeartbeatTimers(socket)
  record({at: Date.now(), kind: "connection-close", connectionId: socket.data.connectionId})
  sockets.delete(socket.data.connectionId)
  const closingPeer = topology.snapshot().peers.find(({connectionId}) =>
    connectionId === socket.data.connectionId)
  const browserScopeUnreachable =
    socket.data.identityConfirmed &&
    socket.data.retainAuthorityOnClose &&
    socket.data.reportedEmptyWindowInventory &&
    closingPeer?.windows.length === 0 &&
    !webPush.has(socket.data.workerEntityId) &&
    !pendingWakes.has(socket.data.workerEntityId) &&
    ![...sockets.values()].some((candidate) =>
      candidate.data.identityConfirmed && candidate.data.deviceId === socket.data.deviceId)
  if (socket.data.identityConfirmed && socket.data.retainAuthorityOnClose) {
    relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "closed",
      subjectId: socket.data.lifecycleTransportId,
      subjectKind: "websocket",
      ownerId: socket.data.workerEntityId,
      sourceEntityId: socket.data.workerEntityId,
      targetEntityId: serverEntityId,
      transportId: socket.data.lifecycleTransportId,
      attributes: {
        connectionId: socket.data.connectionId,
        code,
        reason: String(reason).slice(0, 256),
        observedBy: "server",
      },
    })))
    broadcastServerDeclaration()
  }
  if (browserScopeUnreachable) {
    forgetBrowserProfileIfUnreachable(
      socket.data.deviceId,
      socket.data.workerEntityId,
      socket.data.connectionId,
    )
  } else if (
    !stopping &&
    socket.data.identityConfirmed &&
    socket.data.retainAuthorityOnClose &&
    !webPush.has(socket.data.workerEntityId) &&
    !pendingWakes.has(socket.data.workerEntityId) &&
    ![...sockets.values()].some((candidate) =>
      candidate.data.identityConfirmed && candidate.data.deviceId === socket.data.deviceId)
  ) {
    scheduleBrowserProfileReachabilityExpiry(
      socket.data.deviceId,
      socket.data.workerEntityId,
      socket.data.connectionId,
      socket.data.lastPongAt + heartbeatMs * 3,
    )
  }
  if (
    socket.data.identityConfirmed &&
    socket.data.retainAuthorityOnClose &&
    !browserScopeUnreachable &&
    !pendingWakes.has(socket.data.workerEntityId)
  ) {
    observeServiceWorkerAvailability(
      socket.data.workerEntityId,
      socket.data.deviceId,
      webPush.has(socket.data.workerEntityId)
        ? {state: "standby", push: "ready", heartbeat: "paused"}
        : {state: "error", push: "unavailable", heartbeat: "failed"},
    )
  }
  const leader = topologyState().leader
  const retainsCurrentAuthority =
    !stopping &&
    !browserScopeUnreachable &&
    socket.data.retainAuthorityOnClose &&
    leader?.connectionId === socket.data.connectionId
  if (retainsCurrentAuthority) {
    const expiresAt = socket.data.lastPongAt + heartbeatMs * 3
    if (!socket.data.workerIdentity || !socket.data.resumeNonce) {
      topology.disconnect(socket.data.connectionId)
      broadcastTopology()
      return
    }
    detachedAuthorities.set(socket.data.connectionId, {
      expiresAt,
      deviceId: socket.data.deviceId,
      workerIdentity: socket.data.workerIdentity,
      resumeNonce: socket.data.resumeNonce,
    })
    record({
      at: Date.now(),
      kind: "authority-detached",
      connectionId: socket.data.connectionId,
      detail: `valid until ${expiresAt}`,
    })
    const timer = setTimeout(() => {
      detachedLeaseTimers.delete(socket.data.connectionId)
      detachedAuthorities.delete(socket.data.connectionId)
      topology.disconnect(socket.data.connectionId)
      record({at: Date.now(), kind: "detached-authority-expired", connectionId: socket.data.connectionId})
      broadcastTopology()
    }, Math.max(0, expiresAt - Date.now()))
    detachedLeaseTimers.set(socket.data.connectionId, timer)
  } else {
    detachedAuthorities.delete(socket.data.connectionId)
    topology.disconnect(socket.data.connectionId)
  }
  broadcastTopology()
}

export function handleControlDrain(socket: ControlSocket): void {
  if (socket.getBufferedAmount() === 0) broadcastTopology()
}

function startSourceWatchers(): void {
  for (const root of [
    `${experimentRoot}/browser`,
    `${experimentRoot}/public`,
    `${experimentRoot}/core`,
    updateRoot,
    visualRoot,
    uiRoot,
    nodesRoot,
    webPushRoot,
  ]) {
    try {
      sourceWatchers.push(watch(root, {recursive: true}, (_event, filename) => {
        scheduleSourceUpdate(filename)
      }))
    } catch (error) {
      record({
        at: Date.now(),
        kind: "source-watch-failed",
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

  const versionPayload = {version, source, sha256: sourceHash}
  const payloadForRole = (role: string) => ({
    ...versionPayload,
    serverEntityId,
    authority: placement === "server" && role === serverMainRole ? serverAuthority : null,
  })
  let serverMainOperations: Promise<void> = Promise.resolve()
  const rebirthBunEmbodimentInternal = (role = serverMainRole) => {
    if (stopping) return Promise.reject(new Error("Hamiltonian host is stopping"))
    if (placement !== "server" || role !== serverMainRole) {
      return bunEmbodiments.rebirth(role, payloadForRole(role))
    }
    const rebirth = serverMainOperations.then(async () => {
      serverFencingToken += 1
      serverAuthority = makeServerAuthority(serverFencingToken)
      broadcastTopology()
      return await bunEmbodiments.rebirth(role, payloadForRole(role))
    })
    serverMainOperations = rebirth.then(() => undefined, () => undefined)
    return rebirth
  }
  requestBunRepair = (role, _reason) => {
    if (stopping) return
    void rebirthBunEmbodimentInternal(role).catch(() => {})
  }
export let bunReady: Promise<ReturnType<typeof bunEmbodiments.snapshot>> =
  Promise.resolve(bunEmbodiments.snapshot())
  let stopPromise: Promise<void> | null = null
let runtimeBound = false

export function bindHamiltonianServer(server: Bun.Server<HamiltonianServerSocketData>): void {
  if (runtimeBound) throw new Error("Hamiltonian server runtime is already bound")
  runtimeBound = true
  boundPort = server.port ?? port
  startSourceWatchers()
  bunReady = bunEmbodiments.birthAll(payloadForRole).catch(() => bunEmbodiments.snapshot())
}

export function getHamiltonianStatus() {
  return observableState()
}

export function stopHamiltonianRuntime(server: Bun.Server<HamiltonianServerSocketData>): Promise<void> {
  if (stopPromise) return stopPromise
  stopPromise = (async () => {
    stopping = true
    for (const socket of sockets.values()) clearHeartbeatTimers(socket)
    if (sourceUpdateTimer !== null) clearTimeout(sourceUpdateTimer)
    sourceUpdateTimer = null
    for (const watcher of sourceWatchers) watcher.close()
    sourceWatchers.length = 0
    for (const timer of detachedLeaseTimers.values()) clearTimeout(timer)
    detachedLeaseTimers.clear()
    detachedAuthorities.clear()
    for (const timer of browserProfileReachabilityTimers.values()) clearTimeout(timer)
    browserProfileReachabilityTimers.clear()
    for (const timer of pendingWakeTimers.values()) clearTimeout(timer)
    pendingWakeTimers.clear()
    pendingWakes.clear()
    await Promise.race([server.stop(true), Bun.sleep(250)])
    await Promise.all([peerSupervisor.stop(), bunEmbodiments.stopAll()])
  })()
  return stopPromise
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}
