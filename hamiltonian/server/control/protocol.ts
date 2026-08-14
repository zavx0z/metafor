import {
  isHamiltonianLifecycleEnvelope,
  isHamiltonianLifecycleSnapshot,
  isHamiltonianNodeSystemDeclaration,
  type HamiltonianLifecycleEnvelope,
  type HamiltonianLifecycleSnapshot,
  type HamiltonianNodeSystemDeclaration,
} from "../../core/lifecycle.js"
import {isHamiltonianServiceWorkerCodeVersion} from "../../update/shared/service-worker-release.js"
import type {PeerSignal} from "../peer/werift-peer.ts"
import {
  validateWebPushSubscription,
  validPublicId,
  type WebPushSubscriptionJSON,
} from "@metafor/web-push/protocol"

export interface HamiltonianControlWindowCandidate {
  tabId: string
  joinedAt: number
  visible: boolean
}

export interface HamiltonianControlTabsMessage {
  kind: "tabs"
  windows: HamiltonianControlWindowCandidate[]
}

export interface HamiltonianControlPongMessage {
  kind: "pong"
  at: number
  seq: number
  workerIdentity: string
  workerRuntimeIncarnation: string
}

export interface HamiltonianControlIdentityMessage {
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

export interface HamiltonianControlBrowserLifecycleSnapshotMessage {
  kind: "browser-lifecycle-snapshot"
  snapshot: HamiltonianLifecycleSnapshot
  declaration?: HamiltonianNodeSystemDeclaration
}

export interface HamiltonianControlPushSubscriptionMessage {
  kind: "push-subscription"
  registrationId: string
  subscription: WebPushSubscriptionJSON
}

export interface HamiltonianControlPeerSignalMessage {
  kind: "peer-signal"
  peerId: string
  sessionEpoch: string
  peerGeneration: number
  authorityKey: string
  tabId: string
  signal: PeerSignal
}

export interface HamiltonianControlPeerFailedMessage {
  kind: "peer-failed"
  peerId: string
  sessionEpoch: string
  peerGeneration: number
  authorityKey: string
  tabId: string
  reason: string
}

export interface HamiltonianControlLifecycleMonitor {
  messageId: string
  transportId: string
}

export interface HamiltonianControlLifecycleRetirementMessage {
  kind: "lifecycle-retirement"
  envelope: HamiltonianLifecycleEnvelope
}

type HamiltonianControlMessage =
  | HamiltonianControlTabsMessage
  | HamiltonianControlPongMessage
  | HamiltonianControlIdentityMessage
  | HamiltonianControlPushSubscriptionMessage
  | HamiltonianControlPeerSignalMessage
  | HamiltonianControlPeerFailedMessage
  | HamiltonianControlLifecycleRetirementMessage
  | HamiltonianControlBrowserLifecycleSnapshotMessage

export type HamiltonianControlClientMessage = HamiltonianControlMessage & {
  monitor?: HamiltonianControlLifecycleMonitor
}

export function parseHamiltonianControlClientMessage(
  value: string | Buffer,
): HamiltonianControlClientMessage | null {
  if (value.length > 128 * 1024) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(typeof value === "string" ? value : value.toString())
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) return null

  const monitor = parseHamiltonianControlLifecycleMonitor(parsed)
  if (monitor === null) return null

  if (
    parsed.kind === "pong" &&
    "at" in parsed && typeof parsed.at === "number" &&
    "seq" in parsed && typeof parsed.seq === "number" &&
    "workerIdentity" in parsed && validPublicId(parsed.workerIdentity) &&
    "workerRuntimeIncarnation" in parsed && validPublicId(parsed.workerRuntimeIncarnation)
  ) {
    return withHamiltonianControlLifecycleMonitor({
      kind: "pong",
      at: parsed.at,
      seq: parsed.seq,
      workerIdentity: parsed.workerIdentity,
      workerRuntimeIncarnation: parsed.workerRuntimeIncarnation,
    }, monitor)
  }

  if (
    parsed.kind === "identity" &&
    "workerIdentity" in parsed && validPublicId(parsed.workerIdentity) &&
    "workerRuntimeIncarnation" in parsed && validPublicId(parsed.workerRuntimeIncarnation) &&
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
      ("wakeId" in parsed && validPublicId(parsed.wakeId) &&
        "wakeProof" in parsed && validPublicId(parsed.wakeProof))
    )
  ) {
    return withHamiltonianControlLifecycleMonitor({
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
    return withHamiltonianControlLifecycleMonitor({
      kind: "browser-lifecycle-snapshot",
      snapshot: parsed.snapshot,
      ...("declaration" in parsed && isHamiltonianNodeSystemDeclaration(parsed.declaration)
        ? {declaration: parsed.declaration}
        : {}),
    }, monitor)
  }

  if (
    parsed.kind === "push-subscription" &&
    "registrationId" in parsed && validPublicId(parsed.registrationId) &&
    "subscription" in parsed && isHamiltonianControlPushSubscription(parsed.subscription)
  ) {
    return withHamiltonianControlLifecycleMonitor({
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
    return withHamiltonianControlLifecycleMonitor({
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
    "signal" in parsed && validHamiltonianControlPeerSignal(parsed.signal)
  ) {
    return withHamiltonianControlLifecycleMonitor({
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
    return withHamiltonianControlLifecycleMonitor({
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

  const windows: HamiltonianControlWindowCandidate[] = []
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
  return withHamiltonianControlLifecycleMonitor({kind: "tabs", windows}, monitor)
}

export function isHamiltonianRealtimePayloadOnControlChannel(value: string | Buffer): boolean {
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

function parseHamiltonianControlLifecycleMonitor(
  value: object,
): HamiltonianControlLifecycleMonitor | null | undefined {
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

function withHamiltonianControlLifecycleMonitor<T extends HamiltonianControlMessage>(
  message: T,
  monitor: HamiltonianControlLifecycleMonitor | undefined,
): T & {monitor?: HamiltonianControlLifecycleMonitor} {
  return monitor === undefined ? message : {...message, monitor}
}

function validHamiltonianControlPeerSignal(value: unknown): value is PeerSignal {
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

function isHamiltonianControlPushSubscription(value: unknown): value is WebPushSubscriptionJSON {
  try {
    validateWebPushSubscription(value)
    return true
  } catch {
    return false
  }
}
