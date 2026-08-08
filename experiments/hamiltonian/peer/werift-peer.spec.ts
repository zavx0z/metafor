import {describe, expect, test} from "bun:test"
import {WeriftPeer, type PeerSignal} from "./werift-peer.ts"

describe("Bun WebRTC adapter", () => {
  test("connects two Bun peers with oracle and force DataChannels", async () => {
    let left!: WeriftPeer
    let right!: WeriftPeer
    const relay = (target: () => WeriftPeer) => (signal: PeerSignal) => {
      queueMicrotask(() => void target().signal(signal))
    }
    left = new WeriftPeer({
      peerId: "left",
      sessionEpoch: "rtc-session-1",
      initiator: true,
      serveProtocol: false,
      onSignal: relay(() => right),
    })
    right = new WeriftPeer({
      peerId: "right",
      sessionEpoch: "rtc-session-1",
      initiator: false,
      onSignal: relay(() => left),
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
    } finally {
      await Promise.all([left.close(), right.close()])
    }
  }, 15_000)
})
