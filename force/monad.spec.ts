import {beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessageInput, SourcedForceMessage} from "shared/protocol/force/message"
import {ForceLifecycle} from "./monad.ts"
import {forceDomains, type ForceDomain, type ForceStore} from "./store.ts"

const agentInflaton = (ts: number): ForceMessageInput => ({
  parts: [{part: "inflaton", op: "add", path: "wimp", ts, value: {src: "capsule", name: "Capsule"}}],
})

let lifecycle: ForceLifecycle
let recording: ReturnType<typeof createRecordingChannels>

const createRecordingChannels = () => {
  const messages = Object.fromEntries(
    forceDomains.map((domain) => [domain, [] as SourcedForceMessage[]]),
  ) as Record<ForceDomain, SourcedForceMessage[]>
  const channels = Object.fromEntries(forceDomains.map((domain) => [domain, {
    domain,
    send(message: SourcedForceMessage) {
      messages[domain].push(structuredClone(message))
    },
  }])) as ForceStore
  return {
    channels,
    deliveries: (domain: ForceDomain) => structuredClone(messages[domain]),
  }
}

beforeEach(() => {
  recording = createRecordingChannels()
  lifecycle = new ForceLifecycle()
})

const start = (): void => {
  lifecycle.start(recording.channels)
  for (const domain of forceDomains) lifecycle.channelReady(domain)
}

describe("ForceLifecycle", () => {
  test("enters running only after all five prepared channels are connected", () => {
    expect(lifecycle.status()).toEqual({
      ok: false,
      domain: "force",
      state: "created",
      requiredDomains: ["dark", "boundary", "matrix", "energy", "bulk"],
      connectedDomains: [],
      error: null,
    })

    expect(lifecycle.start(recording.channels)).toMatchObject({ok: false, state: "starting"})
    for (const domain of forceDomains) lifecycle.channelReady(domain)
    expect(lifecycle.status()).toEqual({
      ok: true,
      domain: "force",
      state: "running",
      requiredDomains: ["dark", "boundary", "matrix", "energy", "bulk"],
      connectedDomains: ["dark", "boundary", "matrix", "energy", "bulk"],
      error: null,
    })
  })

  test("accepts an agent Particle only in running state", () => {
    expect(lifecycle.acceptAgentParticle(agentInflaton(1))).toMatchObject({
      ok: false,
      reason: "not_running",
    })

    start()
    expect(lifecycle.acceptAgentParticle(agentInflaton(2))).toEqual({
      ok: true,
      delivered: ["dark", "bulk"],
      particle: {
        part: "inflaton",
        op: "add",
        path: "wimp",
        by: "agent",
        ts: 2,
        value: {src: "capsule", name: "Capsule"},
      },
    })
  })

  test("routes a numeric Energy z/test as an ordinary Particle", () => {
    start()
    const claim: SourcedForceMessage = {
      parts: [{part: "z", op: "test", path: 17, by: "energy", ts: 4, value: {energy: "energy-local"}}],
    }

    expect(lifecycle.acceptParticle("energy", claim)).toEqual({
      ok: true,
      delivered: ["dark", "boundary", "matrix", "bulk"],
    })
  })

  test("owns fail-stop when one domain channel is destroyed", () => {
    start()
    expect(lifecycle.acceptAgentParticle(agentInflaton(3)).ok).toBe(true)
    const darkBefore = recording.deliveries("dark")
    const bulkBefore = recording.deliveries("bulk")

    lifecycle.channelDestroyed("matrix", new Error("channel closed"))

    expect(lifecycle.acceptAgentParticle(agentInflaton(4))).toEqual({
      ok: false,
      reason: "not_running",
      error: "Force stopped: matrix channel was destroyed: channel closed",
    })
    expect(recording.deliveries("dark")).toEqual(darkBefore)
    expect(recording.deliveries("bulk")).toEqual(bulkBefore)
    expect(lifecycle.start(recording.channels)).toMatchObject({ok: false, state: "error"})
  })

  test("does not express fail-stop as a Particle", () => {
    start()
    lifecycle.channelDestroyed("energy", "connection lost")

    for (const domain of ["dark", "boundary", "matrix", "energy", "bulk"] as const) {
      expect(recording.deliveries(domain)).toEqual([])
    }
  })
})
