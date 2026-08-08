import {
  HAMILTONIAN_FORCE_EDGE_ID,
  HAMILTONIAN_ORACLE_EDGE_ID,
  emitHamiltonianTraffic,
  hamiltonianMessagePortEdgeId,
} from "/core/traffic.js"
import {authorityKey, LogicalChannelSession, PeerProtocol} from "/core/runtime.js"
import {
  disposeFailedWorker,
  isCurrentPeerGeneration,
  mainRealmRequiresReload,
} from "/core/browser-control.js"
import {parseLocalHamiltonianWindowAction} from "/core/orchestration.js"

const elements = Object.fromEntries([
  "secure", "control", "socket", "role", "host", "version", "device",
  "tab", "module", "source-hash", "main-embodiment", "worker-embodiment",
  "singleton-authority", "bun-embodiment", "caches", "topology", "events",
  "peer-carrier", "oracle-proof", "force-proof",
].map((id) => [id, document.getElementById(id)]))

const firstLoadHadController = navigator.serviceWorker?.controller !== null
const pageIncarnation = crypto.randomUUID()
const tabId = sessionStorage.getItem("hamiltonian-window-id") ?? crypto.randomUUID()
sessionStorage.setItem("hamiltonian-window-id", tabId)
const joinedAt = Number(sessionStorage.getItem("hamiltonian-window-joined-at") ?? Date.now())
sessionStorage.setItem("hamiltonian-window-joined-at", String(joinedAt))
let deviceId = localStorage.getItem("hamiltonian-device")
if (!deviceId) {
  deviceId = crypto.randomUUID()
  localStorage.setItem("hamiltonian-device", deviceId)
}
let controlResumeNonce = localStorage.getItem("hamiltonian-control-resume")
if (!controlResumeNonce) {
  controlResumeNonce = crypto.randomUUID()
  localStorage.setItem("hamiltonian-control-resume", controlResumeNonce)
}

const pageUrl = new URL(location.href)
const suppliedToken = pageUrl.searchParams.get("token")
if (suppliedToken) {
  localStorage.setItem("hamiltonian-token", suppliedToken)
  pageUrl.searchParams.delete("token")
  history.replaceState(null, "", pageUrl)
}
const token = suppliedToken ?? localStorage.getItem("hamiltonian-token")

let port = null
let attachedController = null
let lastWorkerMessageAt = 0
let reconnecting = false
let topology = null
let loadedVersion = null
let mainEmbodiment = null
let dedicatedEmbodiment = null
let versionQueue = Promise.resolve()
let isMainLeader = false
let mainAuthorityKey = null
let leaseExpiresAt = 0
let browserPeer = null
let pendingPeerRepair = null
let hostPlacement = "browser"
let controlConnectionId = null
const acceptedPeerGeneration = new Map()

elements.secure.textContent = isSecureContext ? "yes" : "no"
elements.secure.className = isSecureContext ? "leader" : "error"
elements.control.textContent = firstLoadHadController ? "pre-existing" : "first install"
elements.device.textContent = deviceId
elements.tab.textContent = tabId

function log(message, isError = false) {
  const item = document.createElement("li")
  item.textContent = `${new Date().toLocaleTimeString()} · ${message}`
  if (isError) item.className = "error"
  elements.events.prepend(item)
  while (elements.events.children.length > 80) elements.events.lastElementChild?.remove()
}

function send(message) {
  try {
    if (!port) return false
    port.postMessage(message)
    if (controlConnectionId && message?.kind !== "edge-traffic") {
      emitHamiltonianTraffic({
        edgeId: hamiltonianMessagePortEdgeId(controlConnectionId, tabId),
        direction: "reverse",
        messageClass: message?.kind,
      })
    }
    return true
  } catch (error) {
    log(`page channel send failed: ${error.message}`, true)
    return false
  }
}

function renderHost(nextHost) {
  if (!nextHost) return
  hostPlacement = nextHost.placement ?? "browser"
  elements.host.textContent = nextHost.identity
  elements.version.textContent = nextHost.version
  const buns = nextHost.bunEmbodiments
  const bun = nextHost.bunEmbodiment
  elements["bun-embodiment"].textContent = buns
    ? Object.entries(buns).map(([role, snapshot]) =>
      `${role}: ${snapshot.state} · pid ${snapshot.pid ?? "—"} · ${snapshot.incarnation ?? "—"}`
    ).join(" | ")
    : bun
      ? `${bun.state} · ${bun.version ?? "—"} · pid ${bun.pid ?? "—"} · ${bun.incarnation ?? "—"}`
    : "not reported"
}

function renderTopology(nextTopology) {
  topology = nextTopology
  const leader = nextTopology?.leader
  isMainLeader = hostPlacement === "browser" &&
    leader?.deviceId === deviceId &&
    leader?.tabId === tabId
  leaseExpiresAt = isMainLeader ? Number(leader.leaseExpiresAt ?? 0) : 0
  elements.role.textContent = isMainLeader
    ? "elected embodiment"
    : hostPlacement === "server"
      ? "observer · server placement"
      : "candidate"
  elements.role.className = isMainLeader ? "leader" : ""
  elements["singleton-authority"].textContent = isMainLeader
    ? `fence ${leader.fencingToken} · ${leader.leaseId}`
    : "none"
  elements.topology.textContent = JSON.stringify(nextTopology, null, 2)
  if (pendingPeerRepair) {
    if (
      isMainLeader &&
      pendingPeerRepair.authorityKey === authorityKey(leader) &&
      Date.now() < leaseExpiresAt
    ) send(pendingPeerRepair)
    else pendingPeerRepair = null
  }
  versionQueue = versionQueue
    .then(() => reconcileMain())
    .catch((error) => log(`main singleton reconciliation failed: ${error.message}`, true))
}

function publishInitialSceneEnvelope(envelope) {
  window.__hamiltonianOrchestrationInitial = envelope
  window.dispatchEvent(new CustomEvent("hamiltonian-orchestration-initial", {detail: envelope}))
}

function describeSnapshot(snapshot) {
  return `${snapshot.version} · ${snapshot.state} · ${snapshot.incarnation}`
}

function closeBrowserPeer(reason) {
  const previous = browserPeer
  if (!previous) return
  browserPeer = null
  if (previous.probeTimer) clearInterval(previous.probeTimer)
  previous.protocol?.close(reason)
  try { previous.connection.close() } catch {}
  elements["peer-carrier"].textContent = `closed · ${reason}`
}

function requestPeerRepair(peer, reason) {
  if (browserPeer !== peer || peer.repairRequested) return
  peer.repairRequested = true
  pendingPeerRepair = {
    kind: "peer-failed",
    peerId: peer.peerId,
    sessionEpoch: peer.sessionEpoch,
    peerGeneration: peer.peerGeneration,
    authorityKey: peer.authorityKey,
    tabId,
    reason,
  }
  send(pendingPeerRepair)
  closeBrowserPeer(`repair requested: ${reason}`)
}

function acceptPeerChannel(peer, channel) {
  if (channel.label !== "oracle" && channel.label !== "force") {
    channel.close()
    return
  }
  peer.channels.set(channel.label, channel)
  channel.addEventListener("open", () => activatePeerProtocol(peer))
  channel.addEventListener("close", () => {
    elements["peer-carrier"].textContent = `${channel.label} closed`
    requestPeerRepair(peer, `${channel.label} DataChannel closed`)
  })
  activatePeerProtocol(peer)
}

function activatePeerProtocol(peer) {
  if (browserPeer !== peer || peer.protocol || peer.channels.size !== 2) return
  const oracle = peer.channels.get("oracle")
  const force = peer.channels.get("force")
  if (oracle.readyState !== "open" || force.readyState !== "open") return
  const session = new LogicalChannelSession({
    sessionEpoch: peer.sessionEpoch,
    lanes: {oracle, force},
    onProtocolEvent: (event) => log(`peer protocol ${event.kind} on ${event.lane ?? "session"}`),
    onTraffic: (event) => emitHamiltonianTraffic({
      edgeId: event.lane === "oracle" ? HAMILTONIAN_ORACLE_EDGE_ID : HAMILTONIAN_FORCE_EDGE_ID,
      direction: event.direction,
      messageClass: event.messageClass,
    }),
  })
  peer.protocol = new PeerProtocol(session)
  peer.protocol.onForce((event) => {
    peer.forceEchoCount += 1
    elements["force-proof"].textContent =
      `echo ${peer.forceEchoCount} · seq ${event.sequence} · ${JSON.stringify(event.particle)}`
  })
  elements["peer-carrier"].textContent = `connected · ${peer.peerId} · oracle + force`
  void runPeerProbe(peer)
  peer.probeTimer = setInterval(() => void runPeerProbe(peer), 10_000)
}

async function runPeerProbe(peer) {
  if (browserPeer !== peer || !peer.protocol || peer.probePending) return
  peer.probePending = true
  const sequence = peer.probeCount + 1
  try {
    const result = await peer.protocol.request("probe", {
      runtime: "browser-window",
      tabId,
      pageIncarnation,
      sequence,
    })
    if (browserPeer !== peer) return
    peer.probeCount = sequence
    elements["oracle-proof"].textContent = `response ${sequence} · ${JSON.stringify(result)}`
    peer.protocol.publishForce({kind: "particle", from: tabId, at: Date.now(), sequence})
  } catch (error) {
    if (browserPeer === peer) elements["oracle-proof"].textContent = `failed · ${error.message}`
  } finally {
    peer.probePending = false
  }
}

async function receivePeerSignal(message) {
  if (!isMainLeader) return
  const generationKey = message.authorityKey
  const previousGeneration = acceptedPeerGeneration.get(generationKey) ?? 0
  const isCurrent = browserPeer &&
    browserPeer.peerId === message.peerId &&
    browserPeer.sessionEpoch === message.sessionEpoch &&
    browserPeer.peerGeneration === message.peerGeneration &&
    browserPeer.authorityKey === message.authorityKey
  if (!isCurrent && message.peerGeneration <= previousGeneration) {
    log(`ignored stale peer generation ${message.peerGeneration}`)
    return
  }
  if (!isCurrent) {
    closeBrowserPeer("new peer session")
    acceptedPeerGeneration.set(generationKey, message.peerGeneration)
    pendingPeerRepair = null
    const connection = new RTCPeerConnection()
    const peer = {
      peerId: message.peerId,
      sessionEpoch: message.sessionEpoch,
      peerGeneration: message.peerGeneration,
      authorityKey: message.authorityKey,
      connection,
      channels: new Map(),
      pendingCandidates: [],
      remoteDescriptionSet: false,
      protocol: null,
      probeTimer: null,
      probePending: false,
      probeCount: 0,
      forceEchoCount: 0,
      repairRequested: false,
    }
    browserPeer = peer
    elements["peer-carrier"].textContent = `negotiating · ${peer.peerId}`
    connection.addEventListener("datachannel", (event) => acceptPeerChannel(peer, event.channel))
    connection.addEventListener("connectionstatechange", () => {
      if (browserPeer !== peer) return
      elements["peer-carrier"].textContent = `${connection.connectionState} · ${peer.peerId}`
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        requestPeerRepair(peer, `RTCPeerConnection ${connection.connectionState}`)
      }
    })
    connection.addEventListener("icecandidate", (event) => {
      if (browserPeer !== peer) return
      send({
        kind: "peer-signal",
        peerId: peer.peerId,
        sessionEpoch: peer.sessionEpoch,
        peerGeneration: peer.peerGeneration,
        authorityKey: peer.authorityKey,
        tabId,
        signal: {type: "candidate", candidate: event.candidate?.toJSON() ?? null},
      })
    })
  }

  const peer = browserPeer
  if (
    peer.sessionEpoch !== message.sessionEpoch ||
    peer.peerGeneration !== message.peerGeneration ||
    peer.authorityKey !== message.authorityKey
  ) return
  const peerIsCurrent = () => browserPeer === peer &&
    isMainLeader &&
    peer.sessionEpoch === message.sessionEpoch &&
    peer.peerGeneration === message.peerGeneration &&
    peer.authorityKey === message.authorityKey
  const signal = message.signal
  if (signal.type === "candidate") {
    if (!peer.remoteDescriptionSet) {
      peer.pendingCandidates.push(signal.candidate)
      return
    }
    await peer.connection.addIceCandidate(signal.candidate)
    return
  }
  await peer.connection.setRemoteDescription(signal.description)
  if (!peerIsCurrent()) return
  peer.remoteDescriptionSet = true
  for (const candidate of peer.pendingCandidates.splice(0)) {
    await peer.connection.addIceCandidate(candidate)
    if (!peerIsCurrent()) return
  }
  if (signal.description.type === "offer") {
    const answer = await peer.connection.createAnswer()
    if (!peerIsCurrent()) return
    await peer.connection.setLocalDescription(answer)
    if (!peerIsCurrent()) return
    send({
      kind: "peer-signal",
      peerId: peer.peerId,
      sessionEpoch: peer.sessionEpoch,
      peerGeneration: peer.peerGeneration,
      authorityKey: peer.authorityKey,
      tabId,
      signal: {
        type: "description",
        description: peer.connection.localDescription?.toJSON() ?? peer.connection.localDescription,
      },
    })
  }
}

async function stopDedicatedWorker() {
  const previous = dedicatedEmbodiment
  if (!previous) return
  dedicatedEmbodiment = null
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 500)
    previous.worker.addEventListener("message", (event) => {
      if (event.data?.kind !== "stopped") return
      clearTimeout(timeout)
      resolve()
    }, {once: true})
    previous.worker.postMessage({kind: "stop"})
  })
  previous.worker.terminate()
}

async function birthDedicatedWorker(versionState) {
  await stopDedicatedWorker()
  const incarnation = crypto.randomUUID()
  const worker = new Worker("/embodiment-worker.js", {type: "module"})
  elements["worker-embodiment"].textContent = `starting · ${incarnation}`
  const attemptedEmbodiment = {worker, incarnation, fingerprint: versionState.fingerprint}
  dedicatedEmbodiment = attemptedEmbodiment
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Dedicated Worker birth timed out")), 5_000)
      worker.addEventListener("message", (event) => {
        const message = event.data
        if (message?.kind === "error") {
          clearTimeout(timeout)
          reject(new Error(message.error))
          return
        }
        if (message?.kind !== "ready") return
        clearTimeout(timeout)
        if (
          message.version !== versionState.version ||
          message.sha256 !== versionState.sha256 ||
          message.snapshot?.incarnation !== incarnation ||
          message.snapshot?.runtime !== "dedicated-worker" ||
          message.snapshot?.state !== "active"
        ) {
          reject(new Error("Dedicated Worker returned an invalid ready snapshot"))
          return
        }
        elements["worker-embodiment"].textContent = describeSnapshot(message.snapshot)
        log(`Dedicated Worker born as ${incarnation}`)
        resolve()
      })
      worker.addEventListener("error", (event) => {
        clearTimeout(timeout)
        reject(new Error(event.message || "Dedicated Worker failed"))
      }, {once: true})
      worker.postMessage({
        kind: "birth",
        incarnation,
        moduleUrl: versionState.moduleUrl,
        version: versionState.version,
        sha256: versionState.sha256,
      })
    })
  } catch (error) {
    dedicatedEmbodiment = disposeFailedWorker(dedicatedEmbodiment, attemptedEmbodiment)
    if (!dedicatedEmbodiment) elements["worker-embodiment"].textContent = "birth failed"
    throw error
  }
}

function stopMain(reason) {
  closeBrowserPeer(reason)
  if (!mainEmbodiment) return
  const stopped = mainEmbodiment.stop()
  mainEmbodiment = null
  mainAuthorityKey = null
  elements["main-embodiment"].textContent = "not elected"
  log(`Window main stopped (${reason}) at ${stopped.incarnation}`)
}

async function reconcileMain() {
  const leader = topology?.leader
  const nextAuthorityKey = authorityKey(leader)
  if (!isMainLeader || !leader || !leaseExpiresAt || Date.now() >= leaseExpiresAt) {
    stopMain("singleton lease lost")
    return
  }
  if (mainEmbodiment && mainAuthorityKey !== nextAuthorityKey) {
    stopMain("singleton authority changed")
  }
  if (!loadedVersion || mainEmbodiment) return

  sessionStorage.setItem("hamiltonian-main-version", loadedVersion.fingerprint)

  const mainIncarnation = crypto.randomUUID()
  mainEmbodiment = loadedVersion.loaded.createEmbodiment({
    runtime: "window-main",
    role: "singleton-main",
    incarnation: mainIncarnation,
    authority: {
      hostEpoch: leader.hostEpoch,
      leaseId: leader.leaseId,
      fencingToken: leader.fencingToken,
      expiresAt: leaseExpiresAt,
    },
  })
  const mainSnapshot = mainEmbodiment.start()
  mainAuthorityKey = nextAuthorityKey
  elements["main-embodiment"].textContent = describeSnapshot(mainSnapshot)
  log(`Window main singleton born as ${mainIncarnation} with fence ${leader.fencingToken}`)

  const reloadReason = sessionStorage.getItem("hamiltonian-main-reload-reason")
  if (reloadReason) {
    sessionStorage.removeItem("hamiltonian-main-reload-reason")
    log(`main realm completed page reload for ${reloadReason}`)
  }
}

async function activateVersion(message) {
  const fingerprint = `${message.version}:${message.sha256}`
  if (loadedVersion?.fingerprint === fingerprint) return
  if (mainRealmRequiresReload(Boolean(mainEmbodiment), loadedVersion?.fingerprint, fingerprint)) {
    sessionStorage.setItem("hamiltonian-main-version", fingerprint)
    sessionStorage.setItem("hamiltonian-main-reload-reason", `version ${message.version}`)
    log(`main realm update to ${message.version} requires page reload`)
    location.reload()
    return
  }

  const loaded = await import(message.moduleUrl)
  if (loaded.version !== message.version || typeof loaded.createEmbodiment !== "function") {
    throw new Error("main realm received an invalid version module")
  }
  loadedVersion = {...message, fingerprint, loaded}
  sessionStorage.setItem("hamiltonian-main-version", fingerprint)
  elements.module.textContent = loaded.describe()
  elements["source-hash"].textContent = message.sha256
  await birthDedicatedWorker(loadedVersion)
  await reconcileMain()
  log(`loaded ${loaded.version} from ${message.moduleUrl}`)
}

function receive(message) {
  lastWorkerMessageAt = Date.now()
  if (!message || typeof message !== "object") return
  if (message.kind === "orchestration-envelope") {
    publishInitialSceneEnvelope(message.envelope)
    return
  }
  if (message.kind === "worker-state") {
    controlConnectionId = message.connectionId ?? null
    elements.socket.textContent = message.socket
    renderHost(message.host)
    if (message.socket !== "connected") {
      log(`control session unavailable; current authority remains valid until ${new Date(leaseExpiresAt).toLocaleTimeString()}`)
    }
    return
  }
  if (message.kind === "topology") {
    renderHost(message.host)
    renderTopology(message.topology)
    return
  }
  if (message.kind === "version-ready") {
    elements.caches.textContent = message.caches.join(", ") || "none"
    elements.version.textContent = message.version
    versionQueue = versionQueue
      .then(() => activateVersion(message))
      .catch((error) => {
        elements.module.textContent = `load failed: ${error.message}`
        elements.module.className = "error"
        log(`embodiment birth failed: ${error.message}`, true)
      })
    return
  }
  if (message.kind === "peer-signal") {
    void receivePeerSignal(message).catch((error) => {
      if (!isCurrentPeerGeneration(browserPeer, message)) return
      elements["peer-carrier"].textContent = `failed · ${error.message}`
      log(`peer negotiation failed: ${error.message}`, true)
      requestPeerRepair(browserPeer, `negotiation failed: ${error.message}`)
    })
    return
  }
  if (message.kind === "window-id-collision") {
    sessionStorage.setItem("hamiltonian-window-id", message.replacementTabId)
    sessionStorage.setItem("hamiltonian-window-joined-at", String(Date.now()))
    sessionStorage.setItem("hamiltonian-main-reload-reason", "duplicate Window identity")
    location.reload()
    return
  }
  if (message.kind === "event") log(message.message, message.level === "error")
}

function attachPageChannel(force = false) {
  const controller = navigator.serviceWorker.controller
  if (!controller || !token) return false
  if (!force && port && attachedController === controller) return true
  port?.close()
  const channel = new MessageChannel()
  port = channel.port1
  attachedController = controller
  port.onmessage = (event) => receive(event.data)
  port.onmessageerror = () => log("page channel message error", true)
  port.start()
  controller.postMessage({
    kind: "connect-window",
    deviceId,
    tabId,
    pageIncarnation,
    joinedAt,
    token,
    controlResumeNonce,
    visible: document.visibilityState === "visible",
  }, [channel.port2])
  lastWorkerMessageAt = Date.now()
  log("Window attached to Service Worker through MessageChannel")
  return true
}

async function waitForController(timeoutMs = 8_000) {
  if (navigator.serviceWorker.controller) return true
  return await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      clearTimeout(timer)
      resolve(true)
    }, {once: true})
  })
}

async function start() {
  if (!("serviceWorker" in navigator)) {
    log("Service Worker API is unavailable", true)
    return
  }
  if (!isSecureContext) {
    log("A remote device must open this experiment through trusted HTTPS", true)
    return
  }
  if (!token) {
    log("Missing join token. Open the complete URL printed by the host.", true)
    return
  }

  try {
    await navigator.serviceWorker.register("/sw.js", {scope: "/", type: "module"})
    await navigator.serviceWorker.ready
    const controlled = await waitForController()
    elements.control.textContent = controlled
      ? (firstLoadHadController ? "pre-existing" : "claimed after install")
      : "reload required"
    if (!controlled) {
      log("Worker installed but did not claim this page; reload once", true)
      return
    }
    attachPageChannel()
  } catch (error) {
    log(`Service Worker registration failed: ${error.message}`, true)
  }
}

setInterval(() => {
  if (!port || Date.now() - lastWorkerMessageAt > 7_000) {
    if (!reconnecting) {
      reconnecting = true
      log("page channel became quiet; retaining unexpired authority while attaching a fresh MessageChannel")
      attachPageChannel(true)
      reconnecting = false
    }
  }
  if (mainEmbodiment && (!leaseExpiresAt || Date.now() >= leaseExpiresAt)) {
    isMainLeader = false
    stopMain("singleton lease expired")
  }
  send({kind: "window-heartbeat", visible: document.visibilityState === "visible"})
}, 2_000)

document.addEventListener("visibilitychange", () => {
  send({kind: "window-heartbeat", visible: document.visibilityState === "visible"})
})
window.addEventListener("pagehide", () => {
  mainEmbodiment?.stop()
  dedicatedEmbodiment?.worker.terminate()
  send({kind: "disconnect-window"})
})
navigator.serviceWorker?.addEventListener("controllerchange", () => attachPageChannel())
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.kind === "reattach-window") attachPageChannel(true)
})

function runOrchestrationAction(actionId) {
  if (actionId === "open-window") {
    window.open(location.href, "_blank", "noopener")
    return
  }
  if (actionId === "rebirth-worker") {
    if (!loadedVersion) return
    versionQueue = versionQueue
      .then(() => birthDedicatedWorker(loadedVersion))
      .catch((error) => log(`Dedicated Worker rebirth failed: ${error.message}`, true))
    return
  }
  if (actionId === "reload-main") {
    if (!mainEmbodiment || !loadedVersion) {
      log("Only the elected Window can rebirth the main realm", true)
      return
    }
    sessionStorage.setItem("hamiltonian-main-reload-reason", "manual rebirth")
    location.reload()
    return
  }
  if (actionId === "reconnect") {
    attachPageChannel(true)
    return
  }
  if (actionId === "reload") location.reload()
}

document.getElementById("new-tab").addEventListener("click", () => runOrchestrationAction("open-window"))
document.getElementById("rebirth-worker").addEventListener("click", () => runOrchestrationAction("rebirth-worker"))
document.getElementById("reload-main").addEventListener("click", () => runOrchestrationAction("reload-main"))
document.getElementById("reconnect").addEventListener("click", () => runOrchestrationAction("reconnect"))
document.getElementById("reload").addEventListener("click", () => runOrchestrationAction("reload"))
window.addEventListener("hamiltonian-orchestration-action", (event) => {
  const action = parseLocalHamiltonianWindowAction(event.detail, deviceId, tabId)
  if (action === null) {
    log("Ignored orchestration action for another or unknown Window", true)
    return
  }
  runOrchestrationAction(action.actionId)
})

void start()
