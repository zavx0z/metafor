import {GenerationRegistry, ReconnectPolicy} from "/core/runtime.js"
import {responseMatchesHash, sha256Hex, selectRetainedCaches} from "/core/cache.js"
import {
  ExclusiveResourceSlot,
  isCurrentLeaderPeerControl,
  isCurrentWindowChannel,
} from "/core/browser-control.js"
import {
  createOrchestrationEnvelope,
  createOrchestrationProjection,
  HAMILTONIAN_ORCHESTRATION_CHANNEL,
} from "/core/orchestration.js"

const windows = new GenerationRegistry()
const MAX_SOCKET_BUFFER = 256_000
const WINDOW_TIMEOUT_MS = 7_000
const MAX_VERSION_CACHES = 2
const workerIncarnationId = crypto.randomUUID()
const socketSlot = new ExclusiveResourceSlot()
const orchestrationChannel = typeof BroadcastChannel === "function"
  ? new BroadcastChannel(HAMILTONIAN_ORCHESTRATION_CHANNEL)
  : null
let orchestrationRevision = 0
let reconnectTimer = null
const reconnectPolicy = new ReconnectPolicy()
let currentDeviceId = null
let currentToken = null
let currentHost = null
let currentTopology = null
let currentVersionState = null
let currentConnectionId = null
let currentResumeNonce = null

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  await self.clients.claim()
  const clients = await self.clients.matchAll({type: "window", includeUncontrolled: false})
  for (const client of clients) client.postMessage({kind: "reattach-window"})
})()))

function tellWindow(window, message) {
  try {
    window.port.postMessage(message)
  } catch {
    windows.deleteIfCurrent(window.tabId, window)
  }
}

function tellAll(message) {
  for (const window of windows.values()) tellWindow(window, message)
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

function publishOrchestration(reason) {
  if (!orchestrationChannel) return
  orchestrationRevision += 1
  orchestrationChannel.postMessage(createOrchestrationEnvelope({
    sourceId: workerIncarnationId,
    revision: orchestrationRevision,
    projection: createOrchestrationProjection(workerState(), currentHost, currentTopology, reason),
  }))
}

function sendSocket(message) {
  const socket = socketSlot.current
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  if (socket.bufferedAmount > MAX_SOCKET_BUFFER) {
    socket.close(1013, "control channel backpressure")
    return false
  }
  socket.send(JSON.stringify(message))
  return true
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
    window.port.close()
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
  if (!currentToken || !currentDeviceId || !currentResumeNonce || windows.size === 0) return
  if (reconnectTimer) return
  if (socketSlot.current) return

  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const url = new URL(`${protocol}//${location.host}/control`)
  url.searchParams.set("token", currentToken)
  url.searchParams.set("device", currentDeviceId)
  const openedSocket = new WebSocket(url)
  if (!socketSlot.attach(openedSocket)) {
    openedSocket.close(1000, "another control socket is current")
    return
  }
  tellAll(workerState())

  openedSocket.addEventListener("open", () => {
    if (!socketSlot.isCurrent(openedSocket)) return
    reconnectPolicy.reset()
    sendSocket({kind: "identity", workerIncarnationId, resumeNonce: currentResumeNonce})
    emit("Service Worker control socket connected")
    tellAll(workerState())
    publishOrchestration("control-open")
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
    if (message.kind === "ping") {
      sendSocket({kind: "pong", at: message.at, seq: message.seq, workerIncarnationId})
      return
    }
    if (message.kind === "hello") {
      currentConnectionId = message.connectionId ?? null
      currentHost = message.host
      tellAll(workerState())
      publishOrchestration("host-hello")
      void prepareVersion(message.host.version)
      return
    }
    if (message.kind === "topology") {
      currentHost = message.host
      currentTopology = message.topology
      tellAll(message)
      publishOrchestration("topology")
      return
    }
    if (message.kind === "peer-signal") {
      const window = windows.get(message.tabId)
      if (window) tellWindow(window, message)
    }
  })
  openedSocket.addEventListener("close", (event) => {
    if (!socketSlot.clearIfCurrent(openedSocket)) return
    emit(`control socket closed (${event.code || "network"}); reconnect scheduled`)
    currentConnectionId = null
    tellAll(workerState())
    publishOrchestration("control-close")
    scheduleReconnect()
  })
  openedSocket.addEventListener("error", () => {
    if (socketSlot.isCurrent(openedSocket)) emit("control socket error", "error")
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
  if (currentDeviceId && currentDeviceId !== message.deviceId) {
    socketSlot.current?.close(4001, "device identity changed")
    for (const window of windows.values()) window.port.close()
    windows.clear()
  }
  if (currentToken && currentToken !== message.token) socketSlot.current?.close(4001, "token changed")
  if (currentResumeNonce && currentResumeNonce !== message.controlResumeNonce) {
    socketSlot.current?.close(4001, "resume capability changed")
  }
  currentDeviceId = message.deviceId
  currentToken = message.token
  currentResumeNonce = message.controlResumeNonce

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
  previous?.port.close()
  const window = {
    tabId: message.tabId,
    joinedAt: message.joinedAt,
    visible: message.visible,
    lastSeenAt: Date.now(),
    clientId,
    pageIncarnation: message.pageIncarnation,
    port,
  }
  windows.set(message.tabId, window)
  port.onmessage = (event) => {
    if (!isCurrentWindowChannel(windows, window)) return
    const pageMessage = event.data
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
      port.close()
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
  tellWindow(window, workerState())
  if (currentTopology) tellWindow(window, {kind: "topology", host: currentHost, topology: currentTopology})
  if (currentVersionState) tellWindow(window, currentVersionState)
  publishOrchestration("window-attached")
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
