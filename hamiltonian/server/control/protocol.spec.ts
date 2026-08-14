import {describe, expect, test} from "bun:test"
import {
  HamiltonianLifecycleRetainedJournal,
  HamiltonianLifecycleSource,
  createHamiltonianLifecycleObservation,
} from "../../core/lifecycle.js"
import {
  isHamiltonianRealtimePayloadOnControlChannel,
  parseHamiltonianControlClientMessage,
} from "./protocol.ts"

function encode(value: unknown): string {
  return JSON.stringify(value)
}

const lifecycleJournal = new HamiltonianLifecycleRetainedJournal("service-worker:worker-a")
const lifecycleSnapshot = lifecycleJournal.snapshot()
const lifecycleSource = new HamiltonianLifecycleSource({
  id: "page:page-a",
  kind: "page",
  incarnation: "page-a",
  startedAt: 1,
})
const lifecycleRetirement = lifecycleSource.next(createHamiltonianLifecycleObservation({
  type: "entity",
  phase: "ended",
  subjectId: "service-worker:worker-old",
  subjectKind: "service-worker",
  ownerId: "browser:profile-a",
}))

describe("Hamiltonian control protocol", () => {
  test("accepts the eight existing control message kinds", () => {
    const messages = [
      {
        kind: "tabs",
        windows: [{tabId: "tab-a", joinedAt: 1, visible: true}],
      },
      {
        kind: "pong",
        at: 2,
        seq: 3,
        workerIdentity: "worker-a",
        workerRuntimeIncarnation: "runtime-a",
      },
      {
        kind: "identity",
        workerIdentity: "worker-a",
        workerRuntimeIncarnation: "runtime-a",
        workerCodeVersion: "1.0.0",
        resumeNonce: "resume-a",
        lifecycleSnapshot,
      },
      {
        kind: "browser-lifecycle-snapshot",
        snapshot: lifecycleSnapshot,
      },
      {
        kind: "push-subscription",
        registrationId: "registration-a",
        subscription: {
          endpoint: "https://push.example/subscription-a",
          keys: {p256dh: "AQ", auth: "Ag"},
        },
      },
      {
        kind: "lifecycle-retirement",
        envelope: lifecycleRetirement,
      },
      {
        kind: "peer-signal",
        peerId: "peer-a",
        sessionEpoch: "epoch-a",
        peerGeneration: 1,
        authorityKey: "authority-a",
        tabId: "tab-a",
        signal: {type: "candidate", candidate: null},
      },
      {
        kind: "peer-failed",
        peerId: "peer-a",
        sessionEpoch: "epoch-a",
        peerGeneration: 1,
        authorityKey: "authority-a",
        tabId: "tab-a",
        reason: "connection-failed",
      },
    ]

    expect(messages.map((message) => parseHamiltonianControlClientMessage(encode(message))?.kind))
      .toEqual([
        "tabs",
        "pong",
        "identity",
        "browser-lifecycle-snapshot",
        "push-subscription",
        "lifecycle-retirement",
        "peer-signal",
        "peer-failed",
      ])
  })

  test("preserves a valid lifecycle monitor and rejects invalid monitor identity", () => {
    const message = {
      kind: "tabs" as const,
      windows: [],
      monitor: {
        messageId: "message:tabs-a",
        transportId: "websocket:control-a",
      },
    }
    expect(parseHamiltonianControlClientMessage(encode(message))).toEqual(message)
    expect(parseHamiltonianControlClientMessage(encode({
      ...message,
      monitor: {...message.monitor, transportId: "rtc:control-a"},
    }))).toBeNull()
    expect(parseHamiltonianControlClientMessage(encode({
      ...message,
      monitor: {...message.monitor, messageId: `message:${"x".repeat(505)}`},
    }))).toBeNull()
  })

  test("enforces frame and structured field limits", () => {
    expect(parseHamiltonianControlClientMessage(Buffer.from(encode({kind: "tabs", windows: []}))))
      .toEqual({kind: "tabs", windows: []})
    expect(parseHamiltonianControlClientMessage(`{${"x".repeat(128 * 1024)}}`)).toBeNull()
    expect(parseHamiltonianControlClientMessage(encode({
      kind: "tabs",
      windows: Array.from({length: 65}, (_, index) => ({
        tabId: `tab-${index}`,
        joinedAt: index,
        visible: true,
      })),
    }))).toBeNull()
    expect(parseHamiltonianControlClientMessage(encode({
      kind: "peer-signal",
      peerId: "peer-a",
      sessionEpoch: "epoch-a",
      peerGeneration: 0,
      authorityKey: "authority-a",
      tabId: "tab-a",
      signal: {type: "candidate", candidate: null},
    }))).toBeNull()
  })

  test("validates lifecycle retirement envelopes", () => {
    expect(parseHamiltonianControlClientMessage(encode({
      kind: "lifecycle-retirement",
      envelope: lifecycleRetirement,
    }))?.kind).toBe("lifecycle-retirement")
    expect(parseHamiltonianControlClientMessage(encode({
      kind: "lifecycle-retirement",
      envelope: {...lifecycleRetirement, version: 2},
    }))).toBeNull()
  })

  test("recognizes Oracle and Force payloads forbidden on the control channel", () => {
    for (const payload of [
      {lane: "oracle"},
      {lane: "force"},
      {kind: "oracle.request"},
      {kind: "force-event"},
    ]) {
      expect(isHamiltonianRealtimePayloadOnControlChannel(encode(payload))).toBeTrue()
    }
    expect(isHamiltonianRealtimePayloadOnControlChannel(encode({kind: "tabs", windows: []})))
      .toBeFalse()
    expect(isHamiltonianRealtimePayloadOnControlChannel("not-json")).toBeFalse()
  })
})
