// The attached Service Worker joins its observed browser-runtime owner.
import "../core/monitor.js"
import {
  HamiltonianLifecycleRetainedJournal,
  HamiltonianNodeSystemDeclarationRegistry,
  createHamiltonianLifecycleObservation,
  createHamiltonianNodeSystemDeclaration,
  emitHamiltonianLifecycle,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
  hamiltonianLifecycleTransportId,
  hamiltonianLogicalContourId,
  isHamiltonianLifecycleEnvelope,
  isHamiltonianLifecycleEnvelopeFromSource,
  isHamiltonianLifecycleSnapshot,
  isHamiltonianLifecycleSnapshotFromSource,
  isHamiltonianNodeSystemDeclaration,
  projectHamiltonianLifecycleOwnershipScope,
  publishHamiltonianLifecycleEnvelope,
  publishHamiltonianLifecycleSnapshot,
  publishHamiltonianNodeSystemDeclaration,
  receiveHamiltonianNodeSystemDeclaration,
  subscribeHamiltonianLifecycle,
  type HamiltonianLifecycleEnvelope,
  type HamiltonianLifecycleSnapshot,
  type HamiltonianNodeSystemDeclaration,
} from "../core/lifecycle.js"
import {hamiltonianRealmSnapshot} from "../core/monitor.js"
import {hamiltonianBrowserNodeId, hamiltonianBrowserRuntimeName} from "../core/orchestration.js"
import {GenerationRegistry, ReconnectPolicy} from "../core/runtime.js"
import {responseMatchesHash, sha256Hex, selectRetainedCaches} from "../update/browser/release-cache.js"
import {
  ExclusiveResourceSlot,
  isCurrentLeaderPeerControl,
  isCurrentWindowChannel,
  isWindowPageReplacement,
  missingWindowClientChannels,
  windowClientLeaseExpired,
} from "../core/browser-control.js"
import type {TopologySnapshot} from "../host-state.ts"
import {createWebPushWorkerHandlers} from "@metafor/web-push/worker"
import type {WebPushLifecycleEvent} from "@metafor/web-push/lifecycle"
import type {WebPushMessage} from "@metafor/web-push/protocol"
import {HAMILTONIAN_SERVICE_WORKER_CODE_VERSION} from "../update/browser/service-worker-code-version.ts"
import {rejectHamiltonianControlSocket} from "./control-socket-rejection.ts"
import {isHamiltonianServiceWorkerCodeVersion} from "../update/shared/service-worker-release.js"
import {
  pageLifecycleChangesNodeSystem,
  pageLifecycleMayEnterBrowserJournal,
  projectPageLifecycleForBrowserJournal,
} from "./page-lifecycle-declaration.ts"

type LifecycleJournal = InstanceType<typeof HamiltonianLifecycleRetainedJournal>
type MessageRecord = {kind: string; monitor?: LifecycleMonitor; [key: string]: unknown}

interface LifecycleMonitor {
  messageId: string
  transportId?: string
}

interface HamiltonianWorkerClient {
  readonly id: string
  readonly url?: string
  postMessage(message: unknown): void
  focus?(): Promise<HamiltonianWorkerClient>
}

interface HamiltonianWorkerClients {
  claim(): Promise<void>
  get(id: string): Promise<HamiltonianWorkerClient | undefined>
  matchAll(options: {type: "window"; includeUncontrolled: boolean}): Promise<HamiltonianWorkerClient[]>
  openWindow?(url: string): Promise<HamiltonianWorkerClient | null>
}

interface HamiltonianExtendableEvent {
  waitUntil(promise: Promise<unknown>): void
}

interface HamiltonianExtendableMessageEvent extends HamiltonianExtendableEvent {
  readonly data: unknown
  readonly source: HamiltonianWorkerClient | null
}

interface HamiltonianPushEvent extends HamiltonianExtendableEvent {
  readonly data: {json(): unknown} | null
}

interface HamiltonianNotificationClickEvent extends HamiltonianExtendableEvent {
  readonly action?: string
  readonly notification: {
    readonly data?: unknown
    close(): void
  }
}

interface HamiltonianWorkerRegistration {
  showNotification(title: string, options?: NotificationOptions): Promise<void>
  update(): Promise<HamiltonianWorkerRegistration>
}

interface HamiltonianWorkerRuntime {
  readonly clients: HamiltonianWorkerClients
  readonly registration: HamiltonianWorkerRegistration
  skipWaiting(): Promise<void>
  addEventListener(type: "install" | "activate", listener: (event: HamiltonianExtendableEvent) => void): void
  addEventListener(type: "message", listener: (event: HamiltonianExtendableMessageEvent) => void): void
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void
  addEventListener(type: "push", listener: (event: HamiltonianPushEvent) => void): void
  addEventListener(type: "notificationclick", listener: (event: HamiltonianNotificationClickEvent) => void): void
}

interface HostIdentity {
  identity?: string
  hostEpoch: string
  version: string
}

interface SocketLifecycle {
  socketIncarnation: string
  transportId: string
  serverEntityId: string | null
  identitySent: boolean
  transportDeclared: boolean
}

interface WindowChannel {
  tabId: string
  joinedAt: number
  visible: boolean
  lastSeenAt: number
  clientId: string | null
  pageIncarnation: string
  predecessorPageIncarnation: string | null
  pageEntityId: string
  serviceWorkerTransportId: string
  client: HamiltonianWorkerClient
}

interface WindowRegistry extends Iterable<[string, WindowChannel]> {
  readonly size: number
  get(key: string): WindowChannel | undefined
  set(key: string, value: WindowChannel): WindowChannel
  deleteIfCurrent(key: string, value: WindowChannel): boolean
  clear(): void
  values(): IterableIterator<WindowChannel>
}

interface ConnectWindowMessage extends MessageRecord {
  kind: "connect-window"
  browserEntityId: string
  controlResumeNonce: string
  deviceId: string
  joinedAt: number
  serviceWorkerTransportId: string
  pageLifecycleSnapshot: HamiltonianLifecycleSnapshot
  pageIncarnation: string
  predecessorPageIncarnation: string | null
  serverEntityId: string
  tabId: string
  token: string
  visible: boolean
  workerIdentity: string
}

interface PageControlMessage extends MessageRecord {
  kind: "window-heartbeat" | "disconnect-window" | "peer-signal" | "peer-failed" | string
  envelope?: unknown
  pageIncarnation?: string
  visible?: boolean
  tabId?: string
}

interface HostControlMessage extends MessageRecord {
  connectionId?: string
  envelope?: HamiltonianLifecycleEnvelope
  host?: HostIdentity
  snapshot?: HamiltonianLifecycleSnapshot
  declaration?: HamiltonianNodeSystemDeclaration
  topology?: TopologySnapshot
  at?: number
  seq?: number
  tabId?: string
  target?: ServiceWorkerRelease
}

interface ServiceWorkerRelease {
  version: string
  sha256: string
}

interface VersionManifest {
  version: string
  moduleUrl: string
  sha256: string
}

interface HostPingMessage extends HostControlMessage {
  kind: "ping"
  at: number
  seq: number
}

interface VersionState extends MessageRecord {
  kind: "version-ready"
  version: string
  moduleUrl: string
  sha256: string
  caches: string[]
}

interface WorkerState extends MessageRecord {
  kind: "worker-state"
  control: string
  socket: "connected" | "reconnecting"
  workerIdentity: string
  workerRuntimeIncarnation: string
  workerCodeVersion: string
  connectionId: string | null
  host: HostIdentity | null
}

interface ControlBootstrap {
  schema: 1
  workerIdentity: string
  deviceId: string
  browserEntityId: string
  token: string
  controlResumeNonce: string
  serverEntityId: string
  pushReady: boolean
  savedAt: number
}

interface PushSubscriptionRecord {
  endpoint: string
  expirationTime?: number | null
  keys: {p256dh: string; auth: string}
}

interface PendingPushRegistration {
  registrationId: string
  subscription: PushSubscriptionRecord
  tabId: string
}

interface PushWakePayload {
  kind: "wake-service-worker"
  wakeId: string
  wakeProof: string
  token: string
  serverEntityId: string
}

interface PendingPushWake {
  wakeId: string
  wakeProof: string
  promise: Promise<void>
  resolve(): void
  reject(error: Error): void
}

const serviceWorkerRuntime = globalThis as unknown as HamiltonianWorkerRuntime

const windows = new GenerationRegistry() as WindowRegistry
const MAX_SOCKET_BUFFER = 256_000
const WINDOW_TIMEOUT_MS = 7_000
const WINDOW_REHYDRATION_TIMEOUT_MS = 4_000
const WINDOW_REHYDRATION_POLL_MS = 100
const windowReattachRequestedAt = new Map<string, number>()
const MAX_VERSION_CACHES = 2
const CONTROL_CACHE = "hamiltonian-control:v1"
const CONTROL_BOOTSTRAP_URL = "/.hamiltonian/control-bootstrap"
const workerRuntime = hamiltonianRealmSnapshot()
const workerRuntimeIncarnation = workerRuntime.incarnation
const workerCodeVersion = HAMILTONIAN_SERVICE_WORKER_CODE_VERSION
const browserRuntimeName = hamiltonianBrowserRuntimeName(
  (globalThis as unknown as {navigator?: {userAgent?: string}}).navigator?.userAgent ?? "",
)
let workerIdentity = ""
let workerEntityId = ""
let workerLifecycleJournal: LifecycleJournal | null = null
const socketSlot = new ExclusiveResourceSlot<WebSocket>()
const socketLifecycle = new WeakMap<WebSocket, SocketLifecycle>()
const nodeSystemDeclarations = new HamiltonianNodeSystemDeclarationRegistry()
const pendingHostRetirements = new Map<string, HamiltonianLifecycleEnvelope>()
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const reconnectPolicy = new ReconnectPolicy()
let currentDeviceId: string | null = null
let currentBrowserEntityId: string | null = null
let currentToken: string | null = null
let currentHost: HostIdentity | null = null
let currentTopology: TopologySnapshot | null = null
let currentSourceUpdate: HostControlMessage | null = null
let currentVersionState: VersionState | null = null
let currentConnectionId: string | null = null
let currentResumeNonce: string | null = null
let currentServerEntityId: string | null = null
let currentServerLogicalContourId: string | null = null
let currentHostLifecycleJournal: LifecycleJournal | null = null
let currentPushReady = false
let applicationReady = false
const pendingWindowConnections = new Map<string, {
  message: ConnectWindowMessage
  client: HamiltonianWorkerClient
}>()
const pendingPushRegistrations = new Map<string, PendingPushRegistration>()
let pendingPushWake: PendingPushWake | null = null
subscribeHamiltonianLifecycle((envelope) => {
  if (
    workerEntityId &&
    envelope.sourceId === hamiltonianLifecycleEntityId("service-worker", workerRuntimeIncarnation) &&
    envelope.sourceIncarnation === workerRuntimeIncarnation
  ) {
    workerLifecycleJournal?.observe(envelope)
  }
  if (!isObservedSupersededServiceWorkerEnd(envelope)) return
  if (!workerEntityId || !currentBrowserEntityId) return
  pendingHostRetirements.set(envelope.observation.subjectId, envelope)
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: currentBrowserEntityId,
    attributes: {
      ...workerEmbodimentAttributes(),
      lastFailure: "worker-replaced",
      failedWorker: envelope.observation.subjectId,
    },
  }), {causedBy: envelope.eventId})
  flushHostRetirements()
})

serviceWorkerRuntime.addEventListener("install", (event) => event.waitUntil(serviceWorkerRuntime.skipWaiting()))
serviceWorkerRuntime.addEventListener("activate", (event) => event.waitUntil((async () => {
  await serviceWorkerRuntime.clients.claim()
  if (await restoreControlBootstrap()) {
    observeWorkerAvailability("standby", currentPushReady ? "ready" : "unavailable")
    ensureSocket()
  }
  const clients = await serviceWorkerRuntime.clients.matchAll({type: "window", includeUncontrolled: false})
  for (const client of clients) client.postMessage({kind: "reattach-window"})
})()))

function initializeWorkerIdentity(identity: string, browserEntityId: string, profileId: string): boolean {
  if (!validControlIdentity(identity)) return false
  if (workerIdentity) return workerIdentity === identity
  workerIdentity = identity
  workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
  workerLifecycleJournal = new HamiltonianLifecycleRetainedJournal(workerEntityId, {
    initialRevision: workerRuntime.startedAt * 1_024,
  })
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "born",
    subjectId: browserEntityId,
    subjectKind: "browser-runtime",
    ownerId: browserEntityId,
    attributes: {
      profileId,
      runtime: browserRuntimeName,
      state: "active",
    },
  }))
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "born",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: browserEntityId,
    attributes: {
      ...workerEmbodimentAttributes(),
      state: "evaluating",
      push: currentPushReady ? "ready" : "unavailable",
    },
  }))
  return true
}

function retainBrowserNodeSystemDeclaration(): HamiltonianNodeSystemDeclaration | null {
  const snapshot = workerLifecycleJournal?.snapshot()
  const browserSnapshot = currentBrowserEntityId && snapshot
    ? projectHamiltonianLifecycleOwnershipScope(snapshot, [currentBrowserEntityId])
    : null
  if (!browserSnapshot || !currentDeviceId || !currentBrowserEntityId) return null
  const declaration = createHamiltonianNodeSystemDeclaration({
    logicalContourId: hamiltonianLogicalContourId("browser-profile", currentDeviceId),
    incarnation: workerRuntimeIncarnation,
    incarnationStartedAt: workerRuntime.startedAt,
    revision: browserSnapshot.revision,
    rootId: currentBrowserEntityId,
    snapshot: browserSnapshot,
  })
  const accepted = nodeSystemDeclarations.accept(declaration)
  const retained = accepted?.declaration ?? nodeSystemDeclarations.current(declaration.logicalContourId)
  if (
    !retained ||
    retained.incarnation !== declaration.incarnation ||
    retained.revision !== declaration.revision ||
    retained.snapshot.snapshotId !== declaration.snapshot.snapshotId
  ) return null
  publishHamiltonianNodeSystemDeclaration(retained)
  return retained
}

function browserDeclarationIdentity(
  declaration: HamiltonianNodeSystemDeclaration,
): {profileId: string; workerId: string} | null {
  const entityEnvelopes = declaration.snapshot.envelopes
    .filter(({observation}) => observation.type === "entity")
  const rootEnvelope = entityEnvelopes.find(({observation}) =>
    observation.subjectId === declaration.rootId)
  const workerEnvelope = entityEnvelopes.find(({observation}) =>
    observation.subjectKind === "service-worker")
  const root = rootEnvelope?.observation
  const worker = workerEnvelope?.observation
  const profileId = root?.attributes.profileId
  const workerIdentity = worker?.attributes.identity
  if (
    root?.subjectKind !== "browser-runtime" ||
    typeof profileId !== "string" ||
    typeof workerIdentity !== "string" ||
    declaration.logicalContourId !== hamiltonianLogicalContourId("browser-profile", profileId) ||
    worker?.ownerId !== declaration.rootId ||
    worker.subjectId !== hamiltonianLifecycleEntityId("service-worker", workerIdentity) ||
    worker.attributes.runtimeIncarnation !== declaration.incarnation ||
    workerEnvelope?.sourceIncarnation !== declaration.incarnation ||
    workerEnvelope.sourceStartedAt !== declaration.incarnationStartedAt
  ) return null
  return {profileId, workerId: worker.subjectId}
}

function serverDeclarationIdentity(declaration: HamiltonianNodeSystemDeclaration): HostIdentity | null {
  const root = declaration.snapshot.envelopes
    .map(({observation}) => observation)
    .find((observation) => observation.type === "entity" && observation.subjectId === declaration.rootId)
  const identity = root?.attributes.identity
  const hostEpoch = root?.attributes.hostEpoch
  const version = root?.attributes.version
  if (
    root?.subjectKind !== "server" ||
    typeof identity !== "string" ||
    typeof hostEpoch !== "string" ||
    typeof version !== "string" ||
    hostEpoch !== declaration.incarnation ||
    declaration.rootId !== hamiltonianLifecycleEntityId("server", hostEpoch) ||
    declaration.logicalContourId !== hamiltonianLogicalContourId("server", identity)
  ) return null
  return {identity, hostEpoch, version}
}

function acceptHostNodeSystemDeclaration(
  declaration: HamiltonianNodeSystemDeclaration,
  socket: WebSocket,
): boolean {
  const serverIdentity = serverDeclarationIdentity(declaration)
  const browserIdentity = serverIdentity === null ? browserDeclarationIdentity(declaration) : null
  if (serverIdentity === null && browserIdentity === null) return false
  if (
    serverIdentity !== null &&
    currentServerLogicalContourId !== null &&
    currentServerLogicalContourId !== declaration.logicalContourId
  ) return false
  const accepted = nodeSystemDeclarations.accept(declaration)
  if (!accepted) {
    const current = nodeSystemDeclarations.current(declaration.logicalContourId)
    return current?.incarnation === declaration.incarnation &&
      current.revision === declaration.revision &&
      current.snapshot.snapshotId === declaration.snapshot.snapshotId
  }
  if (!receiveHamiltonianNodeSystemDeclaration(accepted.declaration)) return false
  tellAllNodeSystemDeclaration(accepted.declaration)
  if (serverIdentity === null) return true

  currentServerLogicalContourId = accepted.declaration.logicalContourId
  if (currentServerEntityId !== accepted.declaration.rootId) {
    currentServerEntityId = accepted.declaration.rootId
    currentHostLifecycleJournal = new HamiltonianLifecycleRetainedJournal(currentServerEntityId)
  }
  currentHost = serverIdentity
  const lifecycle = socketLifecycle.get(socket)
  if (!lifecycle) return false
  lifecycle.serverEntityId = currentServerEntityId
  void persistControlBootstrap()
  return true
}

function applyControlBootstrap(bootstrap: ControlBootstrap): boolean {
  if (!validControlBootstrap(bootstrap)) return false
  currentPushReady = bootstrap.pushReady
  if (!initializeWorkerIdentity(bootstrap.workerIdentity, bootstrap.browserEntityId, bootstrap.deviceId)) return false
  currentDeviceId = bootstrap.deviceId
  currentBrowserEntityId = bootstrap.browserEntityId
  currentToken = bootstrap.token
  currentResumeNonce = bootstrap.controlResumeNonce
  if (currentServerEntityId !== bootstrap.serverEntityId) {
    currentHostLifecycleJournal = new HamiltonianLifecycleRetainedJournal(bootstrap.serverEntityId)
  }
  currentServerEntityId = bootstrap.serverEntityId
  return true
}

async function restoreControlBootstrap(): Promise<boolean> {
  if (workerIdentity && currentToken && currentDeviceId && currentResumeNonce && currentServerEntityId) return true
  try {
    const cache = await caches.open(CONTROL_CACHE)
    const response = await cache.match(new URL(CONTROL_BOOTSTRAP_URL, location.origin).toString())
    if (!response) return false
    return applyControlBootstrap(await response.json() as ControlBootstrap)
  } catch {
    return false
  }
}

async function persistControlBootstrap(): Promise<void> {
  if (
    !workerIdentity ||
    !currentDeviceId ||
    !currentBrowserEntityId ||
    !currentToken ||
    !currentResumeNonce ||
    !currentServerEntityId
  ) return
  const bootstrap: ControlBootstrap = {
    schema: 1,
    workerIdentity,
    deviceId: currentDeviceId,
    browserEntityId: currentBrowserEntityId,
    token: currentToken,
    controlResumeNonce: currentResumeNonce,
    serverEntityId: currentServerEntityId,
    pushReady: currentPushReady,
    savedAt: Date.now(),
  }
  const cache = await caches.open(CONTROL_CACHE)
  await cache.put(
    new URL(CONTROL_BOOTSTRAP_URL, location.origin).toString(),
    new Response(JSON.stringify(bootstrap), {
      headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"},
    }),
  )
}

function observeWorkerAvailability(
  state: "active" | "standby" | "waking" | "error",
  push: "ready" | "unavailable" | "received" | "reconnect-failed",
  attributes: Record<string, string | number | boolean | null> = {},
): void {
  if (!workerEntityId || !currentBrowserEntityId) return
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: currentBrowserEntityId,
    attributes: {
      ...workerEmbodimentAttributes(),
      state,
      push,
      ...attributes,
    },
  }))
}

function observeWebPushLifecycle(event: WebPushLifecycleEvent): void {
  if (!workerEntityId || !currentBrowserEntityId) return
  const attributes: Record<string, string | number | boolean | null> = {
    ...workerEmbodimentAttributes(),
    webPushLifecycle: event.type,
  }
  if (event.type === "worker.push-received") {
    attributes.push = "received"
    attributes.state = "waking"
  } else if (event.type === "worker.notification-shown") {
    attributes.push = "received"
    attributes.notification = "shown"
    attributes.state = "active"
  } else if (event.type === "worker.notification-failed" || event.type === "worker.push-rejected") {
    attributes.push = "failed"
    attributes.state = "error"
  }
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: currentBrowserEntityId,
    attributes,
  }))
  if (event.type !== "worker.push-received" || !currentServerEntityId || !event.detail?.messageId) return
  const transportId = hamiltonianLifecycleTransportId("web-push", workerEntityId)
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "opened",
    subjectId: transportId,
    subjectKind: "web-push",
    ownerId: currentServerEntityId,
    sourceEntityId: currentServerEntityId,
    targetEntityId: workerEntityId,
    transportId,
    attributes: {state: "delivered", mediatedBy: "browser-push-service"},
  }))
  const messageId = hamiltonianLifecycleMessageId(event.detail.messageId)
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase: "received",
    subjectId: messageId,
    subjectKind: "web-push-message",
    ownerId: workerEntityId,
    sourceEntityId: currentServerEntityId,
    targetEntityId: workerEntityId,
    transportId,
    messageId,
    messageClass: "web-push",
  }))
}

const webPushWorker = createWebPushWorkerHandlers({
  beforeNotification: handleHamiltonianPushMessage,
  showNotification: (title, options) => serviceWorkerRuntime.registration.showNotification(title, options),
  onNotificationClick: async ({applicationData}) => {
    const requestedRoute = typeof applicationData?.route === "string" ? applicationData.route : "/"
    const route = requestedRoute.startsWith("/") && !requestedRoute.startsWith("//") ? requestedRoute : "/"
    const targetUrl = new URL(route, location.origin).href
    const clients = await serviceWorkerRuntime.clients.matchAll({type: "window", includeUncontrolled: true})
    const exact = clients.find((client) => client.url === targetUrl && client.focus)
    if (exact?.focus) {
      await exact.focus()
      return
    }
    const available = clients.find((client) => client.focus)
    if (available?.focus) {
      await available.focus()
      return
    }
    await serviceWorkerRuntime.clients.openWindow?.(targetUrl)
  },
  onLifecycle: observeWebPushLifecycle,
})

function tellWindow(window: WindowChannel, message: MessageRecord): void {
  try {
    const messageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "sent",
      subjectId: messageId,
      subjectKind: "service-worker-api-message",
      ownerId: workerEntityId,
      sourceEntityId: workerEntityId,
      targetEntityId: window.pageEntityId,
      transportId: window.serviceWorkerTransportId,
      messageId,
      messageClass: lifecycleMessageClass(message?.kind),
    }))
    window.client.postMessage({...message, monitor: {messageId}})
  } catch {
    windows.deleteIfCurrent(window.tabId, window)
  }
}

function tellAll(message: MessageRecord): void {
  for (const window of windows.values()) tellWindow(window, message)
}

function tellAllLifecycleSnapshot(snapshot: HamiltonianLifecycleSnapshot): void {
  for (const window of windows.values()) {
    try {
      window.client.postMessage({kind: "lifecycle-snapshot", snapshot})
    } catch {
      windows.deleteIfCurrent(window.tabId, window)
    }
  }
}

function tellAllNodeSystemDeclaration(declaration: HamiltonianNodeSystemDeclaration): void {
  for (const window of windows.values()) {
    try {
      window.client.postMessage({kind: "node-system-declaration", declaration})
    } catch {
      windows.deleteIfCurrent(window.tabId, window)
    }
  }
}

function tellCurrentNodeSystemDeclarations(client: HamiltonianWorkerClient): void {
  const declarations = [...nodeSystemDeclarations.values()].sort((left, right) =>
    Number(serverDeclarationIdentity(left) !== null) - Number(serverDeclarationIdentity(right) !== null))
  for (const declaration of declarations) {
    client.postMessage({kind: "node-system-declaration", declaration})
  }
}

function tellAllLifecycleEnvelope(envelope: HamiltonianLifecycleEnvelope): void {
  for (const window of windows.values()) {
    try {
      window.client.postMessage({kind: "lifecycle", envelope})
    } catch {
      windows.deleteIfCurrent(window.tabId, window)
    }
  }
}

function tellAllWorkerLifecycleSnapshot(): void {
  const snapshot = workerLifecycleJournal?.snapshot()
  if (snapshot) tellAllLifecycleSnapshot(snapshot)
}

function waitForWindowRehydrationPoll(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, WINDOW_REHYDRATION_POLL_MS))
}

async function awaitLiveWindowChannels(currentClientId: string | null): Promise<boolean> {
  const deadline = Date.now() + WINDOW_REHYDRATION_TIMEOUT_MS
  let completeSamples = 0
  while (Date.now() <= deadline) {
    const liveClients = await serviceWorkerRuntime.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    })
    const liveClientIds = liveClients.map((client) => client.id)
    const connectedClientIds = [...windows.values()]
      .flatMap((window) => window.clientId === null ? [] : [window.clientId])
    const missingClientIds = missingWindowClientChannels(liveClientIds, connectedClientIds)
    const currentClientObserved = currentClientId === null || liveClientIds.includes(currentClientId)
    if (currentClientObserved && missingClientIds.length === 0) {
      completeSamples += 1
      if (completeSamples >= 2) return true
    } else {
      completeSamples = 0
      const missing = new Set(missingClientIds)
      const now = Date.now()
      for (const [clientId, requestedAt] of windowReattachRequestedAt) {
        if (now - requestedAt >= WINDOW_REHYDRATION_TIMEOUT_MS) {
          windowReattachRequestedAt.delete(clientId)
        }
      }
      for (const client of liveClients) {
        if (!missing.has(client.id) || windowReattachRequestedAt.has(client.id)) continue
        windowReattachRequestedAt.set(client.id, now)
        client.postMessage({kind: "reattach-window"})
      }
    }
    await waitForWindowRehydrationPoll()
  }
  return false
}

function emit(message: string, level: "info" | "error" = "info"): void {
  tellAll({kind: "event", message, level})
}

function workerState(): WorkerState {
  const socket = socketSlot.current
  return {
    kind: "worker-state",
    control: "Service Worker API active",
    socket: socket?.readyState === WebSocket.OPEN ? "connected" : "reconnecting",
    workerIdentity,
    workerRuntimeIncarnation,
    workerCodeVersion,
    connectionId: currentConnectionId,
    host: currentHost,
  }
}

function observeWorkerHeartbeat(
  state: "active" | "error",
  heartbeat: "awaiting" | "observed" | "failed",
  attributes: Record<string, string | number | boolean | null> = {},
): void {
  if (!workerEntityId || !currentBrowserEntityId) return
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: currentBrowserEntityId,
    attributes: {
      ...workerEmbodimentAttributes(),
      state,
      heartbeat,
      ...(state === "active" ? {reason: null} : {}),
      ...attributes,
    },
  }))
}

function sendSocket(message: MessageRecord): boolean {
  const socket = socketSlot.current
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  if (socket.bufferedAmount > MAX_SOCKET_BUFFER) {
    rejectHamiltonianControlSocket(socketSlot, socket, "control channel backpressure")
    return false
  }
  const lifecycle = socketLifecycle.get(socket)
  const serverEntityId = lifecycle?.serverEntityId ?? null
  const messageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
  if (!lifecycle) return false
  const observedMessage = {...message, monitor: {messageId, transportId: lifecycle.transportId}}
  if (lifecycle && serverEntityId) {
    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "sent",
      subjectId: messageId,
      subjectKind: "websocket-message",
      ownerId: workerEntityId,
      sourceEntityId: workerEntityId,
      targetEntityId: serverEntityId,
      transportId: lifecycle.transportId,
      messageId,
      messageClass: lifecycleMessageClass(message?.kind),
    }))
  }
  socket.send(JSON.stringify(observedMessage))
  return true
}

function sendWorkerIdentity(): boolean {
  const lifecycleDeclaration = retainBrowserNodeSystemDeclaration()
  const browserLifecycleSnapshot = lifecycleDeclaration?.snapshot ?? null
  if (!workerIdentity || !currentResumeNonce || !browserLifecycleSnapshot || !lifecycleDeclaration) return false
  const wake = pendingPushWake
  return sendSocket({
    kind: "identity",
    workerIdentity,
    workerRuntimeIncarnation,
    workerCodeVersion,
    resumeNonce: currentResumeNonce,
    lifecycleSnapshot: browserLifecycleSnapshot,
    lifecycleDeclaration,
    ...(wake === null ? {} : {wakeId: wake.wakeId, wakeProof: wake.wakeProof}),
  })
}

function flushPushRegistrations(): void {
  for (const pending of pendingPushRegistrations.values()) {
    sendSocket({
      kind: "push-subscription",
      registrationId: pending.registrationId,
      subscription: pending.subscription,
    })
  }
}

function flushHostRetirements(): void {
  for (const envelope of pendingHostRetirements.values()) {
    sendSocket({kind: "lifecycle-retirement", envelope})
  }
}

function isObservedSupersededServiceWorkerEnd(envelope: HamiltonianLifecycleEnvelope): boolean {
  const observation = envelope?.observation
  return currentBrowserEntityId !== null &&
    envelope?.sourceKind === "page" &&
    envelope?.sourceId === hamiltonianLifecycleEntityId("page", envelope?.sourceIncarnation) &&
    observation?.type === "entity" &&
    observation?.phase === "ended" &&
    observation?.subjectKind === "service-worker" &&
    observation?.subjectId !== workerEntityId &&
    observation?.ownerId === currentBrowserEntityId &&
    observation?.attributes?.state === "ended" &&
    observation?.attributes?.successor === workerEntityId
}

async function sweepWindows(): Promise<boolean> {
  const liveClients = new Set(
    (await serviceWorkerRuntime.clients.matchAll({type: "window", includeUncontrolled: false}))
      .map((client) => client.id),
  )
  const now = Date.now()
  let changed = false
  for (const [tabId, window] of windows) {
    if (!windowClientLeaseExpired({
      hasLiveClient: Boolean(window.clientId && liveClients.has(window.clientId)),
      now,
      lastSeenAt: window.lastSeenAt,
      timeoutMs: WINDOW_TIMEOUT_MS,
    })) continue
    observeWindowEnded(window, "client-missing")
    closeWindowChannel(window, "client-missing")
    windows.deleteIfCurrent(tabId, window)
    changed = true
  }
  if (changed) tellAllWorkerLifecycleSnapshot()
  return changed
}

async function sendWindowSnapshot(): Promise<void> {
  await sweepWindows()
  sendSocket({
    kind: "tabs",
    windows: [...windows.values()].map((window) => ({
      tabId: window.tabId,
      joinedAt: window.joinedAt,
      visible: window.visible,
    })),
  })
  sendCurrentBrowserNodeSystemDeclaration()
}

function sendCurrentBrowserNodeSystemDeclaration(): void {
  const snapshot = workerLifecycleJournal?.snapshot()
  const browserSnapshot = currentBrowserEntityId && snapshot
    ? projectHamiltonianLifecycleOwnershipScope(snapshot, [currentBrowserEntityId])
    : null
  const declaration = retainBrowserNodeSystemDeclaration()
  if (browserSnapshot && declaration?.snapshot.snapshotId === browserSnapshot.snapshotId) {
    sendSocket({kind: "browser-lifecycle-snapshot", snapshot: browserSnapshot, declaration})
  }
}

function reconnectDelay(): number {
  return reconnectPolicy.nextDelay()
}

function scheduleReconnect(): void {
  if (reconnectTimer || !currentToken || !currentDeviceId) return
  const delay = reconnectDelay()
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    ensureSocket()
  }, delay)
  tellAll(workerState())
}

function ensureSocket(): void {
  if (!workerIdentity || !workerEntityId || !currentToken || !currentDeviceId || !currentResumeNonce || !currentServerEntityId) return
  if (reconnectTimer) return
  if (socketSlot.current) return

  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const url = new URL(`${protocol}//${location.host}/control`)
  const socketIncarnation = crypto.randomUUID()
  const transportId = hamiltonianLifecycleTransportId("websocket", socketIncarnation)
  url.searchParams.set("token", currentToken)
  url.searchParams.set("device", currentDeviceId)
  url.searchParams.set("transport", transportId)
  url.searchParams.set("worker", workerEntityId)
  const openedSocket = new WebSocket(url)
  socketLifecycle.set(openedSocket, {
    socketIncarnation,
    transportId,
    serverEntityId: null,
    identitySent: false,
    transportDeclared: false,
  })
  if (!socketSlot.attach(openedSocket)) {
    openedSocket.close(1000, "another control socket is current")
    return
  }
  tellAll(workerState())

  openedSocket.addEventListener("open", () => {
    if (!socketSlot.isCurrent(openedSocket)) return
    reconnectPolicy.reset()
    tellAll(workerState())
  })
  openedSocket.addEventListener("message", (event) => {
    if (!socketSlot.isCurrent(openedSocket) || openedSocket.readyState !== WebSocket.OPEN) return
    let message: HostControlMessage
    try {
      message = JSON.parse(String(event.data)) as HostControlMessage
    } catch {
      rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid host message")
      return
    }
    const lifecycle = socketLifecycle.get(openedSocket)
    if (!lifecycle) return
    if (message.kind === "node-system-declaration") {
      const declaration = message.declaration
      const serverIdentity = isHamiltonianNodeSystemDeclaration(declaration)
        ? serverDeclarationIdentity(declaration)
        : null
      if (
        !isHamiltonianNodeSystemDeclaration(declaration) ||
        !acceptHostNodeSystemDeclaration(declaration, openedSocket)
      ) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid host node-system declaration")
        return
      }
      if (serverIdentity !== null && !lifecycle.identitySent) {
        lifecycle.identitySent = true
        if (!sendWorkerIdentity()) {
          rejectHamiltonianControlSocket(socketSlot, openedSocket, "browser node-system declaration is unavailable")
          return
        }
      }
      if (serverIdentity !== null && declaration.boundaryTransports.some(({transportId: declaredId}) =>
        declaredId === lifecycle.transportId)) {
        lifecycle.transportDeclared = true
      }
      return
    }
    const serverEntityId = lifecycle.serverEntityId
    if (message.kind === "lifecycle-snapshot") {
      const snapshot = message.snapshot
      if (!serverEntityId || !isHamiltonianLifecycleSnapshot(snapshot) || snapshot.scopeId !== serverEntityId) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "host lifecycle snapshot scope mismatch")
        return
      }
      const journal = currentHostLifecycleJournal ?? new HamiltonianLifecycleRetainedJournal(serverEntityId)
      if (!journal.replace(snapshot) || !publishHamiltonianLifecycleSnapshot(snapshot)) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid host lifecycle snapshot")
        return
      }
      currentHostLifecycleJournal = journal
      tellAllLifecycleSnapshot(snapshot)
      return
    }
    if (message.kind === "lifecycle") {
      const envelope = message.envelope
      if (!isHamiltonianLifecycleEnvelope(envelope)) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid host lifecycle envelope")
        return
      }
      const retiredSubjectId = envelope.observation.subjectId
      const pendingRetirement = pendingHostRetirements.get(retiredSubjectId)
      if (pendingRetirement?.eventId === envelope.eventId) {
        pendingHostRetirements.delete(retiredSubjectId)
      }
      if (!publishHamiltonianLifecycleEnvelope(envelope)) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid host lifecycle envelope")
        return
      }
      currentHostLifecycleJournal?.observe(envelope)
      return
    }
    if (message.kind === "hello") {
      const host = message.host
      const nextServerEntityId = isHostIdentity(host)
        ? hamiltonianLifecycleEntityId("server", host.hostEpoch)
        : null
      if (!nextServerEntityId) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "hello lacks server incarnation")
        return
      }
      if (lifecycle.serverEntityId && lifecycle.serverEntityId !== nextServerEntityId) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "server incarnation changed on one socket")
        return
      }
    }
    const messageId = lifecycleMessageId(message)
    const messageTransportId = lifecycleMonitorTransportId(message)
    if (messageId && messageTransportId !== transportId) {
      rejectHamiltonianControlSocket(socketSlot, openedSocket, "host message transport identity mismatch")
      return
    }
    if (messageId && serverEntityId) {
      emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
        type: "message",
        phase: "received",
        subjectId: messageId,
        subjectKind: "websocket-message",
        ownerId: workerEntityId,
        sourceEntityId: serverEntityId,
        targetEntityId: workerEntityId,
        transportId,
        messageId,
        messageClass: lifecycleMessageClass(message.kind),
      }))
    }
    if (message.kind === "wake-confirmed") {
      const wakeId = message.wakeId
      const pending = pendingPushWake
      if (!validControlIdentity(wakeId) || !pending || pending.wakeId !== wakeId) {
        const error = new Error("host confirmed an unexpected Web Push wake")
        pending?.reject(error)
        pendingPushWake = null
        rejectHamiltonianControlSocket(socketSlot, openedSocket, error.message)
        return
      }
      pendingPushWake = null
      observeWorkerAvailability("active", "received", {wakeId})
      pending.resolve()
      return
    }
    if (message.kind === "push-subscription-confirmed") {
      const registrationId = message.registrationId
      if (!validControlIdentity(registrationId)) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid PushSubscription confirmation")
        return
      }
      const pending = pendingPushRegistrations.get(registrationId)
      if (!pending) return
      pendingPushRegistrations.delete(registrationId)
      currentPushReady = true
      void persistControlBootstrap()
      observeWorkerAvailability("active", "ready")
      const window = windows.get(pending.tabId)
      if (window) tellWindow(window, {
        kind: "push-subscription-confirmed",
        registrationId,
        subscription: message.subscription,
      })
      tellAll(workerState())
      return
    }
    if (message.kind === "push-subscription-rejected") {
      const registrationId = message.registrationId
      if (!validControlIdentity(registrationId)) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid PushSubscription rejection")
        return
      }
      const pending = pendingPushRegistrations.get(registrationId)
      if (!pending) return
      pendingPushRegistrations.delete(registrationId)
      const window = windows.get(pending.tabId)
      if (window) {
        tellWindow(window, {
          kind: "push-subscription-rejected",
          registrationId,
          reason: typeof message.reason === "string" ? message.reason.slice(0, 256) : "server rejected subscription",
        })
      }
      return
    }
    if (isHostPingMessage(message)) {
      if (sendSocket({
        kind: "pong",
        at: message.at,
        seq: message.seq,
        workerIdentity,
        workerRuntimeIncarnation,
      })) {
        observeWorkerHeartbeat("active", "observed", {
          heartbeatSequence: message.seq,
          ...(currentConnectionId === null ? {} : {connectionId: currentConnectionId}),
        })
      }
      return
    }
    if (message.kind === "hello") {
      if (!isHostIdentity(message.host)) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid host identity")
        return
      }
      const declaredHost = currentServerLogicalContourId === null
        ? null
        : nodeSystemDeclarations.current(currentServerLogicalContourId)
      const declaredIdentity = declaredHost === null ? null : serverDeclarationIdentity(declaredHost)
      if (
        declaredIdentity === null ||
        declaredIdentity.identity !== message.host.identity ||
        declaredIdentity.hostEpoch !== message.host.hostEpoch ||
        declaredIdentity.version !== message.host.version
      ) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "host identity does not match its node-system declaration")
        return
      }
      currentConnectionId = message.connectionId ?? null
      currentHost = message.host
      tellAll(workerState())
      return
    }
    if (message.kind === "topology") {
      if (!isHostIdentity(message.host) || !message.topology) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid topology message")
        return
      }
      currentHost = message.host
      currentTopology = message.topology
      if (applicationReady) tellAll(message)
      return
    }
    if (message.kind === "source-update") {
      currentSourceUpdate = message
      if (applicationReady) tellAll(message)
      return
    }
    if (message.kind === "service-worker-update") {
      if (!isServiceWorkerRelease(message.target) || message.target.version === workerCodeVersion) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid Service Worker update target")
        return
      }
      applicationReady = false
      void serviceWorkerRuntime.registration.update().then(() => {
        emit(`browser accepted Service Worker update check for ${message.target!.version}`)
      }).catch((error: unknown) => {
        emit(`Service Worker update check failed: ${error instanceof Error ? error.message : String(error)}`, "error")
      })
      return
    }
    if (message.kind === "service-worker-current") {
      if (!isServiceWorkerRelease(message.target) || message.target.version !== workerCodeVersion) {
        rejectHamiltonianControlSocket(socketSlot, openedSocket, "invalid current Service Worker release")
        return
      }
      void admitServiceWorkerApplication()
      return
    }
    if (message.kind === "peer-signal" && typeof message.tabId === "string") {
      const window = windows.get(message.tabId)
      if (window) tellWindow(window, message)
    }
  })
  openedSocket.addEventListener("close", (event) => {
    if (!socketSlot.clearIfCurrent(openedSocket)) return
    applicationReady = false
    const lifecycle = socketLifecycle.get(openedSocket)
    const serverEntityId = lifecycle?.serverEntityId ?? null
    if (serverEntityId && lifecycle?.transportDeclared) {
      emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "closed",
        subjectId: transportId,
        subjectKind: "websocket",
        ownerId: workerEntityId,
        sourceEntityId: workerEntityId,
        targetEntityId: serverEntityId,
        transportId,
        attributes: {
          socketIncarnation,
          protocol: protocol === "wss:" ? "wss" : "ws",
          code: event.code,
          reason: event.reason || "network",
        },
      }))
    }
    emit(`control socket closed (${event.code || "network"}); reconnect scheduled`)
    if (currentPushReady) {
      observeWorkerAvailability("standby", "ready", {
        heartbeat: "paused",
        reason: event.reason || `websocket-${event.code || "network"}`,
      })
    } else {
      observeWorkerHeartbeat("error", "failed", {
        reason: event.reason || `websocket-${event.code || "network"}`,
      })
    }
    currentConnectionId = null
    tellAll(workerState())
    scheduleReconnect()
  })
  openedSocket.addEventListener("error", () => {
    if (socketSlot.isCurrent(openedSocket)) {
      emit("control socket error", "error")
      const serverEntityId = socketLifecycle.get(openedSocket)?.serverEntityId ?? null
      if (serverEntityId && socketLifecycle.get(openedSocket)?.transportDeclared) {
        emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
          type: "transport",
          phase: "changed",
          subjectId: transportId,
          subjectKind: "websocket",
          ownerId: workerEntityId,
          sourceEntityId: workerEntityId,
          targetEntityId: serverEntityId,
          transportId,
          attributes: {
            socketIncarnation,
            protocol: protocol === "wss:" ? "wss" : "ws",
            state: "error",
          },
        }))
      }
    }
  })
}

async function admitServiceWorkerApplication(): Promise<void> {
  if (applicationReady) return
  applicationReady = true
  flushPushRegistrations()
  flushHostRetirements()
  observeWorkerHeartbeat("active", "awaiting")
  emit("Service Worker control socket connected")
  tellAll(workerState())
  if (currentHost) void prepareVersion(currentHost.version)
  if (currentTopology && currentHost) {
    tellAll({kind: "topology", host: currentHost, topology: currentTopology})
  }
  if (currentSourceUpdate) tellAll(currentSourceUpdate)
  const pending = [...pendingWindowConnections.values()]
  pendingWindowConnections.clear()
  for (const connection of pending) {
    await connectWindow(connection.message, connection.client)
  }
  await sendWindowSnapshot()
}

async function prepareVersion(expectedVersion: string): Promise<void> {
  try {
    const headers = {authorization: `Bearer ${currentToken}`}
    const manifestResponse = await fetch("/manifest.json", {headers, cache: "no-store"})
    if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}`)
    const manifest = await manifestResponse.json()
    if (!isVersionManifest(manifest)) throw new Error("invalid version manifest")
    if (manifest.version !== expectedVersion) throw new Error("host and manifest versions differ")

    const cacheName = `hamiltonian-code:${manifest.version}`
    const cache = await caches.open(cacheName)
    let moduleResponse = await cache.match(manifest.moduleUrl)
    if (!await responseMatchesHash(moduleResponse, manifest.sha256)) {
      const fetched = await fetch(manifest.moduleUrl, {headers, cache: "no-store"})
      if (!fetched.ok) throw new Error(`module ${fetched.status}`)
      const actualHash = await sha256Hex(fetched.clone())
      if (actualHash !== manifest.sha256) throw new Error("module SHA-256 mismatch")
      await cache.put(manifest.moduleUrl, fetched.clone())
      moduleResponse = fetched
      emit(`cached version ${manifest.version} after SHA-256 verification`)
    } else {
      emit(`reused cached version ${manifest.version}`)
    }

    const cacheNames = await retainVersionCaches(cacheName)
    currentVersionState = {
      kind: "version-ready",
      version: manifest.version,
      moduleUrl: manifest.moduleUrl,
      sha256: manifest.sha256,
      caches: cacheNames,
    }
    tellAll(currentVersionState)
  } catch (error) {
    emit(`version preparation failed: ${error instanceof Error ? error.message : String(error)}`, "error")
  }
}

async function retainVersionCaches(currentCacheName: string): Promise<string[]> {
  const names = (await caches.keys())
    .filter((name) => name.startsWith("hamiltonian-code:"))
    .sort()
  const previous = currentVersionState
    ? `hamiltonian-code:${currentVersionState.version}`
    : null
  const keep = new Set(selectRetainedCaches(names, currentCacheName, previous, MAX_VERSION_CACHES))
  await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)))
  return (await caches.keys()).filter((name) => name.startsWith("hamiltonian-code:")).sort()
}

async function connectWindow(message: ConnectWindowMessage, client: HamiltonianWorkerClient): Promise<void> {
  await restoreControlBootstrap()
  const clientId = client.id
  const pageEntityId = hamiltonianLifecycleEntityId("page", message.pageIncarnation)
  const nextBrowserEntityId = lifecycleIdentifier(message.browserEntityId, "browser:")
  const nextServerEntityId = lifecycleIdentifier(message.serverEntityId, "server:")
  const nextServiceWorkerTransportId = lifecycleIdentifier(
    message.serviceWorkerTransportId,
    "service-worker-api:",
  )
  const connectMessageId = lifecycleMessageId(message)
  const pageLifecycleSnapshot = isHamiltonianLifecycleSnapshotFromSource(
    message.pageLifecycleSnapshot,
    pageEntityId,
    pageEntityId,
    "page",
    message.pageIncarnation,
  ) ? message.pageLifecycleSnapshot : null
  if (
    !nextBrowserEntityId ||
    nextBrowserEntityId !== hamiltonianBrowserNodeId(message.deviceId) ||
    !nextServerEntityId ||
    !nextServiceWorkerTransportId ||
    !connectMessageId ||
    !pageLifecycleSnapshot ||
    !initializeWorkerIdentity(message.workerIdentity, nextBrowserEntityId, message.deviceId)
  ) {
    return
  }
  const declaredServerEntityId = currentServerLogicalContourId === null
    ? null
    : nodeSystemDeclarations.current(currentServerLogicalContourId)?.rootId ?? null
  const acceptedServerEntityId = declaredServerEntityId ?? nextServerEntityId
  const controlIdentityChanged =
    (currentDeviceId !== null && currentDeviceId !== message.deviceId) ||
    (currentBrowserEntityId !== null && currentBrowserEntityId !== nextBrowserEntityId) ||
    (currentToken !== null && currentToken !== message.token) ||
    (currentResumeNonce !== null && currentResumeNonce !== message.controlResumeNonce) ||
    (currentServerEntityId !== null && currentServerEntityId !== acceptedServerEntityId)
  if (controlIdentityChanged) {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    reconnectPolicy.reset()
  }
  if (currentDeviceId && currentDeviceId !== message.deviceId) {
    socketSlot.current?.close(4001, "device identity changed")
    for (const window of windows.values()) closeWindowChannel(window, "device-identity-changed")
    windows.clear()
  }
  if (currentToken && currentToken !== message.token) socketSlot.current?.close(4001, "token changed")
  if (currentResumeNonce && currentResumeNonce !== message.controlResumeNonce) {
    socketSlot.current?.close(4001, "resume capability changed")
  }
  if (currentServerEntityId && currentServerEntityId !== acceptedServerEntityId) {
    socketSlot.current?.close(4001, "server incarnation changed")
  }
  currentDeviceId = message.deviceId
  currentBrowserEntityId = nextBrowserEntityId
  currentToken = message.token
  currentResumeNonce = message.controlResumeNonce
  if (currentServerEntityId !== acceptedServerEntityId) {
    currentHostLifecycleJournal = new HamiltonianLifecycleRetainedJournal(acceptedServerEntityId)
  }
  currentServerEntityId = acceptedServerEntityId
  await persistControlBootstrap()

  if (!applicationReady) {
    pendingWindowConnections.set(message.tabId, {message, client})
    ensureSocket()
    return
  }
  pendingWindowConnections.delete(message.tabId)

  const previous = windows.get(message.tabId)
  const previousClient = previous?.clientId ? await serviceWorkerRuntime.clients.get(previous.clientId) : null
  const replacesPreviousPage = isWindowPageReplacement(previous, message)
  if (
    previous &&
    previous.clientId !== clientId &&
    previousClient &&
    !replacesPreviousPage
  ) {
    client.postMessage({kind: "window-id-collision", replacementTabId: crypto.randomUUID()})
    return
  }
  if (previous) {
    if (replacesPreviousPage) observeWindowEnded(previous, "page-reloaded")
    closeWindowChannel(
      previous,
      "replaced",
      previous.serviceWorkerTransportId !== nextServiceWorkerTransportId,
    )
  }
  const window: WindowChannel = {
    tabId: message.tabId,
    joinedAt: message.joinedAt,
    visible: message.visible,
    lastSeenAt: Date.now(),
    clientId,
    pageIncarnation: message.pageIncarnation,
    predecessorPageIncarnation: message.predecessorPageIncarnation,
    pageEntityId,
    serviceWorkerTransportId: nextServiceWorkerTransportId,
    client,
  }
  windows.set(message.tabId, window)
  workerLifecycleJournal?.merge(projectPageLifecycleForBrowserJournal(
    pageLifecycleSnapshot,
    workerEntityId,
  ))
  await awaitLiveWindowChannels(clientId)
  const workerLifecycleSnapshot = workerLifecycleJournal?.snapshot()
  if (!workerLifecycleSnapshot || !isCurrentWindowChannel(windows, window)) {
    windows.deleteIfCurrent(window.tabId, window)
    return
  }
  publishHamiltonianLifecycleSnapshot(workerLifecycleSnapshot)
  tellAllLifecycleSnapshot(workerLifecycleSnapshot)
  tellCurrentNodeSystemDeclarations(client)
  if (currentHostLifecycleJournal) {
    const hostLifecycleSnapshot = currentHostLifecycleJournal.snapshot()
    publishHamiltonianLifecycleSnapshot(hostLifecycleSnapshot)
    client.postMessage({kind: "lifecycle-snapshot", snapshot: hostLifecycleSnapshot})
  }
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: nextBrowserEntityId,
    attributes: {
      ...workerEmbodimentAttributes(),
      state: "active",
      push: currentPushReady ? "ready" : "unavailable",
    },
  }), {causedBy: connectMessageId})
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "opened",
    subjectId: nextServiceWorkerTransportId,
    subjectKind: "service-worker-api",
    ownerId: workerEntityId,
    sourceEntityId: pageEntityId,
    targetEntityId: workerEntityId,
    transportId: nextServiceWorkerTransportId,
    attributes: {
      state: "active",
      mechanism: "ServiceWorker.postMessage / WindowClient.postMessage",
    },
  }), {causedBy: connectMessageId})
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase: "received",
    subjectId: connectMessageId,
    subjectKind: "service-worker-api-message",
    ownerId: workerEntityId,
    sourceEntityId: pageEntityId,
    targetEntityId: workerEntityId,
    transportId: nextServiceWorkerTransportId,
    messageId: connectMessageId,
    messageClass: "connect-window",
  }))
  tellWindow(window, workerState())
  if (currentTopology) tellWindow(window, {kind: "topology", host: currentHost, topology: currentTopology})
  if (currentVersionState) tellWindow(window, currentVersionState)
  ensureSocket()
  void sendWindowSnapshot()
}

async function receiveWindowMessage(pageMessage: PageControlMessage, client: HamiltonianWorkerClient): Promise<void> {
  if (!applicationReady) return
  const window = [...windows.values()].find((candidate) => candidate.clientId === client.id)
  if (!window || !isCurrentWindowChannel(windows, window)) {
    client.postMessage({kind: "reattach-window"})
    return
  }
  const pageMessageId = lifecycleMessageId(pageMessage)
  if (pageMessageId) {
    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "received",
      subjectId: pageMessageId,
      subjectKind: "service-worker-api-message",
      ownerId: workerEntityId,
      sourceEntityId: window.pageEntityId,
      targetEntityId: workerEntityId,
      transportId: window.serviceWorkerTransportId,
      messageId: pageMessageId,
      messageClass: lifecycleMessageClass(pageMessage.kind),
    }))
  }
  if (pageMessage.kind === "page-lifecycle") {
    if (!isHamiltonianLifecycleEnvelopeFromSource(
      pageMessage.envelope,
      window.pageEntityId,
      "page",
      window.pageIncarnation,
    )) return
    if (!pageLifecycleMayEnterBrowserJournal(pageMessage.envelope, workerEntityId)) return
    if (workerLifecycleJournal?.observe(pageMessage.envelope)) {
      tellAllLifecycleEnvelope(pageMessage.envelope)
      if (pageLifecycleChangesNodeSystem(pageMessage.envelope)) {
        sendCurrentBrowserNodeSystemDeclaration()
      }
    }
    return
  }
  if (pageMessage.kind === "register-push-subscription") {
    const registrationId = pageMessage.registrationId
    if (
      !validControlIdentity(registrationId) ||
      pageMessage.workerIdentity !== workerIdentity ||
      !isPushSubscriptionRecord(pageMessage.subscription)
    ) {
      tellWindow(window, {
        kind: "push-subscription-rejected",
        registrationId: typeof registrationId === "string" ? registrationId : "invalid",
        reason: "invalid PushSubscription registration",
      })
      return
    }
    pendingPushRegistrations.set(registrationId, {
      registrationId,
      subscription: pageMessage.subscription,
      tabId: window.tabId,
    })
    ensureSocket()
    flushPushRegistrations()
    return
  }
  if (pageMessage.kind === "window-heartbeat") {
    if (pageMessage.tabId !== window.tabId || pageMessage.pageIncarnation !== window.pageIncarnation) return
    window.lastSeenAt = Date.now()
    window.visible = pageMessage.visible === true
    tellWindow(window, workerState())
    if (await sweepWindows()) await sendWindowSnapshot()
    ensureSocket()
    return
  }
  if (pageMessage.kind === "disconnect-window") {
    windows.deleteIfCurrent(window.tabId, window)
    observeWindowEnded(window, "window-disconnected")
    closeWindowChannel(window, "window-disconnected")
    tellAllWorkerLifecycleSnapshot()
    await sendWindowSnapshot()
    return
  }
  if (pageMessage.kind === "peer-signal" || pageMessage.kind === "peer-failed") {
    const leader = currentTopology?.leader
    if (!isCurrentLeaderPeerControl({
      message: pageMessage,
      leader,
      deviceId: currentDeviceId,
      tabId: window.tabId,
      connectionId: currentConnectionId,
    })) return
    sendSocket(pageMessage)
  }
}

serviceWorkerRuntime.addEventListener("message", (event) => {
  const message = event.data
  const client = event.source
  if (!client || !isMessageRecord(message)) return
  if (isConnectWindowMessage(message)) {
    event.waitUntil(connectWindow(message, client))
    return
  }
  event.waitUntil(receiveWindowMessage(message as PageControlMessage, client))
})

serviceWorkerRuntime.addEventListener("push", (event) => {
  void webPushWorker.handlePush(event)
})
serviceWorkerRuntime.addEventListener("notificationclick", (event) => {
  void webPushWorker.handleNotificationClick(event)
})

async function handleHamiltonianPushMessage(message: WebPushMessage): Promise<void> {
  const payload = parseWakePayload(message.data)
  if (!payload || !await restoreControlBootstrap()) {
    throw new Error("invalid Hamiltonian Web Push wake payload")
  }
  const confirmation = beginPushWake(payload)
  try {
    await applyPushWakePayload(payload)
    observeWorkerAvailability("waking", "received", {wakeId: payload.wakeId})
    ensureSocket()
    await withTimeout(confirmation, 30_000, "server did not confirm the Web Push wake")
  } catch (error) {
    if (pendingPushWake?.wakeId === payload.wakeId) pendingPushWake = null
    const reason = error instanceof Error ? error.message : String(error)
    observeWorkerAvailability("error", "reconnect-failed", {
      wakeId: payload.wakeId,
      reason: reason.slice(0, 256),
    })
    await serviceWorkerRuntime.registration.showNotification("Hamiltonian", {
      body: "Service Worker не смог восстановить связь с сервером",
      tag: "hamiltonian-service-worker",
      data: {wakeId: payload.wakeId},
    })
    throw error
  }
}

async function applyPushWakePayload(payload: PushWakePayload): Promise<void> {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  reconnectPolicy.reset()
  socketSlot.current?.close(4001, "Web Push requires a fresh control socket")
  if (currentServerEntityId !== payload.serverEntityId) {
    currentHostLifecycleJournal = new HamiltonianLifecycleRetainedJournal(payload.serverEntityId)
    currentHost = null
    currentTopology = null
    currentConnectionId = null
  }
  currentToken = payload.token
  currentServerEntityId = payload.serverEntityId
  // Delivery proves that this registration still has a usable PushSubscription.
  // Persist it inside the extendable push task so the next browser-managed
  // execution restores the stable Service Worker as Push-ready.
  currentPushReady = true
  await persistControlBootstrap()
}

function beginPushWake(payload: PushWakePayload): Promise<void> {
  const existing = pendingPushWake
  if (existing?.wakeId === payload.wakeId && existing.wakeProof === payload.wakeProof) return existing.promise
  existing?.reject(new Error("a newer Web Push wake superseded the previous wake"))
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  pendingPushWake = {
    wakeId: payload.wakeId,
    wakeProof: payload.wakeProof,
    promise,
    resolve,
    reject,
  }
  return promise
}

async function withTimeout(promise: Promise<void>, timeoutMs: number, message: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

function parseWakePayload(value: unknown): PushWakePayload | null {
  try {
    return isRecord(value) &&
      value.kind === "wake-service-worker" &&
      validControlIdentity(value.wakeId) &&
      validControlIdentity(value.wakeProof) &&
      typeof value.token === "string" && value.token.length > 0 && value.token.length <= 512 &&
      typeof value.serverEntityId === "string" &&
      value.serverEntityId.startsWith("server:") && value.serverEntityId.length <= 512
      ? {
        kind: "wake-service-worker",
        wakeId: value.wakeId,
        wakeProof: value.wakeProof,
        token: value.token,
        serverEntityId: value.serverEntityId,
      }
      : null
  } catch {
    return null
  }
}

serviceWorkerRuntime.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== location.origin || !url.pathname.startsWith("/versions/")) return
  event.respondWith((async () => {
    const cached = await caches.match(event.request)
    return cached ?? new Response("Version is not prepared by Hamiltonian", {status: 503})
  })())
})

function closeWindowChannel(window: WindowChannel, reason: string, closeTransport = true): void {
  if (!closeTransport) return
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "closed",
    subjectId: window.serviceWorkerTransportId,
    subjectKind: "service-worker-api",
    ownerId: workerEntityId,
    sourceEntityId: window.pageEntityId,
    targetEntityId: workerEntityId,
    transportId: window.serviceWorkerTransportId,
    attributes: {reason},
  }))
}

function observeWindowEnded(window: WindowChannel, reason: string): void {
  if (!currentBrowserEntityId || !workerEntityId) return
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "ended",
    subjectId: window.pageEntityId,
    subjectKind: "page",
    ownerId: currentBrowserEntityId,
    attributes: {
      incarnation: window.pageIncarnation,
      state: "ended",
      reason,
    },
  }))
}

function lifecycleMessageId(message: unknown): string | null {
  if (!isMessageRecord(message) || !isRecord(message.monitor)) return null
  return typeof message.monitor.messageId === "string" && message.monitor.messageId
    ? message.monitor.messageId
    : null
}

function lifecycleMonitorTransportId(message: unknown): string | null {
  if (!isMessageRecord(message) || !isRecord(message.monitor)) return null
  return typeof message.monitor.transportId === "string" && message.monitor.transportId
    ? message.monitor.transportId
    : null
}

function lifecycleMessageClass(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value) ? value : "unknown"
}

function lifecycleIdentifier(value: unknown, prefix: string): string | null {
  return typeof value === "string" && value.startsWith(prefix) && value.length <= 512 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isMessageRecord(value: unknown): value is MessageRecord {
  return isRecord(value) && typeof value.kind === "string"
}

function isHostIdentity(value: unknown): value is HostIdentity {
  return isRecord(value) &&
    (value.identity === undefined || typeof value.identity === "string") &&
    typeof value.hostEpoch === "string" && value.hostEpoch.length > 0 &&
    typeof value.version === "string" && value.version.length > 0
}

function isHostPingMessage(value: HostControlMessage): value is HostPingMessage {
  return value.kind === "ping" && typeof value.at === "number" && typeof value.seq === "number"
}

function isVersionManifest(value: unknown): value is VersionManifest {
  return isRecord(value) &&
    typeof value.version === "string" &&
    typeof value.moduleUrl === "string" &&
    typeof value.sha256 === "string"
}

function isServiceWorkerRelease(value: unknown): value is ServiceWorkerRelease {
  return isRecord(value) &&
    isHamiltonianServiceWorkerCodeVersion(value.version) &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256)
}

function isConnectWindowMessage(value: unknown): value is ConnectWindowMessage {
  if (!isMessageRecord(value) || value.kind !== "connect-window") return false
  return typeof value.browserEntityId === "string" &&
    typeof value.controlResumeNonce === "string" &&
    typeof value.deviceId === "string" &&
    typeof value.joinedAt === "number" &&
    typeof value.serviceWorkerTransportId === "string" &&
    isHamiltonianLifecycleSnapshot(value.pageLifecycleSnapshot) &&
    typeof value.pageIncarnation === "string" &&
    (value.predecessorPageIncarnation === null || validControlIdentity(value.predecessorPageIncarnation)) &&
    typeof value.serverEntityId === "string" &&
    typeof value.tabId === "string" &&
    typeof value.token === "string" &&
    typeof value.visible === "boolean" &&
    validControlIdentity(value.workerIdentity)
}

function isPushSubscriptionRecord(value: unknown): value is PushSubscriptionRecord {
  if (!isRecord(value) || typeof value.endpoint !== "string" || value.endpoint.length > 4_096) return false
  try {
    if (new URL(value.endpoint).protocol !== "https:") return false
  } catch {
    return false
  }
  if (!isRecord(value.keys)) return false
  const validKey = (key: unknown, maxLength: number) =>
    typeof key === "string" && key.length > 0 && key.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(key)
  return validKey(value.keys.p256dh, 512) &&
    validKey(value.keys.auth, 256) &&
    (value.expirationTime === undefined || value.expirationTime === null || typeof value.expirationTime === "number")
}

function validControlBootstrap(value: unknown): value is ControlBootstrap {
  if (!isRecord(value)) return false
  return value.schema === 1 &&
    validControlIdentity(value.workerIdentity) &&
    validControlIdentity(value.deviceId) &&
    value.browserEntityId === hamiltonianBrowserNodeId(value.deviceId) &&
    typeof value.token === "string" && value.token.length > 0 && value.token.length <= 512 &&
    validControlIdentity(value.controlResumeNonce) &&
    typeof value.serverEntityId === "string" && value.serverEntityId.startsWith("server:") && value.serverEntityId.length <= 512 &&
    typeof value.pushReady === "boolean" &&
    typeof value.savedAt === "number" && Number.isFinite(value.savedAt)
}

function validControlIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value)
}

function workerEmbodimentAttributes(): Record<string, string> {
  return {
    identity: workerIdentity,
    runtimeIncarnation: workerRuntimeIncarnation,
    codeVersion: workerCodeVersion,
  }
}
