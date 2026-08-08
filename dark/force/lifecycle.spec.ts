import {beforeEach, describe, expect, test} from "bun:test"
import type {Part} from "shared/protocol/force/particle"
import type {ForceMessageInput, SourcedForceMessage} from "shared/protocol/force/message"
import {ForceLifecycle} from "./lifecycle.ts"
import {forceDomains, type ForceDomain, type ForceStore} from "./store.ts"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_MATTER_AUTHORING_CAUSE_SCHEMA_V1,
  type MetaAuthoringCauseV1,
  type MetaMatterAuthoringCauseV1,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress} from "@metafor/types/metafor/graph"

const agentInflaton = (ts: number): ForceMessageInput => ({
  parts: [{part: "inflaton", op: "add", path: "wimp", ts, value: {src: "capsule", name: "Capsule"}}],
})

const agentRemove = (ts: number): ForceMessageInput => ({
  parts: [{part: "inflaton", op: "remove", path: "wimp", ts, value: {src: "zavx0z/capsule"}}],
})

const authoringCause = (): MetaMatterAuthoringCauseV1 => ({
  schema: META_MATTER_AUTHORING_CAUSE_SCHEMA_V1,
  contractVersion: META_AUTHORING_CONTRACT_VERSION,
  rpcSource: "authoring-agent",
  operationId: "matter-add-1",
  requestDigest: `sha256:${"a".repeat(64)}`,
  sourceProjections: [{
    address: parseMetaAddress("zavx0z/lada")!,
    beforeRevision: `sha256:${"b".repeat(64)}`,
    afterRevision: `sha256:${"c".repeat(64)}`,
  }],
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
      externalAdmission: "open",
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
      externalAdmission: "open",
      requiredDomains: ["dark", "boundary", "matrix", "energy", "bulk"],
      connectedDomains: ["dark", "boundary", "matrix", "energy", "bulk"],
      error: null,
    })
  })

  test("replays one accepted history entry only to unresolved checkpoint domains", async () => {
    recording = createRecordingChannels()
    const receipt = (domain: "boundary" | "bulk") => ({
      cutId: "recovery-cut",
      domain,
      sentOrdinal: 1,
      acceptanceSequence: 1,
    })
    const prepared: unknown[] = []
    const applied: unknown[] = []
    lifecycle = new ForceLifecycle({
      accept() {
        throw new Error("recovery must not append a new history entry")
      },
      read() {
        return [{
          schema: "metafor/dark-force-particle/v1",
          id: "recovery-cut:1",
          sequence: 1,
          acceptedAt: "2026-08-04T12:00:00.000Z",
          particle: {
            part: "inflaton",
            op: "add",
            path: "matter",
            by: "dark",
            ts: 1,
            value: {wimp: "zavx0z/lada", id: 4, kind: "wimp", src: "zavx0z/lada-test"},
          },
        }]
      },
    }, {
      pendingDeliveries: () => [receipt("boundary"), receipt("bulk")],
      recordAccepted() { throw new Error("recovery must not record acceptance") },
      async prepare(receipts) { prepared.push(structuredClone(receipts)) },
      async waitApplied(receipts) { applied.push(structuredClone(receipts)) },
      acceptedFrom() { throw new Error("recovery must not advance an origin") },
    })

    lifecycle.start(recording.channels)
    for (const domain of forceDomains) lifecycle.channelReady(domain)
    expect(lifecycle.status().state).toBe("recovering")
    expect(await lifecycle.waitUntilStarted()).toMatchObject({ok: true, state: "running"})
    expect(recording.deliveries("boundary")).toHaveLength(1)
    expect(recording.deliveries("bulk")).toHaveLength(1)
    expect(recording.deliveries("dark")).toEqual([])
    expect(recording.deliveries("matrix")).toEqual([])
    expect(recording.deliveries("energy")).toEqual([])
    expect(prepared).toHaveLength(1)
    expect(applied).toEqual(prepared)
  })

  test("prepares the complete recovery frontier before delivering its first entry", async () => {
    recording = createRecordingChannels()
    const pending = [1, 2].map((sequence) => ({
      cutId: "recovery-cut",
      domain: "boundary" as const,
      sentOrdinal: sequence,
      acceptanceSequence: sequence,
    }))
    const prepared: unknown[] = []
    const applied: unknown[] = []
    lifecycle = new ForceLifecycle({
      accept() {
        throw new Error("recovery must not append a new history entry")
      },
      read(query) {
        const fromSequence = query?.fromSequence
        if (fromSequence === undefined) throw new Error("recovery sequence is required")
        return [{
          schema: "metafor/dark-force-particle/v1",
          id: `recovery-cut:${fromSequence}`,
          sequence: fromSequence,
          acceptedAt: "2026-08-04T12:00:00.000Z",
          particle: {
            part: "gluon",
            op: "replace",
            path: 1,
            by: "matrix",
            ts: fromSequence,
            value: {fields: {1: fromSequence}},
          },
        }]
      },
    }, {
      pendingDeliveries: () => structuredClone(pending),
      recordAccepted() { throw new Error("recovery must not record acceptance") },
      async prepare(receipts) { prepared.push(structuredClone(receipts)) },
      async waitApplied(receipts) { applied.push(structuredClone(receipts)) },
      acceptedFrom() { throw new Error("recovery must not advance an origin") },
    })

    lifecycle.start(recording.channels)
    for (const domain of forceDomains) lifecycle.channelReady(domain)
    expect(await lifecycle.waitUntilStarted()).toMatchObject({ok: true, state: "running"})
    expect(prepared).toEqual([pending])
    expect(applied).toEqual([pending])
    expect(recording.deliveries("boundary")).toHaveLength(2)
  })

  test("queues cold-birth causality behind the complete recovery delivery frontier", async () => {
    recording = createRecordingChannels()
    const pending = [{
      cutId: "recovery-cut",
      domain: "energy" as const,
      sentOrdinal: 1,
      acceptanceSequence: 1,
    }]
    let releasePreparation!: () => void
    const preparation = new Promise<void>((resolve) => {
      releasePreparation = resolve
    })
    const prepared: unknown[] = []
    const applied: unknown[] = []
    lifecycle = new ForceLifecycle({
      accept(particle) {
        accepted.push(structuredClone(particle))
        return {
          schema: "metafor/dark-force-particle/v1",
          id: "recovery-cut:2",
          sequence: 2,
          acceptedAt: "2026-08-04T12:00:01.000Z",
          particle,
        }
      },
      read() {
        return [{
          schema: "metafor/dark-force-particle/v1",
          id: "recovery-cut:1",
          sequence: 1,
          acceptedAt: "2026-08-04T12:00:00.000Z",
          particle: {
            part: "photon",
            op: "test",
            path: 3,
            by: "matrix",
            ts: 1,
            value: "авторизована",
          },
        }]
      },
    }, {
      pendingDeliveries: () => structuredClone(pending),
      recordAccepted(sequence, destinations) {
        expect(sequence).toBe(2)
        expect(destinations).toContain("energy")
        return [{...pending[0]!, sentOrdinal: 2, acceptanceSequence: 2}]
      },
      async prepare(receipts) {
        prepared.push(structuredClone(receipts))
        if ((receipts[0]?.acceptanceSequence ?? 0) === 1) await preparation
      },
      async waitApplied(receipts) { applied.push(structuredClone(receipts)) },
      acceptedFrom() {},
    })

    lifecycle.start(recording.channels)
    for (const domain of forceDomains) lifecycle.channelReady(domain)
    const coldBirth: SourcedForceMessage = {
      parts: [{
        part: "photon",
        op: "test",
        path: 3,
        by: "matrix",
        ts: 2,
        value: "авторизована",
      }],
    }
    const acceptedColdBirth = lifecycle.acceptParticle("matrix", coldBirth)
    await Promise.resolve()
    expect(accepted).toEqual([])
    expect(recording.deliveries("energy")).toEqual([])

    releasePreparation()
    await expect(acceptedColdBirth).resolves.toMatchObject({ok: true})
    await expect(lifecycle.waitUntilStarted()).resolves.toMatchObject({ok: true, state: "running"})

    expect(prepared).toEqual([pending, [{...pending[0]!, sentOrdinal: 2, acceptanceSequence: 2}]])
    expect(applied).toEqual([pending, [{...pending[0]!, sentOrdinal: 2, acceptanceSequence: 2}]])
    expect(recording.deliveries("energy")).toEqual([
      {parts: [expect.objectContaining({ts: 1})]},
      {parts: [expect.objectContaining({ts: 2})]},
    ])
  })

  test("accepts an agent Particle only in running state", async () => {
    expect(await lifecycle.acceptAgentParticle(agentInflaton(1))).toMatchObject({
      ok: false,
      reason: "not_running",
    })

    start()
    expect(await lifecycle.acceptAgentParticle(agentInflaton(2))).toEqual({
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

  test("holds only external agent admission while domain causality continues", async () => {
    start()
    expect(lifecycle.closeExternalAdmission()).toMatchObject({
      state: "running",
      externalAdmission: "closed",
    })
    expect(await lifecycle.acceptAgentParticle(agentInflaton(3))).toEqual({
      ok: false,
      reason: "admission_closed",
      error: "Force external admission is held by an internal causal operation",
    })

    const causal: SourcedForceMessage = {
      parts: [{
        part: "graviton",
        op: "replace",
        path: "atom/2",
        by: "boundary",
        ts: 4,
        value: {atom: {id: 2, wimp: "zavx0z/lada"}},
      }],
    }
    expect(await lifecycle.acceptParticle("boundary", causal)).toMatchObject({ok: true})
    expect(accepted).toEqual([causal.parts[0]])

    expect(lifecycle.openExternalAdmission()).toMatchObject({
      state: "running",
      externalAdmission: "open",
    })
    expect((await lifecycle.acceptAgentParticle(agentInflaton(5))).ok).toBe(true)
  })

  test("steps one agent Particle only while ordinary external admission stays closed", async () => {
    start()
    expect(await lifecycle.stepAgentParticle(agentInflaton(6))).toEqual({
      ok: false,
      reason: "admission_closed",
      error: "Force internal step requires closed external admission",
    })

    lifecycle.closeExternalAdmission()
    expect(await lifecycle.stepAgentParticle(agentInflaton(7))).toMatchObject({
      ok: true,
      particle: {by: "agent", ts: 7},
    })
    expect(lifecycle.status()).toMatchObject({externalAdmission: "closed"})
    expect(await lifecycle.acceptAgentParticle(agentInflaton(8))).toMatchObject({
      ok: false,
      reason: "admission_closed",
    })
  })

  test("conditionally accepts one runtime input at the exact history frontier", async () => {
    recording = createRecordingChannels()
    let sequence = 4
    lifecycle = new ForceLifecycle({
      status() {
        return {path: "history", cutId: "runtime-cut", startedAt: "2026-08-04T12:00:00.000Z", sequence, segments: 1, retroactiveComplete: false}
      },
      accept(particle) {
        sequence++
        return {
          schema: "metafor/dark-force-particle/v1",
          id: `runtime-cut:${sequence}`,
          sequence,
          acceptedAt: "2026-08-04T12:00:05.000Z",
          particle,
        }
      },
    })
    start()
    const expected = {cutId: "runtime-cut", throughSequence: 4, retroactiveComplete: false as const}
    await expect(lifecycle.acceptAgentParticleAtFrontier(agentInflaton(5), {...expected, throughSequence: 3}))
      .resolves.toMatchObject({ok: false, reason: "frontier_mismatch"})
    await expect(lifecycle.acceptAgentParticleAtFrontier(agentInflaton(5), expected)).resolves.toMatchObject({
      ok: true,
      acceptance: {cutId: "runtime-cut", sequence: 5, id: "runtime-cut:5"},
    })
  })

  test("accepts and sources the agent WIMP remove through the same Oracle-to-Force ingress", async () => {
    start()

    expect(await lifecycle.acceptAgentParticle(agentRemove(5))).toEqual({
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

  test("returns the exact acceptance identity for one Dark-authored RPC Particle", async () => {
    recording = createRecordingChannels()
    let storedCause: MetaAuthoringCauseV1 | undefined
    lifecycle = new ForceLifecycle({
      accept(particle, cause) {
        if (!cause) throw new Error("authoring cause is required")
        accepted.push(structuredClone(particle))
        storedCause = structuredClone(cause)
        return {
          schema: "metafor/dark-force-particle/v1",
          id: "authoring-cut:7",
          sequence: 7,
          acceptedAt: "2026-08-04T12:00:00.000Z",
          particle: structuredClone(particle),
          authoring: structuredClone(cause),
        }
      },
    })
    start()

    const decision = await lifecycle.acceptAuthoringParticle(
      agentInflaton(10),
      authoringCause(),
    )

    expect(decision).toEqual({
      ok: true,
      delivered: ["boundary", "bulk"],
      particle: {
        part: "inflaton",
        op: "add",
        path: "wimp",
        by: "dark",
        ts: 10,
        value: {src: "capsule", name: "Capsule"},
      },
      acceptance: {
        cutId: "authoring-cut",
        sequence: 7,
        id: "authoring-cut:7",
      },
    })
    expect(storedCause).toEqual(authoringCause())
  })

  test("routes a numeric Energy z/test as an ordinary Particle", async () => {
    start()
    const claim: SourcedForceMessage = {
      parts: [{part: "z", op: "test", path: 17, by: "energy", ts: 4, value: {energy: "energy-local"}}],
    }

    expect(await lifecycle.acceptParticle("energy", claim)).toEqual({
      ok: true,
      delivered: ["dark", "boundary", "matrix", "bulk"],
    })
    expect(accepted).toEqual([claim.parts[0]])
  })

  test("persists direct Gluon and Higgs mutations before Boundary delivery", async () => {
    start()
    const gluon: SourcedForceMessage = {
      parts: [{part: "gluon", op: "replace", path: 17, by: "matrix", ts: 5, value: {fields: {1: 2}}}],
    }
    const higgs: SourcedForceMessage = {
      parts: [{part: "higgs", op: "add", path: 17, by: "energy", ts: 6, value: {field: 1}}],
    }

    expect(await lifecycle.acceptParticle("matrix", gluon)).toEqual({ok: true, delivered: ["boundary"]})
    expect(await lifecycle.acceptParticle("energy", higgs)).toEqual({ok: true, delivered: ["boundary"]})
    expect(accepted).toEqual([gluon.parts[0], higgs.parts[0]])
    expect(recording.deliveries("dark")).toEqual([])
    expect(recording.deliveries("boundary")).toEqual([gluon, higgs])
  })

  test("persists every Force Particle kind through the same acceptance point before routing", async () => {
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
      expect((await lifecycle.acceptParticle("matrix", message)).ok).toBe(true)
      expect(accepted.at(-1)).toEqual(message.parts[0])
    }

    expect(accepted.map((particle) => particle.part)).toEqual(parts)
  })

  test("owns fail-stop when one domain channel is destroyed", async () => {
    start()
    expect((await lifecycle.acceptAgentParticle(agentInflaton(3))).ok).toBe(true)
    const darkBefore = recording.deliveries("dark")
    const bulkBefore = recording.deliveries("bulk")

    lifecycle.channelDestroyed("matrix", new Error("channel closed"))

    expect(await lifecycle.acceptAgentParticle(agentInflaton(4))).toEqual({
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

  test("persists before routing and fail-stops without delivery when history append fails", async () => {
    recording = createRecordingChannels()
    lifecycle = new ForceLifecycle({
      accept() {
        throw new Error("history fsync failed")
      },
    })
    start()

    expect(await lifecycle.acceptAgentParticle(agentInflaton(9))).toEqual({
      ok: false,
      reason: "runtime_error",
      error: "Force stopped: runtime could not transfer a Particle: history fsync failed",
    })
    expect(recording.deliveries("dark")).toEqual([])
    expect(recording.deliveries("bulk")).toEqual([])
    expect(lifecycle.status()).toMatchObject({state: "error"})
  })
})
