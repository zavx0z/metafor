// The attached Service Worker joins its observed browser-runtime owner.
import "../core/monitor.js"
import {
  HamiltonianLifecycleRetainedJournal,
  createHamiltonianLifecycleObservation,
  emitHamiltonianLifecycle,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
  hamiltonianLifecycleTransportId,
  isHamiltonianLifecycleEnvelope,
  isHamiltonianLifecycleSnapshot,
  publishHamiltonianLifecycleEnvelope,
  publishHamiltonianLifecycleSnapshot,
  subscribeHamiltonianLifecycle,
  type HamiltonianLifecycleEnvelope,
  type HamiltonianLifecycleSnapshot,
} from "../core/lifecycle.js"
import {hamiltonianRealmSnapshot} from "../core/monitor.js"
import {hamiltonianBrowserNodeId} from "../core/orchestration.js"
import {GenerationRegistry, ReconnectPolicy} from "../core/runtime.js"
import {responseMatchesHash, sha256Hex, selectRetainedCaches} from "../core/cache.js"
import {
  ExclusiveResourceSlot,
  isCurrentLeaderPeerControl,
  isCurrentWindowChannel,
} from "../core/browser-control.js"
import type {TopologySnapshot} from "../host-state.ts"

type LifecycleJournal = InstanceType<typeof HamiltonianLifecycleRetainedJournal>
type MessageRecord = {kind: string; monitor?: LifecycleMonitor; [key: string]: unknown}

interface LifecycleMonitor {
  messageId: string
  transportId?: string
}

interface HamiltonianWorkerClient {
  readonly id: string
  postMessage(message: unknown): void
}

interface HamiltonianWorkerClients {
  claim(): Promise<void>
  get(id: string): Promise<HamiltonianWorkerClient | undefined>
  matchAll(options: {type: "window"; includeUncontrolled: boolean}): Promise<HamiltonianWorkerClient[]>
}

interface HamiltonianExtendableEvent {
  waitUntil(promise: Promise<unknown>): void
}

interface HamiltonianExtendableMessageEvent extends HamiltonianExtendableEvent {
  readonly data: unknown
  readonly ports: readonly MessagePort[]
  readonly source: {readonly id?: unknown} | null
}

interface HamiltonianPushEvent extends HamiltonianExtendableEvent {
  readonly data: {json(): unknown} | null
}

interface HamiltonianWorkerRegistration {
  showNotification(title: string, options?: NotificationOptions): Promise<void>
}

interface HamiltonianWorkerRuntime {
  readonly clients: HamiltonianWorkerClients
  readonly registration: HamiltonianWorkerRegistration
  skipWaiting(): Promise<void>
  addEventListener(type: "install" | "activate", listener: (event: HamiltonianExtendableEvent) => void): void
  addEventListener(type: "message", listener: (event: HamiltonianExtendableMessageEvent) => void): void
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void
  addEventListener(type: "push", listener: (event: HamiltonianPushEvent) => void): void
}

interface HostIdentity {
  identity?: string
  hostEpoch: string
  version: string
}

interface SocketLifecycle {
  socketIncarnation: string
  transportId: string
  serverEntityId: string
}

interface WindowChannel {
  tabId: string
  joinedAt: number
  visible: boolean
  lastSeenAt: number
  clientId: string | null
  pageIncarnation: string
  pageEntityId: string
  controllerTransportId: string
  messagePortTransportId: string
  port: MessagePort
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
  controllerTransportId: string
  deviceId: string
  joinedAt: number
  messagePortTransportId: string
  pageIncarnation: string
  serverEntityId: string
  tabId: string
  token: string
  visible: boolean
  workerIdentity: string
}

interface PageControlMessage extends MessageRecord {
  kind: "window-heartbeat" | "disconnect-window" | "peer-signal" | "peer-failed" | string
  visible?: boolean
  tabId?: string
}

interface HostControlMessage extends MessageRecord {
  connectionId?: string
  envelope?: HamiltonianLifecycleEnvelope
  host?: HostIdentity
  snapshot?: HamiltonianLifecycleSnapshot
  topology?: TopologySnapshot
  at?: number
  seq?: number
  tabId?: string
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
const MAX_VERSION_CACHES = 2
const CONTROL_CACHE = "hamiltonian-control:v1"
const CONTROL_BOOTSTRAP_URL = "/.hamiltonian/control-bootstrap"
const workerRuntimeIncarnation = hamiltonianRealmSnapshot().incarnation
let workerIdentity = ""
let workerEntityId = ""
let workerLifecycleJournal: LifecycleJournal | null = null
const socketSlot = new ExclusiveResourceSlot<WebSocket>()
const socketLifecycle = new WeakMap<WebSocket, SocketLifecycle>()
const pendingHostRetirements = new Map<string, HamiltonianLifecycleEnvelope>()
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const reconnectPolicy = new ReconnectPolicy()
let currentDeviceId: string | null = null
let currentBrowserEntityId: string | null = null
let currentToken: string | null = null
let currentHost: HostIdentity | null = null
let currentTopology: TopologySnapshot | null = null
let currentVersionState: VersionState | null = null
let currentConnectionId: string | null = null
let currentResumeNonce: string | null = null
let currentServerEntityId: string | null = null
let currentHostLifecycleJournal: LifecycleJournal | null = null
let currentPushReady = false
const pendingPushRegistrations = new Map<string, PendingPushRegistration>()
let pendingPushWake: PendingPushWake | null = null
subscribeHamiltonianLifecycle((envelope) => {
  if (workerEntityId && envelope.sourceId === workerEntityId && envelope.sourceIncarnation === workerRuntimeIncarnation) {
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

function initializeWorkerIdentity(identity: string, browserEntityId: string): boolean {
  if (!validControlIdentity(identity)) return false
  if (workerIdentity) return workerIdentity === identity
  workerIdentity = identity
  workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
  workerLifecycleJournal = new HamiltonianLifecycleRetainedJournal(workerEntityId)
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "born",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: browserEntityId,
    attributes: {
      identity: workerIdentity,
      runtimeIncarnation: workerRuntimeIncarnation,
      state: "evaluating",
      push: currentPushReady ? "ready" : "unavailable",
    },
  }))
  return true
}

function applyControlBootstrap(bootstrap: ControlBootstrap): boolean {
  if (!validControlBootstrap(bootstrap)) return false
  currentPushReady = bootstrap.pushReady
  if (!initializeWorkerIdentity(bootstrap.workerIdentity, bootstrap.browserEntityId)) return false
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
      identity: workerIdentity,
      runtimeIncarnation: workerRuntimeIncarnation,
      state,
      push,
      ...attributes,
    },
  }))
}

function tellWindow(window: WindowChannel, message: MessageRecord): void {
  try {
    const messageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "sent",
      subjectId: messageId,
      subjectKind: "message-port-message",
      ownerId: workerEntityId,
      sourceEntityId: workerEntityId,
      targetEntityId: window.pageEntityId,
      transportId: window.messagePortTransportId,
      messageId,
      messageClass: lifecycleMessageClass(message?.kind),
    }))
    window.port.postMessage({...message, monitor: {messageId}})
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
      window.port.postMessage({kind: "lifecycle-snapshot", snapshot})
    } catch {
      windows.deleteIfCurrent(window.tabId, window)
    }
  }
}

function emit(message: string, level: "info" | "error" = "info"): void {
  tellAll({kind: "event", message, level})
}

function workerState(): WorkerState {
  const socket = socketSlot.current
  return {
    kind: "worker-state",
    control: "MessageChannel active",
    socket: socket?.readyState === WebSocket.OPEN ? "connected" : "reconnecting",
    workerIdentity,
    workerRuntimeIncarnation,
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
      identity: workerIdentity,
      runtimeIncarnation: workerRuntimeIncarnation,
      state,
      heartbeat,
      ...attributes,
    },
  }))
}

function sendSocket(message: MessageRecord): boolean {
  const socket = socketSlot.current
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  if (socket.bufferedAmount > MAX_SOCKET_BUFFER) {
    socket.close(1013, "control channel backpressure")
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
  if (!workerIdentity || !currentResumeNonce) return false
  const wake = pendingPushWake
  return sendSocket({
    kind: "identity",
    workerIdentity,
    workerRuntimeIncarnation,
    resumeNonce: currentResumeNonce,
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
  const cutoff = Date.now() - WINDOW_TIMEOUT_MS
  let changed = false
  for (const [tabId, window] of windows) {
    if (window.clientId && liveClients.has(window.clientId)) continue
    if (!window.clientId && window.lastSeenAt >= cutoff) continue
    closeWindowPort(window, "client-missing")
    windows.deleteIfCurrent(tabId, window)
    changed = true
  }
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
  const serverEntityId = currentServerEntityId
  url.searchParams.set("token", currentToken)
  url.searchParams.set("device", currentDeviceId)
  url.searchParams.set("transport", transportId)
  url.searchParams.set("worker", workerEntityId)
  const openedSocket = new WebSocket(url)
  socketLifecycle.set(openedSocket, {socketIncarnation, transportId, serverEntityId})
  if (!socketSlot.attach(openedSocket)) {
    openedSocket.close(1000, "another control socket is current")
    return
  }
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "opening",
    subjectId: transportId,
    subjectKind: "websocket",
    ownerId: workerEntityId,
    sourceEntityId: workerEntityId,
    targetEntityId: serverEntityId,
    transportId,
    attributes: {socketIncarnation, protocol: protocol === "wss:" ? "wss" : "ws"},
  }))
  tellAll(workerState())

  openedSocket.addEventListener("open", () => {
    if (!socketSlot.isCurrent(openedSocket)) return
    reconnectPolicy.reset()
    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: transportId,
      subjectKind: "websocket",
      ownerId: workerEntityId,
      sourceEntityId: workerEntityId,
      targetEntityId: serverEntityId,
      transportId,
      attributes: {socketIncarnation, protocol: protocol === "wss:" ? "wss" : "ws"},
    }))
    sendWorkerIdentity()
    flushPushRegistrations()
    flushHostRetirements()
    observeWorkerHeartbeat("active", "awaiting")
    emit("Service Worker control socket connected")
    tellAll(workerState())
    void sendWindowSnapshot()
  })
  openedSocket.addEventListener("message", (event) => {
    if (!socketSlot.isCurrent(openedSocket)) return
    let message: HostControlMessage
    try {
      message = JSON.parse(String(event.data)) as HostControlMessage
    } catch {
      openedSocket.close(1008, "invalid host message")
      return
    }
    const lifecycle = socketLifecycle.get(openedSocket)
    if (!lifecycle) return
    const serverEntityId = lifecycle.serverEntityId
    if (message.kind === "lifecycle-snapshot") {
      const snapshot = message.snapshot
      if (!serverEntityId || !isHamiltonianLifecycleSnapshot(snapshot) || snapshot.scopeId !== serverEntityId) {
        openedSocket.close(1008, "host lifecycle snapshot scope mismatch")
        return
      }
      const journal = currentHostLifecycleJournal ?? new HamiltonianLifecycleRetainedJournal(serverEntityId)
      if (!journal.replace(snapshot) || !publishHamiltonianLifecycleSnapshot(snapshot)) {
        openedSocket.close(1008, "invalid host lifecycle snapshot")
        return
      }
      currentHostLifecycleJournal = journal
      tellAllLifecycleSnapshot(snapshot)
      return
    }
    if (message.kind === "lifecycle") {
      const envelope = message.envelope
      if (!isHamiltonianLifecycleEnvelope(envelope)) {
        openedSocket.close(1008, "invalid host lifecycle envelope")
        return
      }
      const retiredSubjectId = envelope.observation.subjectId
      const pendingRetirement = pendingHostRetirements.get(retiredSubjectId)
      if (pendingRetirement?.eventId === envelope.eventId) {
        pendingHostRetirements.delete(retiredSubjectId)
      }
      if (!publishHamiltonianLifecycleEnvelope(envelope)) {
        openedSocket.close(1008, "invalid host lifecycle envelope")
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
        openedSocket.close(1008, "hello lacks server incarnation")
        return
      }
      if (lifecycle.serverEntityId && lifecycle.serverEntityId !== nextServerEntityId) {
        openedSocket.close(1008, "server incarnation changed on one socket")
        return
      }
    }
    const messageId = lifecycleMessageId(message)
    const messageTransportId = lifecycleMonitorTransportId(message)
    if (messageId && messageTransportId !== transportId) {
      openedSocket.close(1008, "host message transport identity mismatch")
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
        openedSocket.close(1008, error.message)
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
        openedSocket.close(1008, "invalid PushSubscription confirmation")
        return
      }
      const pending = pendingPushRegistrations.get(registrationId)
      if (!pending) return
      pendingPushRegistrations.delete(registrationId)
      currentPushReady = true
      void persistControlBootstrap()
      observeWorkerAvailability("active", "ready")
      const window = windows.get(pending.tabId)
      if (window) tellWindow(window, {kind: "push-subscription-confirmed", registrationId})
      tellAll(workerState())
      return
    }
    if (message.kind === "push-subscription-rejected") {
      const registrationId = message.registrationId
      if (!validControlIdentity(registrationId)) {
        openedSocket.close(1008, "invalid PushSubscription rejection")
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
        openedSocket.close(1008, "invalid host identity")
        return
      }
      currentConnectionId = message.connectionId ?? null
      currentHost = message.host
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
          connectionId: currentConnectionId ?? "unknown",
        },
      }))
      tellAll(workerState())
      void prepareVersion(message.host.version)
      return
    }
    if (message.kind === "topology") {
      if (!isHostIdentity(message.host) || !message.topology) {
        openedSocket.close(1008, "invalid topology message")
        return
      }
      currentHost = message.host
      currentTopology = message.topology
      tellAll(message)
      return
    }
    if (message.kind === "source-update") {
      tellAll(message)
      return
    }
    if (message.kind === "peer-signal" && typeof message.tabId === "string") {
      const window = windows.get(message.tabId)
      if (window) tellWindow(window, message)
    }
  })
  openedSocket.addEventListener("close", (event) => {
    if (!socketSlot.clearIfCurrent(openedSocket)) return
    const lifecycle = socketLifecycle.get(openedSocket)
    const serverEntityId = lifecycle?.serverEntityId ?? null
    if (serverEntityId) {
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
      if (serverEntityId) {
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

async function connectWindow(message: ConnectWindowMessage, port: MessagePort, clientId: string | null): Promise<void> {
  const pageEntityId = hamiltonianLifecycleEntityId("page", message.pageIncarnation)
  const nextBrowserEntityId = lifecycleIdentifier(message.browserEntityId, "browser:")
  const nextServerEntityId = lifecycleIdentifier(message.serverEntityId, "server:")
  const nextControllerTransportId = lifecycleIdentifier(message.controllerTransportId, "controller:")
  const nextMessagePortTransportId = lifecycleIdentifier(message.messagePortTransportId, "message-port:")
  const connectMessageId = lifecycleMessageId(message)
  if (
    !nextBrowserEntityId ||
    nextBrowserEntityId !== hamiltonianBrowserNodeId(message.deviceId) ||
    !nextServerEntityId ||
    !nextControllerTransportId ||
    !nextMessagePortTransportId ||
    !connectMessageId ||
    !initializeWorkerIdentity(message.workerIdentity, nextBrowserEntityId)
  ) {
    port.close()
    return
  }
  const controlIdentityChanged =
    (currentDeviceId !== null && currentDeviceId !== message.deviceId) ||
    (currentBrowserEntityId !== null && currentBrowserEntityId !== nextBrowserEntityId) ||
    (currentToken !== null && currentToken !== message.token) ||
    (currentResumeNonce !== null && currentResumeNonce !== message.controlResumeNonce) ||
    (currentServerEntityId !== null && currentServerEntityId !== nextServerEntityId)
  if (controlIdentityChanged) {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    reconnectPolicy.reset()
  }
  if (currentDeviceId && currentDeviceId !== message.deviceId) {
    socketSlot.current?.close(4001, "device identity changed")
    for (const window of windows.values()) closeWindowPort(window, "device-identity-changed")
    windows.clear()
  }
  if (currentToken && currentToken !== message.token) socketSlot.current?.close(4001, "token changed")
  if (currentResumeNonce && currentResumeNonce !== message.controlResumeNonce) {
    socketSlot.current?.close(4001, "resume capability changed")
  }
  if (currentServerEntityId && currentServerEntityId !== nextServerEntityId) {
    socketSlot.current?.close(4001, "server incarnation changed")
  }
  currentDeviceId = message.deviceId
  currentBrowserEntityId = nextBrowserEntityId
  currentToken = message.token
  currentResumeNonce = message.controlResumeNonce
  if (currentServerEntityId !== nextServerEntityId) {
    currentHostLifecycleJournal = new HamiltonianLifecycleRetainedJournal(nextServerEntityId)
  }
  currentServerEntityId = nextServerEntityId
  await persistControlBootstrap()

  const previous = windows.get(message.tabId)
  const previousClient = previous?.clientId ? await serviceWorkerRuntime.clients.get(previous.clientId) : null
  if (
    previous &&
    previous.clientId !== clientId &&
    previousClient
  ) {
    port.postMessage({kind: "window-id-collision", replacementTabId: crypto.randomUUID()})
    port.close()
    return
  }
  if (previous) {
    closeWindowPort(
      previous,
      "replaced",
      previous.controllerTransportId !== nextControllerTransportId,
    )
  }
  const window: WindowChannel = {
    tabId: message.tabId,
    joinedAt: message.joinedAt,
    visible: message.visible,
    lastSeenAt: Date.now(),
    clientId,
    pageIncarnation: message.pageIncarnation,
    pageEntityId,
    controllerTransportId: nextControllerTransportId,
    messagePortTransportId: nextMessagePortTransportId,
    port,
  }
  windows.set(message.tabId, window)
  port.onmessage = (event) => {
    if (!isCurrentWindowChannel(windows, window)) return
    const pageMessage = isMessageRecord(event.data) ? event.data as PageControlMessage : null
    const pageMessageId = lifecycleMessageId(pageMessage)
    if (pageMessageId) {
      emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
        type: "message",
        phase: "received",
        subjectId: pageMessageId,
        subjectKind: "message-port-message",
        ownerId: workerEntityId,
        sourceEntityId: window.pageEntityId,
        targetEntityId: workerEntityId,
        transportId: window.messagePortTransportId,
        messageId: pageMessageId,
        messageClass: lifecycleMessageClass(pageMessage?.kind),
      }))
    }
    if (pageMessage?.kind === "register-push-subscription") {
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
    if (pageMessage?.kind === "window-heartbeat") {
      window.lastSeenAt = Date.now()
      window.visible = pageMessage.visible === true
      tellWindow(window, workerState())
      void (async () => {
        if (await sweepWindows()) await sendWindowSnapshot()
      })()
      ensureSocket()
      return
    }
    if (pageMessage?.kind === "disconnect-window") {
      windows.deleteIfCurrent(window.tabId, window)
      closeWindowPort(window, "window-disconnected")
      void sendWindowSnapshot()
      return
    }
    if (pageMessage?.kind === "peer-signal" || pageMessage?.kind === "peer-failed") {
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
  port.start()
  const workerLifecycleSnapshot = workerLifecycleJournal?.snapshot()
  if (!workerLifecycleSnapshot) {
    port.close()
    return
  }
  publishHamiltonianLifecycleSnapshot(workerLifecycleSnapshot)
  port.postMessage({kind: "lifecycle-snapshot", snapshot: workerLifecycleSnapshot})
  if (currentHostLifecycleJournal) {
    const hostLifecycleSnapshot = currentHostLifecycleJournal.snapshot()
    publishHamiltonianLifecycleSnapshot(hostLifecycleSnapshot)
    port.postMessage({kind: "lifecycle-snapshot", snapshot: hostLifecycleSnapshot})
  }
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: nextBrowserEntityId,
    attributes: {
      identity: workerIdentity,
      runtimeIncarnation: workerRuntimeIncarnation,
      state: "active",
      push: currentPushReady ? "ready" : "unavailable",
    },
  }), {causedBy: connectMessageId})
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "opened",
    subjectId: nextControllerTransportId,
    subjectKind: "controller",
    ownerId: workerEntityId,
    sourceEntityId: pageEntityId,
    targetEntityId: workerEntityId,
    transportId: nextControllerTransportId,
    attributes: {state: "controlled"},
  }), {causedBy: connectMessageId})
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase: "received",
    subjectId: connectMessageId,
    subjectKind: "controller-message",
    ownerId: workerEntityId,
    sourceEntityId: pageEntityId,
    targetEntityId: workerEntityId,
    transportId: nextControllerTransportId,
    messageId: connectMessageId,
    messageClass: "connect-window",
  }))
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "opened",
    subjectId: nextMessagePortTransportId,
    subjectKind: "message-port",
    ownerId: workerEntityId,
    sourceEntityId: workerEntityId,
    targetEntityId: pageEntityId,
    transportId: nextMessagePortTransportId,
    attributes: {state: "started"},
  }), {causedBy: connectMessageId})
  tellWindow(window, workerState())
  if (currentTopology) tellWindow(window, {kind: "topology", host: currentHost, topology: currentTopology})
  if (currentVersionState) tellWindow(window, currentVersionState)
  ensureSocket()
  void sendWindowSnapshot()
}

serviceWorkerRuntime.addEventListener("message", (event) => {
  const message = event.data
  const port = event.ports[0]
  if (!isConnectWindowMessage(message) || !port) return
  const clientId = event.source && "id" in event.source && typeof event.source.id === "string"
    ? event.source.id
    : null
  event.waitUntil(connectWindow(message, port, clientId))
})

serviceWorkerRuntime.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event))
})

async function handlePush(event: HamiltonianPushEvent): Promise<void> {
  const payload = parseWakePayload(event.data)
  if (!payload || !await restoreControlBootstrap()) {
    await serviceWorkerRuntime.registration.showNotification("Hamiltonian", {
      body: "Service Worker получил некорректный запрос пробуждения",
      tag: "hamiltonian-service-worker",
    })
    return
  }
  const confirmation = beginPushWake(payload)
  try {
    await applyPushWakePayload(payload)
    observeWorkerAvailability("waking", "received", {wakeId: payload.wakeId})
    ensureSocket()
    await withTimeout(confirmation, 30_000, "server did not confirm the Web Push wake")
    await serviceWorkerRuntime.registration.showNotification("Hamiltonian", {
      body: "Service Worker восстановил связь с сервером",
      tag: "hamiltonian-service-worker",
      data: {wakeId: payload.wakeId},
    })
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

function parseWakePayload(data: HamiltonianPushEvent["data"]): PushWakePayload | null {
  if (!data) return null
  try {
    const value = data.json()
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

function closeWindowPort(window: WindowChannel, reason: string, closeController = true): void {
  if (closeController) {
    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "closed",
      subjectId: window.controllerTransportId,
      subjectKind: "controller",
      ownerId: workerEntityId,
      sourceEntityId: window.pageEntityId,
      targetEntityId: workerEntityId,
      transportId: window.controllerTransportId,
      attributes: {reason},
    }))
  }
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "closed",
    subjectId: window.messagePortTransportId,
    subjectKind: "message-port",
    ownerId: workerEntityId,
    sourceEntityId: workerEntityId,
    targetEntityId: window.pageEntityId,
    transportId: window.messagePortTransportId,
    attributes: {reason},
  }))
  window.port.close()
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

function isConnectWindowMessage(value: unknown): value is ConnectWindowMessage {
  if (!isMessageRecord(value) || value.kind !== "connect-window") return false
  return typeof value.browserEntityId === "string" &&
    typeof value.controlResumeNonce === "string" &&
    typeof value.controllerTransportId === "string" &&
    typeof value.deviceId === "string" &&
    typeof value.joinedAt === "number" &&
    typeof value.messagePortTransportId === "string" &&
    typeof value.pageIncarnation === "string" &&
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
