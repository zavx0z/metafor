import {
  HamiltonianLifecycleRetainedJournal,
  HamiltonianLifecycleSource,
  createHamiltonianLifecycleObservation,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
  hamiltonianLifecycleTransportId,
  isHamiltonianLifecycleEnvelope,
  type HamiltonianLifecycleEnvelope,
} from "./core/lifecycle.js"
import {networkInterfaces} from "node:os"
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
  type HamiltonianWebPushOptions,
} from "./web-push.ts"
import type {WebPushLifecycleEvent, WebPushLifecycleHook} from "@metafor/web-push/lifecycle"

interface SocketData {
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
  resumeNonce: string | null
  identityConfirmed: boolean
  retainAuthorityOnClose: boolean
}

interface HamiltonianHostOptions {
  hostname?: string
  port?: number
  identity?: string
  version?: string
  token?: string
  tlsCertPath?: string
  tlsKeyPath?: string
  heartbeatMs?: number
  placement?: "browser" | "server"
  browserBundles?: Readonly<{
    orchestration: string
    layoutWorker: string
    serviceWorker: string
    webPushClient?: string
  }>
  webPush?: HamiltonianWebPushOptions
}

interface ClientTabsMessage {
  kind: "tabs"
  windows: WindowCandidate[]
}

interface ClientPongMessage {
  kind: "pong"
  at: number
  seq: number
  workerIdentity: string
  workerRuntimeIncarnation: string
}

interface ClientIdentityMessage {
  kind: "identity"
  workerIdentity: string
  workerRuntimeIncarnation: string
  resumeNonce: string
  wakeId?: string
  wakeProof?: string
}

interface ClientPushSubscriptionMessage {
  kind: "push-subscription"
  registrationId: string
  subscription: HamiltonianPushSubscriptionInput["subscription"]
}

interface ClientPeerSignalMessage {
  kind: "peer-signal"
  peerId: string
  sessionEpoch: string
  peerGeneration: number
  authorityKey: string
  tabId: string
  signal: PeerSignal
}

interface ClientPeerFailedMessage {
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

interface ClientLifecycleRetirementMessage {
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
) & {monitor?: ClientLifecycleMonitor}

type ClientMessage = MonitoredClientMessage

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
const orchestrationEntry = `${experimentRoot}/browser/orchestration.ts`
const layoutWorkerEntry = `${experimentRoot}/browser/layout-worker.ts`
const serviceWorkerEntry = `${experimentRoot}/browser/service-worker.ts`
const webPushClientEntry = `${repositoryRoot}/pkg/web-push/src/client.ts`
const engineFont = fileURLToPath(new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url))
const uiRoot = fileURLToPath(new URL("../pkg/ui/", import.meta.url))
const nodesRoot = fileURLToPath(new URL("../pkg/nodes/", import.meta.url))
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

function parseClientMessage(value: string | Buffer): ClientMessage | null {
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
    "resumeNonce" in parsed &&
    typeof parsed.resumeNonce === "string" &&
    parsed.resumeNonce.length > 0 &&
    parsed.resumeNonce.length <= 128 &&
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
      resumeNonce: parsed.resumeNonce,
      ...("wakeId" in parsed && typeof parsed.wakeId === "string" ? {wakeId: parsed.wakeId} : {}),
      ...("wakeProof" in parsed && typeof parsed.wakeProof === "string" ? {wakeProof: parsed.wakeProof} : {}),
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
  ClientLifecycleRetirementMessage
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
    observation.subjectKind === "service-worker" &&
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

function sha256Hex(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex") as string
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

function staticResponse(pathname: string): Response | null {
  const files: Record<string, {path: string; type: string; cache?: string}> = {
    "/": {path: `${publicRoot}/index.html`, type: "text/html; charset=utf-8"},
    "/index.html": {path: `${publicRoot}/index.html`, type: "text/html; charset=utf-8"},
    "/window-entry.js": {path: `${publicRoot}/window-entry.js`, type: "text/javascript; charset=utf-8"},
    "/app.js": {path: `${publicRoot}/app.js`, type: "text/javascript; charset=utf-8"},
    "/embodiment-worker.js": {path: `${publicRoot}/embodiment-worker.js`, type: "text/javascript; charset=utf-8"},
    "/embodiment-worker-entry.js": {path: `${publicRoot}/embodiment-worker-entry.js`, type: "text/javascript; charset=utf-8"},
    "/styles.css": {path: `${publicRoot}/styles.css`, type: "text/css; charset=utf-8"},
    "/engine-static/JetBrainsMono-Bold.ttf": {path: engineFont, type: "font/ttf"},
    "/core/runtime.js": {path: `${experimentRoot}/core/runtime.js`, type: "text/javascript; charset=utf-8"},
    "/core/cache.js": {path: `${experimentRoot}/core/cache.js`, type: "text/javascript; charset=utf-8"},
    "/core/browser-control.js": {path: `${experimentRoot}/core/browser-control.js`, type: "text/javascript; charset=utf-8"},
    "/core/monitor.js": {path: `${experimentRoot}/core/monitor.js`, type: "text/javascript; charset=utf-8"},
    "/core/lifecycle.js": {path: `${experimentRoot}/core/lifecycle.js`, type: "text/javascript; charset=utf-8"},
    "/core/orchestration.js": {path: `${experimentRoot}/core/orchestration.js`, type: "text/javascript; charset=utf-8"},
  }
  const entry = files[pathname]
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

export function createHamiltonianHost(options: HamiltonianHostOptions = {}) {
  const hostname = options.hostname ?? Bun.env.HAMILTONIAN_HOST ?? "127.0.0.1"
  const port = options.port ?? Number(Bun.env.HAMILTONIAN_PORT ?? 4400)
  const identity = options.identity ?? Bun.env.HAMILTONIAN_ID ?? "hamiltonian-lab"
  const version = options.version ?? Bun.env.HAMILTONIAN_VERSION ?? "v1"
  const token = options.token ?? Bun.env.HAMILTONIAN_TOKEN ?? crypto.randomUUID()
  const tlsCertPath = options.tlsCertPath ?? Bun.env.HAMILTONIAN_TLS_CERT
  const tlsKeyPath = options.tlsKeyPath ?? Bun.env.HAMILTONIAN_TLS_KEY
  const heartbeatMs = options.heartbeatMs ?? 10_000
  const placement = options.placement ?? Bun.env.HAMILTONIAN_PLACEMENT ?? "browser"
  const configuredVapidPublicKey = options.webPush?.publicKey ?? Bun.env.HAMILTONIAN_VAPID_PUBLIC_KEY
  const configuredVapidPrivateKey = options.webPush?.privateKey ?? Bun.env.HAMILTONIAN_VAPID_PRIVATE_KEY
  const configuredVapidSubject = options.webPush?.subject ?? Bun.env.HAMILTONIAN_VAPID_SUBJECT
  const webPushStoragePath = options.webPush?.storagePath ??
    (Bun.env.NODE_ENV === "test" ? undefined : `${repositoryRoot}/.metafor/hamiltonian-web-push.json`)
  let observeWebPushLifecycle: WebPushLifecycleHook = () => {}
  const webPush = new HamiltonianWebPush({
    ...(configuredVapidPublicKey === undefined ? {} : {publicKey: configuredVapidPublicKey}),
    ...(configuredVapidPrivateKey === undefined ? {} : {privateKey: configuredVapidPrivateKey}),
    ...(configuredVapidSubject === undefined ? {} : {subject: configuredVapidSubject}),
    ...(webPushStoragePath === undefined ? {} : {storagePath: webPushStoragePath}),
    ...(options.webPush?.send === undefined ? {} : {send: options.webPush.send}),
    onLifecycle: (event) => observeWebPushLifecycle(event),
  })
  if (placement !== "browser" && placement !== "server") {
    throw new Error(`Unknown Hamiltonian placement: ${placement}`)
  }
  if ((tlsCertPath && !tlsKeyPath) || (!tlsCertPath && tlsKeyPath)) {
    throw new Error("HAMILTONIAN_TLS_CERT and HAMILTONIAN_TLS_KEY must be provided together")
  }

  const hostEpoch = crypto.randomUUID()
  const serverEntityId = hamiltonianLifecycleEntityId("server", hostEpoch)
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
  const sockets = new Map<string, Bun.ServerWebSocket<SocketData>>()
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
  const events: HostEvent[] = []
  let boundPort = port
  const record = (event: HostEvent) => {
    events.push(event)
    if (events.length > 500) events.splice(0, events.length - 500)
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
  const sourceHash = sha256Hex(source)
  const indexResponse = async (localJoinToken = "") => {
    const servedAt = Date.now()
    const navigationId = crypto.randomUUID()
    const template = await Bun.file(`${publicRoot}/index.html`).text()
    const html = template
      .replaceAll("__HAMILTONIAN_HOST_IDENTITY__", escapeHtmlAttribute(identity))
      .replaceAll("__HAMILTONIAN_HOST_EPOCH__", escapeHtmlAttribute(hostEpoch))
      .replaceAll("__HAMILTONIAN_HOST_VERSION__", escapeHtmlAttribute(version))
      .replaceAll("__HAMILTONIAN_NAVIGATION_ID__", escapeHtmlAttribute(navigationId))
      .replaceAll("__HAMILTONIAN_SERVED_AT__", String(servedAt))
      .replaceAll("__HAMILTONIAN_LOCAL_JOIN_TOKEN__", escapeHtmlAttribute(localJoinToken))
    const headers = new Headers(securityHeaders("text/html; charset=utf-8"))
    headers.set("content-security-policy", "default-src 'self'; connect-src 'self' ws: wss: data:; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'")
    return new Response(html, {headers})
  }
  const hostLifecycleJournal = new HamiltonianLifecycleRetainedJournal(serverEntityId)
  const broadcastLifecycleEnvelope = (value: HamiltonianLifecycleEnvelope) => {
    const payload = JSON.stringify({kind: "lifecycle", envelope: value})
    for (const observer of sockets.values()) {
      if (observer.getBufferedAmount() <= 256_000) observer.send(payload)
    }
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
    startedAt: Date.now(),
  })
  const observeServiceWorkerAvailability = (
    workerEntityId: string,
    deviceId: string,
    attributes: Record<string, string | number | boolean | null>,
    causedBy?: string,
  ) => {
    relayLifecycleEnvelope(hostLifecycle.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: workerEntityId,
      subjectKind: "service-worker",
      ownerId: hamiltonianBrowserNodeId(webPush.deviceIdFor(workerEntityId) ?? deviceId),
      attributes,
    }), causedBy === undefined ? undefined : {causedBy}))
  }
  const webPushTransportId = (workerEntityId: string) =>
    hamiltonianLifecycleTransportId("web-push", workerEntityId)
  const webPushWorkerEntityId = (event: WebPushLifecycleEvent): string | null => {
    const candidate = event.subjectId ?? event.detail?.subscriptionId
    return typeof candidate === "string" && candidate.startsWith("service-worker:")
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
    socket: Bun.ServerWebSocket<SocketData>,
    message: Readonly<{kind: string}> & Record<string, unknown>,
  ) => {
    const messageId = `message:${encodeURIComponent(crypto.randomUUID())}`
    const monitor = {messageId, transportId: socket.data.lifecycleTransportId}
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
    socket.send(JSON.stringify({...message, monitor}))
  }
  const clearHeartbeatTimers = (socket: Bun.ServerWebSocket<SocketData>) => {
    if (socket.data.nextHeartbeatTimer !== null) clearTimeout(socket.data.nextHeartbeatTimer)
    if (socket.data.heartbeatTimeoutTimer !== null) clearTimeout(socket.data.heartbeatTimeoutTimer)
    socket.data.nextHeartbeatTimer = null
    socket.data.heartbeatTimeoutTimer = null
  }
  const challengeHeartbeat = (socket: Bun.ServerWebSocket<SocketData>) => {
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
  const scheduleHeartbeatAfterAck = (socket: Bun.ServerWebSocket<SocketData>) => {
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
      void Promise.all([getOrchestrationBundle(), getLayoutWorkerBundle(), getServiceWorkerBundle()]).then(([bundle, workerBundle, workerServiceBundle]) => {
        if (generation !== sourceUpdateGeneration || stopping) return
        const revision = `${hostEpoch}:${generation}:${sha256Hex(`${bundle}\u0000${workerBundle}\u0000${workerServiceBundle}`).slice(0, 16)}`
        record({at: Date.now(), kind: "source-update", detail: revision})
        for (const socket of sockets.values()) {
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
  if (options.browserBundles !== undefined) {
    orchestrationBundle = Promise.resolve(options.browserBundles.orchestration)
    layoutWorkerBundle = Promise.resolve(options.browserBundles.layoutWorker)
    serviceWorkerBundle = Promise.resolve(options.browserBundles.serviceWorker)
    if (options.browserBundles.webPushClient !== undefined) {
      webPushClientBundle = Promise.resolve(options.browserBundles.webPushClient)
    } else {
      webPushClientBundle = null
    }
  } else {
    invalidateBrowserBundles()
    if (Bun.env.NODE_ENV !== "test") {
      // Build once as soon as the host incarnation starts. A first navigation
      // must not pay the browser bundle compilation cost on its module request.
      void Promise.all([
        getOrchestrationBundle(),
        getLayoutWorkerBundle(),
        getServiceWorkerBundle(),
        getWebPushClientBundle(),
      ]).catch(() => {})
    }
  }
  let broadcastTopology = () => {}
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
      relayLifecycleEnvelope(envelope)
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
    socket: Bun.ServerWebSocket<SocketData>,
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

  const tls = tlsCertPath && tlsKeyPath
    ? {tls: {cert: Bun.file(tlsCertPath), key: Bun.file(tlsKeyPath)}}
    : {}

  const server = Bun.serve<SocketData>({
    hostname,
    port,
    ...tls,
    async fetch(request, bunServer) {
      const url = new URL(request.url)
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        const localJoinToken = isLoopbackAddress(bunServer.requestIP(request)?.address) ? token : ""
        return await indexResponse(localJoinToken)
      }
      if (url.pathname === "/orchestration.js") {
        try {
          return new Response(await getOrchestrationBundle(), {
            headers: securityHeaders("text/javascript; charset=utf-8"),
          })
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {status: 500})
        }
      }
      if (url.pathname === "/layout-worker.js") {
        try {
          return new Response(await getLayoutWorkerBundle(), {
            headers: securityHeaders("text/javascript; charset=utf-8"),
          })
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {status: 500})
        }
      }
      if (url.pathname === "/web-push-client.js") {
        try {
          return new Response(await getWebPushClientBundle(), {
            headers: securityHeaders("text/javascript; charset=utf-8"),
          })
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {status: 500})
        }
      }
      if (url.pathname === "/sw-entry.js") {
        try {
          const headers = new Headers(securityHeaders("text/javascript; charset=utf-8"))
          headers.set("content-security-policy", "default-src 'self'; connect-src 'self' ws: wss: data:; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'")
          headers.set("service-worker-allowed", "/")
          headers.set("cache-control", "no-cache")
          return new Response(await getServiceWorkerBundle(), {headers})
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {status: 500})
        }
      }
      if (url.pathname === "/control") {
        const suppliedToken = url.searchParams.get("token") ?? ""
        const deviceId = url.searchParams.get("device") ?? ""
        const lifecycleTransportId = url.searchParams.get("transport") ?? ""
        const workerEntityId = url.searchParams.get("worker") ?? ""
        if (
          !safeEqual(suppliedToken, token) ||
          !deviceId || deviceId.length > 128 ||
          !lifecycleTransportId.startsWith("websocket:") || lifecycleTransportId.length > 512 ||
          !workerEntityId.startsWith("service-worker:") || workerEntityId.length > 512
        ) {
          return new Response("Unauthorized", {status: 401})
        }
        const upgraded = bunServer.upgrade(request, {
          data: {
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
            resumeNonce: null,
            identityConfirmed: false,
            retainAuthorityOnClose: false,
          },
        })
        return upgraded ? undefined : new Response("WebSocket upgrade required", {status: 426})
      }

      if (request.method === "GET" && url.pathname === "/push/vapid-public-key") {
        if (!authorized(request, token)) return new Response("Unauthorized", {status: 401})
        return Response.json({publicKey: webPush.publicKey}, {
          headers: securityHeaders("application/json; charset=utf-8"),
        })
      }

      if (request.method === "POST" && url.pathname === "/lab/wake-service-worker") {
        if (!authorized(request, token)) return new Response("Unauthorized", {status: 401})
        let workerIdentity: string | null = null
        try {
          const input = await boundedJson(request)
          if (typeof input === "object" && input !== null && "workerIdentity" in input) {
            if (!validWorkerIdentity(input.workerIdentity)) {
              return new Response("Invalid Service Worker identity", {status: 400})
            }
            workerIdentity = input.workerIdentity
          }
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {status: 400})
        }
        const workerEntityId = workerIdentity === null
          ? webPush.onlyWorkerEntityId()
          : hamiltonianLifecycleEntityId("service-worker", workerIdentity)
        if (!workerEntityId || !webPush.has(workerEntityId)) {
          return new Response("PushSubscription not found", {status: 404})
        }
        const workerDeviceId = webPush.deviceIdFor(workerEntityId)
        if (!workerDeviceId) {
          return new Response("PushSubscription device not found", {status: 404})
        }
        if (pendingWakes.has(workerEntityId)) {
          return new Response("A Web Push wake is already pending for this Service Worker", {status: 409})
        }
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
          const delivery = webPush.wake(workerEntityId, {
            kind: "wake-service-worker",
            wakeId,
            wakeProof,
            token,
            serverEntityId,
          })
          await delivery
          record({at: Date.now(), kind: "push-service-accepted", detail: `${workerEntityId} ${wakeId}`})
          return Response.json({ok: true, workerEntityId, wakeId}, {
            headers: securityHeaders("application/json; charset=utf-8"),
          })
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          if (!clearPendingWake(workerEntityId, wakeId)) {
            return Response.json({ok: true, workerEntityId, wakeId, delivery: "confirmed"}, {
              headers: securityHeaders("application/json; charset=utf-8"),
            })
          }
          record({at: Date.now(), kind: "push-send-failed", detail: `${workerEntityId} ${reason}`.slice(0, 512)})
          observeServiceWorkerAvailability(workerEntityId, workerDeviceId, {
            state: "error",
            push: "failed",
            reason: reason.slice(0, 256),
          })
          return new Response(reason, {status: 502})
        }
      }

      if (url.pathname === "/manifest.json") {
        if (!authorized(request, token)) return new Response("Unauthorized", {status: 401})
        return Response.json({
          identity,
          version,
          moduleUrl: `/versions/${encodeURIComponent(version)}/module.js`,
          sha256: sourceHash,
        }, {headers: securityHeaders("application/json; charset=utf-8")})
      }

      if (url.pathname === "/lab/status") {
        if (!authorized(request, token)) return new Response("Unauthorized", {status: 401})
        return Response.json(observableState(), {
          headers: securityHeaders("application/json; charset=utf-8"),
        })
      }

      if (url.pathname === `/versions/${encodeURIComponent(version)}/module.js`) {
        if (!authorized(request, token)) return new Response("Unauthorized", {status: 401})
        const headers = new Headers(securityHeaders("text/javascript; charset=utf-8"))
        headers.set("x-hamiltonian-sha256", sourceHash)
        return new Response(source, {headers})
      }

      return staticResponse(url.pathname) ?? new Response("Not found", {status: 404})
    },
    websocket: {
      open(socket) {
        sockets.set(socket.data.connectionId, socket)
        topology.connect(socket.data.connectionId, socket.data.deviceId)
        record({at: Date.now(), kind: "connection-open", connectionId: socket.data.connectionId})
        // Establish one explicit causal frontier before producing the first
        // live event for this socket. Historical messages stay behind the
        // frontier; only retained active entities and transports bootstrap.
        socket.send(JSON.stringify({kind: "lifecycle-snapshot", snapshot: hostLifecycleJournal.snapshot()}))
        sendControl(socket, {
          kind: "hello",
          connectionId: socket.data.connectionId,
          host: hostState(),
        })
        broadcastTopology()
        challengeHeartbeat(socket)
      },
      async message(socket, rawMessage) {
        controlFramesIn += 1
        controlBytesIn += rawMessage.length
        if (isRealtimeControlPayload(rawMessage)) {
          realtimeFramesRejected += 1
          socket.data.retainAuthorityOnClose = false
          socket.close(1008, "realtime payload is forbidden on control channel")
          return
        }
        const message = parseClientMessage(rawMessage)
        if (!message) {
          socket.data.retainAuthorityOnClose = false
          socket.close(1008, "invalid control message")
          return
        }
        if (message.monitor) {
          if (message.monitor.transportId !== socket.data.lifecycleTransportId) {
            socket.data.retainAuthorityOnClose = false
            socket.close(1008, "control message transport identity mismatch")
            return
          }
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
        if (message.kind === "lifecycle-retirement") {
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
          broadcastLifecycleEnvelope(message.envelope)
          return
        }
        if (message.kind === "pong") {
          if (
            message.seq !== socket.data.lastChallengeSeq ||
            message.seq <= socket.data.lastAckSeq ||
            socket.data.workerEntityId !== hamiltonianLifecycleEntityId("service-worker", message.workerIdentity) ||
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
          broadcastTopology()
          return
        }
        if (message.kind === "identity") {
          if (
            socket.data.workerEntityId !== hamiltonianLifecycleEntityId("service-worker", message.workerIdentity) ||
            (socket.data.workerIdentity !== null && socket.data.workerIdentity !== message.workerIdentity) ||
            (socket.data.workerRuntimeIncarnation !== null &&
              socket.data.workerRuntimeIncarnation !== message.workerRuntimeIncarnation)
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
          socket.data.workerIdentity = message.workerIdentity
          socket.data.workerRuntimeIncarnation = message.workerRuntimeIncarnation
          socket.data.resumeNonce = message.resumeNonce
          socket.data.identityConfirmed = true
          socket.data.retainAuthorityOnClose = true
          record({
            at: Date.now(),
            kind: "worker-identity",
            connectionId: socket.data.connectionId,
            detail: `${message.workerIdentity} runtime ${message.workerRuntimeIncarnation}`,
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
              state: "active",
              push: "received",
              wakeId: message.wakeId,
            })
            sendControl(socket, {kind: "wake-confirmed", wakeId: message.wakeId})
          } else if (webPush.has(socket.data.workerEntityId)) {
            observeServiceWorkerAvailability(socket.data.workerEntityId, socket.data.deviceId, {
              identity: message.workerIdentity,
              runtimeIncarnation: message.workerRuntimeIncarnation,
              state: "active",
              push: "ready",
            })
          }
          return
        }
        if (message.kind === "push-subscription") {
          if (
            !socket.data.identityConfirmed ||
            !socket.data.workerIdentity ||
            !socket.data.workerRuntimeIncarnation
          ) {
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
          return
        }
        if (message.kind === "peer-signal") {
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
          return
        }
        if (message.kind === "peer-failed") {
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
          return
        }
        if (!tryResumeDetachedAuthority(socket, message.windows)) {
          topology.updateWindows(socket.data.connectionId, message.windows)
        }
        broadcastTopology()
      },
      close(socket, code, reason) {
        clearHeartbeatTimers(socket)
        record({at: Date.now(), kind: "connection-close", connectionId: socket.data.connectionId})
        sockets.delete(socket.data.connectionId)
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
        }
        if (
          socket.data.identityConfirmed &&
          socket.data.retainAuthorityOnClose &&
          !pendingWakes.has(socket.data.workerEntityId)
        ) {
          observeServiceWorkerAvailability(socket.data.workerEntityId, socket.data.deviceId, webPush.has(socket.data.workerEntityId)
            ? {state: "standby", push: "ready", heartbeat: "paused"}
            : {state: "error", push: "unavailable", heartbeat: "failed"})
        }
        const leader = topologyState().leader
        const retainsCurrentAuthority =
          !stopping &&
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
      },
      drain(socket) {
        if (socket.getBufferedAmount() === 0) broadcastTopology()
      },
    },
  })
  boundPort = server.port ?? port

  if (Bun.env.NODE_ENV !== "test") {
    for (const root of [`${experimentRoot}/browser`, `${experimentRoot}/public`, `${experimentRoot}/core`, uiRoot, nodesRoot]) {
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
  const rebirthBunEmbodiment = (role = serverMainRole) => {
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
    void rebirthBunEmbodiment(role).catch(() => {})
  }
  const bunReady = bunEmbodiments.birthAll(payloadForRole).catch(() => bunEmbodiments.snapshot())
  let stopPromise: Promise<void> | null = null

  return {
    server,
    identity,
    version,
    token,
    topology,
    hostEpoch,
    placement,
    bunEmbodiments,
    getStatus: observableState,
    bunReady,
    rebirthBunEmbodiment(role = serverMainRole) {
      return rebirthBunEmbodiment(role)
    },
    crashBunEmbodimentForTest(role = serverMainRole) {
      return bunEmbodiments.crashForTest(role)
    },
    acceptsServerAuthorityForTest(candidate: EmbodimentAuthority | null) {
      return placement === "server" &&
        authorityKey(candidate) === authorityKey(serverAuthority)
    },
    crashPeerProcessForTest() {
      return peerSupervisor.crashForTest()
    },
    requestPeerRepairForTest(reason: string) {
      requestPeerRepair(reason)
      return peerAssignment
    },
    reportPeerErrorForTest(peerId: string, error: string) {
      peerSupervisor.reportErrorForTest(peerId, error)
    },
    stop() {
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
        for (const timer of pendingWakeTimers.values()) clearTimeout(timer)
        pendingWakeTimers.clear()
        pendingWakes.clear()
        // Bun 1.3.14 releases the listener synchronously, but the returned Promise can
        // remain pending after the server has rejected a WebSocket frame with 1008.
        // Bound that runtime-specific wait so child-process teardown is never skipped.
        await Promise.race([server.stop(true), Bun.sleep(250)])
        await Promise.all([peerSupervisor.stop(), bunEmbodiments.stopAll()])
      })()
      return stopPromise
    },
  }
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  return address === "::1" || address === "0:0:0:0:0:0:0:1" ||
    address.startsWith("127.") || address.startsWith("::ffff:127.")
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function advertisedHosts(hostname: string): string[] {
  if (hostname !== "0.0.0.0" && hostname !== "::") return [hostname]
  const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address)
  )
  return addresses.length > 0 ? addresses : ["127.0.0.1"]
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}

if (import.meta.main) {
  const host = createHamiltonianHost()
  const scheme = host.server.protocol ?? "http"
  const port = host.server.port
  console.log(`Hamiltonian ${host.identity} · version ${host.version}`)
  console.log(`One listener: ${scheme}://${host.server.hostname}:${port}`)
  void host.bunReady.then((embodiments) => {
    for (const [role, embodiment] of Object.entries(embodiments)) {
      console.log(`Bun ${role}: ${embodiment.state} · pid ${embodiment.pid} · incarnation ${embodiment.incarnation}`)
    }
  })
  for (const address of advertisedHosts(host.server.hostname ?? "127.0.0.1")) {
    const joinUrl = isLoopbackHostname(address)
      ? `${scheme}://${address}:${port}/`
      : `${scheme}://${address}:${port}/?token=${encodeURIComponent(host.token)}`
    console.log(`Join: ${joinUrl}`)
  }
  if (scheme === "http" && host.server.hostname !== "127.0.0.1" && host.server.hostname !== "localhost") {
    console.warn("Remote browsers need trusted HTTPS before they can register the Service Worker.")
  }
}
