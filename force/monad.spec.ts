import {beforeEach, describe, expect, test} from "bun:test"
import type {SourcedForceMessage} from "@metafor/types/force/message"
import {ForceMonad} from "./monad.ts"
import {forceDomains, type ForceDomain, type ForceStore} from "./store.ts"

const request = (body: unknown): Request => new Request("http://force.test/force", {
  method: "POST",
  headers: {"content-type": "application/json"},
  body: JSON.stringify(body),
})

const agentInflaton = (ts: number) => ({
  parts: [{part: "inflaton", op: "add", path: "wimp", ts, value: {src: "capsule", name: "Capsule"}}],
})

let monad: ForceMonad
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
  monad = new ForceMonad()
})

const start = (): void => {
  monad.onServerStarted(recording.channels)
  for (const domain of forceDomains) monad.onDomainChannelReady(domain)
}

describe("Force Monad", () => {
  test("enters running only after all five prepared channels are connected", async () => {
    expect(await monad.onHealthRequested().json()).toEqual({
      ok: false,
      domain: "force",
      state: "created",
      requiredDomains: ["dark", "boundary", "matrix", "energy", "bulk"],
      connectedDomains: [],
      error: null,
    })

    expect(monad.onServerStarted(recording.channels)).toMatchObject({ok: false, state: "starting"})
    for (const domain of forceDomains) monad.onDomainChannelReady(domain)
    expect(await monad.onHealthRequested().json()).toEqual({
      ok: true,
      domain: "force",
      state: "running",
      requiredDomains: ["dark", "boundary", "matrix", "energy", "bulk"],
      connectedDomains: ["dark", "boundary", "matrix", "energy", "bulk"],
      error: null,
    })
  })

  test("accepts an agent Particle only in running state", async () => {
    const beforeStart = await monad.onAgentParticleReceived(request(agentInflaton(1)))
    expect(beforeStart.status).toBe(503)

    start()
    const response = await monad.onAgentParticleReceived(request(agentInflaton(2)))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
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

  test("temporarily mocks legacy Force replay z/test at domain ingress", () => {
    start()
    const replay: SourcedForceMessage = {
      parts: [{
        part: "z",
        op: "test",
        path: "force/replay/boundary/boundary-local",
        by: "dark",
        ts: 3,
      }],
    }

    expect(monad.onDomainParticleReceived("dark", replay)).toEqual({ok: true, delivered: []})
    for (const domain of forceDomains) expect(recording.deliveries(domain)).toEqual([])
  })

  test("does not mock a real numeric Energy z/test", () => {
    start()
    const claim: SourcedForceMessage = {
      parts: [{part: "z", op: "test", path: 17, by: "energy", ts: 4, value: {energy: "energy-local"}}],
    }

    expect(monad.onDomainParticleReceived("energy", claim)).toEqual({
      ok: true,
      delivered: ["dark", "boundary", "matrix", "bulk"],
    })
  })

  test("owns fail-stop when one domain channel is destroyed", async () => {
    start()
    const accepted = await monad.onAgentParticleReceived(request(agentInflaton(3)))
    expect(accepted.status).toBe(200)
    const darkBefore = recording.deliveries("dark")
    const bulkBefore = recording.deliveries("bulk")

    monad.onDomainChannelDestroyed("matrix", new Error("channel closed"))

    const blocked = await monad.onAgentParticleReceived(request(agentInflaton(4)))
    expect(blocked.status).toBe(503)
    expect(await blocked.json()).toEqual({
      ok: false,
      error: "Force stopped: matrix channel was destroyed: channel closed",
    })
    expect(recording.deliveries("dark")).toEqual(darkBefore)
    expect(recording.deliveries("bulk")).toEqual(bulkBefore)
    expect(monad.onServerStarted(recording.channels)).toMatchObject({ok: false, state: "error"})
  })

  test("does not express fail-stop as a Particle", () => {
    start()
    monad.onDomainChannelDestroyed("energy", "connection lost")

    for (const domain of ["dark", "boundary", "matrix", "energy", "bulk"] as const) {
      expect(recording.deliveries(domain)).toEqual([])
    }
  })
})
