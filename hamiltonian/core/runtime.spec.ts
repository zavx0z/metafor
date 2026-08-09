import {describe, expect, test} from "bun:test"
import {
  FencedLedger,
  GenerationRegistry,
  LeaseAuthority,
  LogicalChannelSession,
  PeerProtocol,
  ReconnectPolicy,
} from "./runtime.js"
import {
  HAMILTONIAN_HIDDEN_WORKER_QUIET_MS,
  HAMILTONIAN_PAGE_HEARTBEAT_MS,
  HAMILTONIAN_VISIBLE_WORKER_QUIET_MS,
  disposeFailedWorker,
  ExclusiveResourceSlot,
  isCurrentLeaderPeerControl,
  isCurrentPageChannel,
  isCurrentPeerGeneration,
  isCurrentWindowChannel,
  mainRealmRequiresReload,
  sourceRevisionRequiresReload,
  pageWorkerChannelIsQuiet,
} from "./browser-control.js"

class FakeChannel extends EventTarget {
  readyState = "open"
  bufferedAmount = 0
  bufferedAmountLowThreshold = 0
  peer: FakeChannel | null = null
  held: string[] = []
  hold = false

  send(frame: string) {
    this.bufferedAmount += frame.length
    if (this.hold) {
      this.held.push(frame)
      return
    }
    queueMicrotask(() => {
      this.bufferedAmount = 0
      this.dispatchEvent(new Event("bufferedamountlow"))
      this.peer?.dispatchEvent(new MessageEvent("message", {data: frame}))
    })
  }

  release(index = 0) {
    const frame = this.held.splice(index, 1)[0]
    if (frame) this.peer?.dispatchEvent(new MessageEvent("message", {data: frame}))
    this.bufferedAmount = this.held.reduce((sum, item) => sum + item.length, 0)
    this.dispatchEvent(new Event("bufferedamountlow"))
  }

  close() {
    if (this.readyState === "closed") return
    this.readyState = "closed"
    this.dispatchEvent(new Event("close"))
  }
}

function channelPair(): [FakeChannel, FakeChannel] {
  const left = new FakeChannel()
  const right = new FakeChannel()
  left.peer = right
  right.peer = left
  return [left, right]
}

function protocolPair(options: Record<string, unknown> = {}) {
  const [leftOracle, rightOracle] = channelPair()
  const [leftForce, rightForce] = channelPair()
  const leftEvents: unknown[] = []
  const rightEvents: unknown[] = []
  const leftSession = new LogicalChannelSession({
    sessionEpoch: "session-1",
    lanes: {oracle: leftOracle, force: leftForce},
    onProtocolEvent: (event: unknown) => leftEvents.push(event),
    ...options,
  })
  const rightSession = new LogicalChannelSession({
    sessionEpoch: "session-1",
    lanes: {oracle: rightOracle, force: rightForce},
    onProtocolEvent: (event: unknown) => rightEvents.push(event),
    ...options,
  })
  let nextId = 0
  return {
    left: new PeerProtocol(leftSession, {ids: () => `rpc-${++nextId}`}),
    right: new PeerProtocol(rightSession, {ids: () => `remote-${++nextId}`}),
    leftSession,
    rightSession,
    leftEvents,
    rightEvents,
    channels: {leftOracle, rightOracle, leftForce, rightForce},
  }
}

describe("shared Hamiltonian core", () => {
  test("forwards signaling and peer failure only after the current control connection owns the leader", () => {
    const input = {
      leader: {connectionId: "connection-current", deviceId: "device-a", tabId: "tab-a"},
      deviceId: "device-a",
      tabId: "tab-a",
      connectionId: "connection-current",
    }
    expect(isCurrentLeaderPeerControl({...input, message: {kind: "peer-signal", tabId: "tab-a"}})).toBeTrue()
    expect(isCurrentLeaderPeerControl({...input, message: {kind: "peer-failed", tabId: "tab-a"}})).toBeTrue()
    expect(isCurrentLeaderPeerControl({
      ...input,
      connectionId: "connection-reconnecting",
      message: {kind: "peer-signal", tabId: "tab-a"},
    })).toBeFalse()
    expect(isCurrentLeaderPeerControl({...input, message: {kind: "force.event", tabId: "tab-a"}})).toBeFalse()
  })

  test("does not let an async error from a stale peer generation affect its replacement", () => {
    const replacement = {
      peerId: "peer-new",
      sessionEpoch: "session-new",
      peerGeneration: 2,
      authorityKey: "authority-a",
    }
    expect(isCurrentPeerGeneration(replacement, replacement)).toBeTrue()
    expect(isCurrentPeerGeneration(replacement, {
      peerId: "peer-old",
      sessionEpoch: "session-old",
      peerGeneration: 1,
      authorityKey: "authority-a",
    })).toBeFalse()
  })

  test("does not let a late close from a stale socket clear its replacement", () => {
    const slot = new ExclusiveResourceSlot<{readyState: string}>()
    const stale = {readyState: "closing"}
    const replacement = {readyState: "connecting"}
    expect(slot.attach(stale)).toBeTrue()
    expect(slot.attach(replacement)).toBeFalse()
    expect(slot.clearIfCurrent(stale)).toBeTrue()
    expect(slot.attach(replacement)).toBeTrue()
    expect(slot.clearIfCurrent(stale)).toBeFalse()
    expect(slot.current).toBe(replacement)
  })

  test("terminates a failed Dedicated Worker without clearing a replacement generation", () => {
    const terminated: string[] = []
    const failed = {worker: {terminate: () => terminated.push("failed")}}
    const replacement = {worker: {terminate: () => terminated.push("replacement")}}
    expect(disposeFailedWorker(failed, failed)).toBeNull()
    expect(disposeFailedWorker(replacement, failed)).toBe(replacement)
    expect(terminated).toEqual(["failed", "failed"])
  })

  test("reloads a version only when replacing an active main in the current page realm", () => {
    expect(mainRealmRequiresReload(true, "v1:hash-a", "v2:hash-b")).toBeTrue()
    expect(mainRealmRequiresReload(true, "v2:hash-b", "v2:hash-b")).toBeFalse()
    expect(mainRealmRequiresReload(true, null, "v2:hash-b")).toBeTrue()
    expect(mainRealmRequiresReload(false, "v1:hash-a", "v2:hash-b")).toBeFalse()
    expect(mainRealmRequiresReload(false, null, "v2:hash-b")).toBeFalse()
  })

  test("reloads one time for each non-empty dev source revision", () => {
    expect(sourceRevisionRequiresReload(null, "host:1:hash")).toBeTrue()
    expect(sourceRevisionRequiresReload("host:1:hash", "host:1:hash")).toBeFalse()
    expect(sourceRevisionRequiresReload("host:1:hash", "host:2:hash")).toBeTrue()
    expect(sourceRevisionRequiresReload("host:1:hash", "")).toBeFalse()
  })

  test("wakes a dead Service Worker quickly without mistaking background throttling for death", () => {
    expect(HAMILTONIAN_PAGE_HEARTBEAT_MS).toBe(500)
    expect(HAMILTONIAN_VISIBLE_WORKER_QUIET_MS).toBe(1_000)
    expect(HAMILTONIAN_HIDDEN_WORKER_QUIET_MS).toBe(3_500)
    expect(pageWorkerChannelIsQuiet({now: 2_000, lastWorkerMessageAt: 1_000, visibility: "visible"})).toBeFalse()
    expect(pageWorkerChannelIsQuiet({now: 2_001, lastWorkerMessageAt: 1_000, visibility: "visible"})).toBeTrue()
    expect(pageWorkerChannelIsQuiet({now: 4_500, lastWorkerMessageAt: 1_000, visibility: "hidden"})).toBeFalse()
    expect(pageWorkerChannelIsQuiet({now: 4_501, lastWorkerMessageAt: 1_000, visibility: "hidden"})).toBeTrue()
  })

  test("uses host epoch plus fencing token and rejects an expired or stale holder", () => {
    const authority = new LeaseAuthority({hostEpoch: "host-a", durationMs: 100})
    const first = authority.grant("connection-a", "main-a", 1_000)
    const ledger = new FencedLedger()
    ledger.setAuthority(first)
    ledger.append(first, "accepted", 1_050)

    const second = authority.grant("connection-b", "main-b", 1_060)
    ledger.setAuthority(second)
    expect(() => ledger.append(first, "stale", 1_070)).toThrow("stale-fencing-token")
    expect(() => ledger.append(second, "expired", 1_161)).toThrow("authority-expired")
    expect(ledger.values()).toEqual(["accepted"])
  })

  test("has deterministic exponential reconnect and reset", () => {
    const policy = new ReconnectPolicy({baseMs: 100, maxMs: 250, jitter: () => 0})
    expect([policy.nextDelay(), policy.nextDelay(), policy.nextDelay()]).toEqual([100, 200, 250])
    policy.reset()
    expect(policy.nextDelay()).toBe(100)
  })

  test("does not let a stale channel delete its replacement", () => {
    const registry = new GenerationRegistry()
    const stale = {generation: 1}
    const current = {generation: 2}
    registry.set("window-a", stale)
    registry.set("window-a", current)

    expect(registry.deleteIfCurrent("window-a", stale)).toBeFalse()
    expect(registry.get("window-a")).toBe(current)
    expect(registry.deleteIfCurrent("window-a", current)).toBeTrue()
  })

  test("does not let a replaced Window channel forward a queued control message", () => {
    const registry = new GenerationRegistry()
    const stale = {tabId: "window-a", generation: 1}
    const current = {tabId: "window-a", generation: 2}
    registry.set(stale.tabId, stale)
    registry.set(current.tabId, current)

    expect(isCurrentWindowChannel(registry, stale)).toBeFalse()
    expect(isCurrentWindowChannel(registry, current)).toBeTrue()
  })

  test("does not let a replaced page MessagePort report a stale worker incarnation", () => {
    const stale = {generation: 1}
    const current = {generation: 2}
    expect(isCurrentPageChannel(current, stale)).toBeFalse()
    expect(isCurrentPageChannel(current, current)).toBeTrue()
  })

  test("routes RPC and Force through separate native channels", async () => {
    const pair = protocolPair()
    pair.right.register("sum", ({left, right}: {left: number; right: number}) => left + right)
    const force: unknown[] = []
    pair.right.onForce((event: unknown) => force.push(event))

    const result = await pair.left.request("sum", {left: 2, right: 3})
    pair.left.publishForce({kind: "particle", value: 7}, 11)
    await Bun.sleep(0)

    expect(result).toBe(5)
    expect(force).toEqual([{
      type: "force.event",
      sequence: 1,
      appliedThrough: 11,
      particle: {kind: "particle", value: 7},
    }])
    expect(pair.leftSession.stats().oracle.sent).toBe(1)
    expect(pair.leftSession.stats().force.sent).toBe(1)
  })

  test("reports a logical message only when its native DataChannel send or receive occurs", async () => {
    const [leftOracle, rightOracle] = channelPair()
    const [leftForce, rightForce] = channelPair()
    const leftTraffic: unknown[] = []
    const rightTraffic: unknown[] = []
    let nextMessageId = 0
    const left = new LogicalChannelSession({
      sessionEpoch: "traffic-session",
      lanes: {oracle: leftOracle, force: leftForce},
      messageIds: () => `rtc-message:${++nextMessageId}`,
      onTraffic: (event: unknown) => leftTraffic.push(event),
    })
    new LogicalChannelSession({
      sessionEpoch: "traffic-session",
      lanes: {oracle: rightOracle, force: rightForce},
      onTraffic: (event: unknown) => rightTraffic.push(event),
    })
    left.send("oracle", {type: "rpc.request", id: "one"})
    left.send("force", {type: "force.event", sequence: 1})
    await Bun.sleep(0)
    expect(leftTraffic).toEqual([
      {lane: "oracle", direction: "forward", messageClass: "rpc.request", messageId: "rtc-message:1", sequence: 1},
      {lane: "force", direction: "forward", messageClass: "force.event", messageId: "rtc-message:2", sequence: 1},
    ])
    expect(rightTraffic).toEqual([
      {lane: "oracle", direction: "reverse", messageClass: "rpc.request", messageId: "rtc-message:1", sequence: 1},
      {lane: "force", direction: "reverse", messageClass: "force.event", messageId: "rtc-message:2", sequence: 1},
    ])
  })

  test("bounds backpressure independently without consuming a rejected sequence", async () => {
    const pair = protocolPair({highWaterMark: 1, maxQueuedMessagesPerLane: 1, maxQueuedBytesPerLane: 1_024})
    pair.channels.leftOracle.bufferedAmount = 10
    pair.leftSession.send("oracle", {value: "first"})
    expect(() => pair.leftSession.send("oracle", {value: "second"})).toThrow("backpressure-limit:oracle")
    expect(() => pair.leftSession.send("force", {value: "independent"})).not.toThrow()
    pair.channels.leftOracle.bufferedAmount = 0
    pair.channels.leftOracle.dispatchEvent(new Event("bufferedamountlow"))
    await Bun.sleep(0)
    pair.leftSession.send("oracle", {value: "after-drain"})
    await Bun.sleep(0)
    expect(pair.rightEvents).not.toContainEqual(expect.objectContaining({kind: "gap", lane: "oracle"}))
  })

  test("does not consume a Force event sequence when backpressure rejects the send", async () => {
    const pair = protocolPair({highWaterMark: 1, maxQueuedMessagesPerLane: 1, maxQueuedBytesPerLane: 1_024})
    const delivered: Array<{sequence: number}> = []
    pair.right.onForce((event: {sequence: number}) => delivered.push(event))
    pair.channels.leftForce.bufferedAmount = 10
    expect(pair.left.publishForce({value: "queued"})).toBe(1)
    expect(() => pair.left.publishForce({value: "rejected"})).toThrow("backpressure-limit:force")
    pair.channels.leftForce.bufferedAmount = 0
    pair.channels.leftForce.dispatchEvent(new Event("bufferedamountlow"))
    await Bun.sleep(0)
    expect(pair.left.publishForce({value: "after-drain"})).toBe(2)
    await Bun.sleep(0)
    expect(delivered.map((event) => event.sequence)).toEqual([1, 2])
  })

  test("rejects an oversized frame before it reaches a carrier", () => {
    const pair = protocolPair({maxFrameBytes: 128})
    expect(() => pair.leftSession.send("oracle", {value: "x".repeat(256)})).toThrow("frame-too-large:oracle")
    expect(pair.leftSession.stats().oracle.sent).toBe(0)
  })

  test("fails the whole peer session on a sequence gap without delivering the later frame", () => {
    const pair = protocolPair()
    const delivered: unknown[] = []
    pair.rightSession.on("force", (payload: unknown) => delivered.push(payload))
    pair.channels.leftForce.hold = true
    pair.leftSession.send("force", {value: 1})
    pair.leftSession.send("force", {value: 2})
    pair.channels.leftForce.release(1)

    expect(pair.rightEvents).toContainEqual({kind: "gap", lane: "force", expected: 1, actual: 2})
    expect(pair.rightEvents).toContainEqual({kind: "session-close", reason: "sequence-gap:force"})
    expect(delivered).toEqual([])
  })

  test("fails closed when a frame from a stale session epoch reaches a repaired carrier", () => {
    const pair = protocolPair()
    pair.channels.rightForce.dispatchEvent(new MessageEvent("message", {data: JSON.stringify({
      sessionEpoch: "stale-session",
      lane: "force",
      sequence: 1,
      payload: {value: "must-not-arrive"},
    })}))

    expect(pair.rightEvents).toContainEqual({
      kind: "session-epoch-mismatch",
      lane: "force",
      expected: "session-1",
      actual: "stale-session",
    })
    expect(pair.rightEvents).toContainEqual({
      kind: "session-close",
      reason: "session-epoch-mismatch:force",
    })
  })

  test("fails pending RPC when the physical session is lost", async () => {
    const pair = protocolPair()
    pair.channels.leftOracle.hold = true
    const pending = pair.left.request("never", {})
    pair.left.close("transport-lost")
    expect(pending).rejects.toThrow("transport-lost")
  })

  test("treats one native lane closing as loss of the whole peer session", async () => {
    const pair = protocolPair()
    pair.channels.leftOracle.hold = true
    const pending = pair.left.request("never", {})
    pair.channels.leftOracle.close()

    await expect(pending).rejects.toThrow("lane-lost:oracle")
    expect(pair.channels.leftForce.readyState).toBe("closed")
    expect(pair.leftEvents).toContainEqual({kind: "session-close", reason: "lane-lost:oracle"})
  })

  test("times out an unanswered RPC without leaking it into Force", async () => {
    const pair = protocolPair()
    pair.channels.leftOracle.hold = true
    await expect(pair.left.request("never", {}, {timeoutMs: 5})).rejects.toThrow("rpc-timeout")
    expect(pair.leftSession.stats().force.sent).toBe(0)
  })

  test("aborts an active remote RPC handler after timeout cancellation", async () => {
    const pair = protocolPair()
    let aborted = false
    pair.right.register("slow", (_params: unknown, {signal}: {signal: AbortSignal}) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", () => {
          aborted = true
          resolve("cancelled")
        }, {once: true})
      }))

    await expect(pair.left.request("slow", {}, {timeoutMs: 5})).rejects.toThrow("rpc-timeout")
    await Bun.sleep(0)
    expect(aborted).toBeTrue()
  })

  test("propagates caller cancellation to the active remote RPC handler", async () => {
    const pair = protocolPair()
    const controller = new AbortController()
    let remoteReason: unknown = null
    pair.right.register("slow", (_params: unknown, {signal}: {signal: AbortSignal}) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", () => {
          remoteReason = signal.reason
          resolve("cancelled")
        }, {once: true})
      }))

    const pending = pair.left.request("slow", {}, {signal: controller.signal, timeoutMs: 1_000})
    await Bun.sleep(0)
    controller.abort(new Error("caller-cancelled"))

    await expect(pending).rejects.toThrow("caller-cancelled")
    await Bun.sleep(0)
    expect(remoteReason).toBe("remote-cancel")
  })
})
