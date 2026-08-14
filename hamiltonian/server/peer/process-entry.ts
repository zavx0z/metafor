import {
  WeriftPeer,
  type PeerSignal,
  type WeriftPeerLifecycleEvent,
  type WeriftPeerSnapshot,
} from "./werift-peer.ts"
import type {RTCIceServer} from "werift"
import {
  HamiltonianLifecycleSource,
  createHamiltonianLifecycleObservation,
  hamiltonianDataChannelTransportId,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
  hamiltonianRtcPeerEntityId,
} from "../../core/lifecycle.js"

type ParentMessage =
  | {kind: "begin"; peerId: string; sessionEpoch: string; iceServers?: RTCIceServer[]; iceLite?: boolean; monitor: {messageId: string}}
  | {kind: "signal"; peerId: string; signal: PeerSignal; monitor: {messageId: string}}
  | {kind: "close-peer"; peerId?: string; monitor: {messageId: string}}
  | {kind: "stop"; monitor: {messageId: string}}

let peer: WeriftPeer | null = null
let operations: Promise<void> = Promise.resolve()
const [rawProcessIncarnation, rawServerEntityId, rawIpcTransportId] = process.argv.slice(2)
if (!rawProcessIncarnation || !rawServerEntityId || !rawIpcTransportId) {
  throw new Error("Peer process lifecycle identity is missing")
}
const processIncarnation = rawProcessIncarnation
const serverEntityId = rawServerEntityId
const ipcTransportId = rawIpcTransportId
const processEntityId = hamiltonianLifecycleEntityId("peer-process", processIncarnation)
const lifecycle = new HamiltonianLifecycleSource({
  id: processEntityId,
  kind: "peer-process",
  incarnation: processIncarnation,
  startedAt: Date.now(),
})

function send(message: unknown): void {
  process.send?.(message)
}

function emitLifecycle(observation: Parameters<HamiltonianLifecycleSource["next"]>[0], causedBy: string | null = null): void {
  send({kind: "lifecycle", envelope: lifecycle.next(observation, {causedBy})})
}

function messageId(message: {monitor?: {messageId?: unknown}}): string | null {
  return typeof message.monitor?.messageId === "string" && message.monitor.messageId
    ? message.monitor.messageId
    : null
}

function observeMessage(
  phase: "sent" | "received",
  id: string,
  messageClass: string,
): void {
  const outgoing = phase === "sent"
  emitLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase,
    subjectId: id,
    subjectKind: "ipc-message",
    ownerId: processEntityId,
    sourceEntityId: outgoing ? processEntityId : serverEntityId,
    targetEntityId: outgoing ? serverEntityId : processEntityId,
    transportId: ipcTransportId,
    messageId: id,
    messageClass,
  }))
}

function sendObserved(message: Record<string, unknown> & {kind: string}): string {
  const id = hamiltonianLifecycleMessageId(crypto.randomUUID())
  observeMessage("sent", id, message.kind)
  send({...message, monitor: {messageId: id}})
  return id
}

function observePeerLifecycle(
  event: WeriftPeerLifecycleEvent,
  peerId: string,
  sessionEpoch: string,
): void {
  const serverRtcEntityId = hamiltonianRtcPeerEntityId(sessionEpoch, "server")
  const browserRtcEntityId = hamiltonianRtcPeerEntityId(sessionEpoch, "browser")
  if (event.kind === "rtc-peer") {
    emitLifecycle(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: event.phase,
      subjectId: serverRtcEntityId,
      subjectKind: "rtc-peer",
      ownerId: processEntityId,
      attributes: {
        endpoint: "server",
        peerId,
        sessionEpoch,
        state: event.state,
        ...(event.reason ? {reason: event.reason} : {}),
      },
    }))
    return
  }
  const transportId = hamiltonianDataChannelTransportId(sessionEpoch, event.label)
  if (event.kind === "data-channel") {
    emitLifecycle(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: event.phase,
      subjectId: transportId,
      subjectKind: "data-channel",
      ownerId: serverRtcEntityId,
      sourceEntityId: serverRtcEntityId,
      targetEntityId: browserRtcEntityId,
      transportId,
      attributes: {
        endpoint: "server",
        lane: event.label,
        sessionEpoch,
        state: event.state,
      },
    }))
    return
  }
  const sent = event.phase === "sent"
  emitLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase: event.phase,
    subjectId: event.messageId,
    subjectKind: "data-channel-message",
    ownerId: serverRtcEntityId,
    sourceEntityId: sent ? serverRtcEntityId : browserRtcEntityId,
    targetEntityId: sent ? browserRtcEntityId : serverRtcEntityId,
    transportId,
    messageId: event.messageId,
    messageClass: event.messageClass,
    attributes: {
      lane: event.label,
      sequence: event.sequence,
      sessionEpoch,
    },
  }))
}

emitLifecycle(createHamiltonianLifecycleObservation({
  type: "entity",
  phase: "born",
  subjectId: processEntityId,
  subjectKind: "peer-process",
  ownerId: serverEntityId,
  attributes: {
    incarnation: processIncarnation,
    pid: process.pid,
    role: "peer",
    state: "starting",
  },
}))
emitLifecycle(createHamiltonianLifecycleObservation({
  type: "transport",
  phase: "opened",
  subjectId: ipcTransportId,
  subjectKind: "ipc",
  ownerId: processEntityId,
  sourceEntityId: serverEntityId,
  targetEntityId: processEntityId,
  transportId: ipcTransportId,
  attributes: {state: "connected"},
}))

async function closePeer(peerId?: string): Promise<void> {
  if (!peer || (peerId && peer.peerId !== peerId)) return
  const previous = peer
  peer = null
  await previous.close()
  sendObserved({kind: "peer-state", snapshot: previous.snapshot()})
}

async function handle(message: ParentMessage): Promise<void> {
  const incomingMessageId = messageId(message)
  if (incomingMessageId) observeMessage("received", incomingMessageId, message.kind)
  try {
    if (message?.kind === "stop") {
      await closePeer()
      emitLifecycle(createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "closed",
        subjectId: ipcTransportId,
        subjectKind: "ipc",
        ownerId: processEntityId,
        sourceEntityId: serverEntityId,
        targetEntityId: processEntityId,
        transportId: ipcTransportId,
        attributes: {reason: "stopped"},
      }))
      emitLifecycle(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "ended",
        subjectId: processEntityId,
        subjectKind: "peer-process",
        ownerId: serverEntityId,
        attributes: {incarnation: processIncarnation, pid: process.pid, role: "peer", state: "stopped"},
      }))
      setTimeout(() => process.exit(0), 0)
      return
    }
    if (message?.kind === "close-peer") {
      await closePeer(message.peerId)
      return
    }
    if (message?.kind === "begin") {
      await closePeer()
      const nextPeer = new WeriftPeer({
        peerId: message.peerId,
        sessionEpoch: message.sessionEpoch,
        ...(message.iceServers === undefined ? {} : {iceServers: message.iceServers}),
        ...(message.iceLite === undefined ? {} : {iceLite: message.iceLite}),
        initiator: true,
        onSignal: (signal) => sendObserved({kind: "peer-signal", peerId: message.peerId, signal}),
        onState: (snapshot: WeriftPeerSnapshot) => sendObserved({kind: "peer-state", snapshot}),
        onLifecycle: (event) => observePeerLifecycle(event, message.peerId, message.sessionEpoch),
        onError: (error) => sendObserved({kind: "peer-error", peerId: message.peerId, error: error.message}),
      })
      peer = nextPeer
      await nextPeer.start()
      sendObserved({kind: "peer-state", snapshot: nextPeer.snapshot()})
      return
    }
    if (message?.kind === "signal" && peer?.peerId === message.peerId) {
      await peer.signal(message.signal)
    }
  } catch (error) {
    sendObserved({
      kind: "peer-error",
      peerId: (message as {peerId?: string})?.peerId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

process.on("message", (rawMessage) => {
  const message = rawMessage as ParentMessage
  operations = operations.then(() => handle(message), () => handle(message))
})

process.on("disconnect", async () => {
  await operations
  await closePeer()
  process.exit(0)
})

emitLifecycle(createHamiltonianLifecycleObservation({
  type: "entity",
  phase: "changed",
  subjectId: processEntityId,
  subjectKind: "peer-process",
  ownerId: serverEntityId,
  attributes: {
    incarnation: processIncarnation,
    pid: process.pid,
    role: "peer",
    state: "active",
  },
}))
sendObserved({kind: "online", pid: process.pid})
