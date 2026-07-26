import {beforeEach, describe, expect, test} from "bun:test"
import type {Part} from "shared/protocol/force/particle"
import type {ForceMessageInput, SourcedForceMessage} from "shared/protocol/force/message"
import {ForceLifecycle} from "./lifecycle.ts"
import {forceDomains, type ForceDomain, type ForceStore} from "./store.ts"

const agentInflaton = (ts: number): ForceMessageInput => ({
  parts: [{part: "inflaton", op: "add", path: "wimp", ts, value: {src: "capsule", name: "Capsule"}}],
})

const agentRemove = (ts: number): ForceMessageInput => ({
  parts: [{part: "inflaton", op: "remove", path: "wimp", ts, value: {src: "zavx0z/capsule"}}],
})

let lifecycle: ForceLifecycle
let recording: ReturnType<typeof createRecordingChannels>
let accepted: SourcedForceMessage["parts"][0][]

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
  accepted = []
  lifecycle = new ForceLifecycle({
    accept(particle) {
      accepted.push(structuredClone(particle))
      return {} as never
    },
  })
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
    expect(accepted).toEqual([{
      part: "inflaton",
      op: "add",
      path: "wimp",
      by: "agent",
      ts: 2,
      value: {src: "capsule", name: "Capsule"},
    }])
  })

  test("accepts and sources the agent WIMP remove through the same Force Monad ingress", () => {
    start()

    expect(lifecycle.acceptAgentParticle(agentRemove(5))).toEqual({
      ok: true,
      delivered: ["dark", "bulk"],
      particle: {
        part: "inflaton",
        op: "remove",
        path: "wimp",
        by: "agent",
        ts: 5,
        value: {src: "zavx0z/capsule"},
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
    expect(accepted).toEqual([claim.parts[0]])
  })

  test("persists direct Gluon and Higgs mutations before Boundary delivery", () => {
    start()
    const gluon: SourcedForceMessage = {
      parts: [{part: "gluon", op: "replace", path: 17, by: "matrix", ts: 5, value: {fields: {1: 2}}}],
    }
    const higgs: SourcedForceMessage = {
      parts: [{part: "higgs", op: "add", path: 17, by: "energy", ts: 6, value: {field: 1}}],
    }

    expect(lifecycle.acceptParticle("matrix", gluon)).toEqual({ok: true, delivered: ["boundary"]})
    expect(lifecycle.acceptParticle("energy", higgs)).toEqual({ok: true, delivered: ["boundary"]})
    expect(accepted).toEqual([gluon.parts[0], higgs.parts[0]])
    expect(recording.deliveries("dark")).toEqual([])
    expect(recording.deliveries("boundary")).toEqual([gluon, higgs])
  })

  test("persists every Force Particle kind through the same acceptance point before routing", () => {
    start()
    const parts: Part[] = ["inflaton", "graviton", "photon", "gluon", "higgs", "w+", "w-", "z"]

    for (const [index, part] of parts.entries()) {
      const message: SourcedForceMessage = {
        parts: [{
          part,
          op: "test",
          path: index,
          by: "matrix",
          ts: index,
          value: {part},
        }],
      }
      expect(lifecycle.acceptParticle("matrix", message).ok).toBe(true)
      expect(accepted.at(-1)).toEqual(message.parts[0])
    }

    expect(accepted.map((particle) => particle.part)).toEqual(parts)
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

  test("persists before routing and fail-stops without delivery when history append fails", () => {
    recording = createRecordingChannels()
    lifecycle = new ForceLifecycle({
      accept() {
        throw new Error("history fsync failed")
      },
    })
    start()

    expect(lifecycle.acceptAgentParticle(agentInflaton(9))).toEqual({
      ok: false,
      reason: "runtime_error",
      error: "Force stopped: runtime could not transfer a Particle: history fsync failed",
    })
    expect(recording.deliveries("dark")).toEqual([])
    expect(recording.deliveries("bulk")).toEqual([])
    expect(lifecycle.status()).toMatchObject({state: "error"})
  })
})
