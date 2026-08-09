import {describe, expect, test} from "bun:test"
import {WeriftPeer, type PeerSignal, type WeriftPeerLifecycleEvent} from "./werift-peer.ts"

describe("Bun WebRTC adapter", () => {
  test("connects two Bun peers with oracle and force DataChannels", async () => {
    const startedAt = performance.now()
    let left!: WeriftPeer
    let right!: WeriftPeer
    const leftLifecycle: WeriftPeerLifecycleEvent[] = []
    const rightLifecycle: WeriftPeerLifecycleEvent[] = []
    const relay = (target: () => WeriftPeer) => (signal: PeerSignal) => {
      queueMicrotask(() => void target().signal(signal))
    }
    left = new WeriftPeer({
      peerId: "left",
      sessionEpoch: "rtc-session-1",
      initiator: true,
      serveProtocol: false,
      onSignal: relay(() => right),
      onLifecycle: (event) => leftLifecycle.push(event),
    })
    right = new WeriftPeer({
      peerId: "right",
      sessionEpoch: "rtc-session-1",
      initiator: false,
      iceLite: true,
      onSignal: relay(() => left),
      onLifecycle: (event) => rightLifecycle.push(event),
    })

    try {
      await left.start()
      const [leftProtocol, rightProtocol] = await Promise.all([
        left.protocolReady,
        right.protocolReady,
      ])
      const response = await leftProtocol.request("probe", {value: 42})
      const echo = new Promise((resolve) => leftProtocol.onForce(resolve))
      leftProtocol.publishForce({kind: "particle", value: 7})

      expect(response).toMatchObject({
        echo: {value: 42},
        peerId: "right",
        sessionEpoch: "rtc-session-1",
      })
      expect(await echo).toMatchObject({
        particle: {echo: {kind: "particle", value: 7}, receivedSequence: 1},
      })
      expect(left.snapshot().channels.sort()).toEqual(["force", "oracle"])
      expect(right.snapshot()).toMatchObject({oracleRequests: 1, forceEvents: 1})
      expect(performance.now() - startedAt).toBeLessThan(2_000)
      expect(leftLifecycle).toContainEqual({kind: "rtc-peer", phase: "born", state: "new"})
      expect(rightLifecycle).toContainEqual({kind: "rtc-peer", phase: "born", state: "new"})
      expect(leftLifecycle).toContainEqual(expect.objectContaining({
        kind: "data-channel",
        phase: "opened",
        label: "oracle",
        state: "open",
      }))
      const leftSent = leftLifecycle.filter((event) =>
        event.kind === "data-channel-message" && event.phase === "sent"
      )
      expect(leftSent.length).toBeGreaterThanOrEqual(2)
      for (const event of leftSent) {
        if (event.kind !== "data-channel-message") continue
        expect(rightLifecycle).toContainEqual(expect.objectContaining({
          kind: "data-channel-message",
          phase: "received",
          label: event.label,
          messageId: event.messageId,
          messageClass: event.messageClass,
          sequence: event.sequence,
        }))
      }
    } finally {
      await Promise.all([left.close(), right.close()])
    }
  }, 15_000)
})
