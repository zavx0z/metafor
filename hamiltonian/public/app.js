import {
  HamiltonianLifecycleRetainedJournal,
  createHamiltonianLifecycleObservation,
  emitHamiltonianLifecycle,
  hamiltonianDataChannelTransportId,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
  hamiltonianLifecycleTransportId,
  hamiltonianRtcPeerEntityId,
  isHamiltonianLifecycleEnvelopeFromSource,
  receiveHamiltonianLifecycleEnvelope,
  receiveHamiltonianLifecycleSnapshot,
  receiveHamiltonianNodeSystemDeclaration,
  subscribeHamiltonianLifecycle,
} from "/core/lifecycle.js"
import {hamiltonianPageBootstrap, hamiltonianRealmSnapshot} from "/core/monitor.js"
import {authorityKey, LogicalChannelSession, PeerProtocol} from "/core/runtime.js"
import {
  HAMILTONIAN_PAGE_HEARTBEAT_MS,
  disposeFailedWorker,
  isCurrentPeerGeneration,
  pageWorkerChannelIsQuiet,
} from "/core/browser-control.js"
import {
  mainRealmRequiresReload,
  sourceRevisionRequiresReload,
} from "/update/page-update.js"
import {
  hamiltonianBrowserNodeId,
  hamiltonianBrowserRuntimeName,
  parseLocalHamiltonianWindowAction,
} from "/core/orchestration.js"
import {createWebPushClient} from "/web-push-client.js"

const pageIncarnation = hamiltonianRealmSnapshot().incarnation
const pageEntityId = hamiltonianLifecycleEntityId("page", pageIncarnation)
const mainEntityId = hamiltonianLifecycleEntityId("window-main", pageIncarnation)
const pageBootstrap = hamiltonianPageBootstrap()
const sourceRevisionStorageKey = "hamiltonian-source-revision"
if (pageBootstrap?.browserSourceRevision) {
  sessionStorage.setItem(sourceRevisionStorageKey, pageBootstrap.browserSourceRevision)
}
const bootstrapServerEntityId = pageBootstrap?.server.hostEpoch
  ? hamiltonianLifecycleEntityId("server", pageBootstrap.server.hostEpoch)
  : null
const tabId = sessionStorage.getItem("hamiltonian-window-id") ?? crypto.randomUUID()
sessionStorage.setItem("hamiltonian-window-id", tabId)
const pagePredecessorStorageKey = "hamiltonian-page-predecessor"
const predecessorPageIncarnation = sessionStorage.getItem(pagePredecessorStorageKey)
sessionStorage.removeItem(pagePredecessorStorageKey)
const joinedAt = Number(sessionStorage.getItem("hamiltonian-window-joined-at") ?? Date.now())
sessionStorage.setItem("hamiltonian-window-joined-at", String(joinedAt))
let deviceId = localStorage.getItem("hamiltonian-device")
if (!deviceId) {
  deviceId = crypto.randomUUID()
  localStorage.setItem("hamiltonian-device", deviceId)
}
let serviceWorkerIdentity = localStorage.getItem("hamiltonian-service-worker-id")
if (!serviceWorkerIdentity) {
  serviceWorkerIdentity = crypto.randomUUID()
  localStorage.setItem("hamiltonian-service-worker-id", serviceWorkerIdentity)
}
const browserEntityId = hamiltonianBrowserNodeId(deviceId)
const stableServiceWorkerEntityId = hamiltonianLifecycleEntityId("service-worker", serviceWorkerIdentity)
const browserRuntimeName = hamiltonianBrowserRuntimeName(navigator.userAgent)
let controlResumeNonce = localStorage.getItem("hamiltonian-control-resume")
if (!controlResumeNonce) {
  controlResumeNonce = crypto.randomUUID()
  localStorage.setItem("hamiltonian-control-resume", controlResumeNonce)
}

let webPushClient = null
let webPushEnablePromise = null

const pageUrl = new URL(location.href)
const suppliedToken = pageUrl.searchParams.get("token")
const localJoinToken = document.querySelector('meta[name="hamiltonian-local-join-token"]')?.content || null
const bootstrapToken = suppliedToken ?? localJoinToken
if (bootstrapToken) {
  localStorage.setItem("hamiltonian-token", bootstrapToken)
}
if (suppliedToken) {
  pageUrl.searchParams.delete("token")
  history.replaceState(null, "", pageUrl)
}
const token = bootstrapToken ?? localStorage.getItem("hamiltonian-token")

let attachedController = null
let attachedWorkerEntityId = null
const serviceWorkerTransportId = hamiltonianLifecycleTransportId("service-worker-api", crypto.randomUUID())
let pendingControllerConnect = null
let pendingPageMessages = []
let supersededWorkerEntityId = null
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
const pendingPushRegistrations = new Map()
const pageLifecycleJournal = new HamiltonianLifecycleRetainedJournal(pageEntityId)
subscribeHamiltonianLifecycle((envelope) => {
  if (!isHamiltonianLifecycleEnvelopeFromSource(
    envelope,
    pageEntityId,
    "page",
    pageIncarnation,
  )) return
  pageLifecycleJournal.observe(envelope)
  if (!attachedController) return
  try {
    attachedController.postMessage({kind: "page-lifecycle", envelope})
  } catch {
    // The next attach sends the complete retained page snapshot.
  }
})

emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
  type: "entity",
  phase: "born",
  subjectId: browserEntityId,
  subjectKind: "browser-runtime",
  ownerId: browserEntityId,
  attributes: {
    profileId: deviceId,
    runtime: browserRuntimeName,
    state: "active",
  },
}), {at: pageBootstrap?.observedAt ?? Date.now()})
emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
  type: "entity",
  phase: "born",
  subjectId: pageEntityId,
  subjectKind: "page",
  ownerId: browserEntityId,
  attributes: {
    incarnation: pageIncarnation,
    tabId,
    navigation: pageBootstrap?.navigationId ?? "",
    visibility: document.visibilityState,
    state: "live",
  },
}), {at: pageBootstrap?.observedAt ?? Date.now()})
emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
  type: "entity",
  phase: "born",
  subjectId: mainEntityId,
  subjectKind: "window-main",
  ownerId: pageEntityId,
  attributes: {
    incarnation: pageIncarnation,
    runtime: "Window",
    state: "active",
  },
}))
// The page journal is the first lifecycle subscriber, so it consumes the
// bounded startup queue before orchestration can subscribe. Seed the local
// snapshot channel at the exact bootstrap frontier; orchestration can then
// continue with the next live page event without reporting a false 1…3 gap.
receiveHamiltonianLifecycleSnapshot(pageLifecycleJournal.snapshot())

function send(message) {
  try {
    if (!attachedController) return false
    const messageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
    const observedMessage = {...message, monitor: {messageId}}
    const messageClass = lifecycleMessageClass(message?.kind)
    if (attachedWorkerEntityId) {
      emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
        type: "message",
        phase: "sent",
        subjectId: messageId,
        subjectKind: "service-worker-api-message",
        ownerId: pageEntityId,
        sourceEntityId: pageEntityId,
        targetEntityId: attachedWorkerEntityId,
        transportId: serviceWorkerTransportId,
        messageId,
        messageClass,
      }))
    } else {
      pendingPageMessages.push({
        messageId,
        transportId: serviceWorkerTransportId,
        messageClass,
        at: Date.now(),
      })
      if (pendingPageMessages.length > 32) pendingPageMessages.splice(0, pendingPageMessages.length - 32)
    }
    attachedController.postMessage(observedMessage)
    return true
  } catch {
    return false
  }
}

function renderHost(nextHost) {
  if (!nextHost) return
  hostPlacement = nextHost.placement ?? "browser"
}

function renderTopology(nextTopology) {
  topology = nextTopology
  const leader = nextTopology?.leader
  isMainLeader = hostPlacement === "browser" &&
    leader?.deviceId === deviceId &&
    leader?.tabId === tabId
  leaseExpiresAt = isMainLeader ? Number(leader.leaseExpiresAt ?? 0) : 0
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
    .catch(() => {})
}

function closeBrowserPeer(reason) {
  const previous = browserPeer
  if (!previous) return
  browserPeer = null
  if (previous.probeTimer) clearInterval(previous.probeTimer)
  previous.protocol?.close(reason)
  try { previous.connection.close() } catch {}
  emitBrowserRtcPeer(previous, "ended", reason)
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
  emitBrowserDataChannel(peer, channel, "opening")
  channel.addEventListener("open", () => {
    emitBrowserDataChannel(peer, channel, "opened")
    activatePeerProtocol(peer)
  })
  channel.addEventListener("close", () => {
    emitBrowserDataChannel(peer, channel, "closed")
    requestPeerRepair(peer, `${channel.label} DataChannel closed`)
  })
  if (channel.readyState === "open") emitBrowserDataChannel(peer, channel, "opened")
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
    onTraffic: (event) => observeBrowserDataChannelMessage(peer, event),
  })
  peer.protocol = new PeerProtocol(session)
  void runPeerProbe(peer)
  peer.probeTimer = setInterval(() => void runPeerProbe(peer), 10_000)
}

async function runPeerProbe(peer) {
  if (browserPeer !== peer || !peer.protocol || peer.probePending) return
  peer.probePending = true
  const sequence = peer.probeCount + 1
  try {
    await peer.protocol.request("probe", {
      runtime: "browser-window",
      tabId,
      pageIncarnation,
      sequence,
    })
    if (browserPeer !== peer) return
    peer.probeCount = sequence
    peer.protocol.publishForce({kind: "particle", from: tabId, at: Date.now(), sequence})
  } catch {} finally {
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
    return
  }
  if (!isCurrent) {
    closeBrowserPeer("new peer session")
    acceptedPeerGeneration.set(generationKey, message.peerGeneration)
    pendingPeerRepair = null
    const connection = new RTCPeerConnection()
    const rtcEntityId = hamiltonianRtcPeerEntityId(message.sessionEpoch, "browser")
    const remoteRtcEntityId = hamiltonianRtcPeerEntityId(message.sessionEpoch, "server")
    const peer = {
      peerId: message.peerId,
      sessionEpoch: message.sessionEpoch,
      peerGeneration: message.peerGeneration,
      authorityKey: message.authorityKey,
      connection,
      rtcEntityId,
      remoteRtcEntityId,
      channels: new Map(),
      channelLifecycle: new WeakMap(),
      pendingCandidates: [],
      remoteDescriptionSet: false,
      protocol: null,
      probeTimer: null,
      probePending: false,
      probeCount: 0,
      repairRequested: false,
      lifecycleEnded: false,
    }
    browserPeer = peer
    emitBrowserRtcPeer(peer, "born")
    connection.addEventListener("datachannel", (event) => acceptPeerChannel(peer, event.channel))
    connection.addEventListener("connectionstatechange", () => {
      if (browserPeer !== peer) return
      emitBrowserRtcPeer(peer, connection.connectionState === "closed" ? "ended" : "changed")
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

function emitBrowserRtcPeer(peer, phase, reason = "") {
  if (phase === "ended") {
    if (peer.lifecycleEnded) return
    peer.lifecycleEnded = true
  } else if (peer.lifecycleEnded) {
    return
  }
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase,
    subjectId: peer.rtcEntityId,
    subjectKind: "rtc-peer",
    ownerId: mainEntityId,
    attributes: {
      endpoint: "browser",
      peerId: peer.peerId,
      sessionEpoch: peer.sessionEpoch,
      generation: peer.peerGeneration,
      state: phase === "ended" ? "closed" : peer.connection.connectionState,
      ...(reason ? {reason} : {}),
    },
  }))
}

function emitBrowserDataChannel(peer, channel, phase) {
  const previous = peer.channelLifecycle.get(channel)
  if (previous === phase || previous === "closed") return
  peer.channelLifecycle.set(channel, phase)
  const transportId = hamiltonianDataChannelTransportId(peer.sessionEpoch, channel.label)
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase,
    subjectId: transportId,
    subjectKind: "data-channel",
    ownerId: peer.remoteRtcEntityId,
    sourceEntityId: peer.remoteRtcEntityId,
    targetEntityId: peer.rtcEntityId,
    transportId,
    attributes: {
      endpoint: "browser",
      lane: channel.label,
      sessionEpoch: peer.sessionEpoch,
      state: channel.readyState,
    },
  }))
}

function observeBrowserDataChannelMessage(peer, event) {
  const sent = event.direction === "forward"
  const transportId = hamiltonianDataChannelTransportId(peer.sessionEpoch, event.lane)
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase: sent ? "sent" : "received",
    subjectId: event.messageId,
    subjectKind: "data-channel-message",
    ownerId: peer.rtcEntityId,
    sourceEntityId: sent ? peer.rtcEntityId : peer.remoteRtcEntityId,
    targetEntityId: sent ? peer.remoteRtcEntityId : peer.rtcEntityId,
    transportId,
    messageId: event.messageId,
    messageClass: event.messageClass,
    attributes: {
      lane: event.lane,
      sequence: event.sequence,
      sessionEpoch: peer.sessionEpoch,
    },
  }))
}

async function stopDedicatedWorker() {
  const previous = dedicatedEmbodiment
  if (!previous) return
  dedicatedEmbodiment = null
  let stopCause = null
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 500)
    previous.worker.addEventListener("message", (event) => {
      if (event.data?.kind !== "stopped") return
      stopCause = observeDedicatedWorkerMessage(previous, event.data) ?? stopCause
      clearTimeout(timeout)
      resolve()
    }, {once: true})
    stopCause = postDedicatedWorkerMessage(previous, {kind: "stop"})
  })
  previous.worker.terminate()
  closeDedicatedWorkerFromOwner(previous, "page-terminated-after-stop", stopCause)
}

async function birthDedicatedWorker(versionState) {
  await stopDedicatedWorker()
  const incarnation = crypto.randomUUID()
  const workerIncarnation = crypto.randomUUID()
  const workerEntityId = hamiltonianLifecycleEntityId("dedicated-worker", workerIncarnation)
  const workerTransportId = hamiltonianLifecycleTransportId("worker-message", crypto.randomUUID())
  const worker = new Worker("/embodiment-worker-entry.js", {type: "module", name: workerIncarnation})
  const attemptedEmbodiment = {
    worker,
    incarnation,
    workerIncarnation,
    workerEntityId,
    workerTransportId,
    fingerprint: versionState.fingerprint,
  }
  dedicatedEmbodiment = attemptedEmbodiment
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "born",
    subjectId: workerEntityId,
    subjectKind: "dedicated-worker",
    ownerId: pageEntityId,
    attributes: {incarnation: workerIncarnation, state: "constructed"},
  }))
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "opening",
    subjectId: workerTransportId,
    subjectKind: "worker-message",
    ownerId: pageEntityId,
    sourceEntityId: mainEntityId,
    targetEntityId: workerEntityId,
    transportId: workerTransportId,
    attributes: {state: "constructed"},
  }))
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Dedicated Worker birth timed out")), 5_000)
      worker.addEventListener("message", (event) => {
        if (dedicatedEmbodiment !== attemptedEmbodiment) return
        const message = event.data
        if (message?.kind === "lifecycle-snapshot") {
          receiveHamiltonianLifecycleSnapshot(message.snapshot)
          return
        }
        observeDedicatedWorkerMessage(attemptedEmbodiment, message)
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
        resolve()
      })
      worker.addEventListener("error", (event) => {
        clearTimeout(timeout)
        reject(new Error(event.message || "Dedicated Worker failed"))
      }, {once: true})
      postDedicatedWorkerMessage(attemptedEmbodiment, {
        kind: "birth",
        incarnation,
        pageEntityId,
        mainEntityId,
        workerEntityId,
        workerTransportId,
        moduleUrl: versionState.moduleUrl,
        version: versionState.version,
        sha256: versionState.sha256,
      })
    })
  } catch (error) {
    dedicatedEmbodiment = disposeFailedWorker(dedicatedEmbodiment, attemptedEmbodiment)
    closeDedicatedWorkerFromOwner(attemptedEmbodiment, "page-terminated-after-birth-failure", null)
    throw error
  }
}

function postDedicatedWorkerMessage(embodiment, message) {
  const messageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
  const envelope = emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase: "sent",
    subjectId: messageId,
    subjectKind: "worker-message",
    ownerId: pageEntityId,
    sourceEntityId: mainEntityId,
    targetEntityId: embodiment.workerEntityId,
    transportId: embodiment.workerTransportId,
    messageId,
    messageClass: lifecycleMessageClass(message?.kind),
  }))
  embodiment.worker.postMessage({...message, monitor: {messageId}})
  return envelope.eventId
}

function observeDedicatedWorkerMessage(embodiment, message) {
  const messageId = lifecycleMessageId(message)
  if (!messageId) return null
  const envelope = emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase: "received",
    subjectId: messageId,
    subjectKind: "worker-message",
    ownerId: pageEntityId,
    sourceEntityId: embodiment.workerEntityId,
    targetEntityId: mainEntityId,
    transportId: embodiment.workerTransportId,
    messageId,
    messageClass: lifecycleMessageClass(message?.kind),
  }))
  return envelope.eventId
}

function closeDedicatedWorkerFromOwner(embodiment, reason, causedBy) {
  const closed = emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "transport",
    phase: "closed",
    subjectId: embodiment.workerTransportId,
    subjectKind: "worker-message",
    ownerId: pageEntityId,
    sourceEntityId: mainEntityId,
    targetEntityId: embodiment.workerEntityId,
    transportId: embodiment.workerTransportId,
    attributes: {reason},
  }), {causedBy})
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "ended",
    subjectId: embodiment.workerEntityId,
    subjectKind: "dedicated-worker",
    ownerId: pageEntityId,
    attributes: {
      incarnation: embodiment.workerIncarnation,
      state: "ended",
      reason,
    },
  }), {causedBy: closed.eventId})
}

function stopMain(reason) {
  closeBrowserPeer(reason)
  if (!mainEmbodiment) return
  mainEmbodiment.stop()
  mainEmbodiment = null
  mainAuthorityKey = null
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
  mainEmbodiment.start()
  mainAuthorityKey = nextAuthorityKey

  const reloadReason = sessionStorage.getItem("hamiltonian-main-reload-reason")
  if (reloadReason) {
    sessionStorage.removeItem("hamiltonian-main-reload-reason")
  }
}

async function activateVersion(message) {
  const fingerprint = `${message.version}:${message.sha256}`
  if (loadedVersion?.fingerprint === fingerprint) return
  if (mainRealmRequiresReload(Boolean(mainEmbodiment), loadedVersion?.fingerprint, fingerprint)) {
    sessionStorage.setItem("hamiltonian-main-version", fingerprint)
    sessionStorage.setItem("hamiltonian-main-reload-reason", `version ${message.version}`)
    location.reload()
    return
  }

  const loaded = await import(message.moduleUrl)
  if (loaded.version !== message.version || typeof loaded.createEmbodiment !== "function") {
    throw new Error("main realm received an invalid version module")
  }
  loadedVersion = {...message, fingerprint, loaded}
  sessionStorage.setItem("hamiltonian-main-version", fingerprint)
  await birthDedicatedWorker(loadedVersion)
  await reconcileMain()
}

function observeAttachedWorkerQuiet(reason) {
  if (!attachedWorkerEntityId) return
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: attachedWorkerEntityId,
    subjectKind: "service-worker",
    ownerId: browserEntityId,
    attributes: {state: "standby", heartbeat: "paused", reason},
  }))
}

function receive(message) {
  lastWorkerMessageAt = Date.now()
  if (!message || typeof message !== "object") return
  if (message.kind === "lifecycle") {
    receiveHamiltonianLifecycleEnvelope(message.envelope)
    return
  }
  if (message.kind === "lifecycle-snapshot") {
    receiveHamiltonianLifecycleSnapshot(message.snapshot)
    return
  }
  if (message.kind === "node-system-declaration") {
    receiveHamiltonianNodeSystemDeclaration(message.declaration)
    return
  }
  if (message.kind === "worker-state" && typeof message.workerIdentity === "string" && message.workerIdentity) {
    const nextWorkerEntityId = hamiltonianLifecycleEntityId("service-worker", message.workerIdentity)
    const previousWorkerEntityId = attachedWorkerEntityId ?? supersededWorkerEntityId
    supersededWorkerEntityId = null
    if (previousWorkerEntityId && previousWorkerEntityId !== nextWorkerEntityId) {
      emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "ended",
        subjectId: previousWorkerEntityId,
        subjectKind: "service-worker",
        ownerId: browserEntityId,
        attributes: {
          state: "ended",
          reason: "superseded-by-observed-incarnation",
          successor: nextWorkerEntityId,
        },
      }), {causedBy: lifecycleMessageId(message)})
    }
    attachedWorkerEntityId = nextWorkerEntityId
    if (pendingControllerConnect) {
      const pending = pendingControllerConnect
      pendingControllerConnect = null
      emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
        type: "message",
        phase: "sent",
        subjectId: pending.messageId,
        subjectKind: "service-worker-api-message",
        ownerId: pageEntityId,
        sourceEntityId: pageEntityId,
        targetEntityId: nextWorkerEntityId,
        transportId: pending.transportId,
        messageId: pending.messageId,
        messageClass: "connect-window",
      }), {at: pending.at})
    }
    for (const pending of pendingPageMessages.splice(0)) {
      emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
        type: "message",
        phase: "sent",
        subjectId: pending.messageId,
        subjectKind: "service-worker-api-message",
        ownerId: pageEntityId,
        sourceEntityId: pageEntityId,
        targetEntityId: nextWorkerEntityId,
        transportId: pending.transportId,
        messageId: pending.messageId,
        messageClass: pending.messageClass,
      }), {at: pending.at})
    }
  }
  const messageId = lifecycleMessageId(message)
  if (messageId && attachedWorkerEntityId) {
    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "received",
      subjectId: messageId,
      subjectKind: "service-worker-api-message",
      ownerId: pageEntityId,
      sourceEntityId: attachedWorkerEntityId,
      targetEntityId: pageEntityId,
      transportId: serviceWorkerTransportId,
      messageId,
      messageClass: lifecycleMessageClass(message.kind),
    }))
  }
  if (message.kind === "worker-state") {
    controlConnectionId = message.connectionId ?? null
    renderHost(message.host)
    return
  }
  if (
    (message.kind === "push-subscription-confirmed" || message.kind === "push-subscription-rejected") &&
    typeof message.registrationId === "string"
  ) {
    const pending = pendingPushRegistrations.get(message.registrationId)
    if (!pending) return
    pendingPushRegistrations.delete(message.registrationId)
    clearTimeout(pending.timer)
    if (message.kind === "push-subscription-confirmed") pending.resolve(message.subscription ?? null)
    else pending.reject(new Error(typeof message.reason === "string" ? message.reason : "server rejected subscription"))
    return
  }
  if (message.kind === "topology") {
    renderHost(message.host)
    renderTopology(message.topology)
    return
  }
  if (message.kind === "version-ready") {
    versionQueue = versionQueue
      .then(() => activateVersion(message))
      .catch(() => {})
    return
  }
  if (message.kind === "source-update") {
    const currentRevision = sessionStorage.getItem(sourceRevisionStorageKey)
    if (!sourceRevisionRequiresReload(currentRevision, message.revision)) return
    sessionStorage.setItem(sourceRevisionStorageKey, message.revision)
    sessionStorage.setItem("hamiltonian-main-reload-reason", `source ${message.revision}`)
    location.reload()
    return
  }
  if (message.kind === "peer-signal") {
    void receivePeerSignal(message).catch((error) => {
      if (!isCurrentPeerGeneration(browserPeer, message)) return
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
}

function attachServiceWorkerChannel(force = false) {
  const controller = navigator.serviceWorker.controller
  if (!controller || !token) return false
  if (!force && attachedController === controller) return true
  supersededWorkerEntityId = attachedWorkerEntityId
  pendingControllerConnect = null
  pendingPageMessages = []
  const connectMessageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
  attachedController = controller
  pendingControllerConnect = {
    messageId: connectMessageId,
    transportId: serviceWorkerTransportId,
    at: Date.now(),
  }
  controller.postMessage({
    kind: "connect-window",
    browserEntityId,
    deviceId,
    tabId,
    pageIncarnation,
    predecessorPageIncarnation,
    joinedAt,
    token,
    workerIdentity: serviceWorkerIdentity,
    controlResumeNonce,
    serverEntityId: bootstrapServerEntityId,
    visible: document.visibilityState === "visible",
    serviceWorkerTransportId,
    pageLifecycleSnapshot: pageLifecycleJournal.snapshot(),
    monitor: {messageId: connectMessageId},
  })
  lastWorkerMessageAt = Date.now()
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
  if (!("serviceWorker" in navigator)) return
  if (!isSecureContext) return
  if (!token) return

  try {
    await navigator.serviceWorker.register("/sw-entry.js", {scope: "/", type: "module"})
    await navigator.serviceWorker.ready
    const controlled = await waitForController()
    if (!controlled) return
    attachServiceWorkerChannel()
    const publicKey = await fetchVapidPublicKey()
    webPushClient = createHamiltonianWebPushClient(publicKey)
    const restored = await webPushClient.restore(crypto.randomUUID())
    const disposition = webPushClient.permissionDisposition()
    if (!restored && (disposition === "request" || disposition === "silent")) {
      void enableWebPush()
    }
  } catch {}
}

async function enableWebPush() {
  if (webPushEnablePromise) return webPushEnablePromise
  webPushEnablePromise = (async () => {
    const publicKey = await fetchVapidPublicKey()
    webPushClient ??= createHamiltonianWebPushClient(publicKey)
    const result = await webPushClient.enable(crypto.randomUUID())
    if (!result.accepted) {
      if (result.reason === "permission-dismissed") return result
      if (result.reason === "permission-denied") return result
      throw new Error(result.reason)
    }
    return result
  })().catch(() => null).finally(() => { webPushEnablePromise = null })
  return webPushEnablePromise
}

function createHamiltonianWebPushClient(publicKey) {
  return createWebPushClient({
    serviceWorker: navigator.serviceWorker,
    notifications: "Notification" in window ? Notification : undefined,
    applicationServerKey: publicKey,
    registerSubscription: async (request) => {
      try {
        const confirmation = await registerPushSubscription(request.subscription, request.operationId)
        return {
          schema: 1,
          accepted: true,
          subscriptionId: stableServiceWorkerEntityId,
          registeredAt: typeof confirmation?.registeredAt === "number"
            ? confirmation.registeredAt
            : Date.now(),
        }
      } catch (error) {
        return {
          schema: 1,
          accepted: false,
          reason: error instanceof Error ? error.name : "RegistrationError",
        }
      }
    },
    onLifecycle: observeWebPushLifecycle,
  })
}

function observeWebPushLifecycle(event) {
  /** @type {Record<string, string | number | boolean | null>} */
  const attributes = {webPushLifecycle: event.type}
  if (event.type === "client.registration-accepted") {
    attributes.push = "ready"
    attributes.state = "active"
  } else if (event.type === "client.permission-denied") {
    attributes.push = "permission-denied"
  } else if (event.type === "client.registration-rejected") {
    attributes.push = "registration-rejected"
  }
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: stableServiceWorkerEntityId,
    subjectKind: "service-worker",
    ownerId: browserEntityId,
    attributes,
  }))
}

async function registerPushSubscription(subscription, registrationId = crypto.randomUUID()) {
  const confirmation = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPushRegistrations.delete(registrationId)
      reject(new Error("Service Worker did not confirm PushSubscription registration"))
    }, 10_000)
    pendingPushRegistrations.set(registrationId, {resolve, reject, timer})
  })
  if (!send({
    kind: "register-push-subscription",
    registrationId,
    workerIdentity: serviceWorkerIdentity,
    subscription,
  })) {
    const pending = pendingPushRegistrations.get(registrationId)
    if (pending) clearTimeout(pending.timer)
    pendingPushRegistrations.delete(registrationId)
    throw new Error("Service Worker control channel is unavailable")
  }
  return await confirmation
}

async function fetchVapidPublicKey() {
  const response = await fetch("/push/vapid-public-key", {
    headers: {authorization: `Bearer ${token}`},
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`VAPID key ${response.status}`)
  const payload = await response.json()
  if (!payload || typeof payload.publicKey !== "string") throw new Error("invalid VAPID public key")
  return payload.publicKey
}

setInterval(() => {
  const now = Date.now()
  if (!attachedController || pageWorkerChannelIsQuiet({
    now,
    lastWorkerMessageAt,
    visibility: document.visibilityState,
  })) {
    if (!reconnecting) {
      reconnecting = true
      observeAttachedWorkerQuiet("page-channel-quiet")
      attachServiceWorkerChannel(true)
      reconnecting = false
    }
  }
  if (mainEmbodiment && (!leaseExpiresAt || Date.now() >= leaseExpiresAt)) {
    isMainLeader = false
    stopMain("singleton lease expired")
  }
  send({
    kind: "window-heartbeat",
    tabId,
    pageIncarnation,
    visible: document.visibilityState === "visible",
  })
}, HAMILTONIAN_PAGE_HEARTBEAT_MS)

document.addEventListener("visibilitychange", () => {
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "changed",
    subjectId: pageEntityId,
    subjectKind: "page",
    ownerId: browserEntityId,
    attributes: {visibility: document.visibilityState, state: "live"},
  }))
  send({
    kind: "window-heartbeat",
    tabId,
    pageIncarnation,
    visible: document.visibilityState === "visible",
  })
})
window.addEventListener("pagehide", () => {
  sessionStorage.setItem(pagePredecessorStorageKey, pageIncarnation)
  mainEmbodiment?.stop()
  const previousWorker = dedicatedEmbodiment
  dedicatedEmbodiment = null
  if (previousWorker) {
    previousWorker.worker.terminate()
    closeDedicatedWorkerFromOwner(previousWorker, "pagehide", null)
  }
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "ended",
    subjectId: mainEntityId,
    subjectKind: "window-main",
    ownerId: pageEntityId,
    attributes: {state: "ended"},
  }))
  emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "ended",
    subjectId: pageEntityId,
    subjectKind: "page",
    ownerId: browserEntityId,
    attributes: {state: "ended"},
  }))
  send({kind: "disconnect-window"})
  closeCurrentServiceWorkerChannel("pagehide")
})
window.addEventListener("pageshow", (event) => {
  if (event.persisted) sessionStorage.removeItem(pagePredecessorStorageKey)
})
navigator.serviceWorker?.addEventListener("controllerchange", () => attachServiceWorkerChannel())
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.kind === "reattach-window") attachServiceWorkerChannel(true)
  else receive(event.data)
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
      .catch(() => {})
    return
  }
  if (actionId === "reload-main") {
    if (!mainEmbodiment || !loadedVersion) return
    sessionStorage.setItem("hamiltonian-main-reload-reason", "manual rebirth")
    location.reload()
    return
  }
  if (actionId === "reconnect") {
    attachServiceWorkerChannel(true)
    return
  }
  if (actionId === "enable-push") {
    void enableWebPush()
    return
  }
  if (actionId === "reload") location.reload()
}

window.addEventListener("keydown", (event) => {
  if (!event.altKey || event.code !== "KeyP") return
  event.preventDefault()
  runOrchestrationAction("enable-push")
})

window.addEventListener("hamiltonian-orchestration-action", (event) => {
  const action = parseLocalHamiltonianWindowAction(
    event.detail,
    deviceId,
    tabId,
    pageIncarnation,
    attachedWorkerEntityId,
  )
  if (action === null) return
  runOrchestrationAction(action.actionId)
})

void start()

function closeCurrentServiceWorkerChannel(reason) {
  if (attachedWorkerEntityId) {
    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "closed",
      subjectId: serviceWorkerTransportId,
      subjectKind: "service-worker-api",
      ownerId: pageEntityId,
      sourceEntityId: pageEntityId,
      targetEntityId: attachedWorkerEntityId,
      transportId: serviceWorkerTransportId,
      attributes: {reason},
    }))
  }
  attachedController = null
  pendingControllerConnect = null
  pendingPageMessages = []
}

function lifecycleMessageId(message) {
  return typeof message?.monitor?.messageId === "string" && message.monitor.messageId
    ? message.monitor.messageId
    : null
}

function lifecycleMessageClass(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value) ? value : "unknown"
}
