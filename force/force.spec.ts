import {beforeEach, describe, expect, test} from "bun:test"
import type {SourcedForceMessage} from "shared/protocol/force/message"
import {routeParticle} from "./force.ts"
import {ForceLifecycle} from "./monad.ts"
import {force$, forceDomains, type ForceDomain, type ForceStore} from "./store.ts"

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
  lifecycle.start(recording.channels)
  for (const domain of forceDomains) lifecycle.channelReady(domain)
})

describe("Force runtime", () => {
  test("is born with a Store containing only the five domain channels", () => {
    expect(Object.keys(force$)).toEqual([...forceDomains])
  })

  test("routes an external Inflaton only to Dark and Bulk", () => {
    const message: SourcedForceMessage = {
      parts: [{
        part: "inflaton",
        op: "add",
        path: "wimp",
        by: "agent",
        ts: 1,
        value: {src: "capsule", name: "Capsule"},
      }],
    }

    expect(routeParticle(message, "agent")).toEqual(["dark", "bulk"])
    expect(recording.deliveries("dark")).toEqual([message])
    expect(recording.deliveries("bulk")).toEqual([message])
    expect(recording.deliveries("boundary")).toEqual([])
  })

  test("routes a Dark Inflaton only to Boundary and Bulk", () => {
    const message: SourcedForceMessage = {
      parts: [{
        part: "inflaton",
        op: "add",
        path: "wimp",
        by: "dark",
        ts: 2,
        value: {src: "capsule", name: "Capsule"},
      }],
    }

    expect(routeParticle(message, "dark")).toEqual(["boundary", "bulk"])
    expect(recording.deliveries("boundary")).toEqual([message])
    expect(recording.deliveries("bulk")).toEqual([message])
    expect(recording.deliveries("matrix")).toEqual([])
  })

  test("routes an uncommitted runtime mutation only to Boundary", () => {
    const message: SourcedForceMessage = {
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        by: "matrix",
        ts: 3,
        value: {fields: {101: 1}},
      }],
    }

    expect(routeParticle(message, "matrix")).toEqual(["boundary"])
    expect(recording.deliveries("boundary")).toEqual([message])
    expect(recording.deliveries("dark")).toEqual([])
  })

  test("keeps the real numeric z/test Particle", () => {
    const claim: SourcedForceMessage = {
      parts: [{part: "z", op: "test", path: 17, by: "energy", ts: 4, value: {energy: "energy-local"}}],
    }

    expect(routeParticle(claim, "energy")).toEqual(["dark", "boundary", "matrix", "bulk"])
  })
})
