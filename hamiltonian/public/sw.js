import {
  HamiltonianLifecycleRetainedJournal,
  createHamiltonianLifecycleObservation,
  emitHamiltonianLifecycle,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
  hamiltonianLifecycleTransportId,
  publishHamiltonianLifecycleEnvelope,
  publishHamiltonianLifecycleSnapshot,
  subscribeHamiltonianLifecycle,
} from "/core/lifecycle.js"
import {hamiltonianRealmSnapshot} from "/core/monitor.js"
import {hamiltonianBrowserNodeId} from "/core/orchestration.js"
import {GenerationRegistry, ReconnectPolicy} from "/core/runtime.js"
import {responseMatchesHash, sha256Hex, selectRetainedCaches} from "/core/cache.js"
import {
  ExclusiveResourceSlot,
  isCurrentLeaderPeerControl,
  isCurrentWindowChannel,
} from "/core/browser-control.js"

const windows = new GenerationRegistry()
const MAX_SOCKET_BUFFER = 256_000
const WINDOW_TIMEOUT_MS = 7_000
const MAX_VERSION_CACHES = 2
const workerIncarnationId = hamiltonianRealmSnapshot().incarnation
const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIncarnationId)
const workerLifecycleJournal = new HamiltonianLifecycleRetainedJournal(workerEntityId)
const socketSlot = new ExclusiveResourceSlot()
const socketLifecycle = new WeakMap()
const pendingHostRetirements = new Map()
let reconnectTimer = null
const reconnectPolicy = new ReconnectPolicy()
let currentDeviceId = null
let currentBrowserEntityId = null
let currentToken = null
let currentHost = null
let currentTopology = null
let currentVersionState = null
let currentConnectionId = null
let currentResumeNonce = null
let currentServerEntityId = null
let currentHostLifecycleJournal = null
subscribeHamiltonianLifecycle((envelope) => {
  if (envelope.sourceId === workerEntityId && envelope.sourceIncarnation === workerIncarnationId) {
    workerLifecycleJournal.observe(envelope)
  }
  if (!isObservedSupersededServiceWorkerEnd(envelope)) return
  pendingHostRetirements.set(envelope.observation.subjectId, envelope)
  flushHostRetirements()
})

emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
  type: "entity",
  phase: "born",
  subjectId: workerEntityId,
  subjectKind: "service-worker",
  ownerId: workerEntityId,
  attributes: {incarnation: workerIncarnationId, state: "evaluating"},
}))

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  await self.clients.claim()
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: workerEntityId,
    attributes: {incarnation: workerIncarnationId, state: "active"},
  }))
  const clients = await self.clients.matchAll({type: "window", includeUncontrolled: false})
  for (const client of clients) client.postMessage({kind: "reattach-window"})
})()))

function tellWindow(window, message) {
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

function tellAll(message) {
  for (const window of windows.values()) tellWindow(window, message)
}

function tellAllLifecycleSnapshot(snapshot) {
  for (const window of windows.values()) {
    try {
      window.port.postMessage({kind: "lifecycle-snapshot", snapshot})
    } catch {
      windows.deleteIfCurrent(window.tabId, window)
    }
  }
}

function emit(message, level = "info") {
  tellAll({kind: "event", message, level})
}

function workerState() {
  const socket = socketSlot.current
  return {
    kind: "worker-state",
    control: "MessageChannel active",
    socket: socket?.readyState === WebSocket.OPEN ? "connected" : "reconnecting",
    workerIncarnationId,
    connectionId: currentConnectionId,
    host: currentHost,
  }
}

function sendSocket(message) {
  const socket = socketSlot.current
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  if (socket.bufferedAmount > MAX_SOCKET_BUFFER) {
    socket.close(1013, "control channel backpressure")
    return false
  }
  const lifecycle = socketLifecycle.get(socket)
  const serverEntityId = lifecycle?.serverEntityId ?? null
  const messageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
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

function flushHostRetirements() {
  for (const envelope of pendingHostRetirements.values()) {
    sendSocket({kind: "lifecycle-retirement", envelope})
  }
}

function isObservedSupersededServiceWorkerEnd(envelope) {
  const observation = envelope?.observation
  return envelope?.sourceKind === "page" &&
    envelope?.sourceId === hamiltonianLifecycleEntityId("page", envelope?.sourceIncarnation) &&
    observation?.type === "entity" &&
    observation?.phase === "ended" &&
    observation?.subjectKind === "service-worker" &&
    observation?.subjectId !== workerEntityId &&
    observation?.ownerId === observation?.subjectId &&
    observation?.attributes?.state === "ended" &&
    observation?.attributes?.successor === workerEntityId
}

async function sweepWindows() {
  const liveClients = new Set(
    (await self.clients.matchAll({type: "window", includeUncontrolled: false}))
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

async function sendWindowSnapshot() {
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

function reconnectDelay() {
  return reconnectPolicy.nextDelay()
}

function scheduleReconnect() {
  if (reconnectTimer || windows.size === 0 || !currentToken || !currentDeviceId) return
  const delay = reconnectDelay()
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    ensureSocket()
  }, delay)
  tellAll(workerState())
}

function ensureSocket() {
  if (!currentToken || !currentDeviceId || !currentResumeNonce || !currentServerEntityId || windows.size === 0) return
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
    sendSocket({kind: "identity", workerIncarnationId, resumeNonce: currentResumeNonce})
    flushHostRetirements()
    emit("Service Worker control socket connected")
    tellAll(workerState())
    void sendWindowSnapshot()
  })
  openedSocket.addEventListener("message", (event) => {
    if (!socketSlot.isCurrent(openedSocket)) return
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      openedSocket.close(1008, "invalid host message")
      return
    }
    const lifecycle = socketLifecycle.get(openedSocket)
    if (!lifecycle) return
    const serverEntityId = lifecycle.serverEntityId
    if (message.kind === "lifecycle-snapshot") {
      const snapshot = message.snapshot
      if (!serverEntityId || snapshot?.scopeId !== serverEntityId) {
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
      const retiredSubjectId = message.envelope?.observation?.subjectId
      const pendingRetirement = pendingHostRetirements.get(retiredSubjectId)
      if (pendingRetirement?.eventId === message.envelope?.eventId) {
        pendingHostRetirements.delete(retiredSubjectId)
      }
      if (!publishHamiltonianLifecycleEnvelope(message.envelope)) {
        openedSocket.close(1008, "invalid host lifecycle envelope")
        return
      }
      currentHostLifecycleJournal?.observe(message.envelope)
      return
    }
    if (message.kind === "hello") {
      const nextServerEntityId = typeof message.host?.hostEpoch === "string" && message.host.hostEpoch
        ? hamiltonianLifecycleEntityId("server", message.host.hostEpoch)
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
    if (message.kind === "ping") {
      sendSocket({kind: "pong", at: message.at, seq: message.seq, workerIncarnationId})
      return
    }
    if (message.kind === "hello") {
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
      currentHost = message.host
      currentTopology = message.topology
      tellAll(message)
      return
    }
    if (message.kind === "source-update") {
      tellAll(message)
      return
    }
    if (message.kind === "peer-signal") {
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

async function prepareVersion(expectedVersion) {
  try {
    const headers = {authorization: `Bearer ${currentToken}`}
    const manifestResponse = await fetch("/manifest.json", {headers, cache: "no-store"})
    if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}`)
    const manifest = await manifestResponse.json()
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
    emit(`version preparation failed: ${error.message}`, "error")
  }
}

async function retainVersionCaches(currentCacheName) {
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

async function connectWindow(message, port, clientId) {
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
    !connectMessageId
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

  const previous = windows.get(message.tabId)
  const previousClient = previous?.clientId ? await self.clients.get(previous.clientId) : null
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
  const window = {
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
    const pageMessage = event.data
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
  const workerLifecycleSnapshot = workerLifecycleJournal.snapshot()
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
    attributes: {incarnation: workerIncarnationId, state: "active"},
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

self.addEventListener("message", (event) => {
  const message = event.data
  const port = event.ports[0]
  if (message?.kind !== "connect-window" || !port) return
  event.waitUntil(connectWindow(message, port, event.source?.id ?? null))
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== location.origin || !url.pathname.startsWith("/versions/")) return
  event.respondWith((async () => {
    const cached = await caches.match(event.request)
    return cached ?? new Response("Version is not prepared by Hamiltonian", {status: 503})
  })())
})

function closeWindowPort(window, reason, closeController = true) {
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

function lifecycleMessageId(message) {
  return typeof message?.monitor?.messageId === "string" && message.monitor.messageId
    ? message.monitor.messageId
    : null
}

function lifecycleMonitorTransportId(message) {
  return typeof message?.monitor?.transportId === "string" && message.monitor.transportId
    ? message.monitor.transportId
    : null
}

function lifecycleMessageClass(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value) ? value : "unknown"
}

function lifecycleIdentifier(value, prefix) {
  return typeof value === "string" && value.startsWith(prefix) && value.length <= 512 ? value : null
}
